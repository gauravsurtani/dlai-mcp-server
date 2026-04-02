import type { Course, CourseDetails } from '../types.js';
import { scrapeCourseDetails } from '../scraper.js';
import { saveCache, loadCache } from '../cache.js';

export async function getCourseDetails(
  courses: Course[],
  slug: string
): Promise<CourseDetails | null> {
  const course = courses.find((c) => c.slug === slug);
  if (!course) return null;

  // If lessons already cached, return immediately
  if (course.lessons && course.lessons.length > 0) {
    return course as CourseDetails;
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
