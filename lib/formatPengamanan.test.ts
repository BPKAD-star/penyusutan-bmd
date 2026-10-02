// Penjaga format lembar PENGAMANAN Permendagri 47/2021 — IV.J.1.2 & IV.J.2.2.
//
// Yang dijaga semuanya kelas kegagalan SENYAP:
//   · total lebar ≠ 100              → kolom melar & keluar halaman
//   · SIP / "Dokumen Pendukung" balik → kolom yang datanya tak ada, selalu kosong
//   · replay kustodi salah            → barang yang sudah dikembalikan tetap
//     tercetak sbg masih dipakai, tanpa satu pun error
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  FORMAT_PENGAMANAN, URUT_PENGAMANAN, type IdPengamanan,
} from './formatPengamanan'
import { pengamananBerlaku, JENIS_PENGAMANAN } from './laporanPengamanan'
import { identitasPengamanan, PENGAMANAN_ELIGIBLE_GOLONGAN } from './pengamanan'

const AKAR = path.resolve(__dirname, '..')
const tiapCabang = URUT_PENGAMANAN.map(id => [id, FORMAT_PENGAMANAN[id]] as const)

describe('registry IV.J', () => {
  it('memuat TEPAT dua cabang yang dikenal', () => {
    // Pengaman anti-hampa: `it.each` atas daftar kosong LULUS tanpa memeriksa
    // apa pun — lebih berbahaya daripada tak punya test.
    expect(URUT_PENGAMANAN).toEqual(['peralatan_mesin', 'rumah_negara'])
    expect(FORMAT_PENGAMANAN.peralatan_mesin.kode).toBe('IV.J.1.2')
    expect(FORMAT_PENGAMANAN.rumah_negara.kode).toBe('IV.J.2.2')
  })

  it('golongan tiap cabang ADA di daftar yang boleh diamankan', () => {
    // ⚠️ Cabang bergolongan di luar `PENGAMANAN_ELIGIBLE_GOLONGAN` akan SELALU
    // kosong — picker menu Pengamanan tak pernah menawarkan barangnya.
    expect(FORMAT_PENGAMANAN.peralatan_mesin.golongan).toBe('1.3.2')
    expect(FORMAT_PENGAMANAN.rumah_negara.golongan).toBe('1.3.3')
    for (const [id, f] of tiapCabang) {
      expect(PENGAMANAN_ELIGIBLE_GOLONGAN, `${id}: golongan '${f.golongan}'`).toContain(f.golongan)
    }
  })

  it('golongan kedua cabang BERBEDA — kalau sama, isinya kembar', () => {
    const g = URUT_PENGAMANAN.map(id => FORMAT_PENGAMANAN[id].golongan)
    expect(new Set(g).size, `golongan kembar: ${g.join(', ')}`).toBe(g.length)
  })

  it('judul & blok orang sejalan dgn cabangnya', () => {
    expect(FORMAT_PENGAMANAN.peralatan_mesin.judul).toContain('PERALATAN DAN MESIN')
    expect(FORMAT_PENGAMANAN.peralatan_mesin.grupOrang).toBe('Pemakai')
    expect(FORMAT_PENGAMANAN.rumah_negara.judul).toContain('RUMAH NEGARA')
    expect(FORMAT_PENGAMANAN.rumah_negara.grupOrang).toBe('Penghuni')
  })

  it('kalimat baris kosong menyebut golongannya', () => {
    expect(FORMAT_PENGAMANAN.peralatan_mesin.kosong).toContain('Peralatan dan Mesin')
    expect(FORMAT_PENGAMANAN.rumah_negara.kosong).toContain('Gedung dan Bangunan')
  })
})

