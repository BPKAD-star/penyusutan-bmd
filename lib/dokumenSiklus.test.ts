// Penjaga konfigurasi Dokumen Sumber. Yang dikunci di sini kelas kesalahan yang
// SELALU SENYAP: penyaring yang salah eja tak menghasilkan satu pun error, cuma
// tab yang selamanya kosong — dan operator membacanya sebagai "dokumennya belum
// diunggah", bukan "aplikasinya salah cari".
import { describe, it, expect } from 'vitest'
import { DAFTAR_SIKLUS, PEMINDAHTANGANAN_SUBJENIS, type PullKelompok, type BarisHeader } from './dokumenSiklus'
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
