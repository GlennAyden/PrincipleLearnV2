# Database Patterns - Supabase Implementation

PrincipleLearn V3 menggunakan Supabase PostgreSQL sebagai database dengan custom query builder wrapper.

---

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────┐
│   API Routes    │────▶│  DatabaseService │────▶│  Supabase    │
└─────────────────┘     └──────────────────┘     │  PostgreSQL  │
                               │                  └──────────────┘
                        ┌──────┴──────┐
                        │ adminDb     │  Service role (elevated)
                        │ publicDb    │  Anon role (respects RLS)
                        └─────────────┘
```

---

## Query Builder API

### Import
```typescript
import { adminDb } from '@/lib/database';
```

### SELECT Operations

```typescript
// Basic select all
const { data, error } = await adminDb
  .from('courses')
  .select('*');

// Select specific columns
const { data, error } = await adminDb
  .from('courses')
  .select('id, title, description');

// With equality filter
const { data, error } = await adminDb
  .from('courses')
  .select('*')
  .eq('created_by', userId);

// With multiple filters
const { data, error } = await adminDb
  .from('quiz')
  .select('*')
  .eq('course_id', courseId)
  .eq('subtopic_id', subtopicId);

// With ordering and limit
const { data, error } = await adminDb
  .from('quiz_submissions')
  .select('*')
  .eq('user_id', userId)
  .orderBy('submitted_at', { ascending: false })
  .limit(50);

// Single record
const { data, error } = await adminDb
  .from('users')
  .select('*')
  .eq('id', userId)
  .single();
```

### INSERT Operations

```typescript
const { data, error } = await adminDb
  .from('jurnal')
  .insert({
    user_id: userId,
    course_id: courseId,
    content: 'Journal content...',
    created_at: new Date().toISOString()
  });
```

### UPDATE Operations

```typescript
// Filter before update
const { error } = await adminDb
  .from('users')
  .eq('id', userId)
  .update({
    name: 'New Name',
    updated_at: new Date().toISOString()
  });
```

### DELETE Operations

```typescript
const { error } = await adminDb
  .from('feedback')
  .eq('id', feedbackId)
  .delete();
```

### RPC (Postgres Functions)

```typescript
const { data, error } = await adminDb.rpc('get_admin_user_stats');
```

---

## Available Tables

- `users`, `courses`, `subtopics`, `quiz`
- `jurnal`, `transcript`, `feedback`
- `user_progress`, `quiz_submissions`
- `ask_question_history`, `challenge_responses`
- `discussion_templates`, `discussion_sessions`, `discussion_messages`
- `course_generation_activity`, `api_logs`, `subtopic_cache`
- `learning_sessions`, `prompt_classifications`, `cognitive_indicators` (research)

---

## Important Notes

1. **Always handle errors**
   ```typescript
   const { data, error } = await adminDb.from('table').select('*');
   if (error) {
     console.error('Database error:', error);
   }
   ```

2. **Use ISO timestamps**: `created_at: new Date().toISOString()`

3. **Filter before update/delete** — omitting filter will affect all rows

4. **JSONB columns** are auto-detected from database schema via `detectJsonbColumns()`

5. **RLS policies** are in `docs/sql/add_rls_policies_all_tables.sql`

---

*Last updated: April 2026*
