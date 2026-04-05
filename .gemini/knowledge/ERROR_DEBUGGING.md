# Error Debugging Guide - PrincipleLearn V3

---

## Quick Diagnosis

| Symptom | Check |
|---------|-------|
| Build fails | `npm run build` — read error output |
| Lint errors | `npm run lint` |
| Runtime error | Terminal (server), Browser console (client) |
| DB connection | `curl http://localhost:3000/api/test-db` |
| Auth fails | Check `JWT_SECRET` in `.env.local` |
| AI timeout | Check `OPENAI_API_KEY`, increase `maxDuration` |

---

## Common Errors

### Module not found
```bash
rm -rf .next node_modules && npm install
```

### Type errors
```bash
npx tsc --noEmit   # See all type errors
```

### Unauthorized (401)
- Token in `access_token` cookie?
- Token expired? Check refresh flow
- Middleware running?

### Database Error
```json
{ "error": "relation does not exist" }
```
- Check Supabase URL/keys in `.env.local`
- Verify table exists in Supabase dashboard
- Check RLS policies

### Rate Limit (429)
- Wait a few minutes
- AI rate limit: 10 req/min per user
- Auth rate limit: 5 req/15min (login)

### CORS Error
- Ensure requests go to same origin
- Check CORS headers in `next.config.ts`

---

## Debug Workflow

1. Reproduce: `rm -rf .next && npm run dev`
2. Add logging: `console.log('[DEBUG]', variable)`
3. Verify fix: `npm run lint && npm run build`
4. Cleanup: remove debug logging before commit

---

## Error Patterns

### Frontend (Browser Console)

| Error | Check |
|-------|-------|
| `TypeError: Cannot read property` | Props undefined? |
| `fetch failed` | Backend running? |
| `Hydration mismatch` | `'use client'` missing? |

### Backend (Terminal)

| Error | Check |
|-------|-------|
| `SUPABASE_SERVICE_ROLE_KEY not set` | `.env.local` exists? |
| `JWT expired` | Token lifetime, refresh flow |
| `OpenAI API timeout` | API key valid? Network? |

---

*Last updated: April 2026*
