# DLAI MCP Server — Implementation Plan

## Metadata
- **Plan ID:** dlai-mcp-server-mvp
- **Created:** 2026-04-02
- **Source Spec:** `.omc/specs/deep-interview-dlai-mcp.md` (14% ambiguity)
- **Complexity:** MEDIUM (greenfield, ~8 files, well-defined scope)
- **Estimated Effort:** 1-2 days

---

## RALPLAN-DR Summary

### Principles (5)
1. **Public-data-first** — MVP uses only publicly available data from deeplearning.ai; no internal APIs.
2. **Cache-over-network** — Every query serves from local JSON; scraping is a background/setup concern.
3. **Standard MCP patterns** — Follow @modelcontextprotocol/sdk conventions exactly (STDIO transport, Zod schemas, Server class).
4. **Zero-config install** — `npx dlai-mcp-server` must work out of the box with no setup beyond MCP config.
5. **Incrementally testable** — Each layer (scraper, cache, tools, server) works and tests independently.

### Decision Drivers (Top 3)
1. **Time to working demo** — Must produce a "wow" demo for the DLAI eng team quickly.
2. **Reliability of scraped data** — Website structure may change; scraper must be resilient and cache must survive failures.
3. **npm publishability** — Package must install globally or via npx and register as an MCP server in one config line.

### Viable Options

#### Option A: Monolithic single-file server (REJECTED)
- **Pros:** Fastest to write, simplest bundling, smallest package.
- **Cons:** Untestable scraper logic, hard to extend for Phase 2-4, mixes transport/business/IO concerns.
- **Rejection rationale:** Violates Principle 5 (incrementally testable). Scraper and tool logic intertwined makes debugging cache vs. parsing issues impossible.

#### Option B: Layered modules — Scraper / Cache / Tools / Server (SELECTED)
- **Pros:** Each module testable in isolation, clear extension points for Phase 2+, scraper can run standalone for debugging.
- **Cons:** Slightly more files (~8 vs ~2), requires explicit wiring.
- **Why chosen:** Aligns with all 5 principles. The marginal overhead of 6 extra files is trivial for a TypeScript project. Enables TDD workflow.

#### Option C: Database-backed (SQLite) with ORM
- **Pros:** Structured queries, future-proof for 500+ courses.
- **Cons:** Heavy dependency for 121 records, complicates npx install (native bindings), overkill for MVP.
- **Rejection rationale:** JSON file cache handles 121 courses trivially. Spec explicitly chose JSON. SQLite can be Phase 3+ migration.

### ADR (Architectural Decision Record)
- **Decision:** Layered module architecture with JSON file cache
- **Drivers:** Testability, time-to-demo, npx compatibility
- **Alternatives considered:** Monolithic (rejected: untestable), SQLite (rejected: overkill)
- **Why chosen:** Best balance of speed, testability, and extensibility
- **Consequences:** ~8 source files, explicit module wiring, but each piece works independently
- **Follow-ups:** Evaluate SQLite migration if catalog exceeds 500 courses in Phase 3+

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
│   ├── index.ts                  # Entry point — creates server, registers tools, starts STDIO
│   ├── scraper.ts                # Cheerio-based catalog + course page scraper
│   ├── cache.ts                  # JSON file cache read/write/refresh logic
│   ├── tools/
│   │   ├── search-courses.ts     # search_courses tool definition + handler
│   │   ├── get-course-details.ts # get_course_details tool definition + handler
│   │   └── list-topics.ts        # list_topics tool definition + handler
│   └── types.ts                  # Course, Lesson, Topic interfaces
├── bin/
│   └── dlai-mcp-server.js        # CLI shebang entry (#!/usr/bin/env node)
└── tests/
    ├── scraper.test.ts           # Scraper tests with HTML fixtures
    ├── cache.test.ts             # Cache read/write/TTL tests
    ├── tools.test.ts             # Tool handler unit tests (mocked cache)
    └── fixtures/
        ├── catalog-page.html     # Saved HTML for scraper tests
        └── course-page.html      # Saved HTML for course detail tests
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
- Create bin shebang file that requires the built output
- Write CLAUDE.md with project-specific instructions

