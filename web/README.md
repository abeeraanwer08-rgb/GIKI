# HissabAI website

React + Vite + TypeScript. Talks only to the HissabAI FastAPI backend.

```bash
npm install
cp .env.example .env     # VITE_API_URL=http://localhost:8000
npm run dev              # http://localhost:5173
npm run build            # type-check + production build in dist/
npm run preview          # http://localhost:4173
npm test                 # unit tests (formatting, date ranges, review/save payloads)
```

The backend must be running and must allow the site's origin
(`CORS_ALLOW_ORIGINS`, defaults to the local dev and preview ports).

Structure: `src/api` (typed client), `src/auth`, `src/lib` (pure helpers, tested),
`src/components`, `src/pages` (Landing, Auth, Dashboard, Transactions, Add,
Budgets, Insights, Assistant). Routing is hash-based so the build deploys to any
static host without rewrites.
