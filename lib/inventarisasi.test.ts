import { describe, it, expect } from 'vitest'
import {
  kekuranganLki, PESAN_FOTO_LKI, klasifikasiLhi, LHI_URUT, LHI_LABEL, REKOMENDASI, konfigLki, labelPosisi, labelTransaksi, type InvBaris, type InvJawaban,
} from './inventarisasi'
import { belumDiinventarisasi, jumlahRingkas } from './inventarisasiData'
import { JENIS_INVENTARISASI, golonganDariKode, sesuaiTampil, atribusiTampil, digunakanSendiriTampil } from './inventarisasi'

// Bawaan: register SUDAH punya foto & lembar baru membawa satu unggahan — supaya
// uji lain tak terganggu aturan FOTO WAJIB; aturan itu diuji sendiri di bawah.
const aset = (jawaban: InvJawaban) => ({ aset_id: 'a-1', jawaban, foto_register: 1 })
// Isian BMD Belum Tercatat yang LENGKAP untuk golongan 1.3.5 (Aset Tetap Lainnya).
const BARU_LENGKAP_ATL = {
  kode_barang: '1.3.5.01.01.01.001', satuan: 'Unit', jumlah: 2, harga_satuan: 500000, tgl_perolehan: '2024-01-15',
  spesifikasi: 'Rak arsip', merek_tipe: 'Brother', spesifikasi_lainnya: 'Besi', wilayah_kode: '3506010001',
  alamat_detail: 'Jl. Mawar 1', latitude: -7.8, longitude: 111.9, kondisi: 'B' as const,
  penggunaan: 'Kantor', keterangan: 'Temuan', asal_usul: 'Hibah',
}

describe('kekuranganLki — barang tercatat', () => {
  it('lembar kosong → keberadaan wajib', () => {
    expect(kekuranganLki(aset({}))).toEqual(['Keberadaan Barang (G)'])
  })

  it('barang ADA → kondisi wajib; tak ada/hilang → kondisi tak ditanya', () => {
    expect(kekuranganLki(aset({ keberadaan: 'ada' }))).toEqual(['Kondisi Barang (K)'])
    expect(kekuranganLki(aset({ keberadaan: 'ada', kondisi: 'B' }))).toEqual([])
    expect(kekuranganLki(aset({ keberadaan: 'hilang' }))).toEqual([])
    expect(kekuranganLki(aset({ keberadaan: 'tidak_ditemukan' }))).toEqual([])
  })

  it('"Tidak Sesuai" tanpa menyebut yang seharusnya → ditolak (LHI III.B.8 akan mencetak "(kosong)")', () => {
    const k = kekuranganLki(aset({
      keberadaan: 'ada', kondisi: 'B',
      spesifikasi: { sesuai: false, seharusnya: '  ' },
      kode_barang: { sesuai: false },
      wilayah: { sesuai: false },
      no_rangka: { sesuai: false, seharusnya: 'MH1JB' },
    }))
    expect(k).toContain('Nama Spesifikasi Barang (D) yang seharusnya')
    expect(k).toContain('Kode Barang yang seharusnya (B–C)')
    expect(k).toContain('Wilayah yang seharusnya (J)')
    expect(k.some(x => x.startsWith('Nomor Rangka'))).toBe(false)
  })

  it('induk & kembaran ganda wajib dipilih kalau opsinya dicentang', () => {
    const k = kekuranganLki(aset({ keberadaan: 'ada', kondisi: 'B', atribusi: 'ya_induk_diketahui', ganda: true }))
    expect(k).toEqual(['Barang induk (I)', 'Barang kembaran yang tercatat ganda (M)'])
  })

  it('mengembalikan SELURUH kekurangan sekaligus, bukan yang pertama saja', () => {
    expect(kekuranganLki(aset({ keberadaan: 'ada', satuan: { sesuai: false } })).length).toBe(2)
  })
})

