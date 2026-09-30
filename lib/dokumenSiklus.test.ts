// Penjaga konfigurasi Dokumen Sumber. Yang dikunci di sini kelas kesalahan yang
// SELALU SENYAP: penyaring yang salah eja tak menghasilkan satu pun error, cuma
// tab yang selamanya kosong — dan operator membacanya sebagai "dokumennya belum
// diunggah", bukan "aplikasinya salah cari".
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  DAFTAR_SIKLUS, DAFTAR_PERATURAN, PEMINDAHTANGANAN_SUBJENIS, dokumenMasihLive, judulPeraturan, tahunPeraturanSah,
  type PullKelompok, type BarisHeader,
} from './dokumenSiklus'
import { JENIS_PEMANFAATAN } from './pemanfaatan'

const pullDari = (key: string): PullKelompok[] => {
  const s = DAFTAR_SIKLUS.find(x => x.key === key)?.sumber.find(x => x.tipe === 'pull')
  if (!s || s.tipe !== 'pull') throw new Error(`siklus ${key} bukan pull`)
  return s.kelompok
}
const baris = (p: Partial<BarisHeader>): BarisHeader =>
  ({ jenis: null, sub_jenis: null, payload: null, ...p })

describe('DAFTAR_SIKLUS — bentuk dasar', () => {
  it('tiap sumber pull punya minimal satu kelompok', () => {
    for (const s of DAFTAR_SIKLUS) {
      for (const sm of s.sumber) {
        if (sm.tipe === 'pull') expect(sm.kelompok.length, s.key).toBeGreaterThan(0)
      }
    }
  })

  it('key kelompok unik dalam satu sumber', () => {
    for (const s of DAFTAR_SIKLUS) {
      for (const sm of s.sumber) {
        if (sm.tipe !== 'pull') continue
        const keys = sm.kelompok.map(k => k.key)
        expect(new Set(keys).size, s.key).toBe(keys.length)
      }
    }
  })

  it('kategori yang ditarik hanya kategori jurnal_header yang benar-benar dipakai', () => {
    // Kembar dgn `kategori:` di komponen menu masing-masing. Salah eji di sini
    // = tab kosong permanen tanpa satu pun error.
    const SAH = new Set([
      'pengadaan', 'hibah_masuk', 'tukar_menukar', 'hasil_inventarisasi', 'perolehan_lainnya',
      'pengalihan_status', 'mutasi_internal', 'pemanfaatan', 'pengamanan',
      'koreksi', 'reklasifikasi', 'penghapusan',
    ])
    for (const s of DAFTAR_SIKLUS) {
      for (const sm of s.sumber) {
        if (sm.tipe !== 'pull') continue
        for (const k of sm.kelompok) expect(SAH.has(k.kategori), `${s.key}/${k.key}: ${k.kategori}`).toBe(true)
      }
    }
  })
})

describe('Pemanfaatan — tab KEMBAR dgn JENIS_PEMANFAATAN', () => {
  const kel = pullDari('pemanfaatan')

  it('kelima jenis pemanfaatan punya tabnya sendiri, tak lebih & tak kurang', () => {
    expect(kel.map(k => k.key).sort()).toEqual(JENIS_PEMANFAATAN.map(j => j.value).sort())
  })

  it('tiap tab cocok TEPAT ke jenis yang dimaksud (dibaca dari payload)', () => {
    for (const j of JENIS_PEMANFAATAN) {
      const k = kel.find(x => x.key === j.value)!
      const cocokKe = JENIS_PEMANFAATAN.filter(v =>
        k.cocok!(baris({ jenis: 'pemanfaatan', payload: { jenis_pemanfaatan: v.value } })))
      expect(cocokKe.map(v => v.value), j.value).toEqual([j.value])
    }
  })

  it('MENOLAK membaca dari kolom `jenis` — di DB isinya harfiah "pemanfaatan"', () => {
    // Kalau suatu saat penyaringnya digeser ke `h.jenis`, uji ini merah: baris
    // yang jenisnya 'sewa' di kolom (dan bukan di payload) tak boleh cocok.
    const k = kel.find(x => x.key === 'sewa')!
    expect(k.cocok!(baris({ jenis: 'sewa' }))).toBe(false)
  })
})

describe('Penghapusan — tab KEMBAR dgn PEMINDAHTANGANAN_SUBJENIS', () => {
  const kel = pullDari('penghapusan')

  it('empat bentuk pemindahtanganan + sebab lain', () => {
    expect(kel.map(k => k.key)).toEqual([...PEMINDAHTANGANAN_SUBJENIS.map(o => o.value), 'sebab_lain'])
  })

  it('tiap baris jatuh ke TEPAT SATU tab', () => {
    const contoh: BarisHeader[] = [
      ...PEMINDAHTANGANAN_SUBJENIS.map(o => baris({ jenis: 'penghapusan_pemindahtanganan', sub_jenis: o.value })),
      baris({ jenis: 'penghapusan_sebab_lain' }),
    ]
    for (const b of contoh) {
      expect(kel.filter(k => k.cocok!(b)).length, JSON.stringify(b)).toBe(1)
    }
  })
})

