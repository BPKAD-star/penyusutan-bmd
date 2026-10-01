// Penjaga LHI: kop identitas (Kuasa PB / PB / Pengelola) & tabel III.B.3 baru.
//
// Kelas kegagalan senyap yang dijaga:
//   · kop lembar bertanda tangan kosong / salah sebut (Pengguna ≠ SKPD induk)
//   · kolom di tampilan tak punya padanan di baris → sel kosong tanpa error
//   · "Data Awal Induk" kosong untuk isian lama (tak membekukan data induknya)
import { describe, it, expect } from 'vitest'
import {
  identitasLhi, PENGELOLA_BARANG_LHI, kolomLhi, kolomLhiTampil, nilaiBarisLhi,
  kebutuhanIndukLive, tglLhi,
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
