# Thesis Context - PrincipleLearn V3

Konteks akademik proyek untuk thesis penelitian.

---

## 📚 Ringkasan Penelitian

PrincipleLearn V3 adalah **Learning Management System (LMS)** yang dirancang untuk mengukur dan mengembangkan **Critical Thinking (CT)** dan **Computational Thinking (CPT)** mahasiswa melalui interaksi dengan AI.

---

## 🎯 Tujuan Penelitian

1. Mengembangkan platform pembelajaran berbasis AI
2. Mengukur indikator berpikir kritis dan komputasional
3. Menganalisis efektivitas metode Socratic dalam pembelajaran online
4. Menyediakan data interaksi untuk analisis kemampuan berpikir

---

## 🧠 Indikator Critical Thinking (CT)

| No | Indikator | Deskripsi Aktivitas Mahasiswa |
|----|-----------|-------------------------------|
| 1 | **Analysis** | Memecah permasalahan atau meminta klarifikasi atas jawaban AI untuk memahami konsep lebih dalam |
| 2 | **Evaluation** | Menilai efektivitas atau ketepatan solusi yang diberikan oleh AI |
| 3 | **Inference** | Membuat prediksi atau kesimpulan logis dari hasil pembelajaran atau contoh kasus |
| 4 | **Explanation** | Menjelaskan kembali konsep dengan kata-kata sendiri atau memberikan contoh baru |
| 5 | **Self-Regulation** | Merefleksikan pemahaman, kesulitan, atau keterbatasan pengetahuan sendiri |

---

## 💻 Indikator Computational Thinking (CPT)

| No | Indikator | Deskripsi Aktivitas Mahasiswa |
|----|-----------|-------------------------------|
| 1 | **Decomposition** | Membagi masalah kompleks menjadi langkah-langkah kecil yang lebih mudah dipahami |
| 2 | **Pattern Recognition** | Mengenali kesamaan atau pola antar masalah untuk menemukan solusi umum |
| 3 | **Abstraction** | Memfokuskan perhatian pada inti konsep dengan mengabaikan detail tidak relevan |
| 4 | **Algorithmic Thinking** | Menyusun urutan langkah penyelesaian masalah secara logis dan sistematis |
| 5 | **Debugging / Error Correction** | Menemukan dan memperbaiki kesalahan dalam algoritma atau prosedur |

---

## 🔗 Pemetaan Fitur ke Indikator

### Ask Question
**CT**: Analysis, Explanation, Self-Regulation  
**CPT**: Abstraction

Dari isi pertanyaan bisa dianalisis apakah mahasiswa memecah masalah, meminta klarifikasi, dan menyadari bagian yang belum dipahami.

### Challenge My Thinking
**CT**: Evaluation, Inference, Self-Regulation  
**CPT**: Abstraction, Algorithmic Thinking

Jawaban terhadap pertanyaan challenge dan respons terhadap feedback menunjukkan kemampuan menilai, menyimpulkan, dan merefleksi.

### Quiz Time
**CT**: Evaluation  
**CPT**: Pattern Recognition, Algorithmic Thinking, Debugging

Pola jawaban benar/salah pada tipe soal tertentu bisa dianalisis untuk melihat kemampuan mengenali pola.

### Feedback
**CT**: Evaluation, Self-Regulation  
**CPT**: Debugging (opsional)

Isi feedback menunjukkan kemampuan menilai efektivitas materi dan menyadari kesulitan diri.

### Discussion (Socratic)
**CT**: Analysis, Explanation, Inference, Self-Regulation  
**CPT**: Decomposition

Pertukaran pesan sangat cocok dianalisis untuk melihat cara mereka mengurai masalah dan menjelaskan ulang.

### Request Course
**CT**: Self-Regulation, Analysis  
**CPT**: Decomposition, Abstraction, Pattern Recognition

Cara mereka mendeskripsikan tujuan belajar dan asumsi awal sebagai refleksi diri.

---

## 🏷️ Thinking Skill Tags

Untuk implementasi tracking, setiap endpoint dapat menambahkan metadata:

```typescript
// Di database record
{
  thinking_skill_tags: ['CT-Analysis', 'CPT-Abstraction']
}
```

### Tag Format
- **CT-Analysis** - Critical Thinking: Analysis
- **CT-Evaluation** - Critical Thinking: Evaluation
- **CT-Inference** - Critical Thinking: Inference
- **CT-Explanation** - Critical Thinking: Explanation
- **CT-SelfRegulation** - Critical Thinking: Self-Regulation
- **CPT-Decomposition** - Computational Thinking: Decomposition
- **CPT-PatternRecognition** - Computational Thinking: Pattern Recognition
- **CPT-Abstraction** - Computational Thinking: Abstraction
- **CPT-AlgorithmicThinking** - Computational Thinking: Algorithmic Thinking
- **CPT-Debugging** - Computational Thinking: Debugging

---

## 📊 Data Collection Points

| Fitur | Tabel Database | Data yang Dikumpulkan |
|-------|----------------|----------------------|
| Ask Question | `ask_question_history` | Pertanyaan, jawaban AI, konteks subtopic |
| Challenge | `challenge_responses` | Pertanyaan challenge, jawaban user, feedback AI |
| Quiz | `quiz_submissions` | Jawaban, kebenaran, waktu |
| Feedback | `feedback` | Rating, komentar |
| Discussion | `discussion_messages` | Semua pesan dalam sesi |
| Course Request | `course_generation_activity` | Input form, outline yang dihasilkan |

---

## 🔬 Analisis Potensial

1. **Frequency Analysis**: Seberapa sering mahasiswa menggunakan fitur tertentu
2. **Pattern Analysis**: Pola pertanyaan yang menunjukkan indikator CT/CPT
3. **Progression Analysis**: Perubahan kemampuan berpikir seiring waktu
4. **Correlation Analysis**: Hubungan antara penggunaan fitur dan hasil quiz
5. **Text Analysis**: Analisis NLP pada pertanyaan dan jawaban

---

## 📝 Catatan Implementasi

1. **Setiap interaksi harus di-log** dengan timestamp dan user ID
2. **Pertahankan konteks** (course, subtopic, module) untuk setiap record
3. **Thinking skill tags** bisa ditambahkan secara otomatis oleh AI atau manual oleh admin
4. **Export data** harus tersedia untuk analisis eksternal (CSV, JSON)

---

## 🎓 Referensi Akademik

- Facione, P.A. (1990). Critical Thinking: A Statement of Expert Consensus for Purposes of Educational Assessment and Instruction
- Wing, J.M. (2006). Computational Thinking
- Brennan, K., & Resnick, M. (2012). New frameworks for studying and assessing the development of computational thinking

---

*Dokumen ini adalah bagian dari dokumentasi thesis PrincipleLearn V3*
