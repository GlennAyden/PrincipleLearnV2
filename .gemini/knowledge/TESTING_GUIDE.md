# Testing Guide - PrincipleLearn V3

Panduan lengkap untuk testing di proyek PrincipleLearn V3.

---

## 📋 Overview

Proyek ini menggunakan pendekatan testing pragmatis:
- **Manual Testing** via API endpoints
- **Debug Endpoints** untuk testing database
- **Script Testing** untuk utility functions
- **Browser Testing** untuk UI

---

## 🛠️ Test Scripts

### Run Script dengan tsx

```bash
# Format umum
npx tsx scripts/[script-name].ts

# Contoh
npx tsx scripts/test-multi-token.ts
npx tsx scripts/setup-notion-databases.ts
```

### Existing Test Scripts

| Script | Fungsi |
|--------|--------|
| `scripts/test-multi-token.ts` | Test Notion multi-token load balancer |
| `scripts/setup-notion-databases.ts` | Setup/verify database structure |

---

## 🔧 Debug Endpoints

### Test Database Connection
```http
GET /api/test-db
```
Response:
```json
{
  "status": "connected",
  "database": "notion"
}
```

### Debug Course Generation
```http
GET /api/debug/generate-courses
```
Test AI course generation tanpa perlu login.

### Debug Users
```http
GET /api/debug/users
```
Melihat semua users di database.

### Debug Course Test
```http
GET /api/debug/course-test
```
Test query ke course database.

---

## 📝 Manual API Testing

### Menggunakan cURL

```bash
# GET Request
curl http://localhost:3000/api/courses

# POST Request dengan body
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password"}'

# Request dengan auth token
curl http://localhost:3000/api/user/profile \
  -H "Authorization: Bearer [token]"
```

### Menggunakan Postman

1. Import collection dari dokumentasi API
2. Set environment variable `baseUrl` = `http://localhost:3000`
3. Simpan token dari login ke variable `authToken`
4. Gunakan `{{authToken}}` di header Authorization

---

## 🧪 Testing Patterns

### API Route Testing

```typescript
// Buat file test endpoint
// src/app/api/test-[feature]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    // Test query
    const { data, error } = await adminDb
      .from('table_name')
      .select('*')
      .limit(5);

    if (error) {
      return NextResponse.json({
        success: false,
        error: error.message,
        details: error
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: data?.length || 0,
      data
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
```

### Component Testing (Manual)

```tsx
// Buat page test untuk isolasi component
// src/app/test/[component]/page.tsx

'use client';

import { ComponentToTest } from '@/components/ComponentToTest';

export default function TestPage() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>Testing: ComponentToTest</h1>
      <hr />
      
      {/* Test case 1: Normal props */}
      <h2>Case 1: Normal</h2>
      <ComponentToTest prop1="value1" />
      
      {/* Test case 2: Edge case */}
      <h2>Case 2: Empty data</h2>
      <ComponentToTest prop1="" />
      
      {/* Test case 3: Error state */}
      <h2>Case 3: Error</h2>
      <ComponentToTest prop1="error-trigger" />
    </div>
  );
}
```

---

## ✅ Testing Checklist

### Sebelum Commit

- [ ] Build berhasil: `npm run build`
- [ ] Lint clean: `npm run lint`
- [ ] Dev server berjalan: `npm run dev`
- [ ] Endpoint baru bisa diakses

### API Endpoint Testing

- [ ] Response format sesuai standar (`{ success, data/error }`)
- [ ] Authentication works (jika diperlukan)
- [ ] Error handling proper
- [ ] Edge cases handled (empty data, invalid input)

### UI Component Testing

- [ ] Render tanpa error
- [ ] Loading state ditampilkan
- [ ] Error state ditampilkan
- [ ] Responsive di mobile/desktop
- [ ] Accessibility (keyboard nav, screen reader)

---

## 🔄 Integration Testing

### Test Flow Lengkap

1. **Auth Flow**
   ```
   POST /api/auth/register → POST /api/auth/login → GET /api/user/profile
   ```

2. **Course Flow**
   ```
   POST /api/generate-course → GET /api/courses → GET /api/courses/[id]
   ```

3. **Learning Flow**
   ```
   GET /api/subtopics/[id] → POST /api/ask-question → POST /api/quiz/submit
   ```

### Test dengan Browser DevTools

1. Buka Network tab
2. Interaksi dengan UI
3. Check request/response
4. Pastikan tidak ada error di Console tab

---

## 📊 Performance Testing

### Notion Rate Limit Test

```typescript
// scripts/test-rate-limit.ts
import { adminDb } from '../src/lib/database';

async function testRateLimit() {
  const startTime = Date.now();
  const requests = [];

  // Simulate 10 concurrent requests
  for (let i = 0; i < 10; i++) {
    requests.push(adminDb.from('users').select('*').limit(1));
  }

  await Promise.all(requests);
  
  const duration = Date.now() - startTime;
  console.log(`10 requests completed in ${duration}ms`);
  console.log(`Average: ${duration / 10}ms per request`);
}

testRateLimit();
```

Run:
```bash
npx tsx scripts/test-rate-limit.ts
```

---

## 🎯 Quick Test Commands

```bash
# Build check
npm run build

# Lint check
npm run lint

# Dev server
npm run dev

# Test Notion connection
curl http://localhost:3000/api/test-db

# Test multi-token
npx tsx scripts/test-multi-token.ts
```

---

*Last updated: February 2026*
