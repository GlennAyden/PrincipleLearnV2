# Error Debugging Guide - PrincipleLearn V3

Panduan lengkap untuk debugging dan mencari error di proyek.

---

## 🔍 Quick Error Search

### Cari Error di Codebase

```bash
# Cari semua console.error
grep -rn "console.error" src/

# Cari throw statements
grep -rn "throw new" src/

# Cari error handling
grep -rn "catch" src/ --include="*.ts" --include="*.tsx"
```

### Cari di Log/Output

```bash
# Filter npm dev output untuk error
npm run dev 2>&1 | grep -i "error"

# Cari di build output
npm run build 2>&1 | grep -i "error\|failed"
```

---

## 🚨 Common Errors & Solutions

### 1. Build Errors

#### Module not found
```
Error: Cannot find module '@/lib/database'
```
**Solusi:**
- Check path alias di `tsconfig.json`
- Pastikan file exists
- Restart dev server

#### Type errors
```
Type 'X' is not assignable to type 'Y'
```
**Solusi:**
- Check interface definitions
- Add proper type casting jika perlu
- Gunakan type guards

### 2. Runtime Errors

#### Unauthorized (401)
```json
{ "success": false, "error": "Unauthorized" }
```
**Checklist:**
- Token ada di request header?
- Token expired?
- Middleware berjalan?

#### Notion Database Error
```json
{ "error": "Could not find database with ID: xxx" }
```
**Solusi:**
- Verify database ID di `.env.local`
- Check integration punya akses ke database
- Verify TABLE_MAPPING di `database.ts`

#### Rate Limit (429)
```json
{ "error": "Rate limited" }
```
**Solusi:**
- Tunggu beberapa menit
- Check jumlah tokens (harus 3)
- Gunakan `/notion-debug` workflow

### 3. API Errors

#### Invalid JSON
```
SyntaxError: Unexpected token < in JSON at position 0
```
**Penyebab:** Server return HTML (error page) instead of JSON

**Debug:**
```typescript
const response = await fetch('/api/endpoint');
const text = await response.text(); // Debug: lihat raw response
console.log('Raw response:', text);
const data = JSON.parse(text);
```

#### CORS Error
```
Access-Control-Allow-Origin error
```
**Solusi:** Pastikan request ke same origin atau setup CORS headers

---

## 🔧 Debugging Tools

### 1. Console Logging

```typescript
// Standard logging pattern
console.log('[FeatureName] Action:', { param1, param2 });

// Error logging
console.error('[FeatureName] Error:', error.message, error.stack);

// Conditional logging
if (process.env.NODE_ENV === 'development') {
  console.log('[DEBUG]', data);
}
```

### 2. API Response Debugging

```typescript
export async function GET(request: NextRequest) {
  const debugMode = request.nextUrl.searchParams.get('debug') === 'true';
  
  try {
    const { data, error } = await adminDb
      .from('table')
      .select('*');

    if (debugMode) {
      return NextResponse.json({
        success: true,
        data,
        debug: {
          query: 'SELECT * FROM table',
          timestamp: new Date().toISOString(),
          requestHeaders: Object.fromEntries(request.headers),
        }
      });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown',
      stack: debugMode ? error.stack : undefined
    }, { status: 500 });
  }
}
```

Usage: `GET /api/endpoint?debug=true`

### 3. Database Query Debugging

```typescript
// Di database.ts atau service file
async function debugQuery(tableName: string, options: any) {
  console.log('='.repeat(50));
  console.log('[DB Query]', {
    table: tableName,
    options: JSON.stringify(options, null, 2)
  });
  
  const startTime = Date.now();
  const result = await adminDb.from(tableName).select('*');
  
  console.log('[DB Result]', {
    duration: `${Date.now() - startTime}ms`,
    count: result.data?.length || 0,
    error: result.error?.message
  });
  console.log('='.repeat(50));
  
  return result;
}
```

---

## 🔎 Error Patterns by Location

### Frontend Errors (Browser Console)

| Error | Location | Check |
|-------|----------|-------|
| `TypeError: Cannot read property` | Component | Props undefined? |
| `fetch failed` | API call | Backend running? |
| `Hydration mismatch` | Server component | 'use client' missing? |

### Backend Errors (Terminal)

| Error | Location | Check |
|-------|----------|-------|
| `NOTION_TOKEN not set` | database.ts | .env.local exists? |
| `Rate limit exceeded` | Notion API | Too many requests |
| `JWT expired` | Auth middleware | Token expired |

### Build Errors (npm run build)

| Error | Location | Check |
|-------|----------|-------|
| `Type error` | TypeScript | Fix type mismatches |
| `Module not found` | Import | Check file path |
| `ESLint error` | Linting | Fix lint issues |

---

## 🛠️ Debug Workflow

### 1. Identify Error Location

```
Frontend → Browser Console
Backend → Terminal (npm run dev)
Build → npm run build output
```

### 2. Reproduce Error

```bash
# Clear cache and restart
rm -rf .next
npm run dev
```

### 3. Add Logging

```typescript
// Tambahkan di sekitar area error
console.log('[DEBUG] Before operation:', { input });

try {
  const result = await operation();
  console.log('[DEBUG] After operation:', { result });
} catch (error) {
  console.error('[DEBUG] Error caught:', {
    message: error.message,
    stack: error.stack
  });
}
```

### 4. Check Related Files

```bash
# Cari references ke file yang error
grep -rn "import.*from.*file-name" src/
grep -rn "functionName" src/
```

### 5. Verify Fix

```bash
npm run lint
npm run build
npm run dev
# Test endpoint/feature
```

---

## 📊 Error Monitoring Pattern

```typescript
// src/lib/error-logger.ts (optional)

interface ErrorLog {
  timestamp: string;
  type: 'api' | 'database' | 'auth' | 'ai';
  message: string;
  stack?: string;
  context?: Record<string, any>;
}

export function logError(
  type: ErrorLog['type'],
  error: Error,
  context?: Record<string, any>
) {
  const log: ErrorLog = {
    timestamp: new Date().toISOString(),
    type,
    message: error.message,
    stack: error.stack,
    context
  };

  // Development: console log
  if (process.env.NODE_ENV === 'development') {
    console.error(`[${type.toUpperCase()}]`, log);
  }

  // Production: bisa kirim ke logging service
  // TODO: integrate with logging service
}

// Usage
try {
  await riskyOperation();
} catch (error) {
  logError('api', error as Error, { userId, endpoint });
  throw error;
}
```

---

## 🎯 Quick Debug Commands

```bash
# Check lint errors
npm run lint

# Build dengan verbose output
npm run build 2>&1 | tee build.log

# Cari error di log
grep -i "error" build.log

# Test specific API
curl -v http://localhost:3000/api/test-db

# Watch file for syntax errors
npx tsc --noEmit --watch
```

---

*Last updated: February 2026*
