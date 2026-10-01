// Penjaga LHI: kop identitas (Kuasa PB / PB / Pengelola) & tabel III.B.3 baru.
//
// Kelas kegagalan senyap yang dijaga:
//   · kop lembar bertanda tangan kosong / salah sebut (Pengguna ≠ SKPD induk)
//   · kolom di tampilan tak punya padanan di baris → sel kosong tanpa error
//   · "Data Awal Induk" kosong untuk isian lama (tak membekukan data induknya)
import { describe, it, expect } from 'vitest'
import {
  identitasLhi, PENGELOLA_BARANG_LHI, kolomLhi, kolomLhiTampil, nilaiBarisLhi,
  kebutuhanIndukLive, tglLhi, CATATAN_KAKI,
} from './inventarisasiLaporan'
import type { InvBaris, InvJawaban } from './inventarisasi'

describe('identitasLhi — butir (3)–(5) kop', () => {
  const pohon = [
    { id: 1, parent_id: null, nama: 'Dinas A' },
    { id: 2, parent_id: 1, nama: 'UPTD A1' },
    { id: 3, parent_id: 2, nama: 'Sub A1a' },
    { id: 9, parent_id: null, nama: 'PENGELOLA BARANG' },
  ]

  it('Pengelola Barang = Badan Keuangan dan Aset Daerah, dalam keadaan APA PUN', () => {
    expect(PENGELOLA_BARANG_LHI).toBe('Badan Keuangan dan Aset Daerah')
    for (const id of [1, 2, 3, 9, 404, null]) {
      expect(identitasLhi(id, pohon).pengelola, String(id)).toBe(PENGELOLA_BARANG_LHI)
    }
  })

  it('SKPD level 1 → Kuasa PB dan PB sama-sama SKPD itu', () => {
    expect(identitasLhi(1, pohon)).toEqual({ kuasa: 'Dinas A', pengguna: 'Dinas A', pengelola: PENGELOLA_BARANG_LHI })
    expect(identitasLhi(9, pohon).pengguna).toBe('PENGELOLA BARANG')
  })

  it('sub unit → Kuasa PB = unit itu, PB = SKPD INDUK (akar)', () => {
    expect(identitasLhi(2, pohon)).toMatchObject({ kuasa: 'UPTD A1', pengguna: 'Dinas A' })
    // level 3 ikut aturan sub unit & naik sampai akar, bukan berhenti di induk langsung
    expect(identitasLhi(3, pohon)).toMatchObject({ kuasa: 'Sub A1a', pengguna: 'Dinas A' })
  })

  it('tanpa SKPD (se-kabupaten) → Kuasa & PB BERTITIK-TITIK (undefined), Pengelola tetap terisi', () => {
    expect(identitasLhi(null, pohon)).toEqual({ pengelola: PENGELOLA_BARANG_LHI })
  })

  it('SKPD tak ditemukan di pohon → tak menebak', () => {
    expect(identitasLhi(404, pohon)).toEqual({ pengelola: PENGELOLA_BARANG_LHI })
  })

  it('induk tak ada di daftar (pohon terpotong) → PB dibiarkan kosong, bukan menunjuk nama keliru', () => {
    const terpotong = [{ id: 2, parent_id: 77, nama: 'UPTD Yatim' }]
    expect(identitasLhi(2, terpotong)).toMatchObject({ kuasa: 'UPTD Yatim' })
  })

  it('pohon berlingkaran tak membekukan', () => {
    const loop = [
      { id: 1, parent_id: 2, nama: 'A' }, { id: 2, parent_id: 1, nama: 'B' },
    ]
    expect(() => identitasLhi(1, loop)).not.toThrow()
  })
})

describe('tglLhi', () => {
  it('YYYY-MM-DD → dd/mm/yyyy (tanpa new Date — tak bergeser zona waktu)', () => {
    expect(tglLhi('2008-01-01')).toBe('01/01/2008')
    expect(tglLhi('2026-12-31T00:00:00+00:00')).toBe('31/12/2026')
  })
  it('kosong → kosong', () => {
    expect(tglLhi(null)).toBe('')
    expect(tglLhi('')).toBe('')
  })
})

const brs = (jawaban: InvJawaban, snap: Partial<NonNullable<InvBaris['snapshot']>> = {}): InvBaris => ({
  id: 'i1', aset_id: 'a-1', jawaban, foto_paths: [],
  snapshot: {
    nibar: '1'.repeat(45), kode: '1.3.3.01.01.01.001', uraian_barang: 'Bangunan Gedung Kantor Permanen',
    nama_barang: 'Rehab Kantor KPU', merek_tipe: null, spesifikasi_lainnya: null,
    tgl_perolehan: '2026-01-01', nilai_perolehan: 169_028_031, ...snap,
  },
})

