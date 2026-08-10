// Konfigurasi Vitest — Fase 0.1 (lihat TESTING.md §4.2).
//
// Lingkup awal SENGAJA sempit: hanya logika MURNI (engine, helper domain).
// Test komponen & integrasi DB punya kebutuhan berbeda (jsdom, Postgres) dan
// ditambahkan saat lapisannya sudah siap — bukan sekarang.
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    // Samakan dengan `paths` di tsconfig.json — engine meng-import '@/lib/bmd'.
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    // ⚠️ `.test.tsx` WAJIB ikut. Sebelum Fase 1 pola-nya cuma `*.test.ts`, jadi
    // berkas test hook pertama (shared/ui/useAsyncData.test.tsx) DILEWATI
    // diam-diam: vitest melaporkan semuanya hijau tanpa pernah menjalankannya.
    // Test yang tak terpungut lebih berbahaya daripada tak punya test — ia
    // memberi rasa aman palsu. Kalau menambah lokasi test baru, tambahkan
    // polanya di sini DAN pastikan jumlah berkasnya bertambah di keluaran.
    include: [
      'lib/**/*.test.ts', 'lib/**/*.test.tsx',
      'modules/**/*.test.ts', 'modules/**/*.test.tsx',
      'shared/**/*.test.ts', 'shared/**/*.test.tsx',
      'tests/**/*.test.ts', 'tests/**/*.test.tsx',
    ],
    exclude: ['node_modules', '.next'],
    // `periodeDariTanggal` membaca tanggal dengan getter LOKAL padahal
    // `new Date('YYYY-MM-DD')` di-parse sebagai UTC — hasilnya ikut zona waktu
    // mesin yang menjalankannya (lihat lib/bmd.test.ts). Dipaku ke WIB supaya
    // test deterministik & sesuai kenyataan pemakaian, bukan ikut zona CI.
    env: { TZ: 'Asia/Jakarta' },
    coverage: {
      provider: 'v8',
      // Ambang HANYA untuk logika murni. Menetapkan target coverage global di
      // repo yang mulai dari nol cuma menghasilkan test basa-basi (TESTING.md §10).
      include: ['lib/engine/**', 'lib/bmd.ts', 'modules/**/domain/**', 'shared/**'],
      // Berkas test tidak ikut dihitung sbg kode yang diukur — kalau ikut,
      // angkanya naik palsu karena test selalu 100% menjalankan dirinya sendiri.
      exclude: ['**/*.test.ts', '**/*.test.tsx'],
      // Catatan: `fetchBatasKapitalisasi` (lib/bmd.ts) sengaja tak diuji —
      // satu-satunya fungsi ber-I/O di sana, milik lapisan data bukan domain
      // (CODING-STANDARD §2), dan akan pindah ke `data/` di Fase 2. Ia yang
      // membuat bmd.ts berhenti di ~93% statement, bukan logika yang terlewat.
      thresholds: { statements: 80, branches: 75 },
    },
  },
})
