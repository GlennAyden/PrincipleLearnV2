---
description: Test API endpoint
---

# Test API Endpoint

Workflow untuk testing API endpoint di PrincipleLearn V3.

## 1. Pastikan dev server running

// turbo
```bash
npm run dev
```

## 2. Test endpoint dengan curl

### GET Request
```bash
# Contoh test endpoint publik
curl http://localhost:3000/api/test-db

# Contoh test dengan query params
curl "http://localhost:3000/api/courses?limit=5"
```

### POST Request
```bash
# Contoh login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123"}'
```

### Authenticated Request
```bash
# Simpan token dari login, lalu gunakan
curl http://localhost:3000/api/user/profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## 3. Check Response Format

Response harus sesuai format standar:
```json
{
  "success": true,
  "data": { ... }
}
```

atau jika error:
```json
{
  "success": false,
  "error": "Error message"
}
```

## 4. Test di Browser (alternatif)

1. Buka http://localhost:3000/api/[endpoint]
2. Lihat response di browser
3. Check Network tab di DevTools

## 5. Debug Endpoints

Endpoint khusus untuk debugging:
- `/api/test-db` - Test koneksi database
- `/api/debug/users` - List semua users
- `/api/debug/course-test` - Test courses query
- `/api/debug/generate-courses` - Test AI generation

## 6. Troubleshooting

### 401 Unauthorized
- Token tidak ada atau expired
- Request ke protected endpoint tanpa auth

### 500 Internal Server Error
- Check terminal untuk error detail
- Tambahkan logging di route handler

### 404 Not Found
- Endpoint belum dibuat
- Check path/folder structure
