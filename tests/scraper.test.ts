import { describe, it, expect } from 'vitest';
import { parseCatalogPage, parseCourseDetailsPage } from '../src/scraper.js';
import catalogData from './fixtures/catalog-nextdata.json';
import courseData from './fixtures/course-nextdata.json';
import type { Course } from '../src/types.js';

describe('parseCatalogPage', () => {
  it('returns courses with all required fields', () => {
    const { courses, nbPages } = parseCatalogPage(catalogData as any);

    expect(courses.length).toBeGreaterThan(0);
    expect(nbPages).toBeGreaterThan(0);

    const course = courses[0];
    expect(course.title).toBeTruthy();
    expect(course.slug).toBeTruthy();
    expect(typeof course.description).toBe('string');
    expect(Array.isArray(course.instructors)).toBe(true);
    expect(course.instructors.length).toBeGreaterThan(0);
    expect(typeof course.level).toBe('string');
    expect(typeof course.partner).toBe('string');
    expect(typeof course.type).toBe('string');
    expect(Array.isArray(course.topics)).toBe(true);
    expect(course.landing_page).toBeTruthy();
    expect(course.url).toBe(course.landing_page);
    expect(typeof course.date).toBe('string');
  });

  it('parses correct number of hits from page', () => {
    const { courses } = parseCatalogPage(catalogData as any);
    // Algolia default is 20 hits per page
    expect(courses.length).toBeLessThanOrEqual(20);
    expect(courses.length).toBeGreaterThan(0);
  });

  it('reads nbPages from Algolia metadata', () => {
    const { nbPages } = parseCatalogPage(catalogData as any);
    expect(nbPages).toBeGreaterThanOrEqual(1);
  });

  it('handles missing initialResults gracefully', () => {
    const { courses, nbPages } = parseCatalogPage({ props: { pageProps: {} } });
    expect(courses).toEqual([]);
    expect(nbPages).toBe(0);
  });

  it('handles empty data gracefully', () => {
    const { courses, nbPages } = parseCatalogPage({});
    expect(courses).toEqual([]);
    expect(nbPages).toBe(0);
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

    // The fixture has video, video_notebook, and quiz types
    expect(types).toContain('video');
    expect(types).toContain('code'); // video_notebook maps to code
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

  it('extracts learning outcomes from HTML content', () => {
    const details = parseCourseDetailsPage(courseData as any, stubCourse);
    // The fixture's course content has a "What you'll learn" section with list items
    expect(details.learning_outcomes.length).toBeGreaterThan(0);
  });

  it('extracts prerequisites from HTML content', () => {
    const details = parseCourseDetailsPage(courseData as any, stubCourse);
    // The fixture has a "Who should join?" section
    expect(details.prerequisites).toBeTruthy();
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
