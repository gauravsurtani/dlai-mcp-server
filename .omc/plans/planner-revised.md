# DLAI MCP Server — Implementation Plan (v2 Revised)

## Metadata
- **Plan ID:** dlai-mcp-server-mvp
- **Created:** 2026-04-02
- **Revised:** 2026-04-02 (incorporates Architect review)
- **Source Spec:** `.omc/specs/deep-interview-dlai-mcp.md` (14% ambiguity)
- **Architect Review:** `.omc/plans/architect-review.md`
- **Complexity:** MEDIUM (greenfield, ~9 files, well-defined scope)
- **Estimated Effort:** 1-2 days

### Changes from v1
| # | What Changed | Why | Source |
|-|-|-|-|
| 1 | Step 2 rewritten: `__NEXT_DATA__` JSON extraction replaces HTML card parsing | DLAI is a Next.js app backed by Algolia; course data lives in embedded JSON, not HTML elements | Architect MUST-FIX #1 |
| 2 | Step 5 rewritten: `McpServer` + `registerTool()` replaces `Server` + `setRequestHandler` | MCP SDK API changed; old imports will not compile | Architect MUST-FIX #2 |
| 3 | Step 5 explicitly limits startup to 7 catalog pages; course details are on-demand only | Eliminates 26s cold start; startup is ~1.4s | Architect MUST-FIX #3 |
| 4 | Pagination corrected to zero-indexed (`?page=0` through `?page=6`) | Off-by-one would miss last page or 404 | Architect SHOULD-FIX #4 |
| 5 | Scraper uses `landing_page` field from Algolia data for course URLs | Courses use mixed URL prefixes (`/short-courses/`, `/courses/`); hardcoding breaks ~50% | Architect SHOULD-FIX #5 |
| 6 | New: `fallback-courses.json` bundled in npm package as offline safety net | If scraping fails on first run, bundled data ensures zero-config install still works | Architect Synthesis |
| 7 | Test fixtures updated: JSON payloads instead of HTML fragments | Matches new `__NEXT_DATA__` extraction strategy | Consequence of #1 |
| 8 | `robots.txt` validation added to Risk Mitigation table | DLAI explicitly allows scraping (`Allow: /`, no crawl-delay) | Architect finding #7 |

---

## RALPLAN-DR Summary

### Principles (5)
1. **Public-data-first** — MVP uses only publicly available data from deeplearning.ai; no internal APIs.
2. **Cache-over-network** — Every query serves from local JSON; scraping is a background/setup concern. Bundled fallback ensures data exists even when network fails.
3. **Standard MCP patterns** — Follow `@modelcontextprotocol/sdk` conventions exactly: `McpServer` class from `@modelcontextprotocol/sdk/server/mcp.js`, `registerTool()`, `zod/v4`, STDIO transport.
4. **Zero-config install** — `npx dlai-mcp-server` must work out of the box. Startup completes in <2s (catalog-only scrape). Bundled fallback guarantees functionality even if scraping fails.
5. **Incrementally testable** — Each layer (scraper, cache, tools, server) works and tests independently.

### Decision Drivers (Top 3)
1. **Time to working demo** — Must produce a "wow" demo for the DLAI eng team quickly.
2. **Reliability of scraped data** — Website structure may change; scraper must be resilient, cache must survive failures, and bundled fallback must prevent total outage.
3. **npm publishability** — Package must install globally or via npx and register as an MCP server in one config line.

### Viable Options

#### Option A: Monolithic single-file server (REJECTED)
- **Pros:** Fastest to write, simplest bundling, smallest package.
- **Cons:** Untestable scraper logic, hard to extend for Phase 2-4, mixes transport/business/IO concerns.
- **Rejection rationale:** Violates Principle 5 (incrementally testable). Scraper and tool logic intertwined makes debugging cache vs. parsing issues impossible.

