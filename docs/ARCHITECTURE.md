# System Architecture

Dokumentasi arsitektur sistem PrincipleLearn V3 dengan diagram detail.

---

## 🏗️ High-Level Architecture

```mermaid
graph TB
    subgraph Users["👥 Users"]
        Learner[Learner]
        Admin[Administrator]
    end

    subgraph Frontend["🖥️ Frontend Layer"]
        Browser[Web Browser]
        NextApp[Next.js 15 App]
        
        subgraph Pages["Pages"]
            PublicPages[Public Pages]
            UserPages[User Pages]
            AdminPages[Admin Pages]
        end
        
        subgraph Components["React Components"]
            Quiz[Quiz System]
            Discussion[Discussion]
            Journal[Learning Journal]
            CourseView[Course View]
        end
    end

    subgraph Backend["⚙️ Backend Layer"]
        subgraph Middleware["Middleware"]
            AuthMiddleware[Auth Middleware]
            RateLimit[Rate Limiter]
        end
        
        subgraph APIRoutes["API Routes"]
            AuthAPI[/api/auth/*]
            AdminAPI[/api/admin/*]
            CourseAPI[/api/courses/*]
            AIAPI[/api/generate-*]
            DiscussionAPI[/api/discussion/*]
        end
        
        subgraph Services["Services"]
            DatabaseService[DatabaseService]
            JWTService[JWT Service]
            CSRFService[CSRF Protection]
        end
    end

    subgraph External["🌐 External Services"]
        OpenAI[OpenAI API]
    end

    subgraph Database["🗄️ Database Layer"]
        Notion[(Notion Databases)]
    end

    subgraph Deployment["☁️ Deployment"]
        Vercel[Vercel Platform]
    end

    Learner --> Browser
    Admin --> Browser
    Browser --> NextApp
    NextApp --> Pages
    Pages --> Components
    
    NextApp --> Middleware
    Middleware --> APIRoutes
    APIRoutes --> Services
    APIRoutes --> OpenAI
    Services --> Notion
    
    NextApp --> Vercel
```

---

## 🛠️ Technology Stack Detail

### Frontend Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 15.3.1 | React framework dengan App Router |
| React | 19.0.0 | UI library |
| TypeScript | 5.x | Type safety |
| Sass | 1.87.0 | CSS preprocessing |
| React Icons | 5.5.0 | Icon library |
| Recharts | 2.15.3 | Data visualization |

### Backend Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js API Routes | 15.x | Backend API |
| JWT | 9.0.2 | Token authentication |
| bcrypt/bcryptjs | 5.1.1/3.0.2 | Password hashing |
| Notion API | REST | Database client via `@/lib/database.ts` |
| OpenAI | 4.96.0 | AI integration |

---

## 📁 Directory Structure

```mermaid
graph LR
    Root[PrincipleLearnV2/] --> src[src/]
    Root --> docs[docs/]
    Root --> public[public/]
    Root --> scripts[scripts/]
    
    src --> app[app/]
    src --> components[components/]
    src --> lib[lib/]
    src --> hooks[hooks/]
    src --> context[context/]
    src --> types[types/]
    
    app --> api[api/]
    app --> admin[admin/]
    app --> course[course/]
    app --> dashboard[dashboard/]
    app --> reqCourse[request-course/]
    
    api --> apiAuth[auth/]
    api --> apiAdmin[admin/]
    api --> apiGenerate[generate-*/]
    api --> apiDiscuss[discussion/]
```

### Detailed Structure

