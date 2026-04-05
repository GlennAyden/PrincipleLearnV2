# PrincipleLearn V3 - Coding Style Guide

Panduan gaya penulisan kode untuk AI assistant dan developer.

---

## 🏗️ Project Structure

```
src/
├── app/                    # Next.js 15 App Router
│   ├── api/               # API routes
│   └── [pages]/           # Page components
├── components/            # React components (by feature)
├── context/               # React Context providers
├── hooks/                 # Custom React hooks
├── lib/                   # Utilities & services
├── services/              # Business logic services
└── types/                 # TypeScript definitions
```

---

## 📝 TypeScript Conventions

### Strict Mode
Project menggunakan TypeScript strict mode. Selalu define types dengan jelas.

```typescript
// ✅ Good
interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'user' | 'ADMIN';
}

// ❌ Bad
const user: any = { ... };
```

### Path Aliases
Gunakan `@/` untuk import dari `src/`:

```typescript
// ✅ Good
import { adminDb } from '@/lib/database';
import { useAuth } from '@/hooks/useAuth';

// ❌ Bad
import { adminDb } from '../../../lib/database';
```

---

## 🔌 API Route Patterns

### Standard Structure
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    // Get user from headers (injected by middleware)
    const userId = request.headers.get('x-user-id');
    
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
```

### Response Format
Semua API response HARUS menggunakan format:

```typescript
// Success
{ success: true, data: { ... }, message?: "Optional message" }

// Error
{ success: false, error: "Error message", code?: "ERROR_CODE" }
```

### Dynamic Routes
Untuk route dengan parameter:

```typescript
// src/app/api/courses/[id]/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // ...
}
```

---

## 🗄️ Database Access

### Always Use adminDb
```typescript
import { adminDb } from '@/lib/database';

// Query
const { data, error } = await adminDb
  .from('courses')
  .select('id, title, description')
  .eq('created_by', userId)
  .limit(10);

// Insert
const { data, error } = await adminDb
  .from('jurnal')
  .insert({
    user_id: userId,
    course_id: courseId,
    content: 'Journal entry...'
  });

// Update
const { error } = await adminDb
  .from('users')
  .eq('id', userId)
  .update({ name: 'New Name' });

// Delete
const { error } = await adminDb
  .from('feedback')
  .eq('id', feedbackId)
  .delete();
```

### Available Tables
- `users`, `courses`, `subtopics`, `quiz`
- `jurnal`, `transcript`, `feedback`
- `user_progress`, `quiz_submissions`
- `ask_question_history`, `challenge_responses`
- `discussion_templates`, `discussion_sessions`, `discussion_messages`
- `course_generation_activity`, `api_logs`

---

## ⚛️ React Component Patterns

### File Structure
Setiap komponen harus memiliki:
```
components/
└── FeatureName/
    ├── ComponentName.tsx
    └── ComponentName.module.scss
```

### Component Template
```tsx
'use client';

import React, { useState } from 'react';
import styles from './ComponentName.module.scss';

interface ComponentNameProps {
  prop1: string;
  prop2?: number;
  onAction?: () => void;
}

export function ComponentName({ prop1, prop2 = 0, onAction }: ComponentNameProps) {
  const [state, setState] = useState<string>('');
  
  return (
    <div className={styles.container}>
      {/* Component content */}
    </div>
  );
}
```

### Styling
Gunakan Sass modules dengan naming convention:
```scss
// ComponentName.module.scss
.container {
  // Container styles
}

.title {
  // Title styles
}

.active {
  // Active state
}
```

---

## 🔐 Authentication

### Check Auth in API Routes
```typescript
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const userRole = request.headers.get('x-user-role');
  
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
  
  // For admin-only routes
  if (userRole !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 }
    );
  }
  
  // ...
}
```

### Client-Side Auth
```tsx
import { useAuth } from '@/hooks/useAuth';

function Component() {
  const { user, isLoading, isAuthenticated } = useAuth();
  
  if (isLoading) return <Loading />;
  if (!isAuthenticated) return <Redirect to="/login" />;
  
  return <AuthenticatedContent user={user} />;
}
```

---

## 🤖 AI Integration

### OpenAI Client
```typescript
import { openai } from '@/lib/openai';

const completion = await openai.chat.completions.create({
  model: process.env.OPENAI_MODEL || 'gpt-5-mini',
  messages: [
    { role: 'system', content: 'System prompt...' },
    { role: 'user', content: userMessage }
  ],
  temperature: 0.7,
});

const response = completion.choices[0].message.content;
```

### AI Prompts
- Gunakan bahasa Indonesia untuk course content
- Struktur output dengan JSON jika perlu parsing
- Include context (course title, level, user progress)

---

## 📋 Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | PascalCase for components | `QuizCard.tsx` |
| Files | camelCase for utilities | `apiLogger.ts` |
| Variables | camelCase | `userId`, `courseData` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES` |
| Interfaces | PascalCase | `UserProgress` |
| CSS Classes | camelCase in modules | `.cardContainer` |

---

## ❌ Avoid

1. **Direct Supabase client calls** - Always use `adminDb`
2. **Any types** - Define proper interfaces
3. **console.log in production** - Use proper logging
4. **Hardcoded IDs** - Use environment variables
5. **Inline styles** - Use Sass modules

---

*Last updated: February 2026*
