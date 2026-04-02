import type { Course } from '../types.js';

export function searchCourses(
  courses: Course[],
  query: string,
  filters?: {
    topic?: string;
    level?: string;
    partner?: string;
    type?: string;
  }
): Course[] {
  const q = query.toLowerCase();

  let results = courses.filter((c) => {
    const text = [
      c.title,
      c.description,
      ...c.instructors,
      ...c.topics,
    ]
      .join(' ')
      .toLowerCase();
    return text.includes(q);
  });

  if (filters?.topic) {
    const t = filters.topic.toLowerCase();
    results = results.filter((c) =>
      c.topics.some((topic) => topic.toLowerCase().includes(t))
    );
  }
  if (filters?.level) {
    const l = filters.level.toLowerCase();
    results = results.filter((c) => c.level.toLowerCase().includes(l));
  }
  if (filters?.partner) {
    const p = filters.partner.toLowerCase();
    results = results.filter((c) => c.partner.toLowerCase().includes(p));
  }
  if (filters?.type) {
    const ty = filters.type.toLowerCase();
    results = results.filter((c) => c.type.toLowerCase().includes(ty));
  }

  // Sort: title match first, then description match
  results.sort((a, b) => {
    const aTitle = a.title.toLowerCase().includes(q) ? 0 : 1;
    const bTitle = b.title.toLowerCase().includes(q) ? 0 : 1;
    return aTitle - bTitle;
  });

  return results;
}
