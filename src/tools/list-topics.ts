import type { Course, Topic } from '../types.js';

export function listTopics(courses: Course[]): Topic[] {
  const topicMap = new Map<string, { count: number; examples: string[] }>();

  for (const course of courses) {
    for (const topic of course.topics) {
      const entry = topicMap.get(topic) ?? { count: 0, examples: [] };
      entry.count++;
      if (entry.examples.length < 3) {
        entry.examples.push(course.title);
      }
      topicMap.set(topic, entry);
    }
  }

  const topics: Topic[] = [];
  for (const [topic, { count, examples }] of topicMap) {
    topics.push({
      topic,
      course_count: count,
      example_courses: examples,
    });
  }

  topics.sort((a, b) => a.topic.localeCompare(b.topic));
  return topics;
}
