# Rencana Optimasi Produk — Fokus Demo Sidang

**Dibuat**: 2026-05-16
**Status**: Draft untuk review user
**Konteks user**:
- Kriteria sukses: **Demo sidang impresif** (penguji harus lihat fitur "wow")
- Pasca-sidang: **Berhenti, jadi artefak riset** → tidak ada beban maintenance jangka panjang
- Cakupan: **Semua area di-cover, abaikan waktu**
- Proses: **Rancangan tertulis dulu, baru eksekusi**

**Implikasi arah**:
- Investasi yang **invisible saat sidang** (e.g., bundle size, code style, scalability untuk 1000+ users) → **deprioritized**
- Fitur yang **VISIBLE saat demo + penguji** (visualisasi, real-time data, comparison mode, citation) → **prioritized**
- Reliability sebatas "tidak crash saat demo" — tidak perlu CI/CD lengkap, monitoring tier-3, dst.
- Boleh refactor besar kalau hasilnya impresif (e.g., outline preview yang sebelumnya saya usulkan = batal kalau tidak meningkatkan demo)

---

## 1. Inventory Lengkap Item (32 item)

### A. Generate Course (4 item)

| # | Item | Dampak demo | Effort | Catatan |
|---|---|---|---|---|
| A1 | **Streaming progress visual di generating page** | ⭐⭐⭐ | 0.5d | Penguji ngintip pas demo → lihat AI thinking step-by-step. Sangat impresif. |
| A2 | **Outline preview + edit sebelum full gen** | ⭐⭐ | 2d | Bagus untuk demo "kontrol pengguna", tapi alur jadi panjang. Worth it. |
| A3 | **Token cost meter live** (admin) | ⭐⭐ | 0.5d | Saat sidang, peneliti bisa pamer "1 course = X token = Rp Y". Transparansi pedagogis. |
| A4 | **Retry circuit breaker per subtopik** | ⭐ | 1d | Mostly invisible. Tapi cegah demo gagal di tengah. Worth it untuk reliability sidang. |

### B. Course Delivery / Pengalaman Siswa (8 item)

| # | Item | Dampak demo | Effort | Catatan |
|---|---|---|---|---|
| B1 | **RAG citation card visual di Sokratik response** | ⭐⭐⭐⭐ | 1.5d | "Sumber: [PDF judul] - hal 12" yang clickable → preview chunk. Bukti RAG visual. **Paling impresif untuk sidang.** |
| B2 | **Quiz auto-save** (resume after refresh) | ⭐⭐ | 1d | Demo audience kadang refresh, kalau hilang progress jelek. |
| B3 | **Code splitting komponen heavy** | ⭐ | 0.5d | Invisible untuk penguji. **DROP** kecuali Anda nyaman demo lokal yang lebih ringan. |
| B4 | **Mobile-first audit subtopic page** | ⭐ | 1d | Penguji pakai laptop. **DROP**. |
| B5 | **HelpDrawer + ProductTour kontekstual per Mode** | ⭐⭐ | 0.5d | Bagus kalau penguji minta "lihat dari sudut pandang siswa baru". |
| B6 | **Animasi reveal Sokratik response** (typewriter + highlight pertanyaan) | ⭐⭐⭐ | 1d | Streaming text sudah ada, tambah micro-animation untuk efek dramatis. |
| B7 | **PromptTimeline visualization upgrade** (Bloom level chart per revisi) | ⭐⭐⭐ | 1.5d | Bukti RM2 visual: prompt naik dari Apply → Evaluate. Sangat sidang-friendly. |
| B8 | **Interactive Block "demo mode" gallery** (semua 6 komponen di 1 halaman) | ⭐⭐⭐ | 1d | Penguji minta "tunjukin semua tipe interaktif". Satu URL `/admin/showcase/interactive-blocks`. |

### C. Admin / Tools Peneliti (8 item)

| # | Item | Dampak demo | Effort | Catatan |
|---|---|---|---|---|
| C1 | **Real-time dashboard polling 30s** | ⭐⭐⭐ | 1d | Saat demo, peneliti buka dashboard di tab samping → angka berdetak. |
| C2 | **Activity timeline chart per siswa** | ⭐⭐⭐⭐ | 1.5d | Visual timeline (waktu vs aktivitas) per siswa pilot. **Bukti RM2/RM3 paling kuat untuk sidang.** |
| C3 | **Bulk PDF upload + auto embed** (14 PDF) | ⭐⭐ | 1d | Saat demo "upload bank sumber baru", admin drag 5 PDF sekaligus. Smooth ops. |
| C4 | **Triangulasi 3-source view** (prompt + cog + artifact) | ⭐⭐⭐⭐ | 2d | **Triangulasi adalah klaim sentral RM3** — visual side-by-side wajib ada. |
| C5 | **Cognitive scoring heatmap per siswa** | ⭐⭐⭐ | 1.5d | Heatmap (Bloom × dimensi CT) untuk visualisasi RM3 cepat. |
| C6 | **Mode Umum vs Penelitian split-screen comparison** | ⭐⭐⭐⭐ | 1.5d | Penguji pasti nanya "apa bedanya?". Side-by-side proof. |
| C7 | **IRR live demo polish** (sudah ada, tambah Cohen κ counter real-time) | ⭐⭐⭐ | 1d | Saat rating 2 sampel, kappa update di pojok kanan atas. Numerik = kredibel. |
| C8 | **Ekspor data riset one-click** (CSV bundle: prompts + scores + artifacts) | ⭐⭐ | 1d | Saat sidang: "data riset siap ekspor". 1 tombol, 1 ZIP. |