**Acceptance Criteria:**
- [ ] `npm install` succeeds with zero errors
- [ ] `npx tsc --noEmit` passes on `src/types.ts`
- [ ] `package.json` has `"bin": { "dlai-mcp-server": "./bin/dlai-mcp-server.js" }`
- [ ] `package.json` has `"type": "module"` and correct `"main"` / `"types"` fields

### Step 2: Scraper Module
**Complexity:** L  
**Files:** `src/scraper.ts`, `tests/scraper.test.ts`, `tests/fixtures/catalog-page.html`, `tests/fixtures/course-page.html`  
**Dependencies:** Step 1 (types)  
**What it does:**
- `scrapeCatalog()`: Fetches all 7 pages of `/courses/?page=N`, parses course cards via Cheerio
  - Extract: title, slug, description, instructors, level, partner, duration, type, topics, url
  - Also check for Schema.org JSON-LD on the catalog page for structured data
  - Handle pagination: detect total pages from pagination controls, iterate all
- `scrapeCourseDetails(slug)`: Fetches individual course page, extracts lesson list
  - Parse lesson titles, durations, content types from course syllabus section
  - Extract prerequisites, learning outcomes, total duration
- Both functions return typed objects (`Course[]`, `CourseDetails`)
- Respect rate limiting: sequential fetches with 200ms delay between pages
- User-Agent header to identify bot politely

**Test Strategy:**
- Save real HTML from deeplearning.ai as fixtures (one catalog page, one course page)
- Unit tests parse fixtures — no network calls in tests
- Test edge cases: missing fields, unexpected HTML structure, empty results

**Acceptance Criteria:**
- [ ] `scrapeCatalog()` parses fixture HTML and returns `Course[]` with all required fields
- [ ] `scrapeCourseDetails("chatgpt-prompt-engineering-for-developers")` parses fixture and returns lessons
- [ ] Handles missing optional fields gracefully (no crashes on partial data)
- [ ] Rate limiting between page fetches is present (200ms delay)

### Step 3: Cache Module
**Complexity:** S  
**Files:** `src/cache.ts`, `tests/cache.test.ts`  
**Dependencies:** Step 1 (types)  
**What it does:**
- Cache directory: `~/.dlai-mcp/cache/`
- `loadCache()`: Read `courses.json`, return parsed data or null if missing/expired
- `saveCache(data)`: Write `courses.json` with `lastUpdated` timestamp
- `isCacheValid(maxAge?)`: Check if cache exists and is within TTL (default 24h)
- `getCachePath()`: Returns resolved path to cache directory
- `ensureCacheDir()`: Creates `~/.dlai-mcp/cache/` if it doesn't exist
- Cache format: `{ courses: Course[], lastUpdated: string, version: 1 }`

**Test Strategy:**
- Use temp directory for cache in tests (not actual `~/.dlai-mcp/`)
- Test: write then read roundtrip, TTL expiry, missing file handling, corrupt JSON handling

