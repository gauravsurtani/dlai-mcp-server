import * as cheerio from 'cheerio';
import type { Course, CourseDetails, Lesson } from './types.js';

const USER_AGENT = 'dlai-mcp-server/1.0 (https://github.com/gauravsurtani/dlai-mcp-server)';
const BASE_URL = 'https://www.deeplearning.ai';

// Algolia search-only API credentials (public, embedded in DLAI's client JS)
const ALGOLIA_APP_ID = 'Y5109WLMQW';
const ALGOLIA_API_KEY = '9030ff79d3ba653535d5b66c26b56683';
const ALGOLIA_INDEX = 'courses_date_desc';

// --- Parsing functions (exported for unit testing) ---

export function parseAlgoliaHits(hits: any[]): Course[] {
  return hits.map((hit: any) => ({
    title: hit.title ?? '',
    slug: hit.slug ?? '',
    description: hit.description ?? '',
    instructors: parseInstructors(hit.instructors),
    level: Array.isArray(hit.skill_level) ? hit.skill_level.join(', ') : (hit.skill_level ?? ''),
    partner: Array.isArray(hit.partnership) ? hit.partnership.join(', ') : (hit.partnership ?? ''),
    duration: '',
    type: hit.course_type ?? '',
    topics: Array.isArray(hit.topic) ? hit.topic : [],
    landing_page: hit.landing_page ?? '',
    url: hit.landing_page ?? '',
    date: hit.date ?? '',
  }));
}

function parseInstructors(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    return raw.split(/,\s*and\s*|\s+and\s+|,\s*/).map((s: string) => s.trim()).filter(Boolean);
  }
  return [];
}

const LESSON_TYPE_MAP: Record<string, Lesson['type']> = {
  video: 'video',
  video_notebook: 'code',
  notebook: 'code',
  reading: 'reading',
  quiz: 'quiz',
  lab: 'lab',
  programming: 'code',
};

function mapLessonType(raw: string): Lesson['type'] {
  return LESSON_TYPE_MAP[raw] ?? 'unknown';
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

export function parseCourseDetailsPage(
  data: Record<string, unknown>,
  course: Course,
): CourseDetails {
  const pageProps = (data as any).props?.pageProps;
  const outlineList = pageProps?.outlineList;

  let lessons: Lesson[] = [];
  let totalSeconds = 0;

  if (Array.isArray(outlineList) && outlineList.length > 0) {
    const rawLessons: any[] = Array.isArray(outlineList[0])
      ? outlineList[0]
      : Object.values(outlineList[0]);

    lessons = rawLessons.map((item: any) => {
      const timeSeconds = typeof item.time === 'number' ? item.time : 0;
      totalSeconds += timeSeconds;
      return {
        title: item.name ?? '',
        slug: item.slug ?? '',
        duration: formatDuration(timeSeconds),
        type: mapLessonType(item.type ?? ''),
      };
    });
  }

  const content: string = pageProps?.course?.content ?? '';
  const learning_outcomes = extractLearningOutcomes(content);
  const prerequisites = extractPrerequisites(content);

  return {
    ...course,
    lessons,
    prerequisites,
    learning_outcomes,
    total_duration: formatDuration(totalSeconds),
    lesson_count: lessons.length,
    code_example_count: lessons.filter((l) => l.type === 'code').length,
  };
}

function extractLearningOutcomes(html: string): string[] {
  if (!html) return [];
  const $ = cheerio.load(html);
  const outcomes: string[] = [];
  $('h2').each((_, el) => {
    const text = $(el).text().toLowerCase();
    if (text.includes('what you') && text.includes('learn')) {
      const next = $(el).nextAll('ul').first();
      if (next.length) {
        next.find('li').each((__, li) => {
          const t = $(li).text().trim();
          if (t) outcomes.push(t);
        });
      }
    }
  });
  return outcomes;
}

function extractPrerequisites(html: string): string {
  if (!html) return '';
  const $ = cheerio.load(html);
  let prereqs = '';
  $('h2').each((_, el) => {
    const text = $(el).text().toLowerCase();
    if (text.includes('who should join') || text.includes('prerequisite')) {
      const next = $(el).nextAll('p').first();
      if (next.length) {
        prereqs = next.text().trim();
      }
    }
  });
  return prereqs;
}

// --- Network functions ---

function extractNextData(html: string): Record<string, unknown> | null {
  const $ = cheerio.load(html);
  const script = $('script#__NEXT_DATA__').text();
  if (!script) return null;
  try {
    return JSON.parse(script);
  } catch {
    return null;
  }
}

async function fetchJson(url: string, headers?: Record<string, string>): Promise<any> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, ...headers },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return res.json();
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return res.text();
}

/**
 * Scrape all courses from the DLAI catalog via Algolia search API.
 * Returns all courses in a single request (no pagination needed).
 */
export async function scrapeCatalog(): Promise<Course[]> {
  const url = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}?query=&hitsPerPage=200`;
  const data = await fetchJson(url, {
    'X-Algolia-Application-Id': ALGOLIA_APP_ID,
    'X-Algolia-API-Key': ALGOLIA_API_KEY,
  });

  if (!data.hits || !Array.isArray(data.hits)) {
    throw new Error('Unexpected Algolia response: no hits array');
  }

  return parseAlgoliaHits(data.hits);
}

/**
 * Scrape details for a specific course (lessons, prerequisites, outcomes).
 * Uses __NEXT_DATA__ from the course page.
 */
export async function scrapeCourseDetails(course: Course): Promise<CourseDetails> {
  const url = `${BASE_URL}${course.landing_page}`;
  const html = await fetchHtml(url);
  const data = extractNextData(html);
  if (!data) {
    throw new Error(`Failed to extract __NEXT_DATA__ from ${url}`);
  }
  return parseCourseDetailsPage(data, course);
}
