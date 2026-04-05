# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server (Fast Refresh disabled)
- `npm run dev:no-lint` - Start development server without linting
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm test` - Run Jest tests
- `npm run test:e2e` - Run Playwright E2E tests

## Environment Setup

Required environment variables (copy `.env.example` to `.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (elevated operations)
- `JWT_SECRET` - JWT secret for token signing
- `OPENAI_API_KEY` - OpenAI API key (optional, for AI features)
- `OPENAI_MODEL` - OpenAI model to use (optional, defaults to gpt-5-mini)

## Project Architecture

### Core Technologies
- **Framework**: Next.js 15 with App Router
- **Frontend**: React 19, TypeScript, Sass modules
- **Database**: Supabase PostgreSQL with RLS policies
- **Authentication**: Custom JWT-based auth with CSRF double-submit cookie pattern
- **Deployment**: Vercel
- **AI Integration**: OpenAI API for course generation, Q&A, challenge thinking

### Authentication & Security Architecture
- **JWT Flow**: Managed by `src/hooks/useAuth.tsx` with access/refresh token pattern
- **CSRF Protection**: Double-submit cookie pattern — `csrf_token` cookie read by `apiFetch()`, sent as `x-csrf-token` header, validated by `withProtection()`
- **Two-Tier Access**: Regular users and admin roles with separate login flows (`/api/auth/login` vs `/api/admin/login`)
- **Service Role Client**: `adminDb` exported from `src/lib/database.ts` for elevated operations
- **Middleware Protection**: `middleware.ts` enforces authentication on protected routes and role-based access for admin routes
- **Request Validation**: Zod schemas via `parseBody()` in `src/lib/schemas.ts`

### Database Architecture
- **Primary Interface**: `DatabaseService` class in `src/lib/database.ts` provides generic CRUD operations via Supabase
- **Query Builder**: `adminDb` provides Supabase-like chaining syntax (`.from().select().eq().single()`)
- **Public Client**: `publicDb` for anon-level reads (respects RLS)
- **Error Handling**: Custom `DatabaseError` class with `.is()`, `.isUniqueViolation`, `.isForeignKeyViolation`
- **JSONB Support**: Auto-detects JSONB columns from database schema via `detectJsonbColumns()`
- **Testing**: `/api/test-db` endpoint for connection validation
- **Schema**: Core tables are `users`, `courses`, `subtopics`, `quiz`, `jurnal`, `transcript`, `user_progress`, `feedback`, `discussion_sessions`, `discussion_messages`, `ask_question_history`, `challenge_responses`, `api_logs`

### Service Layer
- **`src/services/auth.service.ts`**: User lookup, password hashing, JWT generation, CSRF tokens
- **`src/services/course.service.ts`**: Course CRUD, subtopic management, access control
- **`src/services/ai.service.ts`**: OpenAI calls (single, retry, streaming), prompt sanitization, response validation

### Key Directory Structure
```
src/
├── app/                    # Next.js 15 App Router
│   ├── api/               # Backend API routes
│   │   ├── auth/          # User authentication (login, logout, refresh, me)
│   │   ├── admin/         # Admin operations (users, dashboard, activity, research)
│   │   ├── debug/         # Development utilities
│   │   ├── courses/       # Course CRUD operations
│   │   └── **/            # Feature-specific endpoints (quiz, jurnal, transcript, etc.)
│   ├── admin/             # Admin dashboard pages
│   ├── course/[courseId]/ # Dynamic course viewing with subtopic navigation
│   ├── request-course/    # Multi-step course creation flow (step1, step2, step3, result)
│   └── dashboard/         # User dashboard
├── components/            # Feature-organized React components
│   ├── admin/             # Admin-specific components (modals for viewing user activity)
│   ├── Quiz/              # Quiz system components
│   ├── Examples/          # Example generation and display
│   ├── ChallengeThinking/ # Challenge feedback system
│   ├── AskQuestion/       # Q&A components
│   └── **/                # Other feature components
├── services/              # Business logic services (auth, course, ai)
├── hooks/                 # Custom React hooks (useAuth, useSessionStorage)
├── lib/                   # Core utilities and infrastructure
│   ├── database.ts        # DatabaseService class, adminDb, publicDb (Supabase)
│   ├── schemas.ts         # 14 Zod schemas + parseBody() helper
│   ├── api-client.ts      # Frontend apiFetch() with auto CSRF + 401 retry
│   ├── jwt.ts             # JWT utilities
│   ├── csrf.ts            # CSRF protection
│   ├── rate-limit.ts      # In-memory rate limiter
│   ├── api-middleware.ts   # withProtection(), withCacheHeaders()
│   └── api-logger.ts      # withApiLogging() — logs to api_logs table
├── context/               # React Context providers
│   └── RequestCourseContext.tsx  # Multi-step course request state management
└── types/                 # TypeScript definitions
```

### Component Architecture Patterns
- **Styling**: Each component has an associated `.module.scss` file for scoped styling
- **Organization**: Components grouped by feature rather than type
- **Admin Separation**: Admin-specific components isolated in `components/admin/`
- **Context Usage**: `RequestCourseContext` manages state across multi-step course creation flow (step1-3)
- **Props**: Interfaces typically defined inline or co-located with components

### API Route Structure
- **Authentication**: Separate `/api/auth` and `/api/admin/login` endpoints with different permissions
- **Admin Routes**: All `/api/admin/*` routes require ADMIN role verification
- **Error Handling**: Consistent error responses using `DatabaseError` class
- **Activity Tracking**: Admin endpoints for viewing quiz submissions, journal entries, transcripts, and course generation logs
- **AI Features**: `/api/generate-course`, `/api/generate-examples`, `/api/generate-subtopic`, `/api/ask-question` (streaming), `/api/challenge-thinking` (streaming), `/api/challenge-feedback`

### Key Features & Implementation Details
- **Multi-Step Course Creation**: `request-course/step1-3` pages use `RequestCourseContext` to maintain form state across steps
- **AI Course Generation**: OpenAI integration generates course content, examples, and answers questions dynamically
- **AI Streaming**: `ask-question` and `challenge-thinking` use `chatCompletionStream()` for real-time text streaming
- **Interactive Learning**: Quiz system with submission tracking via `/api/quiz/submit` and progress monitoring
- **Learning Journal**: User reflection system (`/api/jurnal/save`) with admin visibility (`/api/admin/activity/jurnal`)
- **Transcript System**: Course notes management (`/api/transcript/save`) viewable by admins
- **Challenge System**: Critical thinking challenges with AI-powered feedback
- **Prompt Injection Prevention**: `sanitizePromptInput()` + XML boundary markers on all AI endpoints

### Authentication Middleware Flow
- **Public routes**: `/`, `/login`, `/signup`, `/admin/login`, `/admin/register` accessible without auth
- **Protected routes**: All other routes require valid JWT in `access_token` cookie
- **Token validation**: Uses `verifyToken` from `src/lib/jwt.ts`
- **Refresh flow**: If access token expired but refresh token exists, redirects to `/api/auth/refresh`
- **Token rotation**: Refresh token is rotated on each use (old token invalidated)
- **Role enforcement**: `/admin/*` routes require `role === 'ADMIN'` in JWT payload
- **Request headers**: Middleware injects `x-user-id`, `x-user-email`, `x-user-role` headers for API routes

### Development Workflow
- **Path aliases**: `@/` maps to `src/` directory
- **TypeScript**: Strict mode with comprehensive type checking
- **Fast Refresh**: Disabled via `cross-env FAST_REFRESH=false` for stability
- **Environment validation**: Missing required env vars will throw errors on startup