describe('kekuranganLki — FOTO WAJIB (2026-10-01)', () => {
  const ada = { keberadaan: 'ada' as const, kondisi: 'B' as const }

  it('barang ada, register TANPA foto & tanpa unggahan → ditolak', () => {
    expect(kekuranganLki({ aset_id: 'a-1', jawaban: ada })).toEqual([PESAN_FOTO_LKI])
    expect(kekuranganLki({ aset_id: 'a-1', jawaban: ada, foto_register: 0, foto_paths: [] })).toEqual([PESAN_FOTO_LKI])
  })

  it('cukup SATU sumber: unggahan petugas ATAU foto yang sudah di register', () => {
    expect(kekuranganLki({ aset_id: 'a-1', jawaban: ada, foto_paths: ['p'] })).toEqual([])
    expect(kekuranganLki({ aset_id: 'a-1', jawaban: ada, foto_register: 2 })).toEqual([])
  })

  it('"Tidak Sesuai" menuntut foto TERBARU — foto lama di register tak menolong', () => {
    const j = { ...ada, foto_barang: { sesuai: false } }
    expect(kekuranganLki({ aset_id: 'a-1', jawaban: j, foto_register: 3 })).toEqual(['Foto barang terbaru (R)'])
    expect(kekuranganLki({ aset_id: 'a-1', jawaban: j, foto_register: 3, foto_paths: ['p'] })).toEqual([])
  })

  it('tak muncul DUA pesan foto sekaligus', () => {
    const k = kekuranganLki({ aset_id: 'a-1', jawaban: { ...ada, foto_barang: { sesuai: false } } })
    expect(k.filter(x => /foto/i.test(x)).length).toBe(1)
  })

  it('barang HILANG / tak ditemukan dikecualikan — tak ada yang bisa difoto', () => {
    expect(kekuranganLki({ aset_id: 'a-1', jawaban: { keberadaan: 'hilang' } })).toEqual([])
    expect(kekuranganLki({ aset_id: 'a-1', jawaban: { keberadaan: 'tidak_ditemukan' } })).toEqual([])
  })

  it('keberadaan BELUM dipilih → foto tetap dituntut (semua kekurangan muncul sekaligus)', () => {
    expect(kekuranganLki({ aset_id: 'a-1', jawaban: {} }))
      .toEqual(['Keberadaan Barang (G)', PESAN_FOTO_LKI])
  })

  it('BMD Belum Tercatat: tak punya foto register, jadi wajib unggah', () => {
    const lengkap: InvJawaban = { keterangan: 'ok', baru: { ...BARU_LENGKAP_ATL } }
    const arg = { aset_id: null, jawaban: lengkap, golongan: '1.3.5' }
    expect(kekuranganLki(arg)).toEqual([PESAN_FOTO_LKI])
    expect(kekuranganLki({ ...arg, foto_paths: ['p'] })).toEqual([])
  })
})

describe('labelPosisi — keterangan kunci', () => {
  it('masih di tempat → null (tak ada kunci)', () => {
    expect(labelPosisi(null)).toBeNull()
    expect(labelPosisi(undefined)).toBeNull()
  })

  it('menyebut tujuan kalau diketahui', () => {
    expect(labelPosisi('pindah_skpd', 'Dinas Kesehatan')).toBe('Pindah ke Dinas Kesehatan')
    expect(labelPosisi('reklas', null, '1.5.4')).toBe('Direklas ke Aset Lain-Lain (1.5.4)')
    expect(labelPosisi('keluar')).toMatch(/^Keluar dari Daftar Barang/)
  })
})

describe('labelTransaksi', () => {
  it('memakai label KIBAR yang sama dgn kartu riwayat barang', () => {
    expect(labelTransaksi({ jenis: 'pengalihan_status', periode: '2026-S2' }))
      .toBe('Pengalihan Status Penggunaan (antar SKPD) (2026-S2)')
  })

  it('jenis tak dikenal tetap tampil apa adanya, tak dibuang', () => {
    expect(labelTransaksi({ jenis: 'jenis_baru', periode: '2026-S1' })).toBe('jenis_baru (2026-S1)')
  })
})

