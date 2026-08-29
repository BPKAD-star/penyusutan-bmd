// Penjaga registry lembar Permendagri 47/2021 (lib/permendagriFormat.ts).
//
// Yang dijaga di sini SEMUANYA kelas kegagalan SENYAP — tak satu pun
// menghasilkan error saat aplikasi dijalankan:
//
//   · penunjuk `berkas` basi setelah rename        → tak ada yang error
//   · dua entri mengaku kode format yang sama      → lembar salah label
//   · dua entri mengklaim cara perolehan yang sama → tab menampilkan lembar lain
//   · kode di registry ≠ kode yang tercetak        → lampiran salah nomor
//
// SENGAJA TIDAK menguji: bunyi label tab, susunan kolom, atau JSX apa pun.
// TESTING.md §10 menolak snapshot JSX ("nyaris selalu jadi stempel karet") dan
// §1 menaruh "tampilan jelek" di peringkat risiko TERENDAH. Yang diuji di sini
// invarian datanya, bukan tampilannya.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  LEMBAR_PERMENDAGRI, labelFormat, lembarPerolehan, type IdLembar,
} from './permendagriFormat'
import { JENIS_PEROLEHAN } from './bmd'

const AKAR = process.cwd()
const semua = Object.entries(LEMBAR_PERMENDAGRI) as [IdLembar, typeof LEMBAR_PERMENDAGRI[IdLembar]][]

describe('registry lembar Permendagri 47/2021', () => {
  it('tidak kosong — kalau kosong, tab Format Permendagri hilang di SEMUA menu', () => {
    expect(semua.length).toBeGreaterThan(0)
  })

  it('tiap entri punya kode, judul, kertas, & berkas yang terisi', () => {
    for (const [id, l] of semua) {
      expect(l.kode.trim(), `${id}.kode`).not.toBe('')
      expect(l.judul.trim(), `${id}.judul`).not.toBe('')
      expect(l.kertas.trim(), `${id}.kertas`).not.toBe('')
      expect(l.berkas.trim(), `${id}.berkas`).not.toBe('')
    }
  })

  // ⚠️ Ini yang paling gampang basi. Berkas lembar SUDAH pernah di-rename
  // (LaporanPengadaanModel3 → LaporanPengadaanPermendagri, 2026-08-29) dan
  // penunjuk yang menggantung TIDAK menghasilkan satu pun error saat runtime —
  // ia cuma bikin orang berikutnya mencari berkas yang tak ada.
  it('regresi 2026-08-29: `berkas` tiap entri BENAR-BENAR ada di disk', () => {
    for (const [id, l] of semua) {
      const p = path.join(AKAR, l.berkas)
      expect(fs.existsSync(p), `${id} menunjuk berkas yang tidak ada: ${l.berkas}`).toBe(true)
    }
  })

  it('kode format unik — dua entri tak boleh mengaku format yang sama', () => {
    const kode = semua.map(([, l]) => l.kode)
    expect(new Set(kode).size, `ada kode kembar: ${kode.join(', ')}`).toBe(kode.length)
  })

  it('kode format berbentuk nomor lampiran, bukan kalimat', () => {
    // Mis. 'IV.A', 'III.K.2', 'V.2', 'III.A.1–III.A.7'. Menangkap entri yang
    // keliru diisi judul ("Laporan Pengadaan…") alih-alih nomor formatnya.
    for (const [id, l] of semua) {
      expect(l.kode, `${id}.kode`).toMatch(/^[IVX]+(\.[A-Z0-9]+)*(–[IVX]+(\.[A-Z0-9]+)*)?$/)
    }
  })

  it('labelFormat menyebut kode & Permendagri-nya', () => {
    const l = LEMBAR_PERMENDAGRI['perolehan-pengadaan']
    expect(labelFormat(l)).toBe('Format IV.A — Permendagri 47/2021')
    for (const [, x] of semua) {
      expect(labelFormat(x)).toContain(x.kode)
      expect(labelFormat(x)).toContain('47/2021')
    }
  })
})

describe('lembarPerolehan', () => {
  it('mengembalikan lembar IV.A untuk pengadaan', () => {
    expect(lembarPerolehan('pengadaan')?.kode).toBe('IV.A')
  })

  // ⚠️ `null` WAJIB, bukan lembar kosong: pemakainya (LaporanPerolehan)
  // memakainya untuk MENIADAKAN tab. Kalau ini pernah berubah jadi objek
  // default, keempat menu itu mendadak menampilkan tab yang isinya bukan
  // laporan mereka.
  it('null untuk cara perolehan yang lembarnya BELUM dibangun', () => {
    for (const j of ['hibah_masuk', 'tukar_menukar', 'hasil_inventarisasi', 'perolehan_lainnya']) {
      expect(lembarPerolehan(j), j).toBeNull()
    }
  })

  it('null untuk jenis yang tak dikenal sama sekali', () => {
    expect(lembarPerolehan('jenis_karangan')).toBeNull()
    expect(lembarPerolehan('')).toBeNull()
  })

  it('tiap `caraPerolehan` diklaim TEPAT SATU entri', () => {
    const klaim = semua.map(([, l]) => l.caraPerolehan).filter(Boolean) as string[]
    expect(new Set(klaim).size, `ada cara perolehan diklaim >1 lembar: ${klaim.join(', ')}`)
      .toBe(klaim.length)
  })

  // Menangkap salah ketik ('pengadaaan') yang membuat tabnya hilang diam-diam:
  // `lembarPerolehan('pengadaan')` cuma mengembalikan null, tanpa error.
  it('`caraPerolehan` yang dipakai adalah jenis perolehan yang SAH', () => {
    const sah = new Set<string>(JENIS_PEROLEHAN)
    for (const [id, l] of semua) {
      if (!l.caraPerolehan) continue
      expect(sah.has(l.caraPerolehan), `${id}.caraPerolehan '${l.caraPerolehan}' bukan jenis perolehan yang dikenal lib/bmd.ts`).toBe(true)
    }
  })
})

describe('kode format yang tercetak == kode di registry', () => {
  // Lembar yang mengetik ulang nomornya sendiri akan menyimpang dari registry
  // tanpa satu pun error — dan yang salah justru yang tercetak di lampiran
  // resmi. Di sini dipastikan lembar Pengadaan MEMBACA registry.
  //
  // ⚠️ Sengaja HANYA assertion positif. Versi pertama test ini juga melarang
  // teks "Format IV.A —" muncul di berkasnya, dan itu langsung salah tangkap:
  // yang kena komentar kepala berkas (baris 2) yang justru sah & berguna.
  // Regex atas teks sumber tak bisa membedakan JSX dari komentar, jadi
  // larangan itu cuma menghasilkan kegagalan palsu. `toContain('labelFormat(')`
  // sudah cukup: mengganti panggilan registry dengan teks keras membuatnya
  // gagal, dan itu satu-satunya perubahan yang benar-benar berbahaya.
  it('LaporanPengadaanTabel membaca labelFormat(), bukan mengetik nomornya sendiri', () => {
    const src = fs.readFileSync(
      path.join(AKAR, 'components/pelaporan/LaporanPengadaanTabel.tsx'), 'utf8')
    expect(src).toContain('labelFormat(')
  })
})
