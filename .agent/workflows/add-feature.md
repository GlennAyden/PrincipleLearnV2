---
description: Menambahkan fitur baru ke aplikasi
---

# Menambah Fitur Baru

Panduan lengkap untuk menambahkan fitur baru ke PrincipleLearn V3.

## 1. Analisis Kebutuhan Fitur

Tentukan apa yang dibutuhkan:

- [ ] Database table baru?
- [ ] API endpoint baru?
- [ ] UI component baru?
- [ ] Modifikasi komponen existing?

## 2. Jika Butuh Database Table Baru

### 2.1 Buat table di Supabase

1. Buka Supabase Dashboard → Table Editor
2. Buat table baru dengan schema yang dibutuhkan
3. Tambahkan RLS policies jika diperlukan
4. Simpan SQL migration di `docs/sql/`

### 2.2 Gunakan adminDb untuk akses

```typescript
import { adminDb } from '@/lib/database';

const { data, error } = await adminDb
  .from('new_table')
  .select('*');
```

### 2.3 Update environment (jika perlu)

Supabase tables otomatis tersedia via `adminDb.from('table_name')` — tidak perlu mapping manual.

## 3. Jika Butuh API Endpoint

Ikuti workflow: `/add-api-route`

## 4. Jika Butuh UI Component

### 4.1 Buat folder component

```
src/components/
└── FeatureName/
    ├── FeatureName.tsx
    └── FeatureName.module.scss
```

### 4.2 Buat component dengan template standar

```typescript
'use client';

import React, { useState } from 'react';
import styles from './FeatureName.module.scss';

interface FeatureNameProps {
  // props
}

export function FeatureName({ }: FeatureNameProps) {
  return (
    <div className={styles.container}>
      {/* content */}
    </div>
  );
}
```

## 5. Testing

```bash
npm run dev    # Test manually
npm test       # Run tests
npm run build  # Verify build
```

## 6. Update Dokumentasi

Jika fitur signifikan, update:

- `docs/ARCHITECTURE.md` - jika ada perubahan arsitektur
- `docs/API_REFERENCE.md` - jika ada API baru

## Checklist Selesai

- [ ] Fitur berfungsi sesuai requirement
- [ ] Error handling sudah ada
- [ ] Loading state sudah ditangani
- [ ] Responsive design
- [ ] Dokumentasi diupdate (jika perlu)
