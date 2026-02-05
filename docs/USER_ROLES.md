# User Roles & Permissions

Dokumentasi lengkap sistem roles dan permissions di PrincipleLearn V3.

---

## 🎭 Role Overview

PrincipleLearn V3 menggunakan sistem **Role-Based Access Control (RBAC)** dengan dua role utama:

```mermaid
graph TD
    subgraph Roles["User Roles"]
        User[👤 User / Learner]
        Admin[👨‍💼 Administrator]
    end

    subgraph UserAccess["User Access"]
        Dashboard[Dashboard]
        Courses[Courses]
        Learning[Learning Features]
        Profile[Profile]
    end

    subgraph AdminAccess["Admin Access"]
        AdminDash[Admin Dashboard]
        UserMgmt[User Management]
        Activity[Activity Monitoring]
        DiscMgmt[Discussion Management]
        ContentMod[Content Moderation]
    end

    User --> UserAccess
    Admin --> UserAccess
    Admin --> AdminAccess
```

---

## 👤 User (Learner)

### Definition
Role default untuk semua pengguna yang mendaftar. Fokus pada pembelajaran dan penggunaan fitur edukasi.

### Capabilities

| Feature | Create | Read | Update | Delete |
|---------|--------|------|--------|--------|
| **Own Profile** | - | ✅ | ✅ | - |
| **Courses** | ✅ (via AI) | ✅ (own) | - | - |
| **Subtopics** | - | ✅ | - | - |
| **Quiz** | - | ✅ | - | - |
| **Quiz Submissions** | ✅ | ✅ (own) | - | - |
| **Journal** | ✅ | ✅ (own) | ✅ | ✅ |
| **Transcript** | ✅ | ✅ (own) | ✅ | ✅ |
| **Progress** | ✅ | ✅ (own) | ✅ | - |
| **Feedback** | ✅ | ✅ (own) | - | - |
| **Discussions** | ✅ | ✅ (own) | - | - |
| **Ask Questions** | ✅ | ✅ (own) | - | - |
| **Challenge Responses** | ✅ | ✅ (own) | - | - |

### Accessible Routes

```
✅ /                     # Homepage
✅ /login                # Login page
✅ /signup               # Registration
✅ /dashboard            # User dashboard
✅ /course/[courseId]    # Course viewing
✅ /request-course/*     # Course request flow
```

---

## 👨‍💼 Administrator (ADMIN)

### Definition
Role dengan akses penuh untuk mengelola platform, users, dan konten. Diberikan secara manual atau melalui admin registration.

### Capabilities

| Feature | Create | Read | Update | Delete |
|---------|--------|------|--------|--------|
| **All Users** | ✅ | ✅ | ✅ | ✅ |
| **All Courses** | ✅ | ✅ | ✅ | ✅ |
| **All Subtopics** | ✅ | ✅ | ✅ | ✅ |
| **All Quiz** | ✅ | ✅ | ✅ | ✅ |
| **All Submissions** | - | ✅ | - | - |
| **All Journals** | - | ✅ | - | - |
| **All Transcripts** | - | ✅ | - | - |
| **All Progress** | - | ✅ | - | - |
| **All Feedback** | - | ✅ | - | - |
| **Discussions** | - | ✅ | ✅ | ✅ |
| **API Logs** | - | ✅ | - | ✅ |
| **System Settings** | - | ✅ | ✅ | - |

### Accessible Routes

```
✅ All User routes
✅ /admin/login          # Admin login
✅ /admin/register       # Admin registration
✅ /admin/dashboard      # Admin dashboard
✅ /admin/users          # User management
✅ /admin/activity       # Activity monitoring
✅ /admin/discussions    # Discussion management
```

---

## 🔐 Permission Matrix

### Page Access Matrix

```mermaid
graph LR
    subgraph Public["🌐 Public"]
        Home["/"]
        Login["/login"]
        Signup["/signup"]
        AdminLogin["/admin/login"]
    end

    subgraph UserOnly["👤 User Required"]
        Dashboard["/dashboard"]
        Course["/course/*"]
        RequestCourse["/request-course/*"]
    end

    subgraph AdminOnly["👨‍💼 Admin Required"]
        AdminDash["/admin/dashboard"]
        AdminUsers["/admin/users"]
        AdminActivity["/admin/activity"]
        AdminDiscuss["/admin/discussions"]
    end

    User[User] --> Public
    User --> UserOnly
    
    Admin[Admin] --> Public
    Admin --> UserOnly
    Admin --> AdminOnly
```

### API Access Matrix

| Endpoint | Public | User | Admin |
|----------|--------|------|-------|
| `POST /api/auth/login` | ✅ | ✅ | ✅ |
| `POST /api/auth/register` | ✅ | ✅ | ✅ |
| `POST /api/auth/logout` | - | ✅ | ✅ |
| `GET /api/auth/me` | - | ✅ | ✅ |
| `GET /api/courses` | - | ✅ | ✅ |
| `POST /api/generate-course` | - | ✅ | ✅ |
| `POST /api/quiz/submit` | - | ✅ | ✅ |
| `POST /api/jurnal/save` | - | ✅ | ✅ |
| `GET /api/admin/dashboard` | - | - | ✅ |
| `GET /api/admin/users` | - | - | ✅ |
| `GET /api/admin/activity/*` | - | - | ✅ |

---

## 🔄 Authentication Flow

### User Login Flow

```mermaid
sequenceDiagram
    participant U as User
    participant B as Browser
    participant M as Middleware
    participant A as API
    participant DB as Database

    U->>B: Enter credentials
    B->>A: POST /api/auth/login
    A->>DB: Validate credentials
    DB-->>A: User (role: 'user')
    A->>A: Generate JWT with role
    A-->>B: Set cookies + response
    B-->>U: Redirect to /dashboard
```

