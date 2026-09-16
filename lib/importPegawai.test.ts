// ============================================================================
// Mengunci pembacaan berkas Excel Daftar Pegawai (./importPegawai.ts).
//
// Berkas ini menentukan SIAPA yang jadi Pengurus Barang di tiap SKPD, dan itu
// menentukan siapa yang boleh menyetujui apa. Baris yang lolos dengan
// `role_bmd` salah tak menghasilkan satu pun error — ia cuma memberi orang
// wewenang yang bukan haknya.
// ============================================================================
import { describe, it, expect } from 'vitest'
import {
  normHeader, mapRoleBmd, cariKolom, bacaGridPegawai, skpdDirujuk,
  validasiImportPegawai, type BarisImportPegawai,
} from './importPegawai'

const PERAN = [
  { value: 'pengurus_barang', label: 'Pengurus Barang' },
  { value: 'pengurus_barang_pembantu', label: 'Pengurus Barang Pembantu' },
  { value: 'penanggung_jawab_ruangan', label: 'Penanggung Jawab Ruangan' },
]
const alat = {
  normalisasiGolongan: (g: string) => {
    const m = g.trim().match(/^(I|II|III|IV)[\s/-]?([a-eA-E])$/)
    return m ? `${m[1]}/${m[2].toLowerCase()}` : g
  },
  pangkatDariGolongan: (g: string) => (g === 'III/a' ? 'Penata Muda' : ''),
}
const baca = (grid: unknown[][]) => bacaGridPegawai(grid, alat)

describe('normHeader', () => {
  it('membuang spasi & tanda baca, jadi huruf kecil', () => {
    expect(normHeader(' Jenis  Kelamin ')).toBe('jeniskelamin')
    expect(normHeader('N.I.P.')).toBe('nip')
  })
  it('null/undefined jadi string kosong, tidak meledak', () => {
    expect(normHeader(null)).toBe('')
    expect(normHeader(undefined)).toBe('')
  })
})

describe('cariKolom', () => {
  it('mengembalikan indeks kolom yang MEMUAT namanya', () => {
    expect(cariKolom(['nama', 'nip', 'jabatan'], 'nip')).toBe(1)
  })
  it('mencoba nama alternatif berurutan', () => {
    expect(cariKolom(['gender'], 'jeniskelamin', 'gender')).toBe(1 - 1)
  })
  it('nama PERTAMA menang walau yang kedua juga cocok', () => {
    expect(cariKolom(['gender', 'jeniskelamin'], 'jeniskelamin', 'gender')).toBe(1)
  })
  it('-1 kalau tak ada yang cocok', () => {
    expect(cariKolom(['nama'], 'nip')).toBe(-1)
  })
})

describe('mapRoleBmd', () => {
  it('menerima slug apa adanya', () =>
    expect(mapRoleBmd('pengurus_barang_pembantu', PERAN)).toBe('pengurus_barang_pembantu'))
  it('menerima LABEL tampilan & mengubahnya jadi slug', () =>
    expect(mapRoleBmd('Pengurus Barang Pembantu', PERAN)).toBe('pengurus_barang_pembantu'))
  it('label tak peka huruf besar-kecil', () =>
    expect(mapRoleBmd('pENGURUS bARANG', PERAN)).toBe('pengurus_barang'))
  it('KOSONG bukan kesalahan — jatuh ke bawaan `pengurus_barang`', () => {
    // Berkas BKD lazim tak punya kolom itu sama sekali; menolaknya berarti
    // menolak seluruh berkasnya.
    expect(mapRoleBmd('', PERAN)).toBe('pengurus_barang')
    expect(mapRoleBmd('   ', PERAN)).toBe('pengurus_barang')
  })
  it('yang tak dikenali → null, BUKAN diam-diam jatuh ke bawaan', () => {
    // Ini pembeda yang menentukan: salah ketik peran yang diam-diam jadi
    // "Pengurus Barang" memberi orang wewenang yang bukan haknya.
    expect(mapRoleBmd('Kepala Dinas', PERAN)).toBeNull()
  })
})