```
src/
├── app/                         # Next.js 15 App Router
│   ├── api/                     # Backend API routes
│   │   ├── auth/               # Authentication endpoints
│   │   │   ├── login/          # POST /api/auth/login
│   │   │   ├── logout/         # POST /api/auth/logout
│   │   │   ├── register/       # POST /api/auth/register
│   │   │   ├── refresh/        # POST /api/auth/refresh
│   │   │   └── me/             # GET /api/auth/me
│   │   ├── admin/              # Admin operations
│   │   │   ├── dashboard/      # Admin dashboard data
│   │   │   ├── users/          # User management
│   │   │   ├── activity/       # Activity monitoring
│   │   │   ├── discussions/    # Discussion management
│   │   │   └── [login,logout]  # Admin auth
│   │   ├── courses/            # Course CRUD
│   │   ├── quiz/               # Quiz operations
│   │   ├── generate-course/    # AI course generation
│   │   ├── generate-examples/  # AI example generation
│   │   ├── generate-subtopic/  # AI subtopic generation
│   │   ├── discussion/         # Discussion system
│   │   ├── jurnal/             # Learning journal
│   │   ├── transcript/         # Transcript management
│   │   ├── feedback/           # Course feedback
│   │   └── debug/              # Development utilities
│   ├── admin/                   # Admin pages
│   │   ├── dashboard/          # Admin dashboard UI
│   │   ├── users/              # User management UI
│   │   ├── activity/           # Activity monitoring UI
│   │   ├── discussions/        # Discussion management UI
│   │   ├── login/              # Admin login page
│   │   └── register/           # Admin registration
│   ├── course/[courseId]/       # Dynamic course pages
│   ├── dashboard/               # User dashboard
│   ├── request-course/          # Multi-step course creation
│   │   ├── step1/              # Topic & goal input
│   │   ├── step2/              # Level & details
│   │   ├── step3/              # Review & confirm
│   │   └── result/             # Generated course result
│   ├── login/                   # User login
│   └── signup/                  # User registration
├── components/                  # React components
│   ├── admin/                  # Admin-specific components
│   ├── Quiz/                   # Quiz system
│   ├── ChallengeThinking/      # Challenge components
│   ├── AskQuestion/            # Q&A components
│   ├── Examples/               # Example display
│   ├── FeedbackForm/           # Feedback components
│   ├── KeyTakeaways/           # Summary components
│   └── NextSubtopics/          # Navigation components
├── context/                     # React Context
│   └── RequestCourseContext.tsx # Multi-step form state
├── hooks/                       # Custom hooks
│   └── useAuth.tsx             # Authentication hook
├── lib/                         # Utilities & services
│   ├── database.ts             # Notion DatabaseService class
│   ├── notion-database.ts      # Notion API utilities
│   ├── jwt.ts                  # JWT utilities
│   ├── csrf.ts                 # CSRF protection
│   ├── openai.ts               # OpenAI client
│   ├── api-error.ts            # Error handling
│   ├── api-logger.ts           # API logging
│   ├── api-middleware.ts       # API middleware
│   ├── rate-limit.ts           # Rate limiting
│   └── validation.ts           # Input validation
└── types/                       # TypeScript definitions
    └── database.ts             # Database types
```

---

## 🔐 Authentication Architecture

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant Middleware
    participant API
    participant JWT
    participant Database

    User->>Browser: Login Request
    Browser->>API: POST /api/auth/login
    API->>Database: Validate Credentials
    Database-->>API: User Data
    API->>JWT: Generate Tokens
    JWT-->>API: Access + Refresh Token
    API-->>Browser: Set HttpOnly Cookies
    Browser-->>User: Login Success

    Note over User,Database: Subsequent Requests

    User->>Browser: Access Protected Route
    Browser->>Middleware: Request with Cookies
    Middleware->>JWT: Verify Access Token
    
    alt Token Valid
        JWT-->>Middleware: Payload
        Middleware->>API: Forward Request + Headers
        API-->>Browser: Response
    else Token Expired
        Middleware->>API: POST /api/auth/refresh
        API->>JWT: Verify Refresh Token
        JWT-->>API: New Access Token
        API-->>Browser: Set New Cookie
        Browser->>Middleware: Retry Request
    else No Token
        Middleware-->>Browser: Redirect to Login
    end
```

### Token Configuration

| Token Type | Storage | Expiry | Purpose |
|------------|---------|--------|---------|
| Access Token | HttpOnly Cookie | 15 min | API authentication |
| Refresh Token | HttpOnly Cookie | 7 days | Token renewal |
| CSRF Token | localStorage | Session | State-changing protection |

---

## 🗄️ Database Architecture

```mermaid
graph TB
    subgraph NotionCloud["☁️ Notion"]
        NotionDB[(Notion Databases)]
        NotionAPI[Notion REST API]
        NotionDB --> NotionAPI
    end

    subgraph App["📱 Application"]
        DatabaseService[DatabaseService Class]
        AdminDb[adminDb Client]
        NotionQueryBuilder[NotionQueryBuilder]
    end

    subgraph RateLimiting["⚡ Rate Limit Handling"]
        Token1[NOTION_TOKEN_1]
        Token2[NOTION_TOKEN_2]
        Token3[NOTION_TOKEN_3]
    end

    DatabaseService --> AdminDb
    AdminDb --> NotionQueryBuilder
    NotionQueryBuilder --> Token1
    NotionQueryBuilder --> Token2
    NotionQueryBuilder --> Token3
    Token1 --> NotionAPI
    Token2 --> NotionAPI
    Token3 --> NotionAPI
