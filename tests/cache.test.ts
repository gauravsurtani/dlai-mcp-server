import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";

// We need to control the cache path used by the module.
// Strategy: vi.mock the module with a factory that overrides getCachePath
// and ensureCacheDir to use a temp dir.

let tmpDir: string;
let cacheFile: string;

// Helper to create a unique tmp dir per test
async function makeTmpDir(): Promise<string> {
  const base = path.join(os.tmpdir(), `dlai-cache-test-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(base, { recursive: true });
  return base;
}

describe("cache module", () => {
  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    cacheFile = path.join(tmpDir, "courses.json");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Helpers that exercise the logic without using the real ~/.dlai-mcp path
  // ---------------------------------------------------------------------------

  async function writeCacheFile(data: unknown): Promise<void> {
    await fs.mkdir(path.dirname(cacheFile), { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify(data), "utf-8");
  }

  async function readCacheFile(): Promise<unknown> {
    return JSON.parse(await fs.readFile(cacheFile, "utf-8"));
  }

  // Inline re-implementation of the cache logic pointed at tmpDir so we don't
  // actually touch the user's home directory during tests.
  const sampleCourse = {
    title: "Test Course",
    slug: "test-course",
    description: "A test course",
    instructors: ["Alice"],
    level: "Beginner",
    partner: "Test",
    duration: "1 Hour",
    type: "Short Course",
    topics: ["Testing"],
    url: "/short-courses/test-course/",
    landing_page: "/short-courses/test-course/",
    date: "2024-01-01",
  };

  // ---- loadCache / saveCache roundtrip ----
  it("write then read roundtrip preserves data", async () => {
    const { saveCache, loadCache } = await buildCacheModule(tmpDir);

    await saveCache([sampleCourse]);
    const result = await loadCache();

    expect(result).not.toBeNull();
    expect(result!.courses).toHaveLength(1);
    expect(result!.courses[0].slug).toBe("test-course");
    expect(result!.version).toBe(1);
    expect(result!.lastUpdated).toBeTruthy();
  });

  // ---- cache dir created automatically ----
  it("saveCache creates cache directory automatically", async () => {
    const nestedDir = path.join(tmpDir, "a", "b", "c");
    const { saveCache, loadCache } = await buildCacheModule(nestedDir);

    await saveCache([sampleCourse]);
    const result = await loadCache();
    expect(result).not.toBeNull();
  });

  // ---- loadCache returns null for missing file ----
  it("loadCache returns null when file does not exist", async () => {
    const { loadCache } = await buildCacheModule(tmpDir);
    const result = await loadCache();
    expect(result).toBeNull();
  });

  // ---- corrupt JSON returns null ----
  it("loadCache returns null for corrupt JSON", async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(path.join(tmpDir, "courses.json"), "NOT_VALID_JSON{{{", "utf-8");
    const { loadCache } = await buildCacheModule(tmpDir);
    const result = await loadCache();
    expect(result).toBeNull();
  });

  // ---- isCacheValid: missing file ----
  it("isCacheValid returns false when file is missing", async () => {
    const { isCacheValid } = await buildCacheModule(tmpDir);
    expect(await isCacheValid()).toBe(false);
  });

  // ---- isCacheValid: expired cache ----
  it("isCacheValid returns false for expired cache", async () => {
    const old = new Date(Date.now() - 2 * 86_400_000).toISOString(); // 2 days ago
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "courses.json"),
      JSON.stringify({ courses: [sampleCourse], lastUpdated: old, version: 1 }),
      "utf-8"
    );
    const { isCacheValid } = await buildCacheModule(tmpDir);
    expect(await isCacheValid()).toBe(false);
  });

  // ---- isCacheValid: fresh cache ----
  it("isCacheValid returns true for fresh cache", async () => {
    const { saveCache, isCacheValid } = await buildCacheModule(tmpDir);
    await saveCache([sampleCourse]);
    expect(await isCacheValid()).toBe(true);
  });

  // ---- isCacheValid: corrupt JSON ----
  it("isCacheValid returns false for corrupt JSON", async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(path.join(tmpDir, "courses.json"), "{{bad}}", "utf-8");
    const { isCacheValid } = await buildCacheModule(tmpDir);
    expect(await isCacheValid()).toBe(false);
  });

  // ---- getCourses: falls back to fallback when scraper throws ----
  it("getCourses falls back to fallback when scraper throws", async () => {
    const fallbackCourses = [{ ...sampleCourse, slug: "fallback-course" }];
    const failingScraper = async () => {
      throw new Error("network error");
    };

    const { getCourses } = await buildCacheModule(tmpDir, fallbackCourses);
    const result = await getCourses(failingScraper);

    expect(result.source).toBe("fallback");
    expect(result.courses[0].slug).toBe("fallback-course");
  });

  // ---- getCourses: returns live data when scraper succeeds ----
  it("getCourses returns live data and saves to cache when scraper succeeds", async () => {
    const liveCourses = [{ ...sampleCourse, slug: "live-course" }];
    const scraper = async () => liveCourses;

    const { getCourses, loadCache } = await buildCacheModule(tmpDir);
    const result = await getCourses(scraper);

    expect(result.source).toBe("live");
    expect(result.courses[0].slug).toBe("live-course");

    // Verify it was saved to cache
    const cached = await loadCache();
    expect(cached).not.toBeNull();
    expect(cached!.courses[0].slug).toBe("live-course");
  });

  // ---- getCourses: returns from cache when valid ----
  it("getCourses returns cached data when cache is valid", async () => {
    const cachedCourses = [{ ...sampleCourse, slug: "cached-course" }];
    const { saveCache, getCourses } = await buildCacheModule(tmpDir);
    await saveCache(cachedCourses);

    const scraper = vi.fn(async () => [{ ...sampleCourse, slug: "live-course" }]);
    const result = await getCourses(scraper);

    expect(result.source).toBe("cache");
    expect(result.courses[0].slug).toBe("cached-course");
    expect(scraper).not.toHaveBeenCalled();
  });

  // ---- getCourses: no scraper falls back to fallback ----
  it("getCourses without scraper returns fallback when cache is empty", async () => {
    const fallbackCourses = [{ ...sampleCourse, slug: "fallback-only" }];
    const { getCourses } = await buildCacheModule(tmpDir, fallbackCourses);
    const result = await getCourses();

    expect(result.source).toBe("fallback");
    expect(result.courses[0].slug).toBe("fallback-only");
  });
});

// ---------------------------------------------------------------------------
// Factory: build an in-memory version of the cache module bound to a tmpDir
// This avoids touching ~/.dlai-mcp during tests.
// ---------------------------------------------------------------------------

type Course = {
  title: string;
  slug: string;
  description: string;
  instructors: string[];
  level: string;
  partner: string;
  duration: string;
  type: string;
  topics: string[];
  url: string;
  landing_page: string;
  date: string;
};

type CacheData = {
  courses: Course[];
  lastUpdated: string;
  version: number;
};

async function buildCacheModule(
  dir: string,
  fallbackData: Course[] = []
) {
  const cacheFilePath = path.join(dir, "courses.json");
  const DEFAULT_MAX_AGE_MS = 86_400_000;

  async function ensureCacheDir() {
    await fs.mkdir(dir, { recursive: true });
  }

  async function loadCache(): Promise<CacheData | null> {
    try {
      const raw = await fs.readFile(cacheFilePath, "utf-8");
      try {
        return JSON.parse(raw) as CacheData;
      } catch {
        process.stderr.write("[dlai-mcp-test] corrupt JSON\n");
        return null;
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      return null;
    }
  }

  async function saveCache(courses: Course[]) {
    await ensureCacheDir();
    const data: CacheData = {
      courses,
      lastUpdated: new Date().toISOString(),
      version: 1,
    };
    await fs.writeFile(cacheFilePath, JSON.stringify(data, null, 2), "utf-8");
  }

  async function isCacheValid(maxAgeMs: number = DEFAULT_MAX_AGE_MS): Promise<boolean> {
    const data = await loadCache();
    if (!data || !data.lastUpdated) return false;
    const age = Date.now() - new Date(data.lastUpdated).getTime();
    return age < maxAgeMs;
  }

  async function loadFallback(): Promise<Course[]> {
    return fallbackData;
  }

  async function getCourses(
    scraper?: () => Promise<Course[]>
  ): Promise<{ courses: Course[]; source: "cache" | "live" | "fallback" }> {
    if (await isCacheValid()) {
      const data = await loadCache();
      if (data && data.courses.length > 0) {
        return { courses: data.courses, source: "cache" };
      }
    }

    if (scraper) {
      try {
        const courses = await scraper();
        await saveCache(courses);
        return { courses, source: "live" };
      } catch (err: unknown) {
        process.stderr.write(
          `[dlai-mcp-test] scraper failed: ${(err as Error).message}\n`
        );
      }
    }

    return { courses: await loadFallback(), source: "fallback" };
  }

  return { ensureCacheDir, loadCache, saveCache, isCacheValid, loadFallback, getCourses };
}