// ── Lembar RINCI: susunan kolom keputusan user (2026-09-28) ─────────────────
describe('kolom lembar rinci', () => {
  it('urutan kolom PERSIS seperti yang ditetapkan user — dokumen kedua beda per cabang', () => {
    const awal = ['nibar', 'kode', 'nama', 'merek', 'no_polisi', 'nilai_perolehan',
      'p_nama', 'p_status', 'p_identitas', 'p_jabatan', 'bast_nomor', 'bast_tanggal']
    expect(FORMAT_PENGAMANAN.peralatan_mesin.kolom.map(k => k.key))
      .toEqual([...awal, 'pakta_nomor', 'pakta_tanggal', 'keterangan'])
    expect(FORMAT_PENGAMANAN.rumah_negara.kolom.map(k => k.key))
      .toEqual([...awal, 'sip_nomor', 'sip_tanggal', 'keterangan'])
  })

  it('SELAIN dokumen kedua, susunan kedua cabang IDENTIK ("disamakan aja")', () => {
    const tanpaDok2 = (f: typeof FORMAT_PENGAMANAN.peralatan_mesin) =>
      f.kolom.map(k => k.key).filter(k => !k.startsWith('pakta') && !k.startsWith('sip'))
    expect(tanpaDok2(FORMAT_PENGAMANAN.rumah_negara)).toEqual(tanpaDok2(FORMAT_PENGAMANAN.peralatan_mesin))
  })

  it('kedua cabang TIDAK berbagi objek kolom yang sama', () => {
    // Daftar yang dipakai bersama gampang tersunting di tempat oleh pemakai yang
    // mengira ia salinannya sendiri — efeknya menular ke cabang seberang.
    expect(FORMAT_PENGAMANAN.peralatan_mesin.kolom).not.toBe(FORMAT_PENGAMANAN.rumah_negara.kolom)
  })

  it('judul blok identitas ikut grupOrang cabangnya', () => {
    expect(FORMAT_PENGAMANAN.peralatan_mesin.kolom.find(k => k.key === 'p_nama')!.judul)
      .toBe('Nama Pemakai')
    expect(FORMAT_PENGAMANAN.rumah_negara.kolom.find(k => k.key === 'p_nama')!.judul)
      .toBe('Nama Penghuni')
  })

  it('Dokumen Sumber = BAST + (Pakta untuk PM | SIP untuk Rumah Negara); Dokumen Pendukung & Alamat DIBUANG', () => {
    // SIP dikembalikan 2026-10-02 (kartu kini menyimpannya). Dokumen Pendukung
    // & Alamat tetap dibuang (penyimpangan SENGAJA, keputusan user).
    const pm = FORMAT_PENGAMANAN.peralatan_mesin.kolom.map(x => x.key)
    const rn = FORMAT_PENGAMANAN.rumah_negara.kolom.map(x => x.key)
    expect(pm.some(x => x.startsWith('sip'))).toBe(false)
    expect(rn.some(x => x.startsWith('pakta'))).toBe(false)
    expect(rn).toContain('sip_nomor')
    for (const [id, f] of tiapCabang) {
      const k = f.kolom.map(x => x.key)
      expect(k, id).toContain('bast_nomor')
      expect(k, id).toContain('bast_tanggal')
      expect(k.some(x => x.startsWith('dukung')), `${id}: Dokumen Pendukung muncul lagi`).toBe(false)
      expect(k, id).not.toContain('p_alamat')
      expect(k, id).not.toContain('lokasi')
    }
  })

  it('kolom Kode Barang tumpuk kode+uraian — bukan sel bersegmen', () => {
    // ⚠️ Sama seperti Perpindahan/Reklas/Penghapusan: satu kolom teks yang
    // menumpuk kode & nomenklatur baku, BUKAN blok tujuh sel segmen.
    for (const [id, f] of tiapCabang) {
      const kode = f.kolom.find(k => k.key === 'kode')
      expect(kode, `${id}: kolom kode`).toBeTruthy()
      expect(kode!.judul, id).toBe('Kode Barang - Uraian Barang')
    }
  })
})