describe('belumDiinventarisasi — hitungan dari ringkasan server', () => {
  it('BMD Belum Tercatat TIDAK mengurangi sisa barang register', () => {
    // 3 isian menunggu (1 di antaranya belum tercatat) + 2 divalidasi → 4 barang register terisi.
    expect(belumDiinventarisasi({ total_aset: 10, menunggu: 3, divalidasi: 2, berubah: 5, belum_tercatat: 1 })).toBe(6)
  })

  it('tak pernah negatif', () => {
    expect(belumDiinventarisasi({ total_aset: 1, menunggu: 5, divalidasi: 0, berubah: 0, belum_tercatat: 0 })).toBe(0)
  })
})

describe('konfigLki — matriks isian dari "Alur Inventarisasi.xlsx" (2026-09-25)', () => {
  const SEMUA = ['1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.5.3', '1.5.4']
  const yang = (flag: 'merekTipe' | 'spesifikasiLainnya' | 'nomorKendaraan' | 'luas' | 'atribusi' | 'tanahMilik') =>
    SEMUA.filter(g => konfigLki(g)[flag])

  it('setiap isian per golongan persis sama dengan matriks user', () => {
    expect(yang('merekTipe')).toEqual(['1.3.2', '1.3.5', '1.5.4'])
    expect(yang('spesifikasiLainnya')).toEqual(['1.3.1', '1.3.2', '1.3.5', '1.5.4'])
    expect(yang('nomorKendaraan')).toEqual(['1.3.2', '1.5.4'])
    expect(yang('luas')).toEqual(['1.3.1', '1.3.3', '1.3.4', '1.3.6', '1.5.4'])
    expect(yang('tanahMilik')).toEqual(['1.3.3', '1.3.4', '1.5.4'])
  })

  it('atribusi: Gedung, JIJ, ATB saja — Peralatan & Mesin SENGAJA tidak', () => {
    expect(yang('atribusi')).toEqual(['1.3.3', '1.3.4', '1.5.3'])
  })

  it('titik koordinat untuk SEMUA golongan', () => {
    for (const g of SEMUA) expect(konfigLki(g).titikKoordinat).toBe(true)
  })

  it('struktur survei Permendagri tetap', () => {
    expect(konfigLki('1.3.4').jijTeknis).toBe(true)
    expect(konfigLki('1.3.3').pemakaiRumahNegara).toBe(true)
    expect(konfigLki('1.3.3').tanahMilikLabel).toBe('Gedung dan Bangunan di atas tanah milik')
    expect(konfigLki('1.3.2').hilangVsTidakDitemukan).toBe(true)
    expect(konfigLki('1.3.1').hilangVsTidakDitemukan).toBe(false)
  })
})

describe('isian matriks baru ikut LHI III.B.8 & kekurangan', () => {
  const b = (jawaban: InvJawaban): InvBaris => ({ id: 'x', aset_id: 'a', snapshot: {}, jawaban, foto_paths: [] })

  it('BPKB/luas/spesifikasi lainnya/wilayah/alamat detail/keterangan/koordinat/foto Tidak Sesuai → III.B.8', () => {
    const kasus: InvJawaban[] = [
      { no_bpkb: { sesuai: false, seharusnya: 'X' } },
      { luas: { sesuai: false, seharusnya: '100' } },
      { spesifikasi_lainnya: { sesuai: false, seharusnya: 'x' } },
      { wilayah: { sesuai: false, wilayah_kode: '35.06.01.1001' } },
      { alamat_detail: { sesuai: false, seharusnya: 'Jl. Baru' } },
      { keterangan_barang: { sesuai: false, seharusnya: 'x' } },
      { koordinat: { sesuai: false }, latitude: -7.8, longitude: 112 },
      { foto_barang: { sesuai: false } },
    ]
    for (const j of kasus) expect(klasifikasiLhi(b(j))).toContain('III.B.8')
    expect(klasifikasiLhi(b({ koordinat: { sesuai: true }, foto_barang: { sesuai: true } }))).toEqual([])
  })

  it('koordinat Tidak Sesuai wajib titik; foto Tidak Sesuai wajib unggahan; luas wajib angka', () => {
    const dasar: InvJawaban = { keberadaan: 'ada', kondisi: 'B' }
    expect(kekuranganLki(aset({ ...dasar, koordinat: { sesuai: false } }))).toEqual(['Titik Koordinat yang seharusnya (O)'])
    expect(kekuranganLki(aset({ ...dasar, foto_barang: { sesuai: false } }))).toEqual(['Foto barang terbaru (R)'])
    expect(kekuranganLki({ ...aset({ ...dasar, foto_barang: { sesuai: false } }), foto_paths: ['p'] })).toEqual([])
    expect(kekuranganLki(aset({ ...dasar, luas: { sesuai: false, seharusnya: 'abc' } })))
      .toEqual(['Luas yang seharusnya harus berupa angka > 0'])
    expect(kekuranganLki(aset({ ...dasar, no_bpkb: { sesuai: false } }))).toEqual(['Nomor BPKB yang seharusnya'])
  })

  it('Wilayah & Alamat Detail — dua form terpisah, masing-masing kekurangannya sendiri', () => {
    const dasar: InvJawaban = { keberadaan: 'ada', kondisi: 'B' }
    expect(kekuranganLki(aset({ ...dasar, wilayah: { sesuai: false } })))
      .toEqual(['Wilayah yang seharusnya (J)'])
    expect(kekuranganLki(aset({ ...dasar, wilayah: { sesuai: false, wilayah_kode: '35.06.01.1001' } })))
      .toEqual([])
    expect(kekuranganLki(aset({ ...dasar, alamat_detail: { sesuai: false } })))
      .toEqual(['Alamat Detail (J) yang seharusnya'])
    expect(kekuranganLki(aset({ ...dasar, alamat_detail: { sesuai: false, seharusnya: 'Jl. Baru' } })))
      .toEqual([])
  })
})

