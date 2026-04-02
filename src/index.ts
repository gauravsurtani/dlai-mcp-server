import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getCourses } from './cache.js';
import { scrapeCatalog, scrapeCourseDetails } from './scraper.js';
import { searchCourses } from './tools/search-courses.js';
import { getCourseDetails } from './tools/get-course-details.js';
import { listTopics } from './tools/list-topics.js';
import type { Course } from './types.js';

const log = (msg: string) => process.stderr.write(`[dlai-mcp] ${msg}\n`);

const server = new McpServer({
  name: 'dlai-mcp-server',
  version: '1.0.0',
});

let coursesCache: Course[] = [];
let dataSource: 'cache' | 'live' | 'fallback' = 'cache';

// --- Tool: search_courses ---
server.tool(
  'search_courses',
  'Search the DeepLearning.AI course catalog by keyword with optional filters. Returns matching courses with title, instructor, level, partner, duration, and direct link.',
  {
    query: z.string().describe('Search query (e.g., "RAG", "agents", "prompt engineering")'),
    topic: z.string().optional().describe('Filter by topic (e.g., "Agents", "RAG", "Computer Vision")'),
    level: z.string().optional().describe('Filter by level: "Beginner", "Intermediate", or "Advanced"'),
    partner: z.string().optional().describe('Filter by partner org (e.g., "OpenAI", "LangChain", "AWS")'),
    type: z.string().optional().describe('Filter by type: "Short Course", "Course", or "Specialization"'),
  },
  async ({ query, topic, level, partner, type }) => {
    const results = searchCourses(coursesCache, query, { topic, level, partner, type });
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(results.map(c => ({
            title: c.title,
            slug: c.slug,
            description: c.description,
            instructors: c.instructors,
            level: c.level,
            partner: c.partner,
            type: c.type,
            topics: c.topics,
            url: `https://www.deeplearning.ai${c.landing_page}`,
          })), null, 2),
        },
      ],
    };
  }
);

// --- Tool: get_course_details ---
server.tool(
  'get_course_details',
  'Get full details for a specific DeepLearning.AI course including lesson list, prerequisites, and learning outcomes. Use the course slug from search results.',
  {
    slug: z.string().describe('Course slug (e.g., "chatgpt-prompt-engineering-for-developers")'),
  },
  async ({ slug }) => {
    try {
      const details = await getCourseDetails(coursesCache, slug);
      if (!details) {
        return {
          content: [{ type: 'text' as const, text: `Course not found: "${slug}". Use search_courses to find valid slugs.` }],
          isError: true,
        };
      }
      // Update local cache reference if lessons were fetched
      if (details.lessons) {
        const idx = coursesCache.findIndex(c => c.slug === slug);
        if (idx >= 0) {
          coursesCache[idx] = { ...coursesCache[idx], lessons: details.lessons };
        }
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            title: details.title,
            slug: details.slug,
            description: details.description,
            instructors: details.instructors,
            level: details.level,
            partner: details.partner,
            type: details.type,
            topics: details.topics,
            url: `https://www.deeplearning.ai${details.landing_page}`,
            prerequisites: details.prerequisites,
            learning_outcomes: details.learning_outcomes,
            total_duration: details.total_duration,
            lesson_count: details.lesson_count,
            code_example_count: details.code_example_count,
            lessons: details.lessons,
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error fetching course details: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// --- Tool: list_topics ---
server.tool(
  'list_topics',
  'List all available DeepLearning.AI topics with course counts and example courses for each topic.',
  {},
  async () => {
    const topics = listTopics(coursesCache);
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(topics, null, 2),
      }],
    };
  }
);

// --- Startup ---
async function main() {
  const forceRefresh = process.argv.includes('--refresh-cache');

  if (forceRefresh) {
    log('Forcing cache refresh...');
  }

  const scraper = forceRefresh ? scrapeCatalog : async () => {
    log('Scraping catalog (first run or cache expired)...');
    return scrapeCatalog();
  };

  const { courses, source } = await getCourses(forceRefresh ? scraper : scraper);
  coursesCache = courses;
  dataSource = source;

  log(`Loaded ${courses.length} courses (source: ${source})`);
  if (source === 'fallback') {
    log('WARNING: Using bundled catalog data (may be outdated). Run with --refresh-cache to retry.');
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('MCP server started on STDIO');
}

main().catch((err) => {
  log(`Fatal error: ${(err as Error).message}`);
  process.exit(1);
});
