---
description: Menjalankan development server
---
// turbo-all

# Menjalankan Development Server

## 1. Install dependencies (jika belum)

```bash
npm install
```

## 2. Pastikan environment variables sudah di-set

Copy `.env.example` ke `.env.local` jika belum ada, lalu isi dengan nilai yang benar:

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `JWT_SECRET` - Secret untuk JWT
- `OPENAI_API_KEY` - API key OpenAI

## 3. Jalankan development server

```bash
npm run dev
```

## 4. Buka browser

Akses http://localhost:3000

## 5. Login credentials

- **User biasa**: Daftar akun baru via /signup
- **Admin**: Login via /admin/login dengan akun yang sudah ada di database

## Troubleshooting

### Port 3000 sudah digunakan

```bash
npx kill-port 3000
npm run dev
```

### Database connection error

- Periksa Supabase URL dan keys di `.env.local`
- Test koneksi: GET http://localhost:3000/api/test-db
