// ============================================================================
// ESLint — REFACTOR-PLAN.md Fase 0.5, "sedikit tapi menggigit".
//
// SENGAJA MINIMALIS. `eslint-config-next` penuh di 36.000 baris tanpa lint akan
// menghasilkan ribuan peringatan yang langsung diabaikan semua orang — dan lint
// yang diabaikan lebih buruk daripada tidak punya lint, karena ia memberi kesan
// ada yang menjaga. Yang dinyalakan hanya aturan yang memetakan LANGSUNG ke
// insiden nyata ([docs/insiden.md](docs/insiden.md)).
//
// ── error vs warn: dipilih dari ANGKA, bukan dari selera ────────────────────
// Diukur 2026-08-06 atas `app components lib middleware.ts`:
//
//   260  no-floating-promises   → 178 di components/, 82 di app/, **0 di lib/**
//   294  no-restricted-syntax   (`const { data } = await` tanpa `error`)
//    15  max-lines              (> 500 baris)
//     0  no-restricted-imports  (`modules/` belum ada)
//
//   * `error` dipakai hanya di tempat yang **hari ini nol pelanggaran**, jadi
//     tiap merah berarti pelanggaran BARU dan CI tetap hijau.
//   * `warn` untuk utang yang sudah terlanjur besar. Menaikkannya sekarang =
//     CI merah permanen, yang efeknya sama dengan tidak punya CI; memperbaiki
//     ratusan pelanggaran sekaligus = satu PR yang mustahil di-review, dan di
//     aplikasi yang dilaporkan ke BPK review adalah pertahanan terakhir.
//     Diadopsi lewat boy-scout rule (CODING-STANDARD §10).
//
// **Jangan menurunkan yang sudah `error` untuk membuat CI hijau lagi.** Kalau
// ada yang merah, itu memang pelanggaran baru — perbaiki kodenya.
// ============================================================================
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import nextPlugin from '@next/eslint-plugin-next'

const akar = path.dirname(fileURLToPath(import.meta.url))

export default tseslint.config(
  {
    ignores: ['.next/**', 'out/**', 'coverage/**', 'node_modules/**'],
  },

  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      // Type-aware: `no-floating-promises` & `await-thenable` MUSTAHIL tanpa
      // tipe. Itu sebabnya dua aturan ini ada di sini, bukan di lint biasa.
      parserOptions: { projectService: true, tsconfigRootDir: akar },
    },
    // Kedua plugin ini DIDAFTARKAN TAPI NOL ATURANNYA DINYALAKAN. Gunanya cuma
    // supaya 144 komentar `eslint-disable` lama yang menyebut
    // `react-hooks/exhaustive-deps` & `@next/next/no-img-element` tetap bisa
    // di-resolve — tanpa ini ESLint melaporkan "Definition for rule was not
    // found" sebagai ERROR di 80 berkas, dan CI merah karena komentar, bukan
    // karena kode. Menyalakan aturannya = keluar dari minimalisme Fase 0.5;
    // membuang 144 komentarnya = menyentuh 80 berkas produk tanpa alasan.
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'react-hooks': reactHooks,
      '@next/next': nextPlugin,
    },
    // Konsekuensi dari keputusan di atas: komentar-komentar itu jadi "tak
    // terpakai" (aturannya memang mati). Melaporkannya cuma menghasilkan 144
    // peringatan tentang komentar yang justru sengaja dipertahankan supaya
    // tetap berlaku kalau react-hooks dinyalakan nanti.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      // ── INS-06, INS-08, INS-09: `error` ditelan → hasilnya KEBALIKAN ────────
      // `const { data } = await supabase...` tanpa `error`: query gagal → data
      // null → fungsi mengembalikan set kosong → terbaca "tak ada yang
      // dibatalkan" → barang yang sudah dibatalkan muncul lagi sebagai
      // perolehan sah di tiga laporan sekaligus, tanpa satu pun pesan.
      // (rules.md §2.1)
      'no-restricted-syntax': ['warn', {
        selector: "VariableDeclarator[id.type='ObjectPattern']:not(:has(Property[key.name='error'])) > AwaitExpression",
        message: 'Query Supabase wajib memeriksa `error` lalu MELEMPAR — pakai assertOk() (rules.md §2.1, docs/insiden.md INS-06).',
      }],

      // ── Arah dependensi antar-lapisan (CODING-STANDARD §2) ────────────────
      // Tanpa aturan ini, pemisahan lapisan cuma niat baik. `modules/` belum
      // ada (Fase 5), jadi hari ini nol efek — itu memang maksudnya: penjaganya
      // terpasang SEBELUM folder pertamanya dibuat, bukan sesudah
      // pelanggarannya terlanjur banyak.
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/modules/*/data/*', '**/modules/*/ui/*'],
          message: 'Impor antar-modul hanya lewat index.ts (CODING-STANDARD §2).',
        }],
      }],

      // ── Berkas raksasa (Fase 3) ───────────────────────────────────────────
      // 15 berkas melewati ambang; terbesar Pengadaan.tsx 1.437 baris / 60
      // useState. `warn` — memecahnya SPEKULATIF dilarang REFACTOR-PLAN §6,
      // tunggu ada fitur yang memang mendarat di berkasnya.
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },

  {
    // ── INS-10: loader tanpa penangkap → halaman beku "Memuat…" selamanya ────
    // Daftar Barang `await fetchOwnerOverrides(...)` tanpa try/catch; begitu
    // query itu timeout, `setLoading(false)` di akhir jalur sukses TAK PERNAH
    // tercapai. (rules.md §2.2)
    //
    // `error` DI SINI SAJA karena lib/ diukur **nol pelanggaran** — inilah
    // lapisan kolektor tempat kegagalan senyap paling mahal, dan justru di sini
    // aturannya bisa langsung menggigit tanpa memerahkan CI.
    files: ['lib/**/*.ts', 'lib/**/*.tsx', 'middleware.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
    },
  },

  {
    // Di app/ & components/ aturan yang sama masih `warn`: 260 pelanggaran,
    // hampir semuanya bentuk `useEffect(() => { load() }, [])`. Membenahinya
    // satu PR = menyentuh 80 berkas sekaligus. Turunkan lewat boy-scout rule,
    // lalu naikkan blok ini jadi `error` begitu angkanya nol.
    files: ['app/**/*.ts', 'app/**/*.tsx', 'components/**/*.ts', 'components/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/await-thenable': 'warn',
    },
  },

  {
    // `domain/` tidak boleh menyentuh I/O sama sekali — itu yang membuatnya
    // bisa diuji tanpa DB. Sengaja DIPISAH: kalau larangan `@supabase/*`
    // dipasang global, seluruh aplikasi ini melanggarnya (akses data memang
    // langsung dari client, architecture.md §1).
    files: ['**/modules/*/domain/**/*.ts', '**/modules/*/domain/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@supabase/*'],
          message: 'domain/ tidak boleh menyentuh I/O — pindahkan query-nya ke data/ (CODING-STANDARD §2).',
        }],
      }],
    },
  },
)
