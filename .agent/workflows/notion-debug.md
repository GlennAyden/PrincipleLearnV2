---
description: Debug masalah database Supabase
---

# Debug Database Issues

Panduan troubleshooting untuk masalah Supabase database.

## 1. Check Connection

```bash
curl http://localhost:3000/api/test-db
```

Expected response:
```json
{ "status": "connected" }
```

## 2. Verifikasi Environment Variables

Pastikan di `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## 3. Common Errors

### "relation does not exist"
- Table belum dibuat di Supabase
- Check SQL migrations di `docs/sql/`

### "permission denied for table"
- RLS policy blocking access
- Check apakah menggunakan `adminDb` (service role) atau `publicDb` (anon)
- Review policies di `docs/sql/add_rls_policies_all_tables.sql`

### "JWT expired" / "Invalid API key"
- Supabase keys expired atau salah
- Re-copy dari Supabase dashboard → Settings → API

## 4. Debug Query

```typescript
console.log('Query:', { table, filter });
const { data, error } = await adminDb
  .from(table)
  .select('*')
  .eq('column', value);
console.log('Result:', { data, error });
```

## 5. Check Supabase Dashboard

1. Buka https://supabase.com/dashboard
2. Pilih project
3. Table Editor → verifikasi data
4. SQL Editor → test query manual
5. Logs → check error logs
