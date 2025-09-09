# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server (with Fast Refresh disabled)
- `npm run dev:no-lint` - Start development server without linting  
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `node run-quiz-fix.js` - Fix quiz database schema and add sample data

## Environment Setup

Required environment variables (copy from `env.example` to `.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key  
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (for admin operations)
- `JWT_SECRET` - JWT secret for token signing
- `OPENAI_API_KEY` - OpenAI API key (optional, for AI features)

## Project Architecture

### Core Technologies
- **Framework**: Next.js 15 with App Router
- **Frontend**: React 19, TypeScript, Sass modules
- **Database**: Supabase (PostgreSQL) with custom database service layer
- **Authentication**: Custom JWT-based auth with CSRF protection
- **Deployment**: Vercel
- **AI Integration**: OpenAI API for course generation

### Authentication & Security Architecture
- JWT-based authentication managed by `src/hooks/useAuth.tsx`
- CSRF token protection with localStorage storage
- Two-tier access: regular users and admin roles
- Service role client (`adminDb`) for elevated database operations
- Middleware-based route protection

### Database Architecture
- **Primary Interface**: `DatabaseService` class in `src/lib/database.ts`
- **Error Handling**: Custom `DatabaseError` class for consistent error management
- **Connection Management**: Dual client setup - public client and service role client
- **Testing**: Built-in connection testing via `/api/test-db`
- **Schema**: Core tables include `users`, `courses`, `subtopics`, `quiz`, `jurnal`, `transcript`, `user_progress`, `feedback`

### Key Directory Structure
```
src/
├── app/                    # Next.js 15 App Router
│   ├── api/               # Backend API routes
│   │   ├── auth/          # User authentication (login, logout, refresh)
│   │   ├── admin/         # Admin operations (users, dashboard, activity)
│   │   ├── debug/         # Development utilities (table setup, testing)
│   │   ├── courses/       # Course CRUD operations
│   │   └── **/            # Feature-specific endpoints (quiz, jurnal, etc.)
│   ├── admin/             # Admin dashboard pages
│   ├── course/[courseId]/ # Dynamic course viewing with subtopic navigation
│   ├── request-course/    # Multi-step course creation flow
│   └── dashboard/         # User dashboard
├── components/            # Feature-organized React components
│   ├── admin/             # Admin-specific components (modals, forms)
│   ├── Quiz/              # Quiz system components
│   ├── Examples/          # Example generation and display
│   ├── ChallengeThinking/ # Challenge feedback system
│   └── **/                # Other feature components
├── hooks/                 # Custom React hooks (auth, etc.)
├── lib/                   # Core utilities and services
│   ├── database.ts        # Generic CRUD operations with error handling
│   ├── supabase.ts        # Supabase client configuration  
│   ├── jwt.ts             # JWT utilities
│   └── csrf.ts            # CSRF protection
├── context/               # React Context providers (RequestCourseContext)
└── types/                 # TypeScript definitions
```

### Component Architecture Patterns
- **Styling**: Each component has an associated `.module.scss` file for scoped styling
- **Organization**: Components grouped by feature rather than type
- **Admin Separation**: Admin-specific components isolated in `components/admin/`
- **Context Usage**: `RequestCourseContext` manages multi-step course creation state
- **Props**: Interfaces typically defined inline or co-located with components

### API Route Structure
- **Authentication Flow**: Separate admin and user auth endpoints with different permissions
- **Error Handling**: Consistent error responses using `DatabaseError` class
- **Debug Endpoints**: Development utilities for database setup and testing
- **Activity Tracking**: Admin endpoints for viewing user activity (quiz submissions, journal entries)
- **Course Management**: Full CRUD operations with AI-powered generation capabilities

### Key Features & Implementation Details
- **Multi-Step Course Creation**: `request-course/step1-3` with context-managed state
- **AI Course Generation**: OpenAI integration for generating course content and examples
- **Interactive Learning**: Quiz system with submission tracking and progress monitoring
- **Learning Journal**: User reflection system with admin visibility
- **Transcript System**: Course notes and transcript management
- **Challenge System**: Critical thinking challenges with feedback mechanisms

### Database Testing & Utilities
- **Connection Testing**: `/api/test-db` endpoint for database connectivity
- **Data Utilities**: `run-quiz-fix.js` script for quiz data management
- **Debug Endpoints**: Complete set of debugging APIs for development
- **CRUD Testing**: Built-in utilities in `DatabaseService` for operation testing

### Development Workflow
- Path aliases: `@/` maps to `src/` directory
- TypeScript strict mode with comprehensive type checking
- Environment variable validation for required configurations
- Graceful error handling with user-friendly error boundaries
- Fast Refresh disabled in development for stability