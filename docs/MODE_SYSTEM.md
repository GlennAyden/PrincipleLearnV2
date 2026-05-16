# Mode System — Dua Mode (Umum vs Penelitian)

Dokumen ini mendeskripsikan arsitektur dua-mode yang memisahkan data operasional aplikasi (Mode Umum) dari data eksperimen tesis (Mode Penelitian), baik di sisi siswa maupun admin. Implementasi mengikuti Item 1 + Item 10 di [`rencana-eksekusi-mvr.md`](../rencana-eksekusi-mvr.md).

## 1. Motivasi

PrincipleLearn V3 dipakai bersamaan untuk tiga hal: (a) tempat siswa belajar bebas, (b) lapangan uji tesis dengan kurikulum Fase E terkontrol, dan (c) panel admin yang sama digunakan peneliti dan operator. Tanpa pemisahan eksplisit, query agregasi (jumlah course, durasi sesi, klasifikasi prompt) akan mencampur dua populasi yang secara metodologis tidak boleh dicampur — analisis RM2 (klasifikasi prompt) dan RM3 (skor kognitif) menuntut sampel yang berasal hanya dari course yang mengikuti protokol penelitian (kurikulum kanonik + RAG + Sokratik graduated).

Solusi: setiap aktivitas siswa di-tag pada level baris dengan kolom `mode VARCHAR(20) NOT NULL DEFAULT 'general' CHECK (mode IN ('general','research'))`; setiap query admin yang relevan mendapat lensa mode yang menyesuaikan apa yang ditampilkan.

## 2. Skema Data

Tujuh tabel kunci memperoleh kolom `mode` (lihat juga [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) untuk konteks lengkap):

- `courses` — sumber kebenaran. Mode siswa di-tetapkan saat course dibuat.
- `learning_sessions`
- `ask_question_history`
- `challenge_responses`
- `jurnal`
- `quiz_submissions`
- `prompt_classifications`

Indeks `idx_<table>_mode` dipasang pada masing-masing untuk mempercepat filter. Backfill awal mengisi semua baris existing menjadi `'general'` agar tidak ada perilaku regresif di Mode Umum.

`research_artifacts` dan `subtopic_cache` juga memiliki kolom `mode` (dipakai oleh Item 9 dan Item 4b — lihat [RAG_PIPELINE.md](RAG_PIPELINE.md) Section 8 dan [INTERACTIVE_BLOCKS_SPEC.md](INTERACTIVE_BLOCKS_SPEC.md) Section 5).

## 3. Mode Siswa

### 3.1 Toggle di Request Course

Pada wizard pembuatan course, langkah pertama [`src/app/request-course/step1/page.tsx`](../src/app/request-course/step1/page.tsx) menampilkan radio group "Mode Pembelajaran" (Umum default vs Penelitian). Pilihan disimpan di `RequestCourseContext`. Mode Penelitian mengganti textarea topik bebas menjadi grid 4 card template Fase E (lihat [CONTENT_SPEC_FASE_E.md](CONTENT_SPEC_FASE_E.md)) dan menutup beberapa input level/goal di step berikutnya karena materi sudah kanonik.

### 3.2 Resolusi & Propagasi

Helper [`src/lib/course-mode.ts`](../src/lib/course-mode.ts) menyediakan `getCourseMode(courseId)` yang me-resolve `courses.mode` (fallback `'general'` saat row tidak ditemukan agar kompatibel dengan course pra-MVR). Pola pemakaian di seluruh write path: handler API baca `courseId` dari body → panggil `getCourseMode` sekali → teruskan nilai itu ke kolom `mode` di insert turunan. Contoh konkret dapat dilihat di [`src/app/api/research-artifacts/submit/route.ts`](../src/app/api/research-artifacts/submit/route.ts) line 42.

### 3.3 Dashboard Conditional Render

Komponen `FaseEJalur` di [`src/components/dashboard/FaseEJalur/FaseEJalur.tsx`](../src/components/dashboard/FaseEJalur/FaseEJalur.tsx) — yang menampilkan kartu progres 4 course Fase E + status unlock — hanya muncul di dashboard siswa ketika `hasResearchCourse === true`. Render dipasang di [`src/app/dashboard/page.tsx`](../src/app/dashboard/page.tsx) line 187. Siswa Mode Umum tidak melihat surface penelitian apa pun di dashboard.

## 4. Mode Admin

### 4.1 Cookie + Provider

Cookie `admin_mode=general|research` (non-HttpOnly, SameSite=Lax, Path=/, Max-Age 30 hari) menjadi sumber kebenaran sisi-klien. Dipasang oleh `AdminModeProvider` di [`src/context/AdminModeContext.tsx`](../src/context/AdminModeContext.tsx). Provider:

1. Seed dari cookie pada `useEffect` pertama (SSR-safe — first render selalu `'general'` agar markup stabil).
2. `setAdminMode(next)` menulis cookie, mem-fire-and-forget `POST /api/admin/mode-switch` untuk audit, lalu memanggil `router.refresh()` agar server components re-fetch dengan filter baru.
3. Tidak ada round-trip ke server untuk hanya berganti mode — flip terasa instan.

Pola ini sengaja meniru `LocaleProvider` agar pemeliharaan minim dan dua toggle (locale + admin mode) bisa di-grok dengan model mental yang sama.

### 4.2 Middleware Header Injection

[`middleware.ts`](../middleware.ts) line 227-231 menambah header `x-admin-mode` pada request yang menuju `/admin/**` atau `/api/admin/**`:

```ts
if (isAdminPage || isAdminApi) {
  const rawMode = req.cookies.get('admin_mode')?.value
  const adminMode = rawMode === 'research' ? 'research' : 'general'
  requestHeaders.set('x-admin-mode', adminMode)
}
```

