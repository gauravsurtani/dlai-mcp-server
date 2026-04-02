import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import http from 'http';
import { getCourses } from './cache.js';
import { scrapeCatalog, scrapeCourseDetails } from './scraper.js';
import { searchCourses } from './tools/search-courses.js';
import { getCourseDetails } from './tools/get-course-details.js';
import { listTopics } from './tools/list-topics.js';
import type { Course } from './types.js';

const log = (msg: string) => process.stderr.write(`[dlai-mcp] ${msg}\n`);

function createServer() {
  const server = new McpServer({
    name: 'dlai-mcp-server',
    version: '1.0.0',
  });

  let coursesCache: Course[] = [];

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
        content: [{
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
        }],
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

  return { server, setCourses: (courses: Course[]) => { coursesCache = courses; } };
}

// --- Load courses ---
async function loadCourses(forceRefresh: boolean) {
  const scraper = async () => {
    log('Fetching catalog from Algolia...');
    return scrapeCatalog();
  };

  const { courses, source } = await getCourses(forceRefresh ? scraper : scraper);
  log(`Loaded ${courses.length} courses (source: ${source})`);
  if (source === 'fallback') {
    log('WARNING: Using bundled catalog data (may be outdated). Run with --refresh-cache to retry.');
  }
  return courses;
}

// --- STDIO mode (local, npx) ---
async function startStdio() {
  const { server, setCourses } = createServer();
  const forceRefresh = process.argv.includes('--refresh-cache');
  const courses = await loadCourses(forceRefresh);
  setCourses(courses);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('MCP server started on STDIO');
}

// --- HTTP mode (Railway, remote) ---
async function startHttp() {
  const port = parseInt(process.env.PORT || '3000', 10);
  const apiToken = process.env.MCP_API_TOKEN || '';
  const courses = await loadCourses(false);

  if (apiToken) {
    log('Bearer token auth enabled');
  } else {
    log('WARNING: No MCP_API_TOKEN set — server is unauthenticated');
  }

  const httpServer = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check (no auth required)
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', courses: courses.length }));
      return;
    }

    // Auth check for MCP endpoint (if token is configured)
    if (apiToken && req.url === '/mcp') {
      const auth = req.headers['authorization'] || '';
      if (auth !== `Bearer ${apiToken}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized. Set Authorization: Bearer <token> header.' }));
        return;
      }
    }

    // MCP endpoint
    if (req.url === '/mcp') {
      const { server, setCourses } = createServer();
      setCourses(courses);

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
      });

      await server.connect(transport);
      await transport.handleRequest(req, res);
      return;
    }

    // Root — info page
    if (req.method === 'GET' && (req.url === '/' || req.url === '')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        name: 'dlai-mcp-server',
        version: '1.0.0',
        description: 'MCP server for discovering DeepLearning.AI courses',
        courses: courses.length,
        tools: ['search_courses', 'get_course_details', 'list_topics'],
        mcp_endpoint: '/mcp',
        usage: {
          claude_code: {
            mcpServers: {
              dlai: {
                type: 'url',
                url: `https://<your-domain>/mcp`,
              }
            }
          }
        }
      }, null, 2));
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  httpServer.listen(port, () => {
    log(`HTTP server listening on port ${port}`);
    log(`MCP endpoint: http://localhost:${port}/mcp`);
    log(`Health check: http://localhost:${port}/health`);
  });
}

// --- Entry point ---
const mode = process.env.MCP_TRANSPORT || (process.env.PORT ? 'http' : 'stdio');

if (mode === 'http') {
  startHttp().catch((err) => {
    log(`Fatal error: ${(err as Error).message}`);
    process.exit(1);
  });
} else {
  startStdio().catch((err) => {
    log(`Fatal error: ${(err as Error).message}`);
    process.exit(1);
  });
}