describe('klasifikasiLhi tetap bekerja atas bentuk baris baru', () => {
  it('barang tanpa aset_id = III.B.11', () => {
    const b: InvBaris = { id: 'x', aset_id: null, snapshot: {}, jawaban: {}, foto_paths: [] }
    expect(klasifikasiLhi(b)).toEqual(['III.B.11'])
  })

  it('kondisi berubah terhadap snapshot = III.B.7', () => {
    const b: InvBaris = {
      id: 'x', aset_id: 'a', snapshot: { kondisi: 'Baik' }, jawaban: { keberadaan: 'ada', kondisi: 'RB' }, foto_paths: [],
    }
    expect(klasifikasiLhi(b)).toEqual(['III.B.7'])
  })
})

describe('G — "Tidak ada karena..." (Gedung & Bangunan, 2026-10-01)', () => {
  const brs = (jawaban: InvJawaban): InvBaris => ({
    aset_id: 'a-1', snapshot: {}, jawaban, foto_paths: [],
  } as unknown as InvBaris)
  const tdk = (sebab: InvJawaban['sebab_tidak_ada'], x: Partial<InvJawaban> = {}): InvJawaban =>
    ({ keberadaan: 'tidak_ditemukan', sebab_tidak_ada: sebab, ...x })

  it('hanya Gedung & Bangunan dan JIJ yang menanyakan sebab', () => {
    expect(konfigLki('1.3.3').sebabTidakAda).toBe(true)
    expect(konfigLki('1.3.4').sebabTidakAda).toBe(true)
    expect(konfigLki('1.3.4').sebabNoun).toBe('jalan/jaringan/irigasi')
    for (const g of ['1.3.1', '1.3.2', '1.3.5', '1.3.6', '1.5.3', '1.5.4']) {
      expect(konfigLki(g).sebabTidakAda).toBe(false)
    }
  })

  it('force majeure / dibongkar → III.B.2', () => {
    expect(klasifikasiLhi(brs(tdk('force_majeure')))).toEqual(['III.B.2'])
    expect(klasifikasiLhi(brs(tdk('dibongkar_baru')))).toEqual(['III.B.2'])
  })

  it('direhab jadi bangunan baru & digabung → III.B.3 (bukan III.B.2)', () => {
    expect(klasifikasiLhi(brs(tdk('rehab_bangunan_baru')))).toEqual(['III.B.3'])
    expect(klasifikasiLhi(brs(tdk('digabung')))).toEqual(['III.B.3'])
  })

  it('seharusnya beberapa register → III.B.13 (perubahan kuantitas), BUKAN III.B.8', () => {
    expect(klasifikasiLhi(brs(tdk('beberapa_register')))).toEqual(['III.B.13'])
  })

  it('PRATINJAU form: "Tidak ada" belum disimpulkan sebelum sebabnya dipilih', () => {
    const b = brs({ keberadaan: 'tidak_ditemukan' })
    expect(klasifikasiLhi(b, { tungguSebab: true })).toEqual([])
    // laporan TIDAK memakai opsi itu — lembar lama tanpa sebab tetap III.B.2
    expect(klasifikasiLhi(b)).toEqual(['III.B.2'])
    expect(klasifikasiLhi(brs(tdk('force_majeure')), { tungguSebab: true })).toEqual(['III.B.2'])
  })

  it('lembar lama tanpa sebab tetap III.B.2; hilang tetap III.B.1', () => {
    expect(klasifikasiLhi(brs({ keberadaan: 'tidak_ditemukan' }))).toEqual(['III.B.2'])
    expect(klasifikasiLhi(brs({ keberadaan: 'hilang', sebab_tidak_ada: 'digabung' }))).toEqual(['III.B.1'])
  })

  it('III.B.3 tak dobel kalau atribusi juga dicentang', () => {
    const k = klasifikasiLhi(brs(tdk('digabung', { atribusi: 'ya_induk_diketahui' })))
    expect(k.filter(x => x === 'III.B.3')).toHaveLength(1)
  })

  it('sebab wajib & relasi wajib bila dipilih — hanya utk golongan ber-sebabTidakAda', () => {
    const a = (j: InvJawaban) => kekuranganLki({ ...aset(j), sebabTidakAda: true })
    expect(a({ keberadaan: 'tidak_ditemukan' })).toEqual(['Sebab barang tidak ada (G)'])
    expect(a(tdk('force_majeure'))).toEqual(['Penjelasan force majeure (G)'])
    expect(a(tdk('force_majeure', { sebab_penjelasan: ' ' }))).toEqual(['Penjelasan force majeure (G)'])
    expect(a(tdk('force_majeure', { sebab_penjelasan: 'Terbakar 12 Mei' }))).toEqual([])
    expect(a(tdk('dibongkar_baru'))).toEqual(['Bangunan baru pengganti yang dibongkar (G)'])
    expect(a(tdk('dibongkar_baru', { sebab_relasi: { aset_id: 'b-9' } }))).toEqual([])
    expect(a(tdk('digabung'))).toEqual(['Bangunan induk tempat digabung (G)'])
    expect(a(tdk('rehab_bangunan_baru'))).toEqual(['Bangunan baru hasil rehab (G)'])
    expect(a(tdk('digabung', { sebab_relasi: { aset_id: 'b-2' } }))).toEqual([])
    expect(a(tdk('beberapa_register'))).toEqual(['Minimal 2 bangunan hasil pemecahan (G)'])
    expect(a(tdk('beberapa_register', { sebab_pecahan: ['A', ''] }))).toEqual(['Nama bangunan hasil pemecahan (G) ada yang kosong'])
    expect(a(tdk('beberapa_register', { sebab_pecahan: ['A', 'B'] }))).toEqual([])
    // JIJ: pesan memakai kata bendanya
    expect(kekuranganLki({ ...aset(tdk('digabung')), sebabTidakAda: true, sebabNoun: 'jalan/jaringan/irigasi' }))
      .toEqual(['Jalan/jaringan/irigasi induk tempat digabung (G)'])
    // golongan lain: tak ditanya
    expect(kekuranganLki(aset({ keberadaan: 'tidak_ditemukan' }))).toEqual([])
  })
})

