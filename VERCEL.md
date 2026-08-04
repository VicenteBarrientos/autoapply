# Deploying AutoApply Backend on Vercel

## Project setup

1. Import the **autoapply** repo on [Vercel](https://vercel.com).
2. **Do not** set a Root Directory — the root `vercel.json` routes to `backend/server.js`.
3. Add environment variables (Production + Preview):

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key (`sk-ant-...`) — **required** for apply, jobs, and profile parse |
| `AUTOAPPLY_SECRET` | Shared secret — same value as in the Chrome extension popup |
| `AUTOAPPLY_SECRET_NEXT` | Optional second shared secret used only during zero-downtime rotation |
| `JSEARCH_API_KEY` | Optional — broader job search via JSearch |

4. Deploy. Verify:

```bash
curl https://YOUR-PROJECT.vercel.app/health
# → {"ok":true,"anthropicConfigured":true,"authRequired":true}

curl -H "X-Autoapply-Key: $AUTOAPPLY_SECRET" https://YOUR-PROJECT.vercel.app/api/auth/check
# → {"ok":true,"authRequired":true}

curl https://YOUR-PROJECT.vercel.app/
# → JSON with endpoints list
```

## Troubleshooting 404

- **404 NOT_FOUND** at the project URL usually means Vercel deployed the repo root without finding `server.js`. Ensure root `vercel.json` is committed and redeploy.
- If you set **Root Directory** to `backend` in the Vercel dashboard, remove it (or use only `backend/vercel.json` with Root Directory = `backend` — pick one approach, not both).

## Extension / ResumeX

Set the backend URL in the extension popup to your Vercel URL (default: `https://autoapply-rwhg.vercel.app`).

## Rotate the shared secret without downtime

1. Generate a new random value and store it outside the repository.
2. Set it as `AUTOAPPLY_SECRET_NEXT` in Development, Preview, and Production.
3. Redeploy and verify `/api/auth/check` accepts both the current and next values.
4. Update the extension and ResumeX clients to use the next value.
5. Promote the next value to `AUTOAPPLY_SECRET`, remove `AUTOAPPLY_SECRET_NEXT`, and redeploy.
6. Verify the former value now receives HTTP 401.