### D. User / Non-course (3 item)

| # | Item | Dampak demo | Effort | Catatan |
|---|---|---|---|---|
| D1 | **Continue learning hero card di dashboard** ("Lanjutkan: Course X — Subtopik 2.3") | ⭐⭐ | 0.5d | Pengalaman lebih natural saat demo. |
| D2 | **Profile / settings page** | ⭐ | 1d | Mostly invisible. **DROP** kecuali Anda mau pamer "akses sendiri". |
| D3 | **Dashboard course filter + search** | ⭐ | 0.5d | **DROP** untuk siswa pilot 3 orang. |

### E. Sidang-Specific (5 item BARU)

Item-item ini khusus dirancang untuk dipakai saat sesi demo penguji. Tidak ada di rencana sebelumnya.

| # | Item | Dampak demo | Effort | Catatan |
|---|---|---|---|---|
| E1 | **"Demo Persona" pre-generated course + siswa contoh** | ⭐⭐⭐⭐⭐ | 1d | Akun siswa "demo_alice" dengan course sudah jalan + history lengkap. Penguji bisa langsung lihat data tanpa tunggu generate. **WAJIB.** |
| E2 | **Sidang Mode toggle** — UI tweak untuk demo (font besar, kontras tinggi, navigation breadcrumb visible) | ⭐⭐ | 0.5d | Saat presenter mode, UI lebih readable untuk proyektor. |
| E3 | **Architecture diagram embedded di /admin/about** | ⭐⭐⭐ | 0.5d | Penguji tanya "bagaimana sistem bekerja?", admin klik 1 tombol → diagram interaktif Mermaid (kita sudah punya `docs/diagrams/`). |
| E4 | **Live metrics page** (`/admin/live`) untuk sidang | ⭐⭐⭐⭐ | 1d | Single screen full-page: token spent, prompt classification distribution, kappa, active sessions. Buat saat sidang dibuka di tab 2. |
| E5 | **Demo script + cue cards built-in** (klik tombol "demo mode" → highlight fitur step-by-step) | ⭐⭐⭐ | 1d | Self-guided demo untuk penguji yang nyobain sendiri. |

### F. Reliability / Cross-cutting (4 item — minimal, hanya untuk hindari crash saat demo)