describe('pemilih jenis — "Semua jenis" (2026-10-01)', () => {
  const r = (n: number) => ({ total_aset: n, menunggu: 1, divalidasi: 2, berubah: 0, belum_tercatat: 0 })

  it('delapan jenis, urutan rekap BMD', () => {
    expect(JENIS_INVENTARISASI.map(j => j.kode)).toEqual(['1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.5.3', '1.5.4'])
  })

  it('jumlahRingkas menjumlah per kolom', () => {
    expect(jumlahRingkas([r(10), r(5)])).toEqual({ total_aset: 15, menunggu: 2, divalidasi: 4, berubah: 0, belum_tercatat: 0 })
  })

  it('satu jenis tak terhitung → total TAK TERHITUNG, bukan total yang kurang sebagian', () => {
    expect(jumlahRingkas([r(10), null])).toBeNull()
    expect(jumlahRingkas([])).toBeNull()
  })

  it('golonganDariKode = 3 segmen pertama', () => {
    expect(golonganDariKode('1.3.3.01.01.01.001')).toBe('1.3.3')
    expect(golonganDariKode(null)).toBe('')
  })
})

describe('klasifikasiLhi — III.B.12 (perubahan kodefikasi)', () => {
  const brs = (jawaban: InvJawaban): InvBaris => ({
    id: 'x', aset_id: 'a', snapshot: { kondisi: 'Baik' }, jawaban, foto_paths: [],
  })

  it('Kode Barang "Tidak Sesuai" → III.B.12', () => {
    expect(klasifikasiLhi(brs({ kode_barang: { sesuai: false, kode_baru: '1.3.3.02.01' } }))).toEqual(['III.B.12'])
  })

  it('SENGAJA tak ikut memicu III.B.8 — satu temuan tak boleh dilaporkan di dua format', () => {
    expect(klasifikasiLhi(brs({ kode_barang: { sesuai: false } }))).not.toContain('III.B.8')
  })

  it('kode DAN atribut lain berubah → masuk keduanya, masing-masing untuk bagiannya', () => {
    const k = klasifikasiLhi(brs({ kode_barang: { sesuai: false }, merek_tipe: { sesuai: false, seharusnya: 'X' } }))
    expect(k).toEqual(expect.arrayContaining(['III.B.8', 'III.B.12']))
  })

  it('kode sesuai → tak masuk III.B.12', () => {
    expect(klasifikasiLhi(brs({ kode_barang: { sesuai: true } }))).not.toContain('III.B.12')
    expect(klasifikasiLhi(brs({}))).not.toContain('III.B.12')
  })

  it('perubahan NON-kode tetap III.B.8 persis seperti dulu', () => {
    expect(klasifikasiLhi(brs({ spesifikasi: { sesuai: false, seharusnya: 'X' } }))).toEqual(['III.B.8'])
  })

  it('terdaftar di label, urutan, & rekomendasi', () => {
    expect(LHI_URUT).toContain('III.B.12')
    expect(LHI_URUT[LHI_URUT.length - 1]).toBe('III.B.13')
    expect(LHI_LABEL['III.B.12']).toBe('BMD Terjadi Perubahan Kodefikasi Barang')
    expect(REKOMENDASI['III.B.12'].menu).toBe('Reklasifikasi')
  })
})