describe('nilaiBarisLhi III.B.3 — tabel baru', () => {
  it('atribusi (bagian I): induk pilihan petugas, dgn data awal yang DIBEKUKAN', () => {
    const r = nilaiBarisLhi('III.B.3', brs({
      atribusi: 'ya_induk_diketahui',
      induk: {
        aset_id: 'ind', nibar: '2'.repeat(45), kode_barang: '1.3.3.01.01.01.001',
        nama_barang: 'Kantor KPU. Kab Kediri', uraian: 'Bangunan Gedung Kantor Permanen',
        tgl_perolehan: '2008-01-01', nilai_perolehan: 654_341_000,
      },
      keterangan: 'Perlu digabung ke induk tahun 2008',
    }), 1)
    expect(r).toMatchObject({
      no: 1, kode: '1.3.3.01.01.01.001', uraian: 'Bangunan Gedung Kantor Permanen',
      nama: 'Rehab Kantor KPU', tgl: '01/01/2026', nilai: 169_028_031,
      induk_kode: '1.3.3.01.01.01.001', induk_uraian: 'Bangunan Gedung Kantor Permanen',
      induk_nama: 'Kantor KPU. Kab Kediri', induk_tgl: '01/01/2008', induk_nilai: 654_341_000,
      keterangan: 'Perlu digabung ke induk tahun 2008',
    })
    expect(r.induk_nibar).toBe('2'.repeat(45))
  })

  it('isian LAMA tanpa data beku → jatuh ke register (indukLive), BUKAN sel kosong', () => {
    const j: InvJawaban = {
      atribusi: 'ya_induk_diketahui',
      induk: { aset_id: 'ind', nibar: 'N', kode_barang: 'K', nama_barang: 'Induk Lama' },
    }
    const kosong = nilaiBarisLhi('III.B.3', brs(j), 1)
    expect(kosong.induk_nilai).toBe('')
    const live = nilaiBarisLhi('III.B.3', brs(j), 1, {
      ind: { uraian_barang: 'Uraian Live', tgl_perolehan: '2008-05-06', nilai_perolehan: 5 },
    })
    expect(live).toMatchObject({ induk_uraian: 'Uraian Live', induk_tgl: '06/05/2008', induk_nilai: 5 })
  })

  it('nilai beku MENANG atas register (data awal tak ikut bergerak)', () => {
    const j: InvJawaban = {
      atribusi: 'ya_induk_diketahui',
      induk: { aset_id: 'ind', uraian: 'Beku', tgl_perolehan: '2008-01-01', nilai_perolehan: 100 },
    }
    const r = nilaiBarisLhi('III.B.3', brs(j), 1, {
      ind: { uraian_barang: 'Live', tgl_perolehan: '2020-01-01', nilai_perolehan: 999 },
    })
    expect(r).toMatchObject({ induk_uraian: 'Beku', induk_tgl: '01/01/2008', induk_nilai: 100 })
  })

  it('nilai beku 0 tetap dipakai (bukan dianggap kosong)', () => {
    const r = nilaiBarisLhi('III.B.3', brs({
      atribusi: 'ya_induk_diketahui',
      induk: { aset_id: 'ind', uraian: 'x', tgl_perolehan: '2008-01-01', nilai_perolehan: 0 },
    }), 1, { ind: { uraian_barang: 'x', tgl_perolehan: '2008-01-01', nilai_perolehan: 999 } })
    expect(r.induk_nilai).toBe(0)
  })

  it('digabung (bagian G): induk = barang pilihan, sebabnya tercatat di Keterangan', () => {
    const r = nilaiBarisLhi('III.B.3', brs({
      keberadaan: 'tidak_ditemukan', sebab_tidak_ada: 'digabung',
      sebab_relasi: { aset_id: 'ind', nibar: 'NIB-IND', kode_barang: 'K9', nama_barang: 'Gedung Induk',
        uraian: 'U9', tgl_perolehan: '2001-02-03', nilai_perolehan: 7 },
    }), 1)
    expect(r).toMatchObject({ induk_kode: 'K9', induk_nama: 'Gedung Induk', induk_nibar: 'NIB-IND',
      induk_uraian: 'U9', induk_tgl: '03/02/2001', induk_nilai: 7 })
    expect(String(r.keterangan)).toContain('Tidak ada')
  })

  it('direhab jadi bangunan baru: barang ini SENDIRI induknya; anak disebut di Keterangan', () => {
    const r = nilaiBarisLhi('III.B.3', brs({
      keberadaan: 'tidak_ditemukan', sebab_tidak_ada: 'rehab_bangunan_baru',
      sebab_relasi: { aset_id: 'anak', nibar: 'NIB-ANAK', nama_barang: 'Gedung Baru' },
    }), 1)
    expect(r).toMatchObject({
      induk_kode: '1.3.3.01.01.01.001', induk_nama: 'Rehab Kantor KPU',
      induk_tgl: '01/01/2026', induk_nilai: 169_028_031,
    })
    expect(String(r.keterangan)).toContain('NIB-ANAK')
  })

  it('Merk/Tipe & Spesifikasi Lainnya diambil dari snapshot (efektif)', () => {
    const r = nilaiBarisLhi('III.B.3', brs(
      { atribusi: 'ya_induk_diketahui', spesifikasi_lainnya: { sesuai: false, seharusnya: 'Beton' } },
      { merek_tipe: 'Permanen', spesifikasi_lainnya: 'Batu' },
    ), 1)
    expect(r).toMatchObject({ merek_tipe: 'Permanen', spek_lain: 'Beton' })
  })
})