Handler tidak perlu membaca cookie langsung — `getAdminModeFromRequest(req)` di [`src/lib/admin-mode.ts`](../src/lib/admin-mode.ts) membaca header dulu, lalu cookie sebagai fallback untuk request yang tidak melalui middleware (cached responses, server actions), sesuai kontrak yang didokumentasikan di komentar middleware.

### 4.3 Helper `applyAdminModeFilter`

```ts
applyAdminModeFilter<TQuery>(query, mode, column = 'mode')
```

Di Mode Penelitian, helper menambah `.eq(col, 'research')` pada query builder; di Mode Umum passthrough tanpa filter. Tanda tangan generik agar bisa di-chain ke Supabase-style builder mana pun (`.select().eq().order()` dst).

Helper ini dipakai di ~28 endpoint admin (hasil grep `applyAdminModeFilter|assertResearchModeOnly` di [`src/app/api/admin/`](../src/app/api/admin/)), tersebar di subtree berikut: `activity/*` (11 endpoint operasional drill-down), `dashboard/route.ts`, `research/*` (analytics, artifacts, evidence, export, irr/*, sessions), `sumber/*` (sumber list, [id], cache-review, interactive-blocks), `users/*` (list + per-id summary + detail).

### 4.4 Helper `assertResearchModeOnly`

Endpoint yang **hanya bermakna** di Mode Penelitian (bank sumber, RAG admin tools, riset pipeline) memanggil `assertResearchModeOnly(req)` di awal handler. Jika mode bukan `'research'`, helper mengembalikan 403 JSON `{ error, code: 'ADMIN_MODE_RESEARCH_REQUIRED' }`. Contoh: [`src/app/api/admin/sumber/route.ts`](../src/app/api/admin/sumber/route.ts) line 69 (GET) dan 132 (POST).

## 5. Navigation Visibility & URL Guard

[`src/app/admin/layout.tsx`](../src/app/admin/layout.tsx) menerapkan dua lapis kontrol:

1. **Sidebar filter** (line 145-147): item dengan `researchOnly: true` di-filter keluar saat `adminMode === 'general'`. Yang `researchOnly`: Riset, Sumber. Yang selalu tampil: Dasbor, Siswa, Aktivitas, Ekspor.
2. **URL guard** (line 103-112): jika pathname termasuk prefix di `RESEARCH_ONLY_PREFIXES = ['/admin/riset', '/admin/sumber']` dan mode = umum, `router.replace('/admin/dashboard?toast=research-only')`. Toast di-consume oleh effect lain (line 86-98), dipampang 5 detik, lalu query param di-strip dari URL agar refresh tidak men-trigger ulang.

Banner persisten "🔬 Mode Penelitian aktif" muncul di top bar saat mode aktif sebagai pengingat visual (line 217-221).

## 6. Audit Trail

Endpoint [`src/app/api/admin/mode-switch/route.ts`](../src/app/api/admin/mode-switch/route.ts):

- **POST** menulis satu baris di `api_logs` dengan `label='admin-mode-switched'`, `metadata={ from, to, admin_email }`. Sengaja terpisah dari log generic `withApiLogging` agar peneliti bisa `WHERE label='admin-mode-switched'` tanpa join metadata di seluruh `api_logs`.
- **GET** mengembalikan event terakhir + mode aktif saat ini. Hasil di-render di footer admin layout sebagai `Terakhir diubah {relative time} oleh {email}` (line 229-239). Cheap (1 row lookup).

Body POST tahan terhadap malformed JSON (try/catch silently consume) karena cookie sudah jadi sumber kebenaran — audit hanyalah signal, bukan source-of-truth.

## 7. Backward Compatibility

Tiga jaminan agar Mode Umum tidak terdampak regresi:

1. **Cookie absen → default `'general'`.** `coerceAdminMode` di [`src/lib/admin-mode.ts`](../src/lib/admin-mode.ts) line 14 me-coerce nilai tidak valid ke fallback. Admin yang login pertama kali pasca-MVR perilakunya identik dengan pre-MVR sampai mereka eksplisit toggle.
2. **Kolom `mode` di tabel siswa default `'general'`.** Course lama yang dibuat sebelum migration tetap tampil dan dapat diakses tanpa modifikasi.
3. **`applyAdminModeFilter` passthrough di Mode Umum.** Tidak menambah `.eq()` apa pun. Query plan identik dengan pre-MVR.

## Catatan untuk Reviewer Sidang

Keputusan kunci yang dapat ditanya: mengapa pemisahan mode dilakukan **per-baris di kolom `mode`** alih-alih per-tabel terpisah (mis. `research_ask_question_history`). Per-kolom dipilih karena (a) menjaga query analytics tetap satu surface untuk peneliti yang ingin compare cross-mode (mis. apakah panjang prompt berbeda antar Mode Umum dan Mode Penelitian), (b) menghindari duplikasi 7 tabel + duplikasi 28 endpoint yang harus dipertahankan secara paralel, dan (c) kompatibel dengan migrasi backfill yang cuma `UPDATE … SET mode='general' WHERE mode IS NULL`. Trade-off-nya: indeks tambahan `idx_<table>_mode` pada 7 tabel — overhead penyimpanan kecil dan terkompensasi oleh waktu query dashboard yang lebih cepat. Lihat juga [RAG_PIPELINE.md](RAG_PIPELINE.md) untuk integrasi mode pada generasi konten kanonik dan [INTERACTIVE_BLOCKS_SPEC.md](INTERACTIVE_BLOCKS_SPEC.md) untuk konsumsi `mode` di pipeline artefak interaktif.