#### Option B: Layered modules — Scraper / Cache / Tools / Server (SELECTED)
- **Pros:** Each module testable in isolation, clear extension points for Phase 2+, scraper can run standalone for debugging.
- **Cons:** Slightly more files (~9 vs ~2), requires explicit wiring.
- **Why chosen:** Aligns with all 5 principles. The marginal overhead of extra files is trivial for a TypeScript project. Enables TDD workflow.

#### Option C: Database-backed (SQLite) with ORM
- **Pros:** Structured queries, future-proof for 500+ courses.
- **Cons:** Heavy dependency for 121 records, complicates npx install (native bindings), overkill for MVP.
- **Rejection rationale:** JSON file cache handles 121 courses trivially. Spec explicitly chose JSON. SQLite can be Phase 3+ migration.

### ADR (Architectural Decision Record)
- **Decision:** Layered module architecture with JSON file cache + bundled fallback
- **Drivers:** Testability, time-to-demo, npx compatibility, first-run reliability
- **Alternatives considered:** Monolithic (rejected: untestable), SQLite (rejected: overkill)
- **Why chosen:** Best balance of speed, testability, and extensibility. Bundled fallback resolves the tension between automation and reliability.
- **Consequences:** ~9 source files, explicit module wiring, fallback data needs periodic refresh via npm publish
- **Follow-ups:** Evaluate SQLite migration if catalog exceeds 500 courses in Phase 3+; automate fallback refresh via CI

---

## File Structure

```
dlai-mcp-server/
├── package.json
├── tsconfig.json
├── README.md
├── CLAUDE.md                     # Project instructions for Claude Code
├── .npmignore
├── src/
│   ├── index.ts                  # Entry point — creates McpServer, registers tools, starts STDIO
│   ├── scraper.ts                # __NEXT_DATA__ JSON extraction from catalog + course pages
│   ├── cache.ts                  # JSON file cache read/write/refresh + bundled fallback logic
│   ├── tools/
│   │   ├── search-courses.ts     # search_courses tool definition + handler
│   │   ├── get-course-details.ts # get_course_details tool definition + handler
│   │   └── list-topics.ts        # list_topics tool definition + handler
│   └── types.ts                  # Course, Lesson, Topic interfaces
├── data/
│   └── fallback-courses.json     # Bundled catalog snapshot (updated each npm publish)
├── bin/
│   └── dlai-mcp-server.js        # CLI shebang entry (#!/usr/bin/env node)
└── tests/
    ├── scraper.test.ts           # Scraper tests with __NEXT_DATA__ JSON fixtures
    ├── cache.test.ts             # Cache read/write/TTL/fallback tests
    ├── tools.test.ts             # Tool handler unit tests (mocked cache)
    └── fixtures/
        ├── catalog-nextdata.json # Saved __NEXT_DATA__ payload for catalog page
        └── course-nextdata.json  # Saved __NEXT_DATA__ payload for course detail page
```

---

## Task Flow (Implementation Order)

### Step 1: Project Scaffold + Types
**Complexity:** S
**Files:** `package.json`, `tsconfig.json`, `.npmignore`, `src/types.ts`, `bin/dlai-mcp-server.js`, `CLAUDE.md`
**Dependencies:** None
**What it does:**
- Initialize npm package with name `dlai-mcp-server`, bin entry, TypeScript config
- Install deps: `@modelcontextprotocol/sdk`, `cheerio`, `zod`
- Install devDeps: `typescript`, `tsup` (bundler), `vitest`, `@types/node`
- Define core interfaces: `Course`, `Lesson`, `Topic`, `CacheData`
  - `Course` must include `landing_page: string` field (the Algolia-provided URL path)
- Create bin shebang file that requires the built output
- Write CLAUDE.md with project-specific instructions

