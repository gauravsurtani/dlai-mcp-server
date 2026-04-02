export interface Course {
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
  lessons?: Lesson[];
}

export interface Lesson {
  title: string;
  slug: string;
  duration: string;
  type: 'video' | 'code' | 'reading' | 'quiz' | 'lab' | 'unknown';
}

export interface Topic {
  topic: string;
  course_count: number;
  example_courses: string[];
}

export interface CacheData {
  courses: Course[];
  lastUpdated: string;
  version: number;
}

export interface CourseDetails extends Course {
  lessons: Lesson[];
  prerequisites: string;
  learning_outcomes: string[];
  total_duration: string;
  lesson_count: number;
  code_example_count: number;
}