```

### Database Strategy

| Component | Purpose |
|-----------|--------|
| `DatabaseService` | Singleton service for database operations |
| `adminDb` | Pre-configured instance with admin privileges |
| `NotionQueryBuilder` | Supabase-like query syntax for Notion |
| Multi-token | 3 tokens for 9 req/s effective rate limit |

---

## 🤖 AI Integration Architecture

```mermaid
flowchart LR
    subgraph Input["📝 User Input"]
        Topic[Topic]
        Goal[Learning Goal]
        Level[Difficulty Level]
        Problem[Specific Problem]
    end

    subgraph Processing["⚙️ Processing"]
        Validation[Input Validation]
        PromptBuilder[Prompt Builder]
        OpenAI[OpenAI API]
        ResponseParser[Response Parser]
    end

    subgraph Output["📚 Generated Content"]
        CourseOutline[Course Outline]
        Modules[Modules]
        Subtopics[Subtopics]
        Quizzes[Quiz Questions]
    end

    Topic --> Validation
    Goal --> Validation
    Level --> Validation
    Problem --> Validation
    
    Validation --> PromptBuilder
    PromptBuilder --> OpenAI
    OpenAI --> ResponseParser
    
    ResponseParser --> CourseOutline
    ResponseParser --> Modules
    ResponseParser --> Subtopics
    ResponseParser --> Quizzes
```

### AI Endpoints

| Endpoint | Purpose | Model |
|----------|---------|-------|
| `/api/generate-course` | Generate complete course | GPT-5-mini |
| `/api/generate-subtopic` | Generate subtopic content | GPT-5-mini |
| `/api/generate-examples` | Generate examples | GPT-5-mini |
| `/api/ask-question` | Answer user questions | GPT-5-mini |
| `/api/challenge-thinking` | Critical thinking prompts | GPT-5-mini |
| `/api/challenge-feedback` | Evaluate user responses | GPT-5-mini |

---

## 🔄 Request Flow

```mermaid
flowchart TD
    A[Client Request] --> B{Public Route?}
    
    B -->|Yes| C[Next.js Page]
    B -->|No| D[Middleware]
    
    D --> E{Has Access Token?}
    
    E -->|No| F{Has Refresh Token?}
    F -->|Yes| G[Refresh Token]
    F -->|No| H[Redirect to Login]
    
    E -->|Yes| I{Token Valid?}
    I -->|No| F
    I -->|Yes| J{Admin Route?}
    
    G -->|Success| I
    G -->|Fail| H
    
    J -->|Yes| K{Is Admin?}
    J -->|No| L[Process Request]
    
    K -->|Yes| L
    K -->|No| M[Redirect to Home]
    
    L --> N[API Handler]
    N --> O[Database Service]
    O --> P[(Database)]
    P --> Q[Response]
```

---

## ☁️ Deployment Architecture

```mermaid
graph TB
    subgraph GitHub["📦 GitHub"]
        Repo[Repository]
    end

    subgraph Vercel["☁️ Vercel"]
        Build[Build Process]
        Edge[Edge Network]
        Functions[Serverless Functions]
    end

    subgraph Notion["🗄️ Notion"]
        DB[(Notion Databases)]
    end

    subgraph OpenAI["🤖 OpenAI"]
        GPT[GPT API]
    end

    Repo -->|Push| Build
    Build --> Edge
    Build --> Functions
    
    Functions --> DB
    Functions --> GPT
    
    Edge -->|Serve| User[End User]
```

### Environment Configuration

| Environment | Purpose | URL |
|-------------|---------|-----|
| Development | Local testing | `localhost:3000` |
| Preview | PR review | `*.vercel.app` |
| Production | Live application | `your-domain.com` |

---

## 📡 Component Communication

```mermaid
graph LR
    subgraph Context["React Context"]
        AuthContext[AuthContext]
        RequestCourseContext[RequestCourseContext]
    end

    subgraph Hooks["Custom Hooks"]
        useAuth[useAuth]
        useRequestCourse[useRequestCourse]
    end

    subgraph Components["Components"]
        LoginForm[LoginForm]
        CourseRequest[CourseRequest Steps]
        Dashboard[Dashboard]
        CourseView[CourseView]
    end

    AuthContext --> useAuth
    RequestCourseContext --> useRequestCourse
    
    useAuth --> LoginForm
    useAuth --> Dashboard
    useAuth --> CourseView
    
    useRequestCourse --> CourseRequest
```

---

## 🔒 Security Layers

```mermaid
graph TD
    A[Client Request] --> B[HTTPS/TLS]
    B --> C[Vercel Edge]
    C --> D[Rate Limiting]
    D --> E[CSRF Validation]
    E --> F[JWT Authentication]
    F --> G[Role Authorization]
    G --> H[Input Validation]
    H --> I[SQL Injection Prevention]
    I --> J[Row Level Security]
    J --> K[(Database)]
```

### Security Measures

| Layer | Implementation |
|-------|----------------|
| Transport | HTTPS enforced by Vercel |
| Rate Limiting | Custom rate-limit.ts + multi-token Notion |
| CSRF | Token validation for state changes |
| Authentication | JWT with HttpOnly cookies |
| Authorization | Role-based middleware |
| Input Validation | Zod/custom validation |
| Database | Notion access via integration tokens |

---

*Dokumentasi ini terakhir diperbarui: Februari 2026*
