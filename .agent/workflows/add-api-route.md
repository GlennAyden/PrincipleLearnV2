---
description: Menambahkan API route baru
---

# Menambah API Route Baru

Langkah-langkah untuk menambahkan endpoint API baru ke PrincipleLearn V3.

## 1. Buat folder route

Buat folder baru di `src/app/api/[nama-route]/`

```
src/app/api/
└── nama-route/
    └── route.ts
```

## 2. Buat file route.ts dengan struktur standar

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';

// GET - untuk mengambil data
export async function GET(request: NextRequest) {
  try {
    // Ambil user dari headers (diinject oleh middleware)
    const userId = request.headers.get('x-user-id');
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Database operation
    const { data, error } = await adminDb
      .from('table_name')
      .select('*')
      .eq('user_id', userId);
    
    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - untuk membuat data baru
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Parse request body
    const body = await request.json();
    
    // Validate input
    if (!body.requiredField) {
      return NextResponse.json(
        { success: false, error: 'Missing required field' },
        { status: 400 }
      );
    }
    
    // Insert ke database
    const { data, error } = await adminDb
      .from('table_name')
      .insert({
        user_id: userId,
        field1: body.field1,
        created_at: new Date().toISOString()
      });
    
    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## 3. Untuk route dengan parameter dinamis

Buat folder dengan format `[paramName]`:

```
src/app/api/courses/[id]/
└── route.ts
```

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  // Gunakan id untuk query
  const { data, error } = await adminDb
    .from('courses')
    .select('*')
    .eq('id', id);
  
  // ...
}
```

## 4. Untuk route yang memerlukan admin role

```typescript
export async function GET(request: NextRequest) {
  const userRole = request.headers.get('x-user-role');
  
  if (userRole !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 }
    );
  }
  
  // Admin-only logic here
}
```

// turbo
## 5. Test endpoint

Jalankan dev server dan test dengan browser atau Postman:
- GET: `http://localhost:3000/api/nama-route`
- POST: Gunakan Postman atau fetch API

## 6. Update dokumentasi (opsional)

Jika endpoint penting, tambahkan ke `docs/API_REFERENCE.md`