describe('kolom III.B.3', () => {
  const j: InvJawaban = {
    atribusi: 'ya_induk_diketahui',
    induk: { aset_id: 'ind', nibar: 'N', kode_barang: 'K', nama_barang: 'I', uraian: 'U', tgl_perolehan: '2008-01-01', nilai_perolehan: 1 },
  }
  const baris = nilaiBarisLhi('III.B.3', brs(j), 1)

  it('susunan tampilan = contoh user (12 kolom, blok "Data Awal Induk" 4 kolom)', () => {
    const t = kolomLhiTampil('III.B.3', false)
    expect(t.map(k => k.label)).toEqual([
      'No', 'Kode Barang / Uraian Barang', 'Nama Barang / NIBAR', 'Merk/Tipe', 'Spesifikasi Lainnya',
      'Tanggal Perolehan', 'Nilai Perolehan',
      'Kode Barang / Uraian Barang', 'Nama Barang / NIBAR', 'Tanggal Perolehan', 'Nilai Perolehan', 'Keterangan',
    ])
    expect(t.filter(k => k.grup === 'Data Awal Induk')).toHaveLength(4)
  })

  it('layar & cetak memakai susunan yang SAMA untuk III.B.3', () => {
    expect(kolomLhiTampil('III.B.3', true)).toBe(kolomLhiTampil('III.B.3', false))
  })

  it('SETIAP key tampilan (termasuk yang ditumpuk) ada di baris — kalau tidak, selnya kosong senyap', () => {
    for (const k of kolomLhiTampil('III.B.3', false)) {
      expect(baris, k.key).toHaveProperty(k.key)
      for (const t of k.tumpuk || []) expect(baris, t).toHaveProperty(t)
    }
  })

  it('SETIAP key Excel (datar) ada di baris', () => {
    for (const k of kolomLhi('III.B.3')) expect(baris, k.key).toHaveProperty(k.key)
  })

  it('Excel tetap DATAR: satu kolom per data, tak ada yang ditumpuk', () => {
    const d = kolomLhi('III.B.3')
    expect(d.some(k => k.tumpuk)).toBe(false)
    expect(d.map(k => k.label)).toEqual(expect.arrayContaining(['Kode Barang', 'Uraian Barang', 'Nama Barang', 'NIBAR']))
  })

  it('kolom "nilai" ada (total Jumlah (Rp) mencarinya)', () => {
    expect(kolomLhiTampil('III.B.3', false).some(k => k.key === 'nilai')).toBe(true)
  })
})

describe('kebutuhanIndukLive', () => {
  const b = (jawaban: InvJawaban) => ({ jawaban })

  it('hanya induk yang datanya TAK dibekukan', () => {
    const ids = kebutuhanIndukLive([
      b({ induk: { aset_id: 'lama' } }),
      b({ induk: { aset_id: 'baru', uraian: 'u', tgl_perolehan: '2008-01-01', nilai_perolehan: 1 } }),
    ])
    expect(ids).toEqual(['lama'])
  })

  it('nilai beku 0 dianggap SUDAH dibekukan', () => {
    expect(kebutuhanIndukLive([b({ induk: { aset_id: 'x', uraian: 'u', tgl_perolehan: '2008-01-01', nilai_perolehan: 0 } })])).toEqual([])
  })

  it('relasi hanya dihitung untuk sebab "digabung" (rehab: relasi = anak, tak dipakai)', () => {
    expect(kebutuhanIndukLive([b({ sebab_tidak_ada: 'digabung', sebab_relasi: { aset_id: 'g' } })])).toEqual(['g'])
    expect(kebutuhanIndukLive([b({ sebab_tidak_ada: 'rehab_bangunan_baru', sebab_relasi: { aset_id: 'a' } })])).toEqual([])
  })

  it('tanpa duplikat; isian tanpa induk dilewati', () => {
    expect(kebutuhanIndukLive([
      b({ induk: { aset_id: 'x' } }), b({ induk: { aset_id: 'x' } }), b({}),
    ])).toEqual(['x'])
  })
})

