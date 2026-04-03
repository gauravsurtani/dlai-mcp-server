# DLAI MCP Server — Comprehensive Code Review

**Date:** 2026-04-03
**Reviewer:** Code Reviewer (Opus)
**Files Reviewed:** 11 source files + tests + config
**Scope:** Bugs, Security, Reliability, Performance, MCP Correctness, Production Readiness

---

## Summary

| Severity | Count |
|-|-|
| CRITICAL | 1 |
| HIGH | 4 |
| MEDIUM | 6 |
| LOW | 5 |
| **Total** | **16** |

**Verdict: REQUEST CHANGES** — 1 CRITICAL and 4 HIGH issues must be resolved before production use.

---

## Issues

### CRITICAL

#### [CRITICAL-1] New McpServer + Transport created per HTTP request — memory leak and broken session semantics
**File:** `src/index.ts:180-189`
```typescript
if (req.url === '/mcp') {
  const { server, setCourses } = createServer();   // NEW server per request
  setCourses(courses);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });
  await server.connect(transport);
  await transport.handleRequest(req, res);
  return;
}
```
**Issue:** Every single HTTP request to `/mcp` creates a brand new `McpServer` instance, connects a new `StreamableHTTPServerTransport`, and never cleans them up. This causes:
1. **Memory leak** — each request allocates a server+transport pair that is never disconnected/GC'd. Under sustained traffic this will OOM the container.
2. **Broken MCP sessions** — the Streamable HTTP transport is designed to be stateful. The client sends an `Mcp-Session-Id` header on subsequent requests expecting to reach the *same* transport instance. Creating a new transport per request means the session ID returned on the first request can never be found again, breaking multi-turn MCP interactions (e.g., tool calls that depend on prior state).
3. **No `server.close()` / `transport.close()`** — resources are orphaned.

**Fix:** Create a single `McpServer` at startup (or use a session-map pattern). Store transport instances in a `Map<sessionId, transport>` and route incoming requests to the correct transport by session ID. Add cleanup (timeout or explicit `DELETE` handling) to prevent unbounded growth. The MCP SDK's `StreamableHTTPServerTransport` docs show a session-map pattern — follow that.

---

### HIGH

#### [HIGH-1] `forceRefresh` parameter is ignored — dead code path
**File:** `src/index.ts:128-134`
```typescript
async function loadCourses(forceRefresh: boolean) {
  const scraper = async () => {
    log('Fetching catalog from Algolia...');
    return scrapeCatalog();
  };
  const { courses, source } = await getCourses(forceRefresh ? scraper : scraper);
  //                                            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //                                            Both branches pass the same value
```
**Issue:** The ternary `forceRefresh ? scraper : scraper` evaluates to `scraper` regardless of the flag. The `--refresh-cache` CLI flag advertised in logs has no effect. `getCourses()` will still return cached data if the cache is valid, ignoring the user's intent.
**Fix:** When `forceRefresh` is true, bypass the cache entirely. Either (a) pass a flag to `getCourses` to skip the validity check, or (b) delete the cache file before calling `getCourses`, or (c) add a `forceRefresh` parameter to `getCourses`.

#### [HIGH-2] CORS `Access-Control-Allow-Origin: *` on the MCP endpoint
**File:** `src/index.ts:161`
```typescript
res.setHeader('Access-Control-Allow-Origin', '*');
```
**Issue:** The wildcard CORS header allows any origin to make requests to the MCP endpoint. If the server is deployed with authentication or is serving sensitive data, any website can make cross-origin requests. For an MCP server that is typically accessed by trusted clients (Claude Desktop, CLI tools), this is overly permissive.
**Fix:** Restrict to known origins via an environment variable `ALLOWED_ORIGINS`, or remove CORS entirely if only server-to-server communication is expected. At minimum, do not allow `*` in production.

#### [HIGH-3] Race condition in concurrent `getCourseDetails` cache writes
**File:** `src/tools/get-course-details.ts:46-55`
```typescript
const details = await scrapeCourseDetails(course);
const cached = await loadCache();          // read
if (cached) {
  const idx = cached.courses.findIndex(c => c.slug === slug);
  if (idx >= 0) {
    cached.courses[idx] = { ... };
    await saveCache(cached.courses);       // write
  }
}
```
**Issue:** If two concurrent `get_course_details` calls run for different slugs, both will `loadCache()`, get the same snapshot, mutate different entries, and the second `saveCache()` will overwrite the first's update. This is a classic read-modify-write race condition. Additionally, the in-memory `coursesCache` in `index.ts:74` is also mutated without coordination.
**Fix:** Add a file lock (e.g., `proper-lockfile` or `lockfile` npm package) around the read-modify-write cycle. Alternatively, serialize cache writes through a queue/mutex.