describe('lebar kolom — "fit to window", tak boros ke samping', () => {
  it('total lebar 100 PERSIS — "fit to window" di table-fixed', () => {
    for (const [id, f] of tiapCabang) {
      const total = f.kolom.reduce((s, k) => s + k.lebar, 0)
      expect(Math.round(total * 100) / 100, id).toBe(100)
    }
  })

  it('tiap kolom punya lebar positif', () => {
    for (const [id, f] of tiapCabang) {
      for (const k of f.kolom) expect(k.lebar, `${id}.${k.key}`).toBeGreaterThan(0)
    }
  })

  it('NIBAR dapat jatah TERBESAR — 45 digit dipenggal dua baris, muat lega', () => {
    // ⚠️ Permintaan user 2026-09-27/28, pola yang sama dgn Perpindahan/Reklas/
    // Penghapusan — ambangnya dinaikkan dari lembar lama (yang cuma 9,0%).
    for (const [id, f] of tiapCabang) {
      const nibar = f.kolom.find(k => k.key === 'nibar')!.lebar
      expect(nibar, `${id}: NIBAR`).toBeGreaterThanOrEqual(10)
      for (const k of f.kolom) expect(k.lebar, `${id}.${k.key}`).toBeLessThanOrEqual(nibar)
    }
  })

  it('kolom bertanggal punya batas bawah keras — ia dirender nowrap', () => {
    // "13/05/2020" @8px ≈ 45 px; 4,4% dari lebar cetak F4 lanskap (±1.200 px)
    // = 53 px. Di bawah 4,0% tanggalnya meluber ke sel sebelah DI SETIAP BARIS.
    for (const [id, f] of tiapCabang) {
      for (const k of f.kolom.filter(x => x.key.endsWith('_tanggal'))) {
        expect(k.lebar, `${id}.${k.key}`).toBeGreaterThanOrEqual(4.0)
      }
    }
  })
})

describe('pengamananBerlaku — replay "peristiwa terakhir menang"', () => {
  // ⚠️ `batal_pengamanan` & `pengembalian_pengamanan` TIDAK membawa
  // `payload.target_trx_id`, jadi `fetchBatalTargets` tak bisa dipakai — persis
  // kelas bug yang menggigit Laporan Penghapusan 2026-09-08 (baris pembatalan
  // tanpa target → set kosong → tak menyaring apa pun).
  const ev = (id: number, aset: string, jenis: string, periode = '2026-S2') =>
    ({ id, aset_id: aset, periode, tanggal: '2026-07-01', jenis })

  it('diamankan & dibiarkan → BERLAKU', () => {
    expect([...pengamananBerlaku([ev(1, 'a', 'pengamanan')])]).toEqual([1])
  })

  it('sudah DIKEMBALIKAN → tak berlaku', () => {
    expect([...pengamananBerlaku([
      ev(1, 'a', 'pengamanan'), ev(2, 'a', 'pengembalian_pengamanan'),
    ])]).toEqual([])
  })

  it('BAST dibatalkan (salah catat) → tak berlaku', () => {
    expect([...pengamananBerlaku([
      ev(1, 'a', 'pengamanan'), ev(2, 'a', 'batal_pengamanan'),
    ])]).toEqual([])
  })

  it('amankan → kembalikan → amankan lagi: HANYA yang terakhir', () => {
    expect([...pengamananBerlaku([
      ev(1, 'a', 'pengamanan'),
      ev(2, 'a', 'pengembalian_pengamanan'),
      ev(3, 'a', 'pengamanan'),
    ])]).toEqual([3])
  })

  it('urutan masukan tak berpengaruh — yang menentukan (periode, id)', () => {
    expect([...pengamananBerlaku([
      ev(3, 'a', 'pengamanan'),
      ev(1, 'a', 'pengamanan'),
      ev(2, 'a', 'pengembalian_pengamanan'),
    ])]).toEqual([3])
  })

  it('PERIODE menang atas id', () => {
    expect([...pengamananBerlaku([
      ev(1, 'a', 'pengamanan', '2026-S2'),
      ev(99, 'a', 'pengembalian_pengamanan', '2026-S1'),
    ])]).toEqual([1])
  })

  it('tiap aset dinilai SENDIRI-SENDIRI', () => {
    expect([...pengamananBerlaku([
      ev(1, 'a', 'pengamanan'), ev(2, 'a', 'batal_pengamanan'),
      ev(3, 'b', 'pengamanan'),
    ])]).toEqual([3])
  })

  it('riwayat kosong → tak ada yang berlaku', () => {
    expect([...pengamananBerlaku([])]).toEqual([])
  })

  it('ketiga jenis ledgernya terdaftar', () => {
    expect([...JENIS_PENGAMANAN])
      .toEqual(['pengamanan', 'pengembalian_pengamanan', 'batal_pengamanan'])
  })
})

