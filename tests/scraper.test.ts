import { describe, it, expect } from 'vitest';
import { parseAlgoliaHits, parseCourseDetailsPage } from '../src/scraper.js';
import algoliaHits from './fixtures/algolia-hits.json';
import courseData from './fixtures/course-nextdata.json';
import type { Course } from '../src/types.js';

describe('parseAlgoliaHits', () => {
  it('returns courses with all required fields', () => {
    const courses = parseAlgoliaHits(algoliaHits as any);

    expect(courses.length).toBeGreaterThan(0);

    const course = courses[0];
    expect(course.title).toBeTruthy();
    expect(course.slug).toBeTruthy();
    expect(typeof course.description).toBe('string');
    expect(Array.isArray(course.instructors)).toBe(true);
    expect(typeof course.level).toBe('string');
    expect(typeof course.partner).toBe('string');
    expect(typeof course.type).toBe('string');
    expect(Array.isArray(course.topics)).toBe(true);
    expect(course.landing_page).toBeTruthy();
    expect(course.url).toBe(course.landing_page);
    expect(typeof course.date).toBe('string');
  });

  it('parses correct number of hits', () => {
    const courses = parseAlgoliaHits(algoliaHits as any);
    expect(courses.length).toBe(algoliaHits.length);
  });

  it('handles empty hits array', () => {
    const courses = parseAlgoliaHits([]);
    expect(courses).toEqual([]);
  });

  it('handles hits with missing fields gracefully', () => {
    const courses = parseAlgoliaHits([{ title: 'Test', slug: 'test' }]);
    expect(courses.length).toBe(1);
    expect(courses[0].title).toBe('Test');
    expect(courses[0].description).toBe('');
    expect(courses[0].topics).toEqual([]);
    expect(courses[0].instructors).toEqual([]);
  });

  it('parses instructors from different formats', () => {
    const courses = parseAlgoliaHits([
      { title: 'A', slug: 'a', instructors: ['Alice', 'Bob'] },
      { title: 'B', slug: 'b', instructors: 'Charlie and Dave' },
      { title: 'C', slug: 'c', instructors: null },
    ]);
    expect(courses[0].instructors).toEqual(['Alice', 'Bob']);
    expect(courses[1].instructors).toEqual(['Charlie', 'Dave']);
    expect(courses[2].instructors).toEqual([]);
  });
});

describe('parseCourseDetailsPage', () => {
  const stubCourse: Course = {
    title: 'ChatGPT Prompt Engineering for Developers',
    slug: 'chatgpt-prompt-engineering-for-developers',
    description: 'Test description',
    instructors: ['Isa Fulford', 'Andrew Ng'],
    level: 'Beginner',
    partner: 'OpenAI',
    duration: '',
    type: 'Short Courses',
    topics: ['Prompt Engineering'],
    landing_page: '/short-courses/chatgpt-prompt-engineering-for-developers/',
    url: '/short-courses/chatgpt-prompt-engineering-for-developers/',
    date: '2023-04-28T00:00:00',
  };

  it('returns lessons array from outlineList', () => {
    const details = parseCourseDetailsPage(courseData as any, stubCourse);

    expect(details.lessons.length).toBeGreaterThan(0);
    expect(details.lesson_count).toBe(details.lessons.length);
  });

  it('maps lesson fields correctly', () => {
    const details = parseCourseDetailsPage(courseData as any, stubCourse);
    const first = details.lessons[0];

    expect(first.title).toBeTruthy();
    expect(first.slug).toBeTruthy();
    expect(typeof first.duration).toBe('string');
    expect(['video', 'code', 'reading', 'quiz', 'lab', 'unknown']).toContain(first.type);
  });

  it('maps lesson types correctly', () => {
    const details = parseCourseDetailsPage(courseData as any, stubCourse);
    const types = details.lessons.map((l) => l.type);

    expect(types).toContain('video');
    expect(types).toContain('code');
    expect(types).toContain('quiz');
  });

  it('calculates total duration', () => {
    const details = parseCourseDetailsPage(courseData as any, stubCourse);
    expect(details.total_duration).toBeTruthy();
  });

  it('counts code examples', () => {
    const details = parseCourseDetailsPage(courseData as any, stubCourse);
    expect(details.code_example_count).toBeGreaterThan(0);
  });

  it('preserves original course fields', () => {
    const details = parseCourseDetailsPage(courseData as any, stubCourse);
    expect(details.title).toBe(stubCourse.title);
    expect(details.slug).toBe(stubCourse.slug);
    expect(details.instructors).toEqual(stubCourse.instructors);
  });

  it('handles missing outlineList gracefully', () => {
    const emptyData = { props: { pageProps: { course: { content: '' } } } };
    const details = parseCourseDetailsPage(emptyData, stubCourse);

    expect(details.lessons).toEqual([]);
    expect(details.lesson_count).toBe(0);
    expect(details.code_example_count).toBe(0);
    expect(details.total_duration).toBe('');
  });

  it('handles empty pageProps gracefully', () => {
    const details = parseCourseDetailsPage({}, stubCourse);

    expect(details.lessons).toEqual([]);
    expect(details.lesson_count).toBe(0);
  });
});
