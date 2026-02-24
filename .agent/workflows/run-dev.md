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

- `NOTION_TOKEN_1`, `NOTION_TOKEN_2`, `NOTION_TOKEN_3` - Notion API tokens
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

### Notion connection error

- Periksa NOTION_TOKEN di .env.local
- Test koneksi: GET http://localhost:3000/api/test-db
