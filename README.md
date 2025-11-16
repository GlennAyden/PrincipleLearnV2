# PrincipleLearn V2

A modern learning management system built with Next.js 15, Supabase, and deployed on Vercel.

## Features

- 🎓 **Course Management**: Create and manage educational courses
- 📝 **Interactive Quizzes**: Built-in quiz system with multiple choice questions
- 📓 **Learning Journal**: Personal reflection and note-taking
- 📄 **Transcript System**: Course transcripts and notes management
- 👥 **User Management**: Admin dashboard for user management
- 🔐 **Authentication**: Secure JWT-based authentication
- 📊 **Analytics Dashboard**: Track learning progress and statistics
- 🌐 **Responsive Design**: Works on desktop and mobile devices

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Sass
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Authentication**: JWT with custom auth system
- **Deployment**: Vercel
- **Styling**: Sass modules

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account
- Docker Desktop (for running the local PostgreSQL replica)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/GlennAyden/PrincipleLearnV2.git
cd PrincipleLearnV2
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp env.example .env.local
```

Edit `.env.local` with your actual values:
```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# JWT Configuration
JWT_SECRET=your-jwt-secret-key-here

# Local PostgreSQL (Prisma)
LOCAL_DATABASE_URL=postgresql://principlelearn:principlelearn@localhost:5432/principlelearn?schema=public
LOCAL_DATABASE_USER=principlelearn
LOCAL_DATABASE_PASSWORD=principlelearn
LOCAL_DATABASE_NAME=principlelearn
LOCAL_DATABASE_PORT=5432

# Optional: OpenAI (for AI features)
OPENAI_API_KEY=your-openai-api-key-here
# Default model used by the app (optional)
OPENAI_MODEL=gpt-5-mini
```

4. Set up Supabase database:
   - Create a new Supabase project
   - Run the SQL script from `create-tables.sql` in the Supabase SQL Editor
   - Optionally run `node create-sample-data.js` to add sample data

5. (Optional) Start the local PostgreSQL replica:
   ```bash
   docker compose up -d postgres
   npm run prisma:generate
   npm run prisma:migrate -- --name init-local-schema
   ```
   The Prisma schema mirrors the Supabase structure but runs entirely in Docker so you can develop without touching the remote database.

### Running Supabase locally

- Install the Supabase CLI if you haven't already (for example `npm install -g supabase` or follow the OS-specific guide at https://supabase.com/docs/guides/cli).
- From the project root run `supabase start`. The CLI detects the bundled `supabase/config.toml` and spins up the local API, database, auth, realtime, storage, and Studio ports defined there.
- You can stop the stack with `supabase stop` and check its health with `supabase status`.
- Avoid `npx start supabase`, because `npx` will try to run a package literally called `start` and fails with "could not determine executable to run". Use `supabase start` (or `npx supabase start` if you prefer not to install the CLI globally) instead so the Supabase services come up correctly.
- Windows reserves the 5432x range, so the project is already configured to use 54021 (API), 54022 (DB), 54023 (Studio), 54024 (Mailpit), 54029 (pooler) and 54020 (shadow DB) via `supabase/config.toml`; keep analytics disabled unless you separately expose Docker on `tcp://localhost:2375`. If you change those ports later, check `netsh interface ipv4 show excludedportrange protocol=tcp` so the CLI can bind cleanly.

6. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Database Schema

The application uses the following main tables:
- `users` - User accounts and authentication
- `courses` - Course information and metadata
- `subtopics` - Course sections and content
- `quiz` - Quiz questions and answers
- `quiz_submissions` - User quiz history
- `ask_question_history` - Q&A trail from AI interactions
- `jurnal` - User learning journal entries
- `transcript` - Course transcripts and notes
- `user_progress` - Learning progress tracking
- `feedback` - Course feedback and ratings
- `discussion_templates`, `discussion_sessions`, `discussion_messages` - AI-assisted Socratic discussion engine
- `challenge_responses` - Reflection and challenge data captured from learners
- `api_logs`, `discussion_admin_actions` - Operational logging and admin audit trail
- `subtopic_cache` - Cached AI subtopic outlines for faster regeneration

### Local vs Supabase databases

- Supabase remains the production-of-record store, including RLS policies and hosted auth.
- Prisma + Docker adds a **local-only** PostgreSQL database so you can experiment safely.
- Schema changes should be authored in `prisma/schema.prisma`. Run `npm run prisma:migrate` to update the container, then translate the generated SQL (in `prisma/migrations/*/migration.sql`) to Supabase if the change needs to go live.
- Because the two databases are separate, you can reset the Docker container without affecting Supabase. Keep credentials aligned via the shared schema to minimise drift.

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### Course Management
- `GET /api/courses` - Get all courses
- `POST /api/courses` - Create new course
- `GET /api/courses/[id]` - Get specific course

### Admin
- `GET /api/admin/dashboard` - Admin dashboard data
- `GET /api/admin/users` - Manage users
- `GET /api/admin/activity` - View system activity

### Testing
- `GET /api/test-db` - Test database connection
- `GET /api/test-data` - View test data

## Deployment

### Deploying to Vercel

1. Push your code to GitHub
2. Connect your GitHub repository to Vercel
3. Set up environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JWT_SECRET`
4. Deploy!

### Environment Variables for Production

Make sure to set these in your Vercel dashboard:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=strong-random-secret-for-production
OPENAI_API_KEY=your-openai-api-key
# Optional: override default model
OPENAI_MODEL=gpt-5-mini
```

## Development

### Project Structure

```
src/
├── app/                    # Next.js 15 App Router
│   ├── api/               # API routes
│   ├── admin/             # Admin pages
│   ├── course/            # Course pages
│   └── ...                # Other pages
├── components/            # React components
├── hooks/                 # Custom React hooks
├── lib/                   # Utility libraries
└── types/                 # TypeScript type definitions
```

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run prisma:generate` - Generate Prisma client from the schema
- `npm run prisma:migrate` - Apply schema changes to the local PostgreSQL container
- `npm run prisma:studio` - Launch Prisma Studio for inspecting local data

### Testing

Run the database connection test:
```bash
node test-supabase-connection.js
```

Run comprehensive CRUD tests:
```bash
node test-crud-operations.js
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test your changes
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support, please open an issue on GitHub or contact the development team.
