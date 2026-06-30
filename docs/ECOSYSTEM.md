# ResumeX Ecosystem Integration

This document describes how AutoApply, Job Searcher, Match Analyzer, and CV Formatter connect through a shared **hub contract**.

## Pipeline

```
CV Formatter → resumex_profile
Job Searcher → resumex_jobs (discover + queue)
Match Analyzer → resumex_jobs[].matchScore (score each job)
AutoApply → resumex_applications + marks job as applied
```

## localStorage keys

| Key | Purpose |
|-----|---------|
| `resumex_profile` | Canonical candidate profile (alias: `autoapply_profile`) |
| `resumex_jobs` | Job queue — discovered, saved, dismissed, applied |
| `resumex_search_prefs` | Last search filters (roles, remote, location, limit) |
| `resumex_applications` | Application log (alias: `autoapply_applications`) |

## Job object schema

See `shared/hub-contract.js` → `normalizeJob()`. Every app should use this shape:

```json
{
  "id": "job_abc123",
  "title": "Software Engineer",
  "company": "Acme",
  "location": "Remote",
  "remote": true,
  "salary": null,
  "url": "https://…",
  "platform": "greenhouse",
  "description": "…",
  "postedAt": "2026-01-15T00:00:00.000Z",
  "discoveredAt": "2026-06-30T00:00:00.000Z",
  "status": "new",
  "matchScore": null,
  "matchGaps": [],
  "matchSummary": null,
  "applySupported": true,
  "source": "arbeitnow"
}
```

**Status values:** `new` · `saved` · `dismissed` · `applied`

## Custom events (page context)

| Event | When |
|-------|------|
| `resumex:profile_updated` | Profile saved |
| `resumex:jobs_updated` | Job queue changed |
| `resumex:job_matched` | Match score written (Match Analyzer) |
| `resumex:new_application` | Application logged |

Legacy `autoapply:*` events are still emitted for backward compatibility.

## postMessage API (page ↔ extension bridge)

| Request | Response |
|---------|----------|
| `RESUMEX_GET_PROFILE` / `AUTOAPPLY_GET_PROFILE` | `AUTOAPPLY_PROFILE_RESPONSE` |
| `RESUMEX_SET_PROFILE` / `AUTOAPPLY_SET_PROFILE` | `AUTOAPPLY_PROFILE_SET_OK` |
| `RESUMEX_GET_JOBS` | `RESUMEX_JOBS_RESPONSE` |
| `RESUMEX_MERGE_JOBS` | `RESUMEX_JOBS_MERGE_OK` |
| `RESUMEX_GET_SEARCH_PREFS` | `RESUMEX_SEARCH_PREFS_RESPONSE` |
| `RESUMEX_SET_SEARCH_PREFS` | `RESUMEX_SEARCH_PREFS_SET_OK` |
| `RESUMEX_LOG_APPLICATION` / `AUTOAPPLY_LOG_APPLICATION` | `AUTOAPPLY_LOG_OK` |

## Backend API (Job Searcher)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/jobs/search` | Discover jobs from external providers |
| `POST /api/jobs/match` | Score one job against a profile (Claude) |
| `POST /api/jobs/normalize` | Normalize a manually added job object |

### Search request

```json
{
  "profile": { "personal": {}, "target": {}, "experience": {}, "skills": {} },
  "preferences": { "roles": ["Software Engineer"], "remote": true, "limit": 25 }
}
```

### Match request

```json
{
  "profile": { … },
  "job": { "title": "…", "company": "…", "description": "…", "url": "…" }
}
```

## Job providers

| Provider | Env var | Notes |
|----------|---------|-------|
| **Arbeitnow** | _(none)_ | Free, no key. Used by default. |
| **Greenhouse boards** | _(none)_ | Public board API — pass `greenhouseBoards: ["stripe"]` in search preferences. |
| **Lever boards** | _(none)_ | Public postings API — pass `leverBoards: ["netflix"]` in search preferences. |
| **JSearch** | `JSEARCH_API_KEY` | RapidAPI. Broader coverage when configured. |

## Job queue UIs

| Location | Purpose |
|----------|---------|
| `extension/jobs/dashboard.html` | Full queue UI in extension — search, match, apply, dismiss |
| `resumex-pages/jobs/` | Deploy to ResumeX at `/jobs` — same queue via localStorage |

Both read/write `resumex_jobs`. The extension also mirrors the queue to `chrome.storage.local`.

## ResumeX app checklist

To integrate a new ResumeX tool:

1. Import or copy `shared/hub-contract.js` constants
2. Read/write the appropriate localStorage keys
3. Dispatch/consume `resumex:*` events
4. For extension sync, use the postMessage types above via `resumex-bridge.js`

## AutoApply extension usage

- Popup **Search jobs** → `POST /api/jobs/search` → merges into ResumeX queue
- On apply → logs application → bridge marks matching job `status: applied`
- Popup shows **In queue** count when ResumeX tab is open