#### [HIGH-4] Algolia pagination hardcoded to 200 — silent data loss if catalog grows
**File:** `src/scraper.ts:177`
```typescript
const url = `...?query=&hitsPerPage=200`;
```
**Issue:** The Algolia API request hard-caps at 200 results. If DLAI's catalog exceeds 200 courses, the rest are silently dropped. Algolia's default max is 1000, but the code does not paginate or check `data.nbHits` to detect truncation.
**Fix:** After the first request, check `data.nbHits > data.hits.length` and either (a) paginate using `page` parameter until all are fetched, or (b) increase `hitsPerPage` and log a warning if truncation is detected.

---

### MEDIUM

#### [MEDIUM-1] `as any` type-safety bypasses in production code
**Files:**
- `src/tools/get-course-details.ts:10-12` — `(course as any).prerequisites`, `.learning_outcomes`, `.total_duration`
- `src/scraper.ts:66` — `(data as any).props?.pageProps`

**Issue:** These `as any` casts bypass TypeScript's type system. If the `Course` type does not include `prerequisites`/`learning_outcomes`/`total_duration`, accessing them via `as any` hides a structural problem — the `Course` interface should be extended or a separate enriched type should be used.
**Fix:** Extend the `Course` interface with optional `prerequisites?: string`, `learning_outcomes?: string[]`, `total_duration?: string` fields, or use a discriminated union. For `scraper.ts:66`, define a `NextData` interface matching the expected shape.

#### [MEDIUM-2] No request body size limit on HTTP endpoint
**File:** `src/index.ts:159`
**Issue:** The raw `http.createServer` handler does not limit request body size. A malicious client could send an arbitrarily large body, consuming server memory.
**Fix:** Add a body size check (e.g., reject requests > 1MB) or use the MCP SDK's built-in handling if it provides one. Example: accumulate body chunks and abort if total exceeds threshold.

#### [MEDIUM-3] No HTTP `DELETE` handler for session cleanup
**File:** `src/index.ts:159-218`
**Issue:** The MCP Streamable HTTP spec requires a `DELETE /mcp` endpoint for clients to terminate sessions. The current handler only matches POST (via `transport.handleRequest`) and GET routes. If a client sends `DELETE /mcp`, it falls through to the 404 handler.
**Fix:** Route `DELETE /mcp` requests to the transport's session cleanup handler. This is part of the MCP Streamable HTTP spec.

#### [MEDIUM-4] Double cache read in `getCourses` — `isCacheValid` then `loadCache`
**File:** `src/cache.ts:88-92`
```typescript
if (await isCacheValid()) {        // reads cache file
  const data = await loadCache();  // reads cache file AGAIN
```
**Issue:** `isCacheValid()` internally calls `loadCache()` to read the file, then `getCourses` calls `loadCache()` again. This is 2 unnecessary file reads per cache hit.
**Fix:** Have `isCacheValid` return the parsed data (or `null` if invalid), so a single read suffices: `const data = await getValidCache(); if (data) return { courses: data.courses, source: 'cache' };`

#### [MEDIUM-5] Fallback data contains only 2 courses (44 lines)
**File:** `data/fallback-courses.json`
**Issue:** The fallback dataset has only 2 courses. If the Algolia API is down and cache is cold, users get an almost-empty catalog. This makes the fallback nearly useless as a safety net.
**Fix:** Run `npm run update-fallback` to populate with the full catalog before publishing. Consider adding a CI step to keep it updated.

#### [MEDIUM-6] No input validation/sanitization on tool parameters
**Files:** `src/index.ts:28-33` (search_courses), `src/index.ts:60` (get_course_details)
**Issue:** While Zod provides type validation, there is no length limit on `query`, `slug`, etc. An extremely long query string could cause performance issues in the substring matching logic. The `slug` parameter is not validated against a safe pattern (e.g., `^[a-z0-9-]+$`), which could be problematic if slugs are ever used in URL construction.
**Fix:** Add `.max(200)` to the query Zod schema. Add `.regex(/^[a-z0-9-]+$/)` to the slug schema.