describe('III.B.12 — perubahan kodefikasi', () => {
  const j: InvJawaban = {
    kode_barang: { sesuai: false, kode_baru: '1.3.3.02.01.01.001', uraian_baru: 'Bangunan Gedung Kantor Semi Permanen' },
    keterangan: 'Salah kodefikasi saat impor',
  }
  const b = brs(j, { jumlah: 1, satuan: 'Unit', spesifikasi_lainnya: 'Beton' })
  const r = nilaiBarisLhi('III.B.12', b, 3)

  it('kode LAMA dari register (snapshot), kode BARU dari jawaban petugas', () => {
    expect(r).toMatchObject({
      no: 3,
      kode_lama: '1.3.3.01.01.01.001', uraian_lama: 'Bangunan Gedung Kantor Permanen',
      kode_baru: '1.3.3.02.01.01.001', uraian_baru: 'Bangunan Gedung Kantor Semi Permanen',
    })
  })

  it('identitas barang: nama, NIBAR, tanggal dd/mm/yyyy, jumlah, satuan, nilai, spesifikasi lainnya', () => {
    expect(r).toMatchObject({
      nama: 'Rehab Kantor KPU', nibar: '1'.repeat(45), tgl: '01/01/2026',
      jumlah: 1, satuan: 'Unit', nilai: 169_028_031, spek_lain: 'Beton',
    })
  })

  it('Keterangan diawali "Perlu di Reklas" (tindak lanjutnya Reklasifikasi), catatan petugas menyusul', () => {
    expect(r.keterangan).toBe('Perlu di Reklas — Salah kodefikasi saat impor')
    expect(nilaiBarisLhi('III.B.12', brs({ kode_barang: { sesuai: false } }), 1).keterangan).toBe('Perlu di Reklas')
  })

  it('kode baru lupa diisi → "(kosong)", bukan sel kosong yang terbaca "tak berubah"', () => {
    const k = nilaiBarisLhi('III.B.12', brs({ kode_barang: { sesuai: false } }), 1)
    expect(k.kode_baru).toBe('(kosong)')
    expect(k.uraian_baru).toBe('(kosong)')
  })

  it('susunan tampilan = contoh user (10 kolom), layar & cetak SAMA', () => {
    const t = kolomLhiTampil('III.B.12', false)
    expect(t.map(k => k.label)).toEqual([
      'No', 'Nama Barang / NIBAR', 'Merk/Tipe', 'Spesifikasi Lainnya', 'Tanggal Perolehan',
      'Jumlah / Satuan', 'Nilai Perolehan',
      'Kode Barang Lama / Uraian Barang Lama', 'Kode Barang Baru / Uraian Barang Baru', 'Keterangan',
    ])
    expect(kolomLhiTampil('III.B.12', true)).toBe(t)
  })

  it('SETIAP key tampilan (termasuk yang ditumpuk) & key Excel ada di baris', () => {
    for (const k of kolomLhiTampil('III.B.12', false)) {
      expect(r, k.key).toHaveProperty(k.key)
      for (const x of k.tumpuk || []) expect(r, x).toHaveProperty(x)
    }
    for (const k of kolomLhi('III.B.12')) expect(r, k.key).toHaveProperty(k.key)
  })

  it('Excel tetap DATAR: kode & uraian, lama & baru, masing-masing kolom sendiri', () => {
    const d = kolomLhi('III.B.12')
    expect(d.some(k => k.tumpuk)).toBe(false)
    expect(d.map(k => k.label)).toEqual(expect.arrayContaining([
      'Kode Barang Lama', 'Uraian Barang Lama', 'Kode Barang Baru', 'Uraian Barang Baru', 'Jumlah', 'Satuan',
    ]))
  })

  it('kolom "nilai" ada (baris Jumlah (Rp) mencarinya)', () => {
    expect(kolomLhiTampil('III.B.12', false).some(k => k.key === 'nilai')).toBe(true)
  })
})

