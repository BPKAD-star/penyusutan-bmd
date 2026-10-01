// Penjaga tabel LHI baru per format (2026-10-02): III.B.4, 5, 9, 10, 11 — susunan kolom,
// padanan kolom ↔ baris (kolom tanpa padanan = sel kosong senyap), dan isi baris.
// Dipisah dari inventarisasiLaporan.test.ts (batas 500 baris).
import { describe, it, expect } from 'vitest'
import { kolomLhi, kolomLhiTampil, nilaiBarisLhi, kebutuhanIndukLive } from './inventarisasiLaporan'
import { LHI_URUT, type InvBaris, type InvJawaban } from './inventarisasi'

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

describe('III.B.9 — tabel baru (2026-10-02)', () => {
  const b: InvBaris = {
    id: 'x', aset_id: 'a', foto_paths: [],
    jawaban: { ganda: true, keterangan: 'Dobel entri 2021', ganda_data: { aset_id: 'k1', nibar: 'N2', nama_barang: 'Laptop Asus', nilai_perolehan: 7_000_000, tgl_perolehan: '2021-04-05' } },
    snapshot: { nibar: 'N1', kode: '1.3.2.10', uraian_barang: 'Laptop', nama_barang: 'Laptop Asus', merek_tipe: 'Asus',
      spesifikasi_lainnya: 'i5', tgl_perolehan: '2021-04-05', nilai_perolehan: 7_000_000, jumlah: 1, satuan: 'Unit' },
  }
  const row = nilaiBarisLhi('III.B.9', b, 1)

  it('urutan kolom = permintaan user; blok "Tercatat Ganda Dengan" berisi nama/NIBAR, tanggal, nilai', () => {
    const k = kolomLhiTampil('III.B.9', false)
    expect(k.map(x => x.key)).toEqual(['no', 'kode', 'nama', 'merek_tipe', 'spek_lain', 'jumlah', 'tgl', 'nilai', 'g_nama', 'g_tgl', 'g_nilai', 'catatan'])
    expect(k.filter(x => x.grup === 'Tercatat Ganda Dengan').map(x => x.key)).toEqual(['g_nama', 'g_tgl', 'g_nilai'])
    expect(k.find(x => x.key === 'g_nama')?.tumpuk).toEqual(['g_nibar'])
  })

  it('setiap kolom (layar & Excel) punya padanan di baris', () => {
    for (const k of [...kolomLhiTampil('III.B.9', false), ...kolomLhi('III.B.9')]) {
      expect(row, k.key).toHaveProperty(k.key)
      for (const t of k.tumpuk || []) expect(row, `tumpuk ${t}`).toHaveProperty(t)
    }
  })

  it('isi baris: data kembaran & catatan', () => {
    expect(row).toMatchObject({ g_nama: 'Laptop Asus', g_nibar: 'N2', g_tgl: '05/04/2021', g_nilai: 7_000_000, catatan: 'Dobel entri 2021' })
  })

  it('isian lama tanpa tanggal kembaran → dibaca dari register; kebutuhannya dilaporkan', () => {
    const lama: InvBaris = { ...b, jawaban: { ...b.jawaban, ganda_data: { aset_id: 'k1', nibar: 'N2', nama_barang: 'X' } } }
    expect(kebutuhanIndukLive([lama])).toEqual(['k1'])
    expect(kebutuhanIndukLive([b])).toEqual([])
    const r = nilaiBarisLhi('III.B.9', lama, 1, { k1: { uraian_barang: null, tgl_perolehan: '2020-01-02', nilai_perolehan: 9 } })
    expect(r).toMatchObject({ g_tgl: '02/01/2020', g_nilai: 9 })
  })
})

describe('III.B.10 — tabel baru (2026-10-02)', () => {
  const b: InvBaris = {
    id: 'x', aset_id: 'a', foto_paths: [],
    jawaban: { tanah_milik: 'pempus', tanah_milik_nama: 'Kementerian ATR', keterangan: 'Sertifikat atas nama pusat' },
    snapshot: { nibar: 'N1', kode: '1.3.3.01', uraian_barang: 'Gedung', nama_barang: 'Gedung Pos', merek_tipe: '',
      spesifikasi_lainnya: 'Beton', tgl_perolehan: '2018-03-04', nilai_perolehan: 800_000_000, jumlah: 1, satuan: 'Unit',
      luas: 120, wilayah_kode: '3506010001', alamat: 'Jl. Raya 1' },
  }
  const wil = (k: string | null | undefined) => (k === '3506010001' ? 'Jawa Timur, Kediri, Pare, Pare' : k || '')
  const row = nilaiBarisLhi('III.B.10', b, 1, {}, wil)

  it('urutan kolom = permintaan user', () => {
    expect(kolomLhiTampil('III.B.10', false).map(k => k.key)).toEqual([
      'no', 'kode', 'nama', 'merek_tipe', 'spek_lain', 'alamat', 'luas', 'jumlah', 'tgl', 'nilai', 'tanah_milik', 'catatan',
    ])
  })

  it('setiap kolom (layar & Excel) punya padanan di baris', () => {
    for (const k of [...kolomLhiTampil('III.B.10', false), ...kolomLhi('III.B.10')]) {
      expect(row, k.key).toHaveProperty(k.key)
      for (const t of k.tumpuk || []) expect(row, `tumpuk ${t}`).toHaveProperty(t)
    }
  })

  it('isi baris: alamat lengkap, luas, pemilik tanah', () => {
    expect(row).toMatchObject({
      alamat: 'Jawa Timur, Kediri, Pare, Pare · Jl. Raya 1', luas: 120,
      tanah_milik: 'Pemerintah Pusat — Kementerian ATR', catatan: 'Sertifikat atas nama pusat',
    })
  })

  it('luas dikoreksi petugas → memakai "seharusnya"', () => {
    const r = nilaiBarisLhi('III.B.10', { ...b, jawaban: { ...b.jawaban, luas: { sesuai: false, seharusnya: '150' } } }, 1, {}, wil)
    expect(r.luas).toBe('150')
  })
})

describe('semua format LHI memakai tabel baru (tak ada lagi bentuk lama)', () => {
  it('kolom layar tiap format tak lagi memuat kolom lama "kode_register" (bentuk INTI sudah dicabut)', () => {
    for (const k of LHI_URUT) {
      const kolom = kolomLhiTampil(k, false, '1.3.3')
      expect(kolom.length, k).toBeGreaterThan(3)
      expect(kolom.map(x => x.key), k).not.toContain('kode_register')
    }
  })
})