| # | Item | Dampak demo | Effort | Catatan |
|---|---|---|---|---|
| F1 | **Slug-conflict lint** (cegah bug seperti hari ini) | invisible | 0.3d | Insurance murah, jangan sampai turun di hari sidang. |
| F2 | **Vercel deployment alert / Sentry** untuk error rate | invisible | 1d | Anda dapet notifikasi kalau /api/* error >5% — penting untuk pilot W13 & sidang. |
| F3 | **Smoke test post-deploy** (script CI cek 5 endpoint kritis) | invisible | 0.5d | Otomatis verifikasi setelah push. |
| F4 | **Database backup snapshot otomatis sebelum demo hari** | invisible | 0.3d | Supabase MCP scheduled task. Rollback safety. |

**Total: 32 item, total effort estimasi ~30 hari kerja.**

---

## 2. Dependency Graph

```text
                    ┌─────────────────────┐
                    │ E1 Demo Persona     │ ← prereq untuk semua demo
                    │ (akun + course pre-gen)│
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
   [Bukti RM2 visual]    [Bukti RM3 visual]    [Operational impresif]
   B7 PromptTimeline     C4 Triangulasi         C1 Real-time dashboard
   B1 RAG citation       C5 Cognitive heatmap   C2 Activity timeline
   A1 Streaming visual   C7 IRR kappa live      C6 Mode comparison
   A3 Token cost meter   E4 Live metrics page   C3 Bulk PDF upload
                                                C8 Ekspor 1-click
                               │
                               ▼
                       [Sidang readiness layer]
                       E2 Sidang mode toggle
                       E3 Architecture diagram
                       E5 Demo script cue
                       F1-F4 Reliability minimum

   [Skip/Drop]
   B3 Code splitting
   B4 Mobile audit
   D2 Profile page
   D3 Course filter
```

---

## 3. Eksekusi Order (Fase)

### Fase 0 — Insurance (hari 1)
Cegah regresi & lossy state sebelum mulai investasi besar.

- F1 Slug-conflict lint (0.3d)
- F4 Database backup otomatis (0.3d)
- F2 Vercel alert + Sentry (1d)
- F3 Smoke test post-deploy (0.5d)

**DoD**: Setiap push memicu validasi otomatis. Anda dapet email kalau prod down.

### Fase 1 — Foundation Demo Persona (hari 2-3)
Tanpa demo persona, semua fitur lain susah dipresentasikan ke penguji.

- E1 Demo Persona pre-generated (1d)
- C3 Bulk PDF upload (1d) — supaya 14 PDF bank sumber masuk dulu

**DoD**: Buka `/login` dengan akun `demo_siswa@thesis.local` → langsung ada 4 course (1 per template Fase E), Quiz + Challenge sudah pernah submit, prompt revisions tercatat, research_artifacts terisi.

### Fase 2 — Bukti RM2 Visual (hari 4-7)
RM2 = "Bagaimana prompt siswa berkembang setelah AI Sokratik?".

- A1 Streaming progress visual (0.5d)
- B1 RAG citation card visual (1.5d) ← **highlight sidang**
- B6 Animasi reveal Sokratik response (1d)
- B7 PromptTimeline Bloom chart (1.5d) ← **highlight sidang**

**DoD**: Demo flow "siswa baru bikin course → tanya Sokratik → lihat prompt diary → lihat Bloom level naik" mulus end-to-end.

### Fase 3 — Bukti RM3 Visual (hari 8-12)
RM3 = "Sejauh mana komputasional thinking siswa terukur via triangulasi 3 sumber?".

- C4 Triangulasi 3-source view (2d) ← **highlight sidang**
- C5 Cognitive heatmap per siswa (1.5d)
- C7 IRR kappa live counter (1d)
- C8 Ekspor 1-click (1d)

**DoD**: Buka `/admin/riset/triangulasi` → pilih siswa pilot → tampil 3 panel side-by-side (prompt cls + cog score + artifact) yang konsisten/bertentangan ditandai jelas. Klik ekspor → download bundle ZIP.

### Fase 4 — Operasional Impresif (hari 13-17)
Tampilkan sistem hidup, bukan static demo.

- C1 Real-time dashboard polling (1d)
- C2 Activity timeline chart (1.5d) ← **highlight sidang**
- C6 Mode Umum vs Penelitian split-screen (1.5d) ← **highlight sidang**
- B8 Interactive Block gallery (1d)
- E4 Live metrics page (1d)

**DoD**: Buka 3 tab di sidang: dashboard live, activity timeline siswa, mode comparison. Penguji nanya apapun → ada satu URL untuk jawab.

### Fase 5 — Sidang Layer (hari 18-21)
Polish khusus sesi sidang.

- E2 Sidang mode toggle (0.5d)
- E3 Architecture diagram di /admin/about (0.5d)
- E5 Demo script cue cards (1d)
- D1 Continue learning hero card (0.5d)
- B5 HelpDrawer kontekstual per Mode (0.5d)

**DoD**: Anda bisa demo 30 menit tanpa buka file slide tambahan — semua narasi terpicu dari UI.

### Fase 6 — Generate Course Polish (hari 22-26)
Penting tapi tidak urgent untuk sidang inti. Bisa dikerjakan paralel kalau bandwidth ada.

- A2 Outline preview + edit (2d)
- A3 Token cost meter (0.5d)
- A4 Retry circuit breaker (1d)
- B2 Quiz auto-save (1d)

**DoD**: Generate course flow lebih kontrolabel + token transparan.

### Fase 7 — Buffer & Rehearsal (hari 27-30)
- Latihan demo 3x (rekam)
- Fix bug yang ketahuan
- Backup state final
- Setup demo environment terpisah (account staging)

---

## 4. Items yang DI-DROP (justifikasi)

| Item | Alasan drop |
|---|---|
| B3 Code splitting komponen heavy | Invisible untuk penguji. User tidak peduli First Load JS. Latency demo lokal cukup cepat. |
| B4 Mobile-first audit | Penguji pakai laptop / proyektor. Siswa pilot 3 orang sudah pegang HP yang sama formatnya. |
| D2 Profile / settings page | Tidak ditanya di sidang. Tidak bagian dari RM. |
| D3 Course filter + search | Hanya 3 siswa pilot, tidak butuh filter. |
| #1 sebelumnya: Outline preview lazy gen "hemat 60% token" | Tetap dikerjakan di Fase 6, tapi tujuan diubah dari "hemat cost" jadi "control demo". |
| #15 sebelumnya: lint rule | Direplace dengan F1 yang lebih spesifik (slug-conflict). |
| Profile activity tracking jangka panjang | Tidak ada maintenance pasca-sidang. |

---

## 5. Definition of Done Per Item

Setiap item harus lulus 3 kriteria minimum sebelum dianggap done:

1. **Functional**: Fitur jalan di production (`principle-learn-v3.vercel.app`), tidak hanya local.
2. **Demo-able**: Ada flow konkret yang bisa diperagakan dalam ≤2 menit untuk satu fitur.
3. **Resilient**: Tidak crash kalau data kosong/network putus (graceful fallback).

Item yang punya ⭐⭐⭐⭐ atau ⭐⭐⭐⭐⭐ butuh tambahan:

4. **Polish visual**: Loading state + empty state + error state semua dirancang.
5. **Captured**: Saya ambil screenshot/recording sebagai bukti progress.

---

## 6. Open Questions ke User

Mohon jawab supaya saya bisa eksekusi lebih tepat:

### Q1 — Tanggal sidang & pilot
- Kapan jadwal sidang final? (untuk hitung mundur fase)
- Kapan pilot W13 mulai? (sebelum atau sesudah Fase 4?)

### Q2 — Demo Persona scope (Fase 1)
Saya rancang E1 dengan akun siswa contoh yang sudah ada history. Pilihan:
- **(a)** Hanya 1 akun siswa "ideal" (course Fase E selesai, prompt naik, artifact lengkap)
- **(b)** 3 akun (rendah/medium/tinggi performance) untuk demonstrasi range
- **(c)** 3 akun real siswa pilot setelah W13 selesai, tidak ada "demo persona" tiruan

### Q3 — Citation visual (B1)
Klik citation card buka:
- **(a)** Modal dengan kutipan chunk (3-5 paragraf) — cepat baca
- **(b)** PDF viewer in-page dengan page anchor — lebih impresif tapi 2x effort
- **(c)** Link external buka PDF di tab baru — paling simpel

### Q4 — Mode toggle di Sidang (E2)
- **(a)** Hidden behind keyboard shortcut Ctrl+Shift+P (peneliti only)
- **(b)** Sebagai opsi normal di settings (bisa diakses penguji juga)

### Q5 — Pilihan akun untuk demo
Saat penguji ngintip:
- **(a)** Login sebagai admin (lihat dashboard + drill-down)
- **(b)** Login sebagai siswa demo (lihat flow learning)
- **(c)** Keduanya, switch antar akun dengan tombol di header

### Q6 — Bahasa data demo
- **(a)** Semua data demo Indonesia
- **(b)** Mix Indonesia + Inggris untuk demonstrasi bilingual toggle
- **(c)** Sesuai bahasa generate saja (random)

### Q7 — Reliability layer (Fase 0)
Sentry/error monitoring berbayar (~$26/mo free tier). Pilihan:
- **(a)** Pakai Sentry free tier (5k events/mo cukup)
- **(b)** Custom error logger ke Supabase table `error_logs`
- **(c)** Skip, hanya andalkan Vercel native logs

### Q8 — Item yang masih ragu
Setelah baca rencana ini, item mana yang Anda rasa **wajib tambah** atau **wajib hapus** yang saya belum cover?

---

## 7. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Sidang dimajukan mendadak | Fase 1-3 cukup untuk inti sidang. Fase 4 ke atas dropable. |
| OpenAI rate limit saat demo | Pre-generate semua AI output di E1 Demo Persona. Demo tidak panggil OpenAI live (kecuali penguji minta test). |
| Vercel turun saat sidang | F4 backup + ada akun lokal `npm run start` di laptop sebagai fallback. |
| Bug regresi dari refactor besar (A2) | Skip A2 kalau Fase 1-3 belum stabil. |
| Penguji nanya area yang tidak ter-cover | E5 cue card harus bisa redirect ke "future work" gracefully. |

---

## 8. Catatan Akhir

- **Saya rekomendasikan jangan eksekusi paralel ≥3 fitur sekaligus**. Risk regresi tinggi mengingat tidak ada CI/CD lengkap.
- **Fase 0 wajib first** — tanpa monitoring, regresi dari fase berikut akan susah dideteksi.
- **Setelah Anda approve rencana ini**, saya kerjakan per fase, minta approval di akhir tiap fase sebelum lanjut.
- Item ⭐⭐⭐⭐⭐ (E1 Demo Persona) = blocker tunggal. Kerjakan dulu.

---

**Permintaan ke Anda**: Review rencana ini, jawab 8 open questions di Section 6, lalu konfirmasi sebelum saya mulai Fase 0.
