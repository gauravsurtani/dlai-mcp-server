# Open Questions

## dlai-mcp-server-mvp — 2026-04-02

- [ ] **Lesson content_type mapping** — The `outlineList` entries have a `type` field but the actual values used by DLAI are unknown. Need to discover and map during implementation. — *Affects Step 2 scraper accuracy*
- [ ] **Coursera-linked specializations** — Some courses link to Coursera, not `learn.deeplearning.ai`. Should `get_course_details` attempt to scrape Coursera pages or return partial data? — *Spec says Coursera is out of scope; recommend returning catalog-level data only for these*
- [ ] **Search relevance scoring** — Spec says "sorted by relevance" but doesn't define scoring weights. Title match vs description match vs topic match weights need to be decided during implementation. — *Recommend: title > topics > instructors > description*
- [ ] **Cache versioning on schema change** — If `Course` type changes between versions, old cache files may not parse. Need a migration strategy or version check + re-scrape. — *Recommend: version field in cache, invalidate on mismatch*
- [x] **Rate limit on initial scrape** — RESOLVED in v2: Startup scrapes only 7 catalog pages (~1.4s). Course details scraped on-demand per `get_course_details` call.
- [ ] **Algolia index name stability** — Scraper currently targets `courses_date_desc` index. If DLAI renames this index, extraction fails silently. — *Recommend: log available index names on parse failure for quick diagnosis*
- [ ] **Fallback data refresh cadence** — Bundled `fallback-courses.json` goes stale between npm publishes. How often should we publish just to refresh the snapshot? — *Recommend: monthly or when course count changes significantly; automate via CI*