describe('III.B.6 — tabel baru (Penggunaan)', () => {
  const wil = (k: string | null | undefined) => (k === 'W1' ? 'Jawa Timur, Kediri, Kec. Mojo, Tamanan' : k || '')
  const j: InvJawaban = {
    penggunaan: { pihak: 'pempus', nama: 'KPU Kab Kediri', dasar_ada: true, nama_dokumen: 'Perjanjian Pinjam Pakai' },
    keterangan: 'Perlu digabung ke induk tahun 2008',
  }
  const r = nilaiBarisLhi('III.B.6', brs(j, { wilayah_kode: 'W1', alamat: 'Jl. Anu 1', satuan: 'Unit', jumlah: 1 }), 1, {}, wil)

  it('mengikuti contoh user: pihak, instansi, dokumen penguasaan, nama dokumen, catatan', () => {
    expect(r).toMatchObject({
      guna_pihak: 'Pemerintah Pusat', guna_nama: 'KPU Kab Kediri', guna_dasar: 'Ada',
      guna_dokumen: 'Perjanjian Pinjam Pakai', catatan: 'Perlu digabung ke induk tahun 2008',
      alamat: 'Jawa Timur, Kediri, Kec. Mojo, Tamanan · Jl. Anu 1',
    })
  })

  it('tanpa dokumen penguasaan → "Tidak ada"', () => {
    const t = nilaiBarisLhi('III.B.6', brs({ penggunaan: { pihak: 'pihak_lain', nama: 'X', dasar_ada: false } }), 1)
    expect(t.guna_dasar).toBe('Tidak ada')
    expect(t.guna_pihak).toBe('Pihak Lain')
  })

  it('layar & cetak SATU susunan, blok Penggunaan 4 kolom, tiap kolom punya padanan di baris', () => {
    const t = kolomLhiTampil('III.B.6', false)
    expect(kolomLhiTampil('III.B.6', true)).toBe(t)
    expect(t.filter(k => k.grup === 'Penggunaan').map(k => k.label)).toEqual(
      ['Pihak', 'Nama Instansi / Pihak', 'Dokumen Penguasaan', 'Nama Dokumen'])
    for (const k of t) {
      expect(r, k.key).toHaveProperty(k.key)
      for (const x of k.tumpuk || []) expect(r, x).toHaveProperty(x)
    }
  })

  it('Excel (kolomLhi) datar & seluruh kuncinya ada di baris', () => {
    for (const k of kolomLhi('III.B.6')) expect(r, k.key).toHaveProperty(k.key)
  })
})

describe('III.B.1 — tabel baru (Hilang)', () => {
  const r = nilaiBarisLhi('III.B.1', brs({ keberadaan: 'hilang', keterangan: 'Dicuri 12 Mei' }, { satuan: 'Unit', jumlah: 1 }), 1)

  it('mengikuti contoh user: identitas + Catatan Inventarisasi', () => {
    expect(r).toMatchObject({ no: 1, kode: '1.3.3.01.01.01.001', uraian: 'Bangunan Gedung Kantor Permanen', catatan: 'Dicuri 12 Mei', jumlah: 1, satuan: 'Unit' })
    expect(kolomLhiTampil('III.B.1', false).map(k => k.label)).toEqual([
      'No', 'Kode Barang / Uraian Barang', 'Nama Barang / NIBAR', 'Merk/Tipe', 'Spesifikasi Lainnya',
      'Tanggal Perolehan', 'Jumlah / Satuan', 'Nilai Perolehan', 'Catatan Inventarisasi',
    ])
  })

  it('layar & cetak satu susunan; tiap kolom (& sel tumpuk) punya padanan di baris', () => {
    const t = kolomLhiTampil('III.B.1', false)
    expect(kolomLhiTampil('III.B.1', true)).toBe(t)
    for (const k of t) {
      expect(r, k.key).toHaveProperty(k.key)
      for (const x of k.tumpuk || []) expect(r, x).toHaveProperty(x)
    }
    for (const k of kolomLhi('III.B.1')) expect(r, k.key).toHaveProperty(k.key)
  })

  it('III.B.2 = III.B.1 + kolom "Alasan Tidak Ada" sebelum Catatan', () => {
    const l = kolomLhiTampil('III.B.2', false).map(k => k.label)
    expect(l.slice(-2)).toEqual(['Alasan Tidak Ada', 'Catatan Inventarisasi'])
    expect(l.slice(0, -2)).toEqual(kolomLhiTampil('III.B.1', false).map(k => k.label).slice(0, -1))
  })

  it('III.B.2: tiap kolom punya padanan di baris; lembar lama tanpa sebab → alasan kosong', () => {
    const b = nilaiBarisLhi('III.B.2', brs({ keberadaan: 'tidak_ditemukan' }), 1)
    expect(b.alasan).toBe('')
    for (const k of kolomLhiTampil('III.B.2', false)) {
      expect(b, k.key).toHaveProperty(k.key)
      for (const x of k.tumpuk || []) expect(b, x).toHaveProperty(x)
    }
    for (const k of kolomLhi('III.B.2')) expect(b, k.key).toHaveProperty(k.key)
  })
})