### Admin Login Flow

```mermaid
sequenceDiagram
    participant A as Admin
    participant B as Browser
    participant M as Middleware
    participant API as API
    participant DB as Database

    A->>B: Enter credentials
    B->>API: POST /api/admin/login
    API->>DB: Validate credentials
    DB-->>API: User (role: 'ADMIN')
    
    alt Role is ADMIN
        API->>API: Generate JWT with role
        API-->>B: Set cookies + response
        B-->>A: Redirect to /admin/dashboard
    else Role is not ADMIN
        API-->>B: 403 Forbidden
        B-->>A: Show error
    end
```

---

## 🛡️ Middleware Protection

### Implementation

```mermaid
flowchart TD
    A[Incoming Request] --> B{Is Public Route?}
    
    B -->|Yes| C[Allow Access]
    B -->|No| D{Has Access Token?}
    
    D -->|No| E{Has Refresh Token?}
    E -->|Yes| F[Attempt Refresh]
    E -->|No| G[Redirect to Login]
    
    F -->|Success| H[Continue]
    F -->|Fail| G
    
    D -->|Yes| H{Token Valid?}
    H -->|No| E
    H -->|Yes| I{Is Admin Route?}
    
    I -->|No| J[Allow Access]
    I -->|Yes| K{Role = ADMIN?}
    
    K -->|Yes| J
    K -->|No| L[Redirect to Home]
```

### Protected Route Configuration

```typescript
// middleware.ts
const publicRoutes = [
  '/',
  '/login',
  '/signup',
  '/admin/login',
  '/admin/register'
];

const adminRoutes = [
  '/admin/dashboard',
  '/admin/users',
  '/admin/activity',
  '/admin/discussions'
];
```

---

## 🎨 Role-Based UI Differences

### Navigation Menu

| Menu Item | User | Admin |
|-----------|------|-------|
| Dashboard | ✅ | ✅ |
| My Courses | ✅ | ✅ |
| Request Course | ✅ | ✅ |
| Profile | ✅ | ✅ |
| Admin Panel | ❌ | ✅ |
| User Management | ❌ | ✅ |
| Activity Monitor | ❌ | ✅ |

### Dashboard Differences

```mermaid
graph TB
    subgraph UserDashboard["👤 User Dashboard"]
        UMyCourses[My Courses]
        UProgress[Learning Progress]
        URecent[Recent Activity]
        UStats[Personal Stats]
    end

    subgraph AdminDashboard["👨‍💼 Admin Dashboard"]
        AOverview[Platform Overview]
        AUserStats[User Statistics]
        ACourseStats[Course Statistics]
        ARecentActivity[All Recent Activity]
        AQuickActions[Quick Actions]
    end
```

---

## 🔑 JWT Token Structure

### Token Payload

```json
{
  "userId": "uuid-string",
  "email": "user@example.com",
  "role": "user",
  "iat": 1707040800,
  "exp": 1707041700
}
```

### Role Values

| Role | Value | Description |
|------|-------|-------------|
| Regular User | `"user"` | Default role |
| Administrator | `"ADMIN"` | Admin access |

---

## 📋 Role Assignment

### Default Registration
- Semua user yang register via `/signup` mendapat role `"user"`

### Admin Registration
- Admin dapat register via `/admin/register`
- Memerlukan invitation code atau approval (implementasi tergantung kebijakan)

### Manual Role Update

```sql
-- Update user role to ADMIN
UPDATE users 
SET role = 'ADMIN' 
WHERE email = 'user@example.com';
```

---

## 🔐 Access Control

### Notion-Based Access Control

```mermaid
graph TD
    subgraph Policies["Access Policies"]
        UserPolicy[User can only access own data]
        AdminPolicy[Admin can access all data]
    end

    subgraph Implementation["Database Service"]
        AdminDb[adminDb Client]
        QueryBuilder[NotionQueryBuilder]
        RoleCheck[Role-Based Filtering]
    end

    UserPolicy --> RoleCheck
    AdminPolicy --> AdminDb
    RoleCheck --> QueryBuilder
```

### Example Access Control

```typescript
// API route with role-based access
const userRole = request.headers.get('x-user-role');
const userId = request.headers.get('x-user-id');

if (userRole === 'ADMIN') {
  // Admin can access all journals
  const { data } = await adminDb.from('jurnal').select('*');
} else {
  // Users can only see their own journals
  const { data } = await adminDb
    .from('jurnal')
    .select('*')
    .eq('user_id', userId);
}
```

---

## 🚨 Security Best Practices

### For Developers

1. **Always validate role in API routes**
   ```typescript
   const userRole = request.headers.get('x-user-role');
   if (userRole !== 'ADMIN') {
     return Response.json({ error: 'Forbidden' }, { status: 403 });
   }
   ```

2. **Use service role client untuk admin operations**
   ```typescript
   import { adminDb } from '@/lib/database';
   // adminDb bypasses RLS
   ```

3. **Never trust client-side role checks alone**
   - Always verify role di middleware dan API

### For Admins

1. Gunakan password yang kuat (min 12 karakter)
2. Enable 2FA jika tersedia
3. Regular audit admin accounts
4. Monitor admin activity logs

---

## 📊 Role Statistics Dashboard

Admin dapat melihat distribusi roles:

| Metric | Description |
|--------|-------------|
| Total Users | Jumlah semua user |
| Active Users | User yang login dalam 30 hari |
| Admin Count | Jumlah admin aktif |
| Role Distribution | Pie chart roles |

---

*Dokumentasi ini terakhir diperbarui: Februari 2026*