describe('Penggunaan & Penatausahaan — muara yang baru disambung', () => {
  it('Penggunaan menarik pengalihan DAN mutasi internal, dua-duanya ber-tujuan', () => {
    const kel = pullDari('penggunaan')
    expect(kel.map(k => k.kategori)).toEqual(['pengalihan_status', 'mutasi_internal'])
    for (const k of kel) expect(k.tujuan, k.key).toBe(true)
  })

  it('Penatausahaan menarik koreksi DAN reklasifikasi', () => {
    expect(pullDari('penatausahaan').map(k => k.kategori)).toEqual(['koreksi', 'reklasifikasi'])
  })

  it('Pengamanan membaca DUA kunci payload — bukan dokumen_paths', () => {
    const kel = pullDari('pengamanan')
    expect(kel).toHaveLength(1)
    expect(kel[0].payloadKeys).toEqual(['bast_paths', 'pakta_paths'])
  })

  it('Cara Perolehan hanya menarik yang SUDAH disetujui', () => {
    for (const k of pullDari('cara_perolehan')) expect(k.perluApproval, k.key).toBe(true)
  })
})

describe('dokumenMasihLive — arsip (`ditolak`) tak boleh muncul lagi (insiden 2026-09-17)', () => {
  // Kartu Pengalihan/Mutasi Internal yang PERNAH diterima lalu dibatalkan tak
  // bisa dihapus (append-only) — `hapusJurnal` (Penghapusan.tsx) menandainya
  // `ditolak` sbg ganti DELETE, dan header-nya (berikut dokumen) tetap ada
  // SELAMANYA. Kelompok `pengalihan`/`internal` tak punya `perluApproval`,
  // jadi tanpa `dokumenMasihLive` tak ada satu pun filter approval_status yang
  // menghalanginya tampil lagi.
  it('ditolak (arsip ATAU ditolak sungguhan) tak lolos', () => {
    expect(dokumenMasihLive('ditolak')).toBe(false)
  })

  it('pending & disetujui tetap lolos — cuma arsip yang disaring', () => {
    expect(dokumenMasihLive('pending')).toBe(true)
    expect(dokumenMasihLive('disetujui')).toBe(true)
  })

  it('null (kategori tanpa alur approval sama sekali) tetap lolos', () => {
    expect(dokumenMasihLive(null)).toBe(true)
  })
})

describe('Peraturan — empat kotak & judul baku', () => {
  it('Perpres · Permendagri · Perda · Perbup, urutannya tetap', () => {
    expect(DAFTAR_PERATURAN.map(p => p.label)).toEqual(['Perpres', 'Permendagri', 'Perda', 'Perbup'])
  })

  it('judul dirakit seragam, spasi tepi nomor dibuang', () => {
    expect(judulPeraturan('Permendagri', ' 47 ', 2021)).toBe('Permendagri Nomor 47 Tahun 2021')
  })

  it('tahun peraturan: 4 angka, 1945 s.d. tahun berjalan', () => {
    expect(tahunPeraturanSah('2021', 2026)).toBe(2021)
    expect(tahunPeraturanSah(' 2014 ', 2026)).toBe(2014)
    expect(tahunPeraturanSah('2027', 2026)).toBeNull()
    expect(tahunPeraturanSah('1900', 2026)).toBeNull()
    expect(tahunPeraturanSah('21', 2026)).toBeNull()
    expect(tahunPeraturanSah('dua ribu', 2026)).toBeNull()
  })
})

describe('dbSiklus KEMBAR dgn CHECK constraint admin_dokumen.siklus', () => {
  // Nilai yang tak ada di CHECK tidak menghasilkan error apa pun saat MEMBACA —
  // kotaknya cuma kosong selamanya — dan baru ditolak Postgres (23514) saat
  // admin menekan Simpan. Yang dibaca: migrasi TERAKHIR yang menulis constraint.
  const dir = path.resolve(__dirname, '../supabase/migrations')
  const berkas = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
    .filter(f => fs.readFileSync(path.join(dir, f), 'utf8').includes('ADD CONSTRAINT admin_dokumen_siklus_check'))
  const sql = fs.readFileSync(path.join(dir, berkas[berkas.length - 1]), 'utf8')
  const blok = sql.slice(sql.indexOf('ADD CONSTRAINT admin_dokumen_siklus_check'))
  const sah = new Set([...blok.slice(0, blok.indexOf('));')).matchAll(/'([a-z_]+)'/g)].map(m => m[1]))

  it('pemindainya benar-benar membaca daftar (bukan lulus hampa)', () => {
    expect(sah.size).toBeGreaterThanOrEqual(14)
    expect(sah.has('sk_pengelolaan_bmd')).toBe(true)
  })

  it('keempat peraturan terdaftar', () => {
    for (const p of DAFTAR_PERATURAN) expect(sah.has(p.dbSiklus), p.dbSiklus).toBe(true)
  })

  it('seluruh siklus generik terdaftar', () => {
    for (const s of DAFTAR_SIKLUS) {
      for (const sm of s.sumber) {
        if (sm.tipe === 'generic') expect(sah.has(sm.dbSiklus), `${s.key}: ${sm.dbSiklus}`).toBe(true)
      }
    }
  })

  it('dbSiklus peraturan tak bertabrakan dgn siklus generik', () => {
    const generik = DAFTAR_SIKLUS.flatMap(s => s.sumber).flatMap(sm => (sm.tipe === 'generic' ? [sm.dbSiklus] : []))
    for (const p of DAFTAR_PERATURAN) expect(generik.includes(p.dbSiklus), p.dbSiklus).toBe(false)
  })
})