describe('III.B.13 — Perubahan Kuantitas (beberapa register)', () => {
  const r = nilaiBarisLhi('III.B.13', brs({
    keberadaan: 'tidak_ditemukan', sebab_tidak_ada: 'beberapa_register',
    sebab_pecahan: ['Gudang sisi barat', ' Gudang sisi selatan ', ''], keterangan: 'cek',
  }, { luas: 150, satuan: 'Unit', jumlah: 1 }), 1)

  it('nama hasil pemecahan satu per baris (kosong dibuang), luas dari register', () => {
    expect(r.pecahan).toBe('Gudang sisi barat\nGudang sisi selatan')
    expect(r.luas).toBe(150)
    expect(r.catatan).toBe('cek')
  })

  it('susunan mengikuti contoh user & tiap kolom punya padanan di baris', () => {
    const t = kolomLhiTampil('III.B.13', false)
    expect(kolomLhiTampil('III.B.13', true)).toBe(t)
    expect(t.map(k => k.label)).toEqual([
      'No', 'Kode Barang / Uraian Barang', 'Nama Barang / NIBAR', 'Merk/Tipe', 'Spesifikasi Lainnya', 'Luas',
      'Tanggal Perolehan', 'Jumlah / Satuan', 'Nilai Perolehan', 'Nama Barang Hasil Pemecahan', 'Catatan Inventarisasi',
    ])
    for (const k of t) {
      expect(r, k.key).toHaveProperty(k.key)
      for (const x of k.tumpuk || []) expect(r, x).toHaveProperty(x)
    }
    for (const k of kolomLhi('III.B.13')) expect(r, k.key).toHaveProperty(k.key)
  })

  it('III.B.2 memuat penjelasan force majeure & bangunan pengganti di "Alasan Tidak Ada"', () => {
    const fm = nilaiBarisLhi('III.B.2', brs({ keberadaan: 'tidak_ditemukan', sebab_tidak_ada: 'force_majeure', sebab_penjelasan: 'Terbakar 12 Mei' }), 1)
    expect(fm.alasan).toBe('Force majeure : Terbakar 12 Mei')
    const db = nilaiBarisLhi('III.B.2', brs({ keberadaan: 'tidak_ditemukan', sebab_tidak_ada: 'dibongkar_baru', sebab_relasi: { aset_id: 'b', nibar: '99', nama_barang: 'Gedung Baru' } }), 1)
    expect(db.alasan).toMatch(/Dibongkar total dan sudah ada bangunan baru : 99 Gedung Baru/)
  })
})

describe('III.B.7 — tabel baru (kondisi fisik)', () => {
  const r = nilaiBarisLhi('III.B.7', brs({ kondisi: 'RB', keterangan: 'atap roboh' }, { kondisi: 'Baik', satuan: 'Unit', jumlah: 1 }), 1)

  it('kondisi sebelum/setelah = KATA PENUH, bukan B/RR/RB', () => {
    expect(r.kondisi_sebelum).toBe('Baik')
    expect(r.kondisi_setelah).toBe('Rusak Berat')
    expect(r.catatan).toBe('atap roboh')
  })

  it('susunan = III.B.1 + dua kolom kondisi sebelum Catatan; tiap kolom punya padanan; layar = cetak', () => {
    const t = kolomLhiTampil('III.B.7', false)
    expect(kolomLhiTampil('III.B.7', true)).toBe(t)
    expect(t.slice(-3).map(k => k.label)).toEqual([
      'Kondisi Fisik Sebelum Inventarisasi', 'Kondisi Fisik Setelah Inventarisasi', 'Catatan Inventarisasi'])
    expect(t.slice(0, -3).map(k => k.label)).toEqual(kolomLhiTampil('III.B.1', false).map(k => k.label).slice(0, -1))
    for (const k of t) {
      expect(r, k.key).toHaveProperty(k.key)
      for (const x of k.tumpuk || []) expect(r, x).toHaveProperty(x)
    }
    for (const k of kolomLhi('III.B.7')) expect(r, k.key).toHaveProperty(k.key)
  })

  it('kondisi snapshot yang tak dikenal tampil apa adanya, bukan kosong', () => {
    expect(nilaiBarisLhi('III.B.7', brs({ kondisi: 'RB' }, { kondisi: 'Sedang' }), 1).kondisi_sebelum).toBe('Sedang')
  })
})

describe('catatan kaki LHI', () => {
  it('TIDAK ada salinan catatan bertanda *) **) ***) dari lampiran Permendagri', () => {
    for (const [k, daftar] of Object.entries(CATATAN_KAKI)) {
      for (const c of daftar || []) expect(c, k).not.toMatch(/^\*+\)/)
    }
  })

  it('keterangan membaca III.B.8 (kita buat sendiri) tetap ada', () => {
    expect((CATATAN_KAKI['III.B.8'] || []).join(' ')).toMatch(/baris ATAS = sebelum/)
  })
})