describe('semua isian WAJIB dijawab eksplisit (2026-10-01)', () => {
  const cfg = konfigLki('1.3.3')
  const penuh = (): InvJawaban => ({
    keberadaan: 'ada', kondisi: 'B',
    kode_barang: { sesuai: true }, spesifikasi: { sesuai: true },
    luas: { sesuai: true }, wilayah: { sesuai: true }, alamat_detail: { sesuai: true },
    koordinat: { sesuai: true }, satuan: { sesuai: true }, keterangan_barang: { sesuai: true },
    foto_barang: { sesuai: true }, atribusi: 'bukan', penggunaan: null, tanah_milik: 'pemda',
  })
  const k = (j: InvJawaban) => kekuranganLki({ aset_id: 'a-1', jawaban: j, foto_register: 1, config: cfg })

  it('lembar kosong → SEMUA yang belum dijawab disebut sekaligus', () => {
    const r = kekuranganLki({ aset_id: 'a-1', jawaban: {}, foto_register: 1, config: cfg })
    expect(r.filter(x => /pilih Sesuai atau Tidak Sesuai/.test(x))).toHaveLength(9)
    expect(r.join('|')).toMatch(/Penggunaan Barang \(L\)/)
    expect(r.join('|')).toMatch(/atribusi \(I\)/)
    expect(r.join('|')).toMatch(/tanah milik \(N\)/)
  })

  it('semuanya dijawab → lolos', () => {
    expect(k(penuh())).toEqual([])
  })

  it('SATU saja yang belum dijawab → ditolak, dan menyebut yang mana', () => {
    for (const f of ['kode_barang', 'spesifikasi', 'luas', 'wilayah', 'alamat_detail', 'koordinat', 'satuan', 'keterangan_barang', 'foto_barang'] as const) {
      const j = penuh(); delete (j as Record<string, unknown>)[f]
      expect(k(j), f).toHaveLength(1)
    }
    const j = penuh(); delete j.penggunaan
    expect(k(j)).toEqual(['Penggunaan Barang (L) — belum dipilih'])
  })

  it('isian yang tak ditanyakan golongannya tak dituntut (Gedung tak punya Merek/Tipe)', () => {
    expect(cfg.merekTipe).toBe(false)
    expect(k(penuh())).toEqual([])
  })

  it('barang HILANG / tak ditemukan: cukup keberadaan, rinciannya tak dituntut', () => {
    expect(kekuranganLki({ aset_id: 'a-1', jawaban: { keberadaan: 'hilang' }, config: cfg })).toEqual([])
  })

  it('tanpa `config` aturan ini tak diperiksa (pemanggil lama tetap jalan)', () => {
    expect(kekuranganLki({ aset_id: 'a-1', jawaban: { keberadaan: 'ada', kondisi: 'B' }, foto_register: 1 })).toEqual([])
  })

  it('radio TAK PERNAH tercentang sendiri — termasuk lembar yang sudah pernah disimpan', () => {
    expect(sesuaiTampil(undefined)).toBeUndefined()
    expect(sesuaiTampil({ sesuai: false })).toBe(false)
    expect(atribusiTampil(undefined)).toBeUndefined()
    expect(digunakanSendiriTampil(undefined)).toBe(false)
    expect(digunakanSendiriTampil(null)).toBe(true)
  })
})

