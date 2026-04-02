import type { Course, CourseDetails } from '../types.js';
import { scrapeCourseDetails } from '../scraper.js';
import { saveCache, loadCache } from '../cache.js';

function computeDetails(course: Course): CourseDetails {
  const lessons = course.lessons ?? [];
  return {
    ...course,
    lessons,
    prerequisites: (course as any).prerequisites ?? '',
    learning_outcomes: (course as any).learning_outcomes ?? [],
    total_duration: (course as any).total_duration ?? formatTotalDuration(lessons),
    lesson_count: lessons.length,
    code_example_count: lessons.filter((l) => l.type === 'code').length,
  };
}

function formatTotalDuration(lessons: { duration: string }[]): string {
  let totalMins = 0;
  for (const l of lessons) {
    const m = l.duration.match(/(\d+)m/);
    const h = l.duration.match(/(\d+)h/);
    if (m) totalMins += parseInt(m[1]);
    if (h) totalMins += parseInt(h[1]) * 60;
  }
  if (totalMins === 0) return '';
  if (totalMins < 60) return `${totalMins}m`;
  const hrs = Math.floor(totalMins / 60);
  const rem = totalMins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

export async function getCourseDetails(
  courses: Course[],
  slug: string
): Promise<CourseDetails | null> {
  const course = courses.find((c) => c.slug === slug);
  if (!course) return null;

  // If lessons already cached, compute derived fields and return
  if (course.lessons && course.lessons.length > 0) {
    return computeDetails(course);
  }

  // On-demand scrape for lesson data
  const details = await scrapeCourseDetails(course);

  // Merge lesson data into cache
  const cached = await loadCache();
  if (cached) {
    const idx = cached.courses.findIndex((c) => c.slug === slug);
    if (idx >= 0) {
      cached.courses[idx] = { ...cached.courses[idx], lessons: details.lessons };
      await saveCache(cached.courses);
    }
  }

  return details;
}