describe('bacaGridPegawai', () => {
  const grid = [
    ['LAPORAN DAFTAR PEGAWAI', '', '', ''],
    ['Per 1 Januari 2026', '', '', ''],
    ['NIP', 'Nama Lengkap', 'Golongan', 'SKPD ID'],
    ['1973', 'Budi', 'III-a', '7'],
  ]

  it('menemukan baris header lewat kolom NIP, bukan mengira baris pertama', () => {
    // Berkas BKD lazim berkop beberapa baris di atas tabelnya.
    const r = baca(grid)
    expect(r).toHaveLength(1)
    expect(r[0].nip).toBe('1973')
    expect(r[0].nama).toBe('Budi')
  })

  it('golongan dinormalkan & pangkatnya diturunkan dari situ', () => {
    const r = baca(grid)
    expect(r[0].golongan).toBe('III/a')
    expect(r[0].pangkat).toBe('Penata Muda')
  })

  it('SKPD id diurai jadi angka', () => expect(baca(grid)[0].skpd_id).toBe(7))

  it('SKPD berisi TEKS → null, bukan NaN yang lolos', () => {
    // `NaN` menembus pemeriksaan `!= null` lalu mendarat di DB sbg galat
    // mentah; null ditangkap validasi sbg baris tanpa SKPD.
    const r = baca([['NIP', 'SKPD ID'], ['1973', 'Dinas Pendidikan']])
    expect(r[0].skpd_id).toBeNull()
  })

  it('baris TANPA NIP dilewati diam-diam (kop / subtotal / baris kosong)', () => {
    const r = baca([
      ['NIP', 'Nama'],
      ['', 'JUMLAH'],
      ['1973', 'Budi'],
      ['', ''],
    ])
    expect(r).toHaveLength(1)
  })

  it('jenis kelamin dibesarkan hurufnya', () =>
    expect(baca([['NIP', 'Jenis Kelamin'], ['1', 'l']])[0].jenis_kelamin).toBe('L'))

  it('kolom yang TIDAK ADA jadi string kosong, tak menjatuhkan pembacaan', () => {
    const r = baca([['NIP'], ['1973']])
    expect(r[0]).toMatchObject({ nama: '', jabatan: '', golongan: '', skpd_id: null })
  })

  it('judul kolom yang LEBIH PANJANG tetap cocok (pencocokan MEMUAT)', () => {
    // Berkas BKD memakai judul bebas: "Nama Pegawai", "NIP Baru",
    // "Golongan Ruang". Pencocokan PERSIS akan menolak ketiganya & seluruh
    // kolomnya terbaca kosong — tanpa satu pun error.
    const r = baca([
      ['NIP Baru', 'Nama Pegawai', 'Golongan Ruang', 'Kode SKPD ID'],
      ['1973', 'Budi', 'III-a', '7'],
    ])
    expect(r[0]).toMatchObject({ nip: '1973', nama: 'Budi', golongan: 'III/a', skpd_id: 7 })
  })

  it('⚠️ kolom PERTAMA yang memuat namanya menang — kolom mirip bisa tercaplok', () => {
    // Sisi buruk `includes`, dan di repo ini sudah pernah menggigit (alias
    // "satuan" mencaplok "Besaran / Pagu Satuan" di import Standar Harga).
    // Di sini "Golongan Darah" duduk SEBELUM "Golongan", jadi dialah yang
    // terbaca — dipatok supaya kalau kelak ada kolom baru yang bentrok,
    // ujinya yang berteriak lebih dulu, bukan operatornya.
    const r = baca([
      ['NIP', 'Golongan Darah', 'Golongan'],
      ['1973', 'O', 'III/a'],
    ])
    expect(r[0].golongan).toBe('O')   // ← bukan 'III/a'
  })

  it('MELEMPAR kalau header NIP tak ketemu', () =>
    expect(() => baca([['Nama', 'Jabatan'], ['Budi', 'Staf']])).toThrow(/NIP/))

  it('MELEMPAR kalau tak ada satu pun baris data', () =>
    expect(() => baca([['NIP', 'Nama']])).toThrow(/Tidak ada baris data/))

  it('spasi di ujung sel dibuang', () =>
    expect(baca([['NIP', 'Nama'], [' 1973 ', '  Budi  ']])[0]).toMatchObject({ nip: '1973', nama: 'Budi' }))
})

