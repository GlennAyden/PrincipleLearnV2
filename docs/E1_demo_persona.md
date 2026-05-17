# Demo Persona — Cara Menyiapkan Citation untuk Sidang

## Konteks

Fitur **RAG Citation Modal** menampilkan sumber buku yang digunakan AI untuk menjawab pertanyaan siswa di Mode Penelitian. Data citation disimpan di kolom `ask_question_history.cited_material_chunk_ids` (UUID array).

Demo persona default (user `00000000-0000-0000-0000-000000000d01`) sudah bisa login di `/login` dengan password `demo123`. Jika array `cited_material_chunk_ids` masih kosong (`{}`), section citation **tidak ditampilkan sama sekali** — ini perilaku yang benar (clean fallback).

---

## Cara memunculkan citation untuk demo sidang (W13)

### Prasyarat

1. Ada minimal satu baris di tabel `materials` (Mode Penelitian)
2. Ada chunk-chunk di `material_chunks` untuk material tersebut
3. Demo persona punya record di `ask_question_history` dengan `cited_material_chunk_ids` yang berisi UUID chunk valid

### Langkah

#### 1. Upload material buku (jika belum ada)

Buka admin panel Mode Penelitian → Sumber → Upload. Atau via SQL:

```sql
-- Cek apakah material sudah ada
SELECT id, title, validation_status FROM materials LIMIT 10;

-- Cek chunks
SELECT material_id, COUNT(*) chunk_count FROM material_chunks GROUP BY material_id;
```

#### 2. Catat chunk ID yang ingin di-demo

```sql
-- Ambil beberapa chunk dari material yang sudah ada
SELECT id, chunk_text, page_number
FROM material_chunks
LIMIT 5;
```

Catat 1–3 UUID chunk yang isi teksnya representatif untuk demo.

#### 3. Update record ask_question_history demo persona

```sql
-- Ambil dulu record yang ada untuk demo persona
SELECT id, question, cited_material_chunk_ids
FROM ask_question_history
WHERE user_id = '00000000-0000-0000-0000-000000000d01'
ORDER BY created_at DESC
LIMIT 10;

-- Update satu atau beberapa record dengan chunk IDs nyata
UPDATE ask_question_history
SET cited_material_chunk_ids = ARRAY[
  '<chunk-uuid-1>'::uuid,
  '<chunk-uuid-2>'::uuid
]
WHERE id = '<ask-question-history-id>';
```

Ganti `<chunk-uuid-1>`, `<chunk-uuid-2>`, dan `<ask-question-history-id>` dengan UUID aktual dari query di atas.

#### 4. Verifikasi via endpoint

Setelah login sebagai demo persona, hit endpoint:

```
GET /api/material-chunks/<chunk-uuid-1>
```

Harus return `200` dengan `{ success: true, chunk: { ... } }`.

#### 5. Alur demo di browser

1. Login sebagai `demo123` / password `demo123` di `/login`
2. Buka course Mode Penelitian
3. Buka subtopic → tab "Tanya Pertanyaan"
4. Pertanyaan yang sudah tersimpan dengan citation akan tampil card biru kecil di bawah jawaban
5. Klik card → modal muncul dengan teks kutipan + konteks sebelum/sesudah

---

## Catatan teknis

- Endpoint `GET /api/material-chunks/[id]` memerlukan auth (`access_token` cookie valid)
- Hanya chunk dari material dengan `template_topics` Mode Penelitian yang bisa diakses
- Modal fokus otomatis ke tombol Tutup; ESC menutup; click backdrop menutup
- Jika chunk tidak ditemukan atau mode bukan penelitian, endpoint return 404/403 dan modal menampilkan pesan error
- Untuk siswa pilot W13: flow citation otomatis — setiap kali siswa tanya di Mode Penelitian dan AI menggunakan RAG, `cited_material_chunk_ids` otomatis terisi oleh server setelah stream selesai