describe('III.B.11 — BMD Belum Tercatat (2026-10-02): kolom ikut golongan', () => {
  const baruLengkap = {
    kode_barang: '1.3.2.02.01.01.001', nama_barang: 'Sepeda Motor', spesifikasi: 'Honda Beat', merek_tipe: 'Honda',
    spesifikasi_lainnya: '110 cc', no_polisi: 'AG 1 A', no_rangka: 'R1', no_mesin: 'M1', no_bpkb: 'B1',
    satuan: 'Unit', jumlah: 2, harga_satuan: 10_000_000, tgl_perolehan: '2020-05-13',
    wilayah_kode: '3506010001', alamat_detail: 'Jl. Mawar 1', latitude: -7.8, longitude: 111.9,
    kondisi: 'RB' as const, penggunaan: 'Operasional', keterangan: 'Temuan gudang', asal_usul: 'Hibah',
  }
  const b: InvBaris = { id: 'x', aset_id: null, snapshot: {}, jawaban: { keterangan: 'Ditemukan saat sensus', baru: baruLengkap }, foto_paths: ['p'] }
  const wil = (k: string | null | undefined) => (k === '3506010001' ? 'Jawa Timur, Kediri, Pare, Pare' : k || '')
  const row = nilaiBarisLhi('III.B.11', b, 1, {}, wil)
  const keys = (g: string, cetak = false) => kolomLhiTampil('III.B.11', cetak, g).map(k => k.key)

  it('Peralatan & Mesin memuat nomor kendaraan; Tanah tidak, tapi memuat Luas & dokumen kepemilikan', () => {
    expect(keys('1.3.2')).toEqual(expect.arrayContaining(['no_polisi', 'no_rangka', 'no_mesin', 'no_bpkb']))
    expect(keys('1.3.1')).not.toContain('no_polisi')
    expect(keys('1.3.1')).toEqual(expect.arrayContaining(['luas', 'jenis_hak', 'dok_nomor', 'dok_tgl', 'dok_nama']))
    expect(keys('1.3.2')).not.toContain('luas')
  })

  it('tanpa NIBAR & tanpa petak centang kondisi (kata penuh); kode/uraian dan jumlah/satuan ditumpuk', () => {
    const k = kolomLhiTampil('III.B.11', true, '1.3.2')
    expect(k.map(x => x.key)).not.toContain('nibar')
    expect(k.some(x => x.tanda)).toBe(false)
    expect(k.find(x => x.key === 'kode')?.tumpuk).toEqual(['uraian'])
    expect(k.find(x => x.key === 'jumlah')?.tumpuk).toEqual(['satuan'])
  })

  it('Catatan Inventarisasi di ujung; Keterangan spesifikasi terpisah darinya', () => {
    const k = keys('1.3.2')
    expect(k[k.length - 1]).toBe('catatan')
    expect(k).toContain('keterangan')
    expect(row.catatan).toBe('Ditemukan saat sensus')
    expect(row.keterangan).toBe('Temuan gudang')
  })

  it('SETIAP kolom (layar & Excel, semua golongan) punya padanan di baris — tak ada sel kosong senyap', () => {
    for (const g of ['1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.5.3', '1.5.4']) {
      for (const k of [...kolomLhiTampil('III.B.11', false, g), ...kolomLhi('III.B.11', g)]) {
        expect(row, `${g} ${k.key}`).toHaveProperty(k.key)
        for (const t of k.tumpuk || []) expect(row, `${g} tumpuk ${t}`).toHaveProperty(t)
      }
    }
  })

  it('isi baris: nilai total = jumlah × nilai per item, alamat Provinsi→Desa, titik & kondisi kata penuh', () => {
    expect(row.nilai).toBe(20_000_000)
    expect(row.harga_satuan).toBe(10_000_000)
    expect(row.alamat).toBe('Jawa Timur, Kediri, Pare, Pare · Jl. Mawar 1')
    expect(row.titik).toBe('-7.8, 111.9')
    expect(row.kondisi).toBe('Rusak Berat')
    expect(row.tgl).toBe('13/05/2020')
  })

  it('Excel datar: kode dan uraian dua kolom terpisah, tak ada sel tumpuk', () => {
    const k = kolomLhi('III.B.11', '1.3.2')
    expect(k.map(x => x.key)).toEqual(expect.arrayContaining(['kode', 'uraian', 'jumlah', 'satuan']))
    expect(k.some(x => x.tumpuk)).toBe(false)
  })
})