**Acceptance Criteria:**
- [ ] Write/read roundtrip preserves all course data exactly
- [ ] `isCacheValid()` returns false for missing file, expired cache, corrupt JSON
- [ ] Cache directory is created automatically if missing
- [ ] Corrupt JSON file is handled gracefully (returns null, doesn't crash)

### Step 4: MCP Tool Handlers
**Complexity:** M  
**Files:** `src/tools/search-courses.ts`, `src/tools/get-course-details.ts`, `src/tools/list-topics.ts`, `tests/tools.test.ts`  
**Dependencies:** Step 1 (types), Step 3 (cache)  
**What it does:**

**search_courses:**
- Load courses from cache
- Text search: match `query` against title + description + instructors + topics (case-insensitive)
- Apply optional filters: `topic`, `level`, `partner`, `type` (exact match, case-insensitive)
- Return matching courses sorted by relevance (title match > description match)
- Zod input schema with proper descriptions for each parameter

**get_course_details:**
- Load courses from cache
- Find course by slug
- If lesson data exists in cache, return it
- If not, trigger scrape of individual course page, merge into cache, return full details
- Return 404-style error message if slug not found

**list_topics:**
- Load courses from cache
- Aggregate: count courses per topic, pick top 3 example courses per topic
- Sort topics alphabetically
- Return `{ topic, course_count, example_courses[] }`

**Test Strategy:**
- Mock cache with known dataset (10-15 sample courses covering various topics/levels)
- Test search: exact match, partial match, no match, with filters, combined filters
- Test get_course_details: valid slug, invalid slug, missing lesson data trigger
- Test list_topics: correct counts, correct example selection, alphabetical sort

**Acceptance Criteria:**
- [ ] `search_courses({query: "RAG"})` returns courses with "RAG" in title/description/topics
- [ ] `search_courses({query: "agents", level: "Beginner"})` filters correctly
- [ ] `get_course_details({slug: "valid-slug"})` returns full course object with lessons
- [ ] `get_course_details({slug: "nonexistent"})` returns clear error message, not crash
- [ ] `list_topics()` returns topics sorted A-Z with correct course counts
- [ ] All tools have Zod input schemas with proper descriptions

### Step 5: MCP Server Wiring + STDIO Transport
**Complexity:** M  
**Files:** `src/index.ts`  
**Dependencies:** Step 2 (scraper), Step 3 (cache), Step 4 (tools)  
**What it does:**
- Create MCP `Server` instance with name `"dlai-mcp-server"` and version from package.json
- Register all 3 tools via `server.setRequestHandler(ListToolsRequestSchema, ...)` and `server.setRequestHandler(CallToolRequestSchema, ...)`
- On startup:
  1. Check if cache is valid
  2. If not, run `scrapeCatalog()` to populate cache (log progress to stderr)
  3. Start STDIO transport via `server.connect(new StdioServerTransport())`
- Add `--refresh-cache` CLI flag to force re-scrape
- All user-facing logs go to stderr (stdout is MCP protocol)
- Graceful shutdown on SIGINT/SIGTERM

**Acceptance Criteria:**
- [ ] `echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/index.js` returns 3 tools
- [ ] Server starts without error when cache exists
- [ ] Server scrapes and caches on first run when no cache exists
- [ ] `--refresh-cache` flag forces re-scrape regardless of cache state
- [ ] No output to stdout except MCP JSON-RPC messages
- [ ] Process exits cleanly on SIGINT

### Step 6: Build, Package + Publish
**Complexity:** S  
**Files:** `package.json` (updates), `tsconfig.json` (updates), `.npmignore`, `README.md`  
**Dependencies:** All previous steps  
**What it does:**
- Configure `tsup` build: `src/index.ts` -> `dist/index.js` (ESM, target node18+)
- Ensure `bin/dlai-mcp-server.js` correctly references `../dist/index.js`
- `.npmignore`: exclude tests, fixtures, src (only ship dist + bin + README)
- `package.json` scripts: `build`, `dev`, `test`, `prepublishOnly` (runs build)
- README with:
  - What it does (1 paragraph)
  - Install via npx: `npx dlai-mcp-server`
  - Install via npm: `npm install -g dlai-mcp-server`
  - Claude Code config: exact JSON for `~/.claude.json` or `.mcp.json`
  - Example queries for each tool
  - Cache management (location, refresh)
- `npm publish` (after local verification)

**Acceptance Criteria:**
- [ ] `npm run build` produces `dist/index.js` with no errors
- [ ] `node bin/dlai-mcp-server.js` starts the MCP server
- [ ] `npm pack` creates a tarball; `npm install -g ./dlai-mcp-server-*.tgz` works
- [ ] README has install instructions, Claude Code config, and example queries
- [ ] `npm publish` succeeds and package is live on npmjs.com

---

## Acceptance Test Plan

These are concrete commands/checks to verify each acceptance criterion from the spec.

### 1. Installation via npx
```bash
# After npm publish
npx dlai-mcp-server --help    # Should show usage or start server
npm install -g dlai-mcp-server && dlai-mcp-server --help
```

### 2. search_courses works for key queries
```bash
# Via MCP inspector or direct JSON-RPC
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_courses","arguments":{"query":"RAG"}},"id":1}' | node dist/index.js
# Verify: response contains courses with "RAG" in title/description/topics

echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_courses","arguments":{"query":"agents"}},"id":2}' | node dist/index.js
# Verify: response contains agent-related courses

echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_courses","arguments":{"query":"prompt engineering"}},"id":3}' | node dist/index.js
# Verify: response contains prompt engineering courses
```

### 3. get_course_details returns lesson list
```bash
# Test with 5 known course slugs
for slug in "chatgpt-prompt-engineering-for-developers" "langchain" "building-systems-with-chatgpt" "langchain-chat-with-your-data" "ai-agents-in-langgraph"; do
  echo "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_course_details\",\"arguments\":{\"slug\":\"$slug\"}},\"id\":1}" | node dist/index.js | python3 -c "import sys,json; r=json.load(sys.stdin); d=json.loads(r['result']['content'][0]['text']); print(f'{slug}: {len(d.get(\"lessons\",[]))} lessons')"
done
# Verify: each slug returns >= 1 lesson
```

### 4. list_topics returns all 37 topics
```bash
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_topics","arguments":{}},"id":1}' | node dist/index.js | python3 -c "import sys,json; r=json.load(sys.stdin); topics=json.loads(r['result']['content'][0]['text']); print(f'{len(topics)} topics'); [print(f'  {t[\"topic\"]}: {t[\"course_count\"]} courses') for t in topics[:5]]"
# Verify: 37 topics, each with course_count > 0 and 3 example courses
```

### 5. Works in Claude Code via MCP config
```json
// Add to ~/.claude.json or project .mcp.json:
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
- Type: "Search for RAG courses on deeplearning.ai" — should invoke search_courses
- Type: "Show me details for the LangChain course" — should invoke get_course_details
- Type: "What topics are available on deeplearning.ai?" — should invoke list_topics

### 6. Cache refresh
```bash
# Delete cache and verify it rebuilds
rm -rf ~/.dlai-mcp/cache/
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/index.js
ls ~/.dlai-mcp/cache/courses.json   # Should exist now

# Force refresh
node dist/index.js --refresh-cache &
sleep 10 && kill %1
stat ~/.dlai-mcp/cache/courses.json  # Modified time should be recent
```

### 7. Response time < 500ms for cached queries
```bash
# After cache is populated, measure response time
time (echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_courses","arguments":{"query":"RAG"}},"id":1}' | node dist/index.js > /dev/null)
# Verify: real time < 0.5s (most of this is Node startup; actual handler is <10ms)
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
| DLAI website structure changes | Scraper breaks | HTML fixtures in tests catch regressions; cache survives scraper failure |
| Rate limiting or IP blocking | Scraper can't fetch | Polite User-Agent, 200ms delay, cache means scraping is infrequent |
| Course count grows beyond 121 | Pagination logic wrong | Scraper dynamically detects page count from pagination controls |
| JSON-LD schema changes | Structured data parsing fails | Fallback to HTML parsing; JSON-LD is supplementary, not primary |
| npm name taken by publish time | Can't publish | Already verified `dlai-mcp-server` is available as of 2026-04-02 |

---

## Implementation Dependencies Graph

```
Step 1 (Scaffold + Types)
   |
   +-------+-------+
   |               |
Step 2 (Scraper)  Step 3 (Cache)
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
