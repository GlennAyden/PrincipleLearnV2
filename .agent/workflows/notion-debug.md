---
description: Debug masalah Notion API
---

# Debug Notion API Issues

Panduan troubleshooting untuk masalah Notion database.

## 1. Check Connection

// turbo
Test koneksi database:

```bash
curl http://localhost:3000/api/test-db
```

Atau buka di browser: http://localhost:3000/api/test-db

Expected response:
```json
{
  "status": "connected",
  "database": "notion"
}
```

## 2. Verifikasi Environment Variables

Pastikan di `.env.local`:

```
NOTION_TOKEN_1=secret_xxx
NOTION_TOKEN_2=secret_yyy
NOTION_TOKEN_3=secret_zzz
```

- Token harus valid (belum expired)
- Token harus punya akses ke database yang dibutuhkan

## 3. Check Rate Limit (429 Error)

### Gejala:
- Error 429 Too Many Requests
- Response lambat
- Data tidak konsisten

### Solusi:
1. Tunggu beberapa menit
2. Pastikan menggunakan 3 token berbeda
3. Tambahkan delay untuk batch operations:

```typescript
for (const item of items) {
  await processItem(item);
  await new Promise(r => setTimeout(r, 500)); // 500ms delay
}
```

## 4. Check Database ID

Verifikasi database ID di `src/lib/database.ts`:

1. Buka Notion database di browser
2. Copy ID dari URL: `notion.so/xxx?v=yyy` → ID adalah `xxx`
3. Pastikan ID sama dengan yang di TABLE_MAPPING

## 5. Check Property Names

Notion property names case-sensitive!

- Pastikan column names di code sama persis dengan di Notion
- Gunakan Title Case jika itu yang ada di Notion

## 6. Clear Cache

Restart dev server untuk clear cache:

```bash
# Stop server (Ctrl+C)
npm run dev
```

## 7. Debug Query

Tambahkan logging untuk debug:

```typescript
console.log('Query:', { table, filter });
const { data, error } = await adminDb
  .from(table)
  .select('*')
  .eq('column', value);
console.log('Result:', { data, error });
```

## 8. Common Errors

### "Could not find database"
- Database ID salah
- Token tidak punya akses ke database

### "Property not found"
- Nama kolom salah (case-sensitive)
- Kolom belum dibuat di Notion

### "Rate limited"
- Terlalu banyak request
- Tunggu dan retry

### "Unauthorized"
- Token expired atau invalid
- Regenerate token di Notion Integrations

## 9. Regenerate Notion Token

1. Buka https://www.notion.so/my-integrations
2. Pilih integration yang digunakan
3. Copy token baru
4. Update di `.env.local`
5. Restart dev server
