# Deploying AutoApply Backend on Vercel

## Project setup

1. Import the **autoapply** repo on [Vercel](https://vercel.com).
2. **Do not** set a Root Directory — the root `vercel.json` routes to `backend/server.js`.
3. Add environment variables (Production + Preview):

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key (`sk-ant-...`) — **required** for apply, jobs, and profile parse |
| `AUTOAPPLY_SECRET` | Shared secret — same value as in the Chrome extension popup |
| `JSEARCH_API_KEY` | Optional — broader job search via JSearch |

4. Deploy. Verify:

```bash
curl https://YOUR-PROJECT.vercel.app/health
# → {"ok":true,"anthropicConfigured":true,"authRequired":true}

curl https://YOUR-PROJECT.vercel.app/
# → JSON with endpoints list
```

## Troubleshooting 404

- **404 NOT_FOUND** at the project URL usually means Vercel deployed the repo root without finding `server.js`. Ensure root `vercel.json` is committed and redeploy.
- If you set **Root Directory** to `backend` in the Vercel dashboard, remove it (or use only `backend/vercel.json` with Root Directory = `backend` — pick one approach, not both).

## Extension / ResumeX

Set the backend URL in the extension popup to your Vercel URL (default: `https://autoapply-rwhg.vercel.app`).