---

### LOW

#### [LOW-1] `search_courses` returns no results silently when `coursesCache` is empty
**File:** `src/index.ts:35`
**Issue:** If `loadCourses` fails and returns an empty array (e.g., all three sources fail), every tool call returns empty results with no indication of why. The user gets `[]` with no error context.
**Fix:** Check `coursesCache.length === 0` and return a helpful message: "No courses loaded. Server may have failed to fetch the catalog."

#### [LOW-2] `bin/dlai-mcp-server.js` uses bare import with no error handling
**File:** `bin/dlai-mcp-server.js:2`
```javascript
import '../dist/index.js';
```
**Issue:** If `dist/` does not exist (user runs without building), this throws an unhelpful `ERR_MODULE_NOT_FOUND`. There's no build check or friendly error.
**Fix:** Add a check: `import { existsSync } from 'fs'; if (!existsSync(...)) { console.error('Run npm run build first'); process.exit(1); }`

#### [LOW-3] `package.json` version not synced with `createServer` version
**Files:** `package.json:3` (version `1.0.0`), `src/index.ts:18` (version `1.0.0`)
**Issue:** The version string is duplicated in two places. When bumping versions, one may be missed.
**Fix:** Import version from `package.json` at build time (tsup can inline it) or use a single source of truth.

#### [LOW-4] Docker build target mismatch: builds with `--target node18` but runs on `node:22-slim`
**File:** `Dockerfile:1,7`
**Issue:** The build step uses `--target node18` (ES2022 downlevel output) but runs on Node 22. This is not a bug per se, but it means the output is unnecessarily downleveled — Node 22 supports all ES2024 features natively. Slightly less efficient code generation.
**Fix:** Change tsup target to `node22` to match the runtime, or standardize on one.

#### [LOW-5] Missing `--dts` flag in Dockerfile build command
**File:** `Dockerfile:7`
```dockerfile
RUN npx tsup src/index.ts --format esm --target node18
```
vs `package.json`:
```json
"build": "tsup src/index.ts --format esm --target node18 --dts"
```
**Issue:** The Dockerfile build omits `--dts` (declaration files). While declarations are not needed at runtime, this means the Docker build is inconsistent with `npm run build`. Not a runtime issue, but a process smell.
**Fix:** Either add `--dts` to the Dockerfile or remove it from both (since DTS is only needed for library consumers, not the server runtime).

---

## Positive Observations

1. **Clean architecture** — Good separation of concerns: scraper, cache, tools, and types are in separate modules with clear responsibilities.
2. **Graceful degradation** — The three-tier fallback (cache -> live -> bundled) is a solid resilience pattern. The server always starts even if Algolia is down.
3. **Good test coverage for parsing** — `scraper.test.ts` covers edge cases (empty hits, missing fields, instructor format variations). `cache.test.ts` uses a factory pattern to avoid touching the real filesystem.
4. **Proper error propagation** — Errors in `get_course_details` are caught and returned as MCP `isError: true` responses instead of crashing the server.
5. **MCP SDK usage is mostly correct** — Tool registration with Zod schemas, proper content types, STDIO transport setup all follow the SDK patterns.
6. **Dockerfile uses multi-stage build** — Keeps the production image small by excluding devDependencies and source files.
7. **Railway configuration is clean** — Health check, restart policy, and Docker build are properly configured.

---

## Recommendation

**REQUEST CHANGES**

The CRITICAL-1 issue (per-request server/transport creation) is a memory leak and breaks MCP session semantics — this must be fixed before any production deployment. HIGH-1 (`forceRefresh` dead code) and HIGH-3 (cache race condition) are also important for correctness. HIGH-2 (CORS wildcard) should be tightened before exposing to the internet.

### Priority fix order:
1. CRITICAL-1 — Fix HTTP session management (session-map pattern)
2. HIGH-1 — Fix `forceRefresh` dead code
3. HIGH-3 — Add cache write serialization
4. HIGH-2 — Restrict CORS
5. HIGH-4 — Add pagination / truncation detection
6. MEDIUM issues — address in a follow-up pass
