---
description: Debug dan cari error di codebase
---

# Debug dan Cari Error

Workflow untuk mencari dan menyelesaikan error di proyek.

## 1. Identifikasi Tipe Error

### Build Error?
```bash
npm run build
```
Lihat output, biasanya ada line number dan file path.

### Runtime Error?
```bash
npm run dev
```
Lihat terminal untuk server-side errors, browser console untuk client-side.

### Lint Error?
```bash
npm run lint
```

### Type Error?
```bash
npx tsc --noEmit
```

## 2. Cari Error di Codebase

### Cari berdasarkan error message
```bash
grep -rn "error message" src/
```

### Cari console.error statements
```bash
grep -rn "console.error" src/
```

## 3. Common Fixes

### Type Error
1. Buka file yang error
2. Check interface/type definition
3. Fix type mismatch atau tambahkan type casting

### Module Not Found
1. Check path import (gunakan @/ alias)
2. Pastikan file exists
3. Restart dev server

### Database Error
- Check Supabase URL/keys di `.env.local`
- Test koneksi: `curl http://localhost:3000/api/test-db`
- Check RLS policies jika permission denied

## 4. Add Debug Logging

Tambahkan logging sementara:
```typescript
console.log('[DEBUG] variable:', variable);
```

## 5. Verify Fix

```bash
npm run lint
npm run build
npm test
```

## 6. Cleanup

Hapus debug logging yang tidak diperlukan sebelum commit.
