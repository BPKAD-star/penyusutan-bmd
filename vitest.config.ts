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
    include: ['lib/**/*.test.ts', 'modules/**/*.test.ts', 'shared/**/*.test.ts'],
    exclude: ['node_modules', '.next'],
    coverage: {
      provider: 'v8',
      // Ambang HANYA untuk logika murni. Menetapkan target coverage global di
      // repo yang mulai dari nol cuma menghasilkan test basa-basi (TESTING.md §10).
      include: ['lib/engine/**', 'modules/**/domain/**', 'shared/**'],
      thresholds: { statements: 80, branches: 75 },
    },
  },
})
