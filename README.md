# AutoApply

AI-powered Chrome extension that automatically fills job application forms across LinkedIn, Indeed, Greenhouse, Lever, Workday, and Jobgether — synced with a [ResumeX](https://resume-x-yixz.vercel.app) dashboard.

Part of the **ResumeX ecosystem**: CV Formatter → Match Analyzer → **Job Searcher** → AutoApply. See [docs/ECOSYSTEM.md](docs/ECOSYSTEM.md) for integration details.

## How it works

```
CV Formatter  →  profile
Job Searcher  →  job queue  →  Match Analyzer  →  scores
                       ↓
Job site form  →  Chrome extension  →  Node backend  →  Claude AI
                       ↓                                     ↓
                  ResumeX dashboard  ←  application log  ←  answers
```

The extension scrapes visible form fields, sends them along with your candidate profile to a Node.js backend, which asks Claude to fill in the best answers. Completed applications are logged to the ResumeX dashboard.

## Project structure

```
job-applier/
├── shared/
│   └── hub-contract.js       ResumeX ecosystem schema + storage keys
├── docs/
│   └── ECOSYSTEM.md          Integration guide for all ResumeX apps
├── backend/                  Node.js + Express API
│   ├── server.js             Entry point, CORS, rate limiting, auth middleware
│   ├── routes/apply.js       POST /api/apply/fill
│   ├── routes/jobs.js        POST /api/jobs/search, /match, /normalize
│   ├── services/claude.js    Anthropic Claude integration
│   ├── services/jobSearch.js Job discovery providers
│   └── services/jobMatch.js  Profile ↔ job match scoring
└── extension/                Chrome MV3 extension
    ├── manifest.json
    ├── background.js         Service worker — fetch relay, storage, logging
    ├── popup/                Extension popup UI
    └── content/              Per-platform content scripts
        ├── common.js         Shared DOM helpers (fillInput, scrapeFormFields, …)
        ├── linkedin.js       Multi-step Easy Apply loop
        ├── indeed.js         Multi-step apply loop
        ├── greenhouse.js     Single-page form fill + submit logger
        ├── lever.js          Single-page form fill + submit logger
        ├── workday.js        Multi-step apply loop
        ├── jobgether.js      Single-page form fill + submit logger
        ├── resumex.js        ResumeX content script relay
        └── resumex-bridge.js ResumeX page-context localStorage bridge
```

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...        # Get from console.anthropic.com
AUTOAPPLY_SECRET=<random-string>    # e.g. openssl rand -hex 32
PORT=3000
```

Start locally:

```bash
node server.js
```

Or deploy to Vercel — a `vercel.json` is included. After deploying, update `BACKEND_URL` in `extension/background.js` to your deployment URL.

### 2. Candidate profile

Copy the example profile and fill in your real information:

```bash
cp backend/profiles/candidate.example.json backend/profiles/candidate.json
```

`candidate.json` is git-ignored so your personal data is never committed. Then paste the JSON into the popup's **Local Profile** textarea and click **Save profile**, or use **Pull profile from ResumeX** to sync directly. The profile saved in the popup is what the extension uses — the file is just a convenient editor.

Key sections:
- `personal` — name, email, phone, LinkedIn, GitHub
- `target` — desired roles, salary range, remote preference
- `experience` — years, current title, summary
- `education` — degrees
- `skills` — languages, frameworks, tools
- `workAuthorization` — country, visa status
- `coverLetterTemplate` — base template with `{role}`, `{company}`, `{years}`, `{skills}`, `{custom_paragraph}` placeholders

### 3. Chrome extension

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `extension/` folder
4. Click the AutoApply icon in the toolbar
5. In the popup, paste your `AUTOAPPLY_SECRET` value (from `.env`) into the **Backend Secret** field and click **Save secret** — this is stored in `chrome.storage.local`, not in source code
6. Save your candidate profile (or pull it from ResumeX)

## Usage

### LinkedIn Easy Apply
Navigate to a job on LinkedIn and click **Easy Apply**. An ⚡ **Auto-Apply** button appears in the modal — click it to fill and auto-advance through all steps. The extension stops and warns you if any required field is still empty before submitting.

### Indeed
Open an Indeed job and click **Apply now**. The ⚡ button appears fixed to the top-right — click it to fill and advance through all steps.

### Greenhouse / Lever / Jobgether
Open a job application page. The ⚡ button is injected at the top of the form. Click it to fill, review the answers, then submit yourself — the application is logged to ResumeX when you click the submit button.

### Workday
Open a Workday job application. The ⚡ button is fixed top-right. Click it to fill and auto-advance through all steps.

## Security notes

- **`AUTOAPPLY_SECRET`**: set a strong random value in both the backend `.env` and the extension popup. The backend rejects all requests without a matching `X-Autoapply-Key` header.
- **Rate limiting**: the backend allows 30 API requests per minute per IP to prevent runaway Anthropic usage. Note: `express-rate-limit` uses in-memory state, so each Vercel serverless invocation has an independent counter — rate limits are not enforced across cold-start instances. For stricter enforcement, replace the default store with a Redis-backed one (e.g. [`rate-limit-redis`](https://www.npmjs.com/package/rate-limit-redis)).
- **Profile data**: your candidate profile is stored in `chrome.storage.local` (local to your browser, not synced). It is sent to your own backend only — never to third parties.

## Development

### Running backend tests

```bash
cd backend
npm test
```

Tests use Jest + supertest with Anthropic fully mocked — no real API calls are made.

### Local backend with auto-reload

```bash
cd backend
npm run dev   # uses nodemon
```

### Extension reload after code changes

After editing any file in `extension/`, go to `chrome://extensions`, find AutoApply, and click the ↺ reload button. Content scripts reload automatically on next page visit; the background service worker reloads immediately.

## Backend deployment (Vercel)

```bash
cd backend
npx vercel
```

Set environment variables in the Vercel dashboard:
- `ANTHROPIC_API_KEY`
- `AUTOAPPLY_SECRET`

After deployment, update `BACKEND_URL` in `extension/background.js` to the new URL, then reload the extension.