**Acceptance Criteria:**
- [ ] `npm install` succeeds with zero errors
- [ ] `npx tsc --noEmit` passes on `src/types.ts`
- [ ] `package.json` has `"bin": { "dlai-mcp-server": "./bin/dlai-mcp-server.js" }`
- [ ] `package.json` has `"type": "module"` and correct `"main"` / `"types"` fields
- [ ] `Course` interface includes `landing_page` field

### Step 2: Scraper Module [REWRITTEN from v1]
**Complexity:** L
**Files:** `src/scraper.ts`, `tests/scraper.test.ts`, `tests/fixtures/catalog-nextdata.json`, `tests/fixtures/course-nextdata.json`
**Dependencies:** Step 1 (types)
**What it does:**

**`scrapeCatalog()` — Catalog extraction via `__NEXT_DATA__` JSON:**
1. Fetch pages `?page=0` through `?page=6` (zero-indexed, 7 pages total)
2. For each page, extract `<script id="__NEXT_DATA__">` content via Cheerio: `$('script#__NEXT_DATA__').text()`
3. `JSON.parse()` the script content
4. Navigate to hits: `pageProps.initialResults[indexName].results[0].hits` where `indexName` is `courses_date_desc`
5. Map each Algolia hit to `Course` type. Key field mappings:
   - `title` -> title
   - `slug` -> slug
   - `description` -> description
   - `instructors` -> instructors (array)
   - `skill_level` -> level
   - `partnership` -> partner
   - `course_type` -> type
   - `topic` -> topics (array)
   - `landing_page` -> url (use this directly, do NOT hardcode URL prefix)
   - `date` -> date
