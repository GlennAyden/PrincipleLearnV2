# Database Patterns - Notion Implementation

PrincipleLearn V3 menggunakan Notion API sebagai database backend dengan custom query builder yang menyerupai Supabase syntax.

---

## 🏗️ Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│   API Routes    │────▶│  DatabaseService │────▶│  Notion API │
└─────────────────┘     └──────────────────┘     └─────────────┘
                               │
                        ┌──────┴──────┐
                        │ adminDb     │
                        │ (singleton) │
                        └─────────────┘
```

---

## 📊 Table Mapping

```typescript
// src/lib/database.ts
const TABLE_MAPPING = {
  'users': 'NOTION_USERS_DB_ID',
  'courses': 'NOTION_COURSES_DB_ID',
  'subtopics': 'NOTION_SUBTOPICS_DB_ID',
  'quiz': 'NOTION_QUIZ_DB_ID',
  'jurnal': 'NOTION_JURNAL_DB_ID',
  'transcript': 'NOTION_TRANSCRIPT_DB_ID',
  'feedback': 'NOTION_FEEDBACK_DB_ID',
  'user_progress': 'NOTION_USER_PROGRESS_DB_ID',
  'quiz_submissions': 'NOTION_QUIZ_SUBMISSIONS_DB_ID',
  'ask_question_history': 'NOTION_ASK_QUESTION_DB_ID',
  'challenge_responses': 'NOTION_CHALLENGE_RESPONSES_DB_ID',
  'discussion_templates': 'NOTION_DISCUSSION_TEMPLATES_DB_ID',
  'discussion_sessions': 'NOTION_DISCUSSION_SESSIONS_DB_ID',
  'discussion_messages': 'NOTION_DISCUSSION_MESSAGES_DB_ID',
  'course_generation_activity': 'NOTION_COURSE_GENERATION_DB_ID',
  'api_logs': 'NOTION_API_LOGS_DB_ID',
};
```

---

## 🔧 Query Builder API

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

// With IN filter
const { data, error } = await adminDb
  .from('users')
  .select('*')
  .in('id', [id1, id2, id3]);

// With LIKE filter (contains)
const { data, error } = await adminDb
  .from('courses')
  .select('*')
  .ilike('title', `%${searchTerm}%`);

// With ordering
const { data, error } = await adminDb
  .from('subtopics')
  .select('*')
  .eq('course_id', courseId)
  .orderBy('order_index', { ascending: true });

// With limit
const { data, error } = await adminDb
  .from('users')
  .select('*')
  .limit(10);

// Combined
const { data, error } = await adminDb
  .from('quiz_submissions')
  .select('*')
  .eq('user_id', userId)
  .orderBy('submitted_at', { ascending: false })
  .limit(50);
```

### INSERT Operations

```typescript
// Single insert
const { data, error } = await adminDb
  .from('jurnal')
  .insert({
    user_id: userId,
    course_id: courseId,
    content: 'Journal content...',
    reflection: 'My reflection...',
    created_at: new Date().toISOString()
  });

// Insert returns the created record
if (data) {
  console.log('Created record ID:', data.id);
}
```

### UPDATE Operations

```typescript
// Update with filter (IMPORTANT: set filter before update)
const { error } = await adminDb
  .from('users')
  .eq('id', userId)
  .update({
    name: 'New Name',
    updated_at: new Date().toISOString()
  });

// Update multiple fields
const { error } = await adminDb
  .from('subtopics')
  .eq('id', subtopicId)
  .update({
    content: newContent,
    updated_at: new Date().toISOString()
  });
```

### DELETE Operations

```typescript
// Delete with filter
const { error } = await adminDb
  .from('feedback')
  .eq('id', feedbackId)
  .delete();
```

---

## ⚡ Rate Limiting Strategy

### Multi-Token Rotation
Project menggunakan 3 Notion tokens untuk menghindari rate limit:

```
NOTION_TOKEN_1=secret_xxx
NOTION_TOKEN_2=secret_yyy
NOTION_TOKEN_3=secret_zzz
```

- Notion rate limit: ~3 requests/second per token
- Dengan 3 tokens: ~9 requests/second effective
- Built-in queue dengan 350ms delay antar request

### Handling Rate Limit Errors
```typescript
// Rate limit is handled automatically by the queue
// If you get 429 errors, the queue will retry

// For batch operations, add delays
async function batchProcess(items: string[]) {
  for (const item of items) {
    await processItem(item);
    await new Promise(r => setTimeout(r, 400)); // 400ms delay
  }
}
```

---

## 🗃️ Caching

### Built-in Cache
```typescript
// Cache TTL: 5 minutes
// Cache is automatically used for GET operations

// To force fresh data (skip cache), the query builder handles this
// Cache is automatically invalidated on INSERT/UPDATE/DELETE
```

### Manual Cache Clear
```typescript
// Clear all cache
clearCache();

// Clear cache for specific table
clearCache('courses');
```

---

## 📋 Common Patterns

### Get User's Courses
```typescript
const { data: courses } = await adminDb
  .from('courses')
  .select('*')
  .eq('created_by', userId)
  .orderBy('created_at', { ascending: false });
```

### Get Course with Subtopics
```typescript
const { data: course } = await adminDb
  .from('courses')
  .select('*')
  .eq('id', courseId);

const { data: subtopics } = await adminDb
  .from('subtopics')
  .select('*')
  .eq('course_id', courseId)
  .orderBy('order_index', { ascending: true });
```

### Track User Progress
```typescript
// Check existing progress
const { data: existing } = await adminDb
  .from('user_progress')
  .select('*')
  .eq('user_id', userId)
  .eq('subtopic_id', subtopicId);

if (existing && existing.length > 0) {
  // Update
  await adminDb
    .from('user_progress')
    .eq('id', existing[0].id)
    .update({ is_completed: true, completion_date: new Date().toISOString() });
} else {
  // Insert
  await adminDb
    .from('user_progress')
    .insert({
      user_id: userId,
      course_id: courseId,
      subtopic_id: subtopicId,
      is_completed: true,
      completion_date: new Date().toISOString()
    });
}
```

### Save Quiz Submission
```typescript
const { data, error } = await adminDb
  .from('quiz_submissions')
  .insert({
    user_id: userId,
    quiz_id: quizId,
    answer: userAnswer,
    is_correct: userAnswer === correctAnswer,
    submitted_at: new Date().toISOString()
  });
```

---

## ⚠️ Important Notes

1. **Always handle errors**
   ```typescript
   const { data, error } = await adminDb.from('table').select('*');
   if (error) {
     console.error('Database error:', error);
     // Handle error appropriately
   }
   ```

2. **Use ISO timestamps**
   ```typescript
   created_at: new Date().toISOString()
   ```

3. **Filter before update/delete**
   ```typescript
   // ✅ Correct
   await adminDb.from('table').eq('id', id).update({ ... });
   
   // ❌ Wrong - will update all records
   await adminDb.from('table').update({ ... });
   ```

4. **Notion property names are case-sensitive**
   - Use exact column names as defined in Notion database

---

*Last updated: February 2026*