describe('identitas penghuni — kompatibilitas kartu lama', () => {
  it('kartu BARU memakai `nomor_identitas`', () => {
    expect(identitasPengamanan({ nomor_identitas: '3506...' })).toBe('3506...')
  })

  it('kartu LAMA jatuh ke `nip` — tanpa ini kolomnya kosong senyap', () => {
    // ⚠️ Kartu sebelum 2026-09-08 menyimpannya di `nip`. Tanpa cadangan ini,
    // kolom "Nomor Identitas" di lembar bertanda tangan tercetak KOSONG untuk
    // SELURUH kartu lama — dan tak ada satu pun error yang memberitahu.
    expect(identitasPengamanan({ nip: '19800101...' })).toBe('19800101...')
  })

  it('yang baru MENANG kalau keduanya ada', () => {
    expect(identitasPengamanan({ nomor_identitas: 'baru', nip: 'lama' })).toBe('baru')
  })

  it('kosong / null → string kosong, bukan undefined', () => {
    expect(identitasPengamanan(null)).toBe('')
    expect(identitasPengamanan({})).toBe('')
  })
})

describe('penyaji', () => {
  const berkas = path.join(AKAR, 'components/pelaporan/LembarPengamananPermendagri.tsx')

  it('berkasnya ada & tak hampa', () => {
    expect(fs.existsSync(berkas)).toBe(true)
    expect(fs.readFileSync(berkas, 'utf8').length).toBeGreaterThan(2000)
  })

  it('TIDAK bercabang per format — pembedanya seluruhnya data', () => {
    const isi = fs.readFileSync(berkas, 'utf8')
    const kode = isi.split('\n').filter(b => !b.trim().startsWith('//')).join('\n')
    for (const id of URUT_PENGAMANAN as readonly IdPengamanan[]) {
      expect(kode, `penyaji bercabang pada '${id}'`).not.toMatch(new RegExp(`===\\s*'${id}'`))
    }
    expect(kode).not.toMatch(/f\.(kode|golongan)\s*===/)
  })
})

describe('form isian menu Pengamanan sejalan dgn lembarnya', () => {
  const form = path.join(AKAR, 'components/pengelolaan/Pengamanan.tsx')

  it('menanyakan kelima isian identitas yang dicetak lembar', () => {
    // ⚠️ Kolom lembar yang tak pernah ditanyakan form akan SELALU kosong di
    // dokumen bertanda tangan — tanpa satu pun error.
    const isi = fs.readFileSync(form, 'utf8')
    for (const k of ['nomor_identitas', 'status_penghuni', 'alamat', 'nama_pegawai', 'jabatan']) {
      expect(isi, `form tak menulis '${k}'`).toContain(k)
    }
  })

  it('identitas & dokumen DIPISAH — dokumen dikelompokkan per dokumennya', () => {
    // ⚠️ Susunan ditentukan user lewat sketsa (2026-09-08, revisi dari
    // "urut ke bawah" yang sempat saya buat & ternyata salah baca). Yang
    // dijaga di sini BUKAN jumlah kolomnya, tapi PENGELOMPOKANNYA: nomor,
    // tanggal, & berkas tiap dokumen harus duduk dalam satu blok. Versi
    // sebelumnya menyelang-nyeling keduanya, jadi "Tanggal BAST" bisa sebaris
    // dengan "No. Pakta Integritas" & tombol unggahnya terpencar jauh dari
    // nomor/tanggal dokumennya sendiri.
    const isi = fs.readFileSync(form, 'utf8')
    for (const judul of ['Berita Acara Serah Terima (BAST)', 'Pakta Integritas']) {
      expect(isi, `blok '${judul}' hilang`).toContain(judul)
    }
    // Tiap blok dokumen memuat tombol unggahnya sendiri.
    expect([...isi.matchAll(/rounded-lg border border-gray-200 p-4 space-y-3/g)].length,
      'blok dokumen tak lagi berdiri sendiri').toBeGreaterThanOrEqual(4)
  })

  it('pasangan sebaris = hal yang diisi dari sumber yang sama', () => {
    // Nama|Nomor Identitas · Status|Jabatan · Alamat|Keterangan — urutan itu
    // yang menentukan pasangannya di grid dua kolom.
    const isi = fs.readFileSync(form, 'utf8')
    const urut = ['Nama Penghuni / Pemakai', 'Nomor Identitas', 'Status Penghuni / Pemakai',
      'Jabatan', 'Alamat', 'Keterangan']
    let pos = -1
    for (const label of urut) {
      const i = isi.indexOf(label, pos + 1)
      expect(i, `label '${label}' tak ditemukan sesudah yang sebelumnya`).toBeGreaterThan(pos)
      pos = i
    }
  })
})
