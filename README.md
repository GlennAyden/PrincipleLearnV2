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

# Optional: OpenAI API Key (for AI features)
OPENAI_API_KEY=your-openai-api-key-here
```

4. Set up Supabase database:
   - Create a new Supabase project
   - Run the SQL script from `create-tables.sql` in the Supabase SQL Editor
   - Optionally run `node create-sample-data.js` to add sample data

5. Run the development server:
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
- `jurnal` - User learning journal entries
- `transcript` - Course transcripts and notes
- `user_progress` - Learning progress tracking
- `feedback` - Course feedback and ratings

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