describe('III.B.4 — tabel baru (2026-10-02), saudara III.B.3 tanpa data induk', () => {
  const b: InvBaris = {
    id: 'x', aset_id: 'a', jawaban: { atribusi: 'ya_induk_tidak_diketahui', keterangan: 'Induk tak ditemukan' }, foto_paths: [],
    snapshot: { nibar: 'N1', kode: '1.3.3.01', uraian_barang: 'Gedung', nama_barang: 'Rehab Atap', merek_tipe: 'X',
      spesifikasi_lainnya: 'Baja', tgl_perolehan: '2021-02-03', nilai_perolehan: 5_000_000 },
  }
  const row = nilaiBarisLhi('III.B.4', b, 1)

  it('sama dgn III.B.3 tanpa blok Data Awal Induk; penutupnya Catatan Inventarisasi', () => {
    const k3 = kolomLhiTampil('III.B.3', false).map(k => k.key)
    const k4 = kolomLhiTampil('III.B.4', false).map(k => k.key)
    expect(k4.some(k => k.startsWith('induk_'))).toBe(false)
    expect(k4).toEqual(k3.filter(k => !k.startsWith('induk_') && k !== 'keterangan').concat('catatan'))
  })

  it('setiap kolom (layar & Excel) punya padanan di baris', () => {
    for (const k of [...kolomLhiTampil('III.B.4', false), ...kolomLhi('III.B.4')]) {
      expect(row, k.key).toHaveProperty(k.key)
      for (const t of k.tumpuk || []) expect(row, `tumpuk ${t}`).toHaveProperty(t)
    }
  })

  it('isi baris', () => {
    expect(row).toMatchObject({ nibar: 'N1', nama: 'Rehab Atap', tgl: '03/02/2021', nilai: 5_000_000, catatan: 'Induk tak ditemukan' })
  })
})

describe('III.B.5 — tabel baru (2026-10-02), disusun dari pola III.B.6', () => {
  const b: InvBaris = {
    id: 'x', aset_id: 'a', foto_paths: [],
    jawaban: { keberadaan: 'ada', keterangan: 'Dipakai sejak 2022',
      penggunaan: { pihak: 'pemda', nama: 'Dinas B', nama_pemakai: 'Budi', status_pemakai: 'ASN', bast_pemakaian: true, bast_nomor: '12/BAST/2022', sip: false } },
    snapshot: { nibar: 'N1', kode: '1.3.3.01', uraian_barang: 'Rumah Negara', nama_barang: 'Rumah Dinas', merek_tipe: '',
      spesifikasi_lainnya: 'Tipe 45', tgl_perolehan: '2019-01-02', nilai_perolehan: 90_000_000, jumlah: 1, satuan: 'Unit',
      wilayah_kode: '3506010001', alamat: 'Jl. Melati 3' },
  }
  const wil = (k: string | null | undefined) => (k === '3506010001' ? 'Jawa Timur, Kediri, Pare, Pare' : k || '')
  const row = nilaiBarisLhi('III.B.5', b, 1, {}, wil)

  it('BAST & SIP hanya utk golongan yang menanyakannya (Gedung = rumah negara); petak centang tak ada lagi', () => {
    const keys = (g: string) => kolomLhiTampil('III.B.5', true, g).map(k => k.key)
    expect(keys('1.3.3')).toEqual(expect.arrayContaining(['pemakai_bast', 'pemakai_sip']))
    expect(keys('1.3.2')).not.toContain('pemakai_bast')
    expect(kolomLhiTampil('III.B.5', true, '1.3.3').some(k => k.tanda)).toBe(false)
  })

  it('blok Pemakai, alamat lengkap, Catatan Inventarisasi di ujung', () => {
    const k = kolomLhiTampil('III.B.5', false, '1.3.3')
    expect(k.filter(x => x.grup === 'Pemakai').map(x => x.key))
      .toEqual(['pemakai_pengguna', 'pemakai_nama', 'pemakai_status', 'pemakai_bast', 'pemakai_bast_nomor', 'pemakai_sip', 'pemakai_sip_nomor'])
    expect(k[k.length - 1].key).toBe('catatan')
    expect(k.find(x => x.key === 'kode')?.tumpuk).toEqual(['uraian'])
  })

  it('setiap kolom (layar & Excel, semua golongan) punya padanan di baris', () => {
    for (const g of ['1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.5.3', '1.5.4']) {
      for (const k of [...kolomLhiTampil('III.B.5', false, g), ...kolomLhi('III.B.5', g)]) {
        expect(row, `${g} ${k.key}`).toHaveProperty(k.key)
        for (const t of k.tumpuk || []) expect(row, `tumpuk ${t}`).toHaveProperty(t)
      }
    }
  })

  it('isi baris', () => {
    expect(row).toMatchObject({
      pemakai_nama: 'Budi', pemakai_status: 'ASN', pemakai_pengguna: 'Dinas B',
      pemakai_bast: 'Ada', pemakai_bast_nomor: '12/BAST/2022', pemakai_sip: 'Tidak ada', pemakai_sip_nomor: '', catatan: 'Dipakai sejak 2022',
      alamat: 'Jawa Timur, Kediri, Pare, Pare · Jl. Melati 3',
    })
  })
})
