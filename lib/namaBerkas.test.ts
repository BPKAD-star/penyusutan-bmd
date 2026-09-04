import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  namaBerkasLaporan, bagianNamaBerkas, SEMUA_JENIS, SE_KABUPATEN,
} from './namaBerkas'

// Susunan yang ditetapkan user 2026-09-04:
//     <Nama Laporan>_<Tahun>_<Kode Jenis Aset>_<SKPD>
// Yang dijaga di sini bukan estetika — nama berkas yang tak menyebut cakupannya
// membuat berkas SKPD kedua MENIMPA berkas SKPD pertama di folder Unduhan tanpa
// satu pun peringatan, dan itu betul-betul bisa terjadi karena beberapa menu
// dulu menamai berkasnya tanpa SKPD sama sekali.

describe('namaBerkasLaporan — susunan empat bagian', () => {
  it('merangkai keempat bagian sesuai urutan yang ditetapkan', () => {
    expect(namaBerkasLaporan({
      laporan: 'Daftar Barang', periode: '2026-S1', golongan: '1.3.2', skpd: 'Dinas Pendidikan',
    })).toBe('Daftar Barang_2026-S1_1.3.2_Dinas Pendidikan')
  })

  it('menerima tahun berupa angka (laporan tahunan)', () => {
    expect(namaBerkasLaporan({ laporan: 'LRA Rekonsiliasi', periode: 2026 }))
      .toBe(`LRA Rekonsiliasi_2026_${SEMUA_JENIS}_${SE_KABUPATEN}`)
  })

  // ⚠️ Keputusan user: filter kosong DITULIS, bukan dihilangkan. Kalau
  // dihilangkan, `Daftar Barang_2026-S1_Dinas Pendidikan` tak bisa dibedakan
  // dari nama yang justru bagian SKPD-nya yang hilang.
  it('jenis aset kosong → "Semua Jenis", SKPD kosong → "Kab Kediri"', () => {
    expect(namaBerkasLaporan({ laporan: 'Daftar Barang', periode: '2026-S1' }))
      .toBe('Daftar Barang_2026-S1_Semua Jenis_Kab Kediri')
    expect(namaBerkasLaporan({ laporan: 'X', periode: 2026, golongan: '', skpd: '' }))
      .toBe('X_2026_Semua Jenis_Kab Kediri')
    expect(namaBerkasLaporan({ laporan: 'X', periode: 2026, golongan: null, skpd: null }))
      .toBe('X_2026_Semua Jenis_Kab Kediri')
    // Spasi doang tetap terhitung kosong.
    expect(namaBerkasLaporan({ laporan: 'X', periode: 2026, skpd: '   ' }))
      .toBe('X_2026_Semua Jenis_Kab Kediri')
  })

  // Satu-satunya bagian yang boleh absen — laporan yang memang tak punya
  // dimensi waktu (KIR & Pengamanan menampilkan POSISI TERKINI).
  it('tahun boleh absen, dan HANYA tahun', () => {
    expect(namaBerkasLaporan({ laporan: 'Laporan KIR', skpd: 'BKAD' }))
      .toBe('Laporan KIR_Semua Jenis_BKAD')
  })

  it('akhiran ditempel SESUDAH keempat bagian baku', () => {
    expect(namaBerkasLaporan({
      laporan: 'Daftar Barang', periode: '2026-S1', golongan: '1.3.2',
      skpd: 'BKAD', akhiran: ['Audit'],
    })).toBe('Daftar Barang_2026-S1_1.3.2_BKAD_Audit')
    // Akhiran kosong dibuang, bukan jadi '__' di ujung.
    expect(namaBerkasLaporan({
      laporan: 'RKBMD Ditetapkan', periode: 2027, akhiran: [null, undefined, ''],
    })).toBe('RKBMD Ditetapkan_2027_Semua Jenis_Kab Kediri')
  })

  // ⚠️ Nama SKPD di data ini boleh memuat garis miring ("Dinas A / B"). Untuk
  // unduhan Excel peramban memotong namanya di karakter itu; untuk "Save as
  // PDF" dialog Windows menolak menyimpannya.
  it('membuang karakter yang ditolak dialog Save as Windows', () => {
    expect(namaBerkasLaporan({ laporan: 'X', periode: 2026, skpd: 'Dinas A / B' }))
      .toBe('X_2026_Semua Jenis_Dinas A - B')
    expect(bagianNamaBerkas('a\\b:c*d?e"f<g>h|i')).toBe('a-b-c-d-e-f-g-h-i')
  })

  // ⚠️ `_` adalah PEMISAH antar bagian. Membiarkannya di dalam bagian membuat
  // susunan empat bagiannya tak bisa dibaca balik — dan nama-nama lama memang
  // penuh garis bawah (`Daftar_Barang`, `Laporan_Pemanfaatan`).
  it('garis bawah di DALAM bagian jadi spasi', () => {
    expect(namaBerkasLaporan({ laporan: 'Laporan_Pemanfaatan', periode: 2026 }))
      .toBe('Laporan Pemanfaatan_2026_Semua Jenis_Kab Kediri')
    expect(namaBerkasLaporan({ laporan: 'X', periode: 2026, skpd: 'Dinas_PU' }))
      .toBe('X_2026_Semua Jenis_Dinas PU')
  })

  it('memangkas spasi ganda & spasi ujung tiap bagian', () => {
    expect(namaBerkasLaporan({ laporan: '  Daftar   Barang  ', periode: ' 2026-S1 ', skpd: ' BKAD ' }))
      .toBe('Daftar Barang_2026-S1_Semua Jenis_BKAD')
  })

  it('memotong bagian yang kelewat panjang, bukan melahirkan nama tak tersimpan', () => {
    const panjang = 'A'.repeat(200)
    const hasil = namaBerkasLaporan({ laporan: 'X', periode: 2026, skpd: panjang })
    expect(hasil.length).toBeLessThan(120)
    expect(hasil.startsWith('X_2026_Semua Jenis_AAA')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Pemindai: tak boleh ada menu yang menamai berkas laporannya sendiri lagi.
//
// ⚠️ Ini yang menjaga aturan tetap berlaku untuk menu YANG BELUM DITULIS. Tanpa
// pemindai, satu `exportToExcel(rows, 'Laporan_Anu_2026')` yang lolos review
// langsung memecah keluarga namanya kembali — dan tak ada apa pun yang gagal.
describe('seluruh Export Excel & lembar cetak memakai namaBerkasLaporan', () => {
  const AKAR = process.cwd()

  function berkasTsx(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(path.join(AKAR, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name)
      if (e.isDirectory()) berkasTsx(rel, out)
      else if (e.name.endsWith('.tsx')) out.push(rel)
    }
    return out
  }

  const pemakai = [...berkasTsx('app'), ...berkasTsx('components')]
    .map(rel => ({ rel, isi: fs.readFileSync(path.join(AKAR, rel), 'utf8') }))
    // Dua pintu yang menghasilkan berkas: tombol Export Excel, dan lembar cetak
    // yang menyetel nama bawaan "Save as PDF" lewat `document.title`.
    .filter(f => f.isi.includes('exportToExcel(') || /document\.title\s*=/.test(f.isi))

  it('pemindaiannya benar-benar menemukan menu-menu export', () => {
    // Pengaman anti-hampa (pola lib/sinkronisasi.test.ts): pemindai yang tak
    // menemukan apa-apa akan "lulus" — lebih berbahaya daripada tak punya test.
    expect(pemakai.length).toBeGreaterThanOrEqual(28)
  })

  for (const f of [...new Set(pemakai.map(x => x.rel))]) {
    it(`${f} tidak merakit nama berkasnya sendiri`, () => {
      const isi = pemakai.find(x => x.rel === f)!.isi
      // `namaBerkasBA` dihitung sah: ia sendiri cuma pembungkus tipis di atas
      // `namaBerkasLaporan` (lib/beritaAcaraRekon.ts), bukan perakit kedua.
      expect(/namaBerkasLaporan|namaBerkasBA/.test(isi),
        `${f} menghasilkan berkas tapi tak memanggil namaBerkasLaporan`).toBe(true)
    })
  }
})