describe('skpdDirujuk', () => {
  it('unik & tanpa null', () => {
    const b = [7, 7, null, 8].map(id => ({ skpd_id: id } as BarisImportPegawai))
    expect(skpdDirujuk(b).sort()).toEqual([7, 8])
  })
})

describe('validasiImportPegawai', () => {
  const br = (o: Partial<BarisImportPegawai> = {}): BarisImportPegawai => ({
    nip: '1', nama: 'Budi', pangkat: '', golongan: '', jabatan: '',
    jenis_kelamin: '', role_bmd: '', skpd_id: 7, valid: true, masalah: [], ...o,
  })

  it('baris sehat → valid, tanpa masalah', () => {
    const [p] = validasiImportPegawai([br()], new Set([7]), PERAN)
    expect(p.valid).toBe(true)
    expect(p.masalah).toEqual([])
  })

  it('role_bmd dinormalkan jadi slug di tempat', () => {
    const [p] = validasiImportPegawai([br({ role_bmd: 'Pengurus Barang Pembantu' })], new Set([7]), PERAN)
    expect(p.role_bmd).toBe('pengurus_barang_pembantu')
  })

  it('role tak dikenali → TIDAK valid & nilainya tak diubah', () => {
    const [p] = validasiImportPegawai([br({ role_bmd: 'Kepala Dinas' })], new Set([7]), PERAN)
    expect(p.valid).toBe(false)
    expect(p.masalah[0]).toContain('Kepala Dinas')
    expect(p.role_bmd).toBe('Kepala Dinas')
  })

  it('NIP dobel DI DALAM berkas ditandai — kedua barisnya', () => {
    const hasil = validasiImportPegawai([br({ nip: '9' }), br({ nip: '9' })], new Set([7]), PERAN)
    expect(hasil.every(p => !p.valid)).toBe(true)
    expect(hasil[0].masalah[0]).toContain('dobel')
  })

  it('NIP yang sudah ada DI DB BUKAN masalah — memang di-upsert', () => {
    // Seluruh guna berkas "data terbaru dari BKD" (keputusan user
    // 2026-07-14): yang sudah ada diperbarui, bukan ditolak.
    const [p] = validasiImportPegawai([br({ nip: 'sudah-ada-di-db' })], new Set([7]), PERAN)
    expect(p.valid).toBe(true)
  })

  it('nama kosong ditolak', () =>
    expect(validasiImportPegawai([br({ nama: '' })], new Set([7]), PERAN)[0].valid).toBe(false))

  it('jenis kelamin selain L/P ditolak', () =>
    expect(validasiImportPegawai([br({ jenis_kelamin: 'X' })], new Set([7]), PERAN)[0].valid).toBe(false))

  it('jenis kelamin KOSONG diizinkan (kolomnya opsional)', () =>
    expect(validasiImportPegawai([br({ jenis_kelamin: '' })], new Set([7]), PERAN)[0].valid).toBe(true))

  it('SKPD id yang tak ada di master ditolak, berikut nomornya', () => {
    const [p] = validasiImportPegawai([br({ skpd_id: 999 })], new Set([7]), PERAN)
    expect(p.valid).toBe(false)
    expect(p.masalah[0]).toContain('999')
  })

  it('SKPD KOSONG tidak diperiksa ke master', () =>
    expect(validasiImportPegawai([br({ skpd_id: null })], new Set([7]), PERAN)[0].valid).toBe(true))

  it('beberapa masalah sekaligus dilaporkan SEMUA', () => {
    const [p] = validasiImportPegawai(
      [br({ nama: '', jenis_kelamin: 'X', skpd_id: 999, role_bmd: 'ngawur' })], new Set([7]), PERAN)
    expect(p.masalah).toHaveLength(4)
  })
})
