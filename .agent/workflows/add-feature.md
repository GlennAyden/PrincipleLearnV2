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
- [ ] Modifikasi komponenexisting?

## 2. Jika Butuh Database Table Baru

### 2.1 Buat Notion database baru

1. Buka Notion
2. Buat database baru di page PrincipleLearn
3. Buat properti sesuai schema yang dibutuhkan
4. Copy database ID dari URL

### 2.2 Update database.ts

Edit `src/lib/database.ts`:

```typescript
// Tambahkan di NOTION_DATABASE_IDS
const NOTION_DATABASE_IDS = {
  // ... existing
  NEW_TABLE: process.env.NOTION_NEW_TABLE_DB_ID || 'database-id-here',
};

// Tambahkan di TABLE_MAPPING
const TABLE_MAPPING = {
  // ... existing
  'new_table': NOTION_DATABASE_IDS.NEW_TABLE,
};
```

### 2.3 Update .env.local

```
NOTION_NEW_TABLE_DB_ID=database-id-here
```

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
  // state, effects, handlers
  
  return (
    <div className={styles.container}>
      {/* content */}
    </div>
  );
}
```

### 4.3 Buat styling

```scss
// FeatureName.module.scss
.container {
  // styles
}
```

### 4.4 Import di page yang membutuhkan

```typescript
import { FeatureName } from '@/components/FeatureName/FeatureName';
```

## 5. Testing

// turbo
### 5.1 Jalankan dev server

```bash
npm run dev
```

### 5.2 Test fitur baru

- Test semua use case normal
- Test error handling
- Test dengan user biasa dan admin

## 6. Update Dokumentasi

Jika fitur signifikan, update:

- `docs/PAGE_CATALOG.md` - jika ada halaman baru
- `docs/API_REFERENCE.md` - jika ada API baru
- `docs/DATABASE_SCHEMA.md` - jika ada table baru

## Checklist Selesai

- [ ] Fitur berfungsi sesuai requirement
- [ ] Error handling sudah ada
- [ ] Loading state sudah ditangani
- [ ] Responsive design
- [ ] Dokumentasi diupdate (jika perlu)