6. Detect total pages dynamically from `nbPages` in the Algolia metadata (don't hardcode 7)
7. Sequential fetches with 200ms delay between pages
8. Polite `User-Agent` header

**`scrapeCourseDetails(course)` — Course detail extraction via `__NEXT_DATA__`:**
1. Use the course's `landing_page` field to construct the full URL (e.g., `https://www.deeplearning.ai${course.landing_page}`)
2. Fetch the page, extract `__NEXT_DATA__` JSON via same Cheerio method
3. Parse lesson data from `outlineList` array in the page props
4. Each lesson has: `slug`, `name`, `type`, `time` fields
5. Map `type` field to content type (video/code/reading/lab/quiz — see open questions for mapping)
6. Return `CourseDetails` with lessons array

**Test Strategy:**
- Save real `__NEXT_DATA__` JSON payloads as fixtures (one catalog page payload, one course page payload)
- Unit tests parse fixtures — no network calls in tests
- Test edge cases: missing fields, malformed JSON, empty hits array, missing `outlineList`

**Acceptance Criteria:**
- [ ] `scrapeCatalog()` parses fixture JSON and returns `Course[]` with all required fields
- [ ] Pagination uses zero-indexed pages (`?page=0` through `?page=6`)
- [ ] Page count is read from `nbPages` metadata, not hardcoded
- [ ] Course URLs use `landing_page` field from Algolia data (handles both `/short-courses/` and `/courses/` paths)
- [ ] `scrapeCourseDetails(course)` parses `outlineList` from fixture and returns lessons
- [ ] Handles missing optional fields gracefully (no crashes on partial data)
- [ ] Rate limiting between page fetches is present (200ms delay)

### Step 3: Cache Module + Fallback Bundle
**Complexity:** S
**Files:** `src/cache.ts`, `tests/cache.test.ts`, `data/fallback-courses.json`
**Dependencies:** Step 1 (types)
**What it does:**
- Cache directory: `~/.dlai-mcp/cache/`
- `loadCache()`: Read `courses.json`, return parsed data or null if missing/expired
- `saveCache(data)`: Write `courses.json` with `lastUpdated` timestamp
- `isCacheValid(maxAge?)`: Check if cache exists and is within TTL (default 24h)
- `getCachePath()`: Returns resolved path to cache directory
- `ensureCacheDir()`: Creates `~/.dlai-mcp/cache/` if it doesn't exist
- **`loadFallback()`**: Read bundled `data/fallback-courses.json` from the npm package. Returns catalog-level course data (no lesson details). Used when both cache and scraper are unavailable.
- `getcourses()`: Orchestrates the priority chain: cache -> scrape -> fallback. Returns courses + source indicator (`"cache" | "live" | "fallback"`)
- Cache format: `{ courses: Course[], lastUpdated: string, version: 1 }`

**Test Strategy:**
- Use temp directory for cache in tests (not actual `~/.dlai-mcp/`)
- Test: write then read roundtrip, TTL expiry, missing file handling, corrupt JSON handling
- Test: fallback loading when cache is missing and scraper would fail

**Acceptance Criteria:**
- [ ] Write/read roundtrip preserves all course data exactly
- [ ] `isCacheValid()` returns false for missing file, expired cache, corrupt JSON
- [ ] Cache directory is created automatically if missing
- [ ] Corrupt JSON file is handled gracefully (returns null, doesn't crash)
- [ ] `loadFallback()` reads bundled JSON and returns valid `Course[]`
- [ ] `getcourses()` returns fallback data with `"fallback"` source when cache and scraper both fail

### Step 4: MCP Tool Handlers
**Complexity:** M
**Files:** `src/tools/search-courses.ts`, `src/tools/get-course-details.ts`, `src/tools/list-topics.ts`, `tests/tools.test.ts`
**Dependencies:** Step 1 (types), Step 3 (cache)
**What it does:**

**search_courses:**
- Load courses from cache (via `getcourses()`)
- Text search: match `query` against title + description + instructors + topics (case-insensitive)
- Apply optional filters: `topic`, `level`, `partner`, `type` (exact match, case-insensitive)
- Return matching courses sorted by relevance (title match > description match)
- Zod input schema (`zod/v4`) with proper descriptions for each parameter

**get_course_details:**
- Load courses from cache (via `getcourses()`)
- Find course by slug
- If lesson data exists in cache, return it
- **If not, trigger on-demand scrape of that individual course page** using the course's `landing_page` URL, merge lesson data into cache, return full details
- Return 404-style error message if slug not found

**list_topics:**
- Load courses from cache (via `getcourses()`)
- Aggregate: count courses per topic, pick top 3 example courses per topic
- Sort topics alphabetically
- Return `{ topic, course_count, example_courses[] }`

**Test Strategy:**
- Mock cache with known dataset (10-15 sample courses covering various topics/levels)
- Test search: exact match, partial match, no match, with filters, combined filters
- Test get_course_details: valid slug, invalid slug, on-demand scrape trigger
- Test list_topics: correct counts, correct example selection, alphabetical sort

**Acceptance Criteria:**
- [ ] `search_courses({query: "RAG"})` returns courses with "RAG" in title/description/topics
- [ ] `search_courses({query: "agents", level: "Beginner"})` filters correctly
- [ ] `get_course_details({slug: "valid-slug"})` returns full course object with lessons
- [ ] `get_course_details` triggers on-demand scrape when lesson data is missing (not pre-scraped)
- [ ] `get_course_details({slug: "nonexistent"})` returns clear error message, not crash
- [ ] `list_topics()` returns topics sorted A-Z with correct course counts
- [ ] All tools use `zod/v4` input schemas with proper descriptions

### Step 5: MCP Server Wiring + STDIO Transport [REWRITTEN from v1]
**Complexity:** M
**Files:** `src/index.ts`
**Dependencies:** Step 2 (scraper), Step 3 (cache), Step 4 (tools)
**What it does:**

**Server setup using current MCP SDK API:**
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';

const server = new McpServer({ name: 'dlai-mcp-server', version: '...' });

server.registerTool('search_courses', {
    description: '...',
    inputSchema: z.object({ ... }),
}, async (args) => { ... });

// Register get_course_details and list_topics similarly

await server.connect(new StdioServerTransport());
```

**Startup sequence (catalog-only, ~1.4s):**
1. Check if cache is valid via `isCacheValid()`
2. If valid: log "Using cached catalog data" to stderr, proceed
3. If not valid: scrape **only the 7 catalog pages** (~1.4s), save to cache, log progress to stderr
4. If scrape fails: load bundled `fallback-courses.json`, log warning to stderr: `"Using bundled catalog data (may be outdated). Run with --refresh-cache to retry."`
5. Start STDIO transport via `server.connect(new StdioServerTransport())`

**Explicitly NOT done at startup:** Scraping individual course detail pages. These are fetched on-demand by `get_course_details` when a user requests a specific course.

**CLI flags:**
- `--refresh-cache`: Force re-scrape of catalog regardless of cache state
- No other flags needed for MVP

**Operational concerns:**
- All user-facing logs go to stderr (stdout is MCP protocol only)
- Graceful shutdown on SIGINT/SIGTERM

**Acceptance Criteria:**
- [ ] MCP Inspector (`npx @modelcontextprotocol/inspector node dist/index.js`) shows 3 registered tools
- [ ] Server starts in <2 seconds when cache exists
- [ ] Server scrapes catalog-only on first run (7 pages, not 121 course pages)
- [ ] Server falls back to bundled data if scraping fails, with stderr warning
- [ ] `--refresh-cache` flag forces re-scrape regardless of cache state
- [ ] No output to stdout except MCP JSON-RPC messages
- [ ] Process exits cleanly on SIGINT
- [ ] Uses `McpServer` class and `registerTool()` (not deprecated `Server`/`setRequestHandler`)

### Step 6: Build, Package + Publish
**Complexity:** S
**Files:** `package.json` (updates), `tsconfig.json` (updates), `.npmignore`, `README.md`
**Dependencies:** All previous steps
**What it does:**
- Configure `tsup` build: `src/index.ts` -> `dist/index.js` (ESM, target node18+)
- Ensure `bin/dlai-mcp-server.js` correctly references `../dist/index.js`
- **Ensure `data/fallback-courses.json` is included in the npm package** (NOT in `.npmignore`)
- `.npmignore`: exclude tests, fixtures, src (only ship dist + bin + data + README)
- `package.json` scripts: `build`, `dev`, `test`, `prepublishOnly` (runs build), `update-fallback` (scrapes catalog and writes to `data/fallback-courses.json`)
- README with:
  - What it does (1 paragraph)
  - Install via npx: `npx dlai-mcp-server`
  - Install via npm: `npm install -g dlai-mcp-server`
  - Claude Code config: exact JSON for `~/.claude.json` or `.mcp.json`
  - Example queries for each tool
  - Cache management (location, refresh, fallback behavior)
  - Note that `robots.txt` permits scraping
- `npm publish` (after local verification)

**Acceptance Criteria:**
- [ ] `npm run build` produces `dist/index.js` with no errors
- [ ] `node bin/dlai-mcp-server.js` starts the MCP server
- [ ] `npm pack` creates a tarball that includes `data/fallback-courses.json`
- [ ] `npm install -g ./dlai-mcp-server-*.tgz` works
- [ ] README has install instructions, Claude Code config, example queries, and fallback behavior docs
- [ ] `npm publish` succeeds and package is live on npmjs.com

---

## Acceptance Test Plan

**NOTE:** All raw JSON-RPC tests require the MCP 3-message handshake before any tool calls work. Use `npx @modelcontextprotocol/inspector` (the official MCP Inspector) for interactive testing, or the helper script below for CLI testing.

### Helper: MCP test script
```bash
# tests/mcp-test.sh — sends the required handshake then a tool call
#!/bin/bash
TOOL_CALL=$1
(
  echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-01-01","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}},"id":0}'
  echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  echo "$TOOL_CALL"
) | node dist/index.js 2>/dev/null | tail -1
```

### 1. Installation via npx
```bash
npx dlai-mcp-server --help    # Should show usage or start server
npm install -g dlai-mcp-server && dlai-mcp-server --help
```

### 2. search_courses works for key queries
```bash
bash tests/mcp-test.sh '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_courses","arguments":{"query":"RAG"}},"id":1}'
# Verify: response contains courses with "RAG" in title/description/topics