describe('Penggunaan Barang (L) → LHI (keputusan user 2026-10-02)', () => {
  const b = (penggunaan: InvJawaban['penggunaan']): InvBaris => ({
    id: 'x', aset_id: 'a', snapshot: {}, jawaban: { keberadaan: 'ada', penggunaan }, foto_paths: [],
  })

  it('Operasional / Tidak ada pihak lain (null) aman — tak keluar ke LHI', () => {
    expect(klasifikasiLhi(b(null))).toEqual([])
    expect(klasifikasiLhi(b(undefined))).toEqual([])
  })

  it('Pegawai / Pengguna Barang lainnya → III.B.5, SELALU (tanpa nama pun)', () => {
    expect(klasifikasiLhi(b({ pihak: 'pemda' }))).toEqual(['III.B.5'])
    expect(klasifikasiLhi(b({ pihak: 'pemda', nama_pemakai: 'Budi' }))).toEqual(['III.B.5'])
  })

  it('Pemerintah Pusat / Pemda Lainnya / Pihak Lain → III.B.6, bukan III.B.5', () => {
    for (const pihak of ['pempus', 'pemda_lain', 'pihak_lain'] as const) {
      expect(klasifikasiLhi(b({ pihak })), pihak).toEqual(['III.B.6'])
    }
  })

  it('pilihan Pegawai mewajibkan Nama & Status Pemakai (laporan tak boleh memuat baris tanpa pemakai)', () => {
    const lembar = (penggunaan: InvJawaban['penggunaan']) => kekuranganLki({
      aset_id: 'a', jawaban: { keberadaan: 'ada', kondisi: 'B', penggunaan }, foto_register: 1, config: konfigLki('1.3.5'),
    })
    const kurang = lembar({ pihak: 'pemda' })
    expect(kurang).toEqual(expect.arrayContaining(['Nama Pemakai (L)', 'Status Pemakai (L)']))
    const sisa = lembar({ pihak: 'pemda', nama_pemakai: 'Budi', status_pemakai: 'ASN' })
    expect(sisa).not.toContain('Nama Pemakai (L)')
    expect(sisa).not.toContain('Status Pemakai (L)')
    expect(lembar({ pihak: 'pempus' })).not.toContain('Nama Pemakai (L)')
  })
})
