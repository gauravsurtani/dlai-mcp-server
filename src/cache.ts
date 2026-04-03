import fs from "fs/promises";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import type { Course, CacheData } from "./types.js";

const CACHE_DIR = path.join(os.homedir(), ".dlai-mcp", "cache");
const CACHE_FILE = path.join(CACHE_DIR, "courses.json");
const DEFAULT_MAX_AGE_MS = 86_400_000; // 24 hours

export function getCachePath(): string {
  return CACHE_FILE;
}

export async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

export async function loadCache(): Promise<CacheData | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    try {
      return JSON.parse(raw) as CacheData;
    } catch {
      process.stderr.write(
        "[dlai-mcp] Warning: cache file contains corrupt JSON, ignoring.\n"
      );
      return null;
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    process.stderr.write(
      `[dlai-mcp] Warning: could not read cache: ${(err as Error).message}\n`
    );
    return null;
  }
}

export async function saveCache(courses: Course[]): Promise<void> {
  await ensureCacheDir();
  const data: CacheData = {
    courses,
    lastUpdated: new Date().toISOString(),
    version: 1,
  };
  await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export async function isCacheValid(maxAgeMs: number = DEFAULT_MAX_AGE_MS): Promise<boolean> {
  const data = await loadCache();
  if (!data || !data.lastUpdated) {
    return false;
  }
  const age = Date.now() - new Date(data.lastUpdated).getTime();
  return age < maxAgeMs;
}

export async function loadFallback(): Promise<Course[]> {
  try {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    // When built with tsup the output lands in dist/; data/ is at project root.
    // Walk up until we find data/fallback-courses.json.
    const candidates = [
      path.join(moduleDir, "data", "fallback-courses.json"),
      path.join(moduleDir, "..", "data", "fallback-courses.json"),
      path.join(moduleDir, "..", "..", "data", "fallback-courses.json"),
    ];
    for (const candidate of candidates) {
      try {
        const raw = await fs.readFile(candidate, "utf-8");
        return JSON.parse(raw) as Course[];
      } catch {
        // try next candidate
      }
    }
    process.stderr.write("[dlai-mcp] Warning: fallback-courses.json not found.\n");
    return [];
  } catch {
    return [];
  }
}

export async function invalidateCache(): Promise<void> {
  try {
    await fs.unlink(CACHE_FILE);
  } catch {
    // File doesn't exist — that's fine
  }
}

export async function getCourses(
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
        `[dlai-mcp] Warning: scraper failed (${(err as Error).message}), using fallback.\n`
      );
    }
  }

  const courses = await loadFallback();
  return { courses, source: "fallback" };
}