bash tests/mcp-test.sh '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_courses","arguments":{"query":"agents"}},"id":2}'
# Verify: response contains agent-related courses
```

### 3. get_course_details returns lesson list (on-demand scrape)
```bash
for slug in "chatgpt-prompt-engineering-for-developers" "langchain" "building-systems-with-chatgpt"; do
  bash tests/mcp-test.sh "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_course_details\",\"arguments\":{\"slug\":\"$slug\"}},\"id\":1}"
done
# Verify: each slug returns >= 1 lesson
# Verify: first call triggers network fetch; second call serves from cache
```

### 4. list_topics returns all topics
```bash
bash tests/mcp-test.sh '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_topics","arguments":{}},"id":1}'
# Verify: topics present, each with course_count > 0 and up to 3 example courses
```

### 5. Fallback behavior when scraping fails
```bash
rm -rf ~/.dlai-mcp/cache/
# Block network or mock scraper failure, then:
bash tests/mcp-test.sh '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_courses","arguments":{"query":"RAG"}},"id":1}'
# Verify: returns results from bundled fallback-courses.json
# Verify: stderr contains "Using bundled catalog data (may be outdated)"
```

### 6. Works in Claude Code via MCP config
```json
{
  "mcpServers": {
    "dlai": {
      "command": "npx",
      "args": ["-y", "dlai-mcp-server"]
    }
  }
}
```
Then in Claude Code:
- "Search for RAG courses on deeplearning.ai" -> invokes search_courses
- "Show me details for the LangChain course" -> invokes get_course_details (on-demand scrape)
- "What topics are available on deeplearning.ai?" -> invokes list_topics

### 7. Interactive testing via MCP Inspector
```bash
npx @modelcontextprotocol/inspector node dist/index.js
# Opens browser UI — test all 3 tools interactively with proper handshake
```

### 8. Unit test suite passes
```bash
npm test
# Verify: all tests pass, coverage > 80% on tool handlers
```

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|-|-|-|
| DLAI website structure changes | Scraper breaks | JSON fixtures in tests catch regressions; cache survives scraper failure; bundled fallback ensures service continuity |
| `__NEXT_DATA__` format changes | JSON extraction path breaks | Scraper logs the actual JSON structure on failure for debugging; fallback data keeps server functional |
| Rate limiting or IP blocking | Scraper can't fetch | Polite User-Agent, 200ms delay, cache means scraping is infrequent; `robots.txt` confirms scraping is permitted |
| Course count grows beyond 121 | Pagination logic wrong | Scraper reads `nbPages` dynamically from Algolia metadata, not hardcoded |
| Algolia index name changes | Hits extraction fails | Log available index names on parse failure for quick diagnosis |
| npm name taken by publish time | Can't publish | Already verified `dlai-mcp-server` is available as of 2026-04-02 |
| Scraping fails on first run | No data to serve | Bundled `fallback-courses.json` provides catalog-level data with stderr warning |

---

## Implementation Dependencies Graph

```
Step 1 (Scaffold + Types)
   |
   +-------+-------+
   |               |
Step 2 (Scraper)  Step 3 (Cache + Fallback)
   |               |
   +-------+-------+
           |
     Step 4 (Tool Handlers)
           |
     Step 5 (Server Wiring)
           |
     Step 6 (Build + Publish)
```

Steps 2 and 3 can run in parallel after Step 1 is complete.

---

## Open Questions

See `.omc/plans/open-questions.md` for tracked items.
