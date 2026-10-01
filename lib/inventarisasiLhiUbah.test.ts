// Penjaga LHI III.B.8 (sebelum/sesudah). Kelas kegagalan senyap yang dijaga:
//   · tanda "berubah" mengikuti centang "Tidak Sesuai", bukan nilai sebenarnya
//   · kolom tampilan tak punya padanan di baris → sel kosong tanpa error
//   · foto ditempel / dihitung berubah padahal sama
import { describe, it, expect } from 'vitest'
import { KOLOM_UBAH, barisExcelUbah, barisUbah } from './inventarisasiLhiUbah'
import { kolomLhiTampil, nilaiBarisLhi } from './inventarisasiLaporan'
import type { InvBaris, InvJawaban } from './inventarisasi'

const wil = (k: string | null | undefined) => ({ W1: 'Jawa Timur, Kediri, Kec. Mojo, Tamanan', W2: 'Jawa Timur, Kediri, Kec. Pare, Pare' } as Record<string, string>)[k || ''] || (k || '')

const brs = (jawaban: InvJawaban, snap: Partial<NonNullable<InvBaris['snapshot']>> = {}, foto: string[] = []): InvBaris => ({
  id: 'i1', aset_id: 'a-1', jawaban, foto_paths: foto,
  snapshot: {
    nibar: '1'.repeat(45), kode: '1.3.3.01.01.01.001', nama_barang: 'Gedung A', merek_tipe: null,
    luas: 100, wilayah_kode: 'W1', alamat: 'Jl. Anu 1', latitude: -7.8, longitude: 112.1,
    keterangan: 'baik', satuan: 'Unit', foto_paths: [], ...snap,
  },
})

describe('barisUbah — hijau hanya bila NILAI berubah', () => {
  it('semua Sesuai → tak ada yang berubah, sesudah = sebelum', () => {
    const r = barisUbah(brs({}, { foto_paths: ['a'] }), 1, wil)
    for (const k of KOLOM_UBAH) expect(r[`${k.key}_beda`], k.key).toBe('')
    expect(r.berubah).toBe('')
    expect(r.nama_sb).toBe(r.nama_st)
  })

  it('Tidak Sesuai dgn nilai BEDA → hijau; nilai SAMA → tetap hitam', () => {
    const r = barisUbah(brs({ spesifikasi: { sesuai: false, seharusnya: 'Gedung B' }, merek_tipe: { sesuai: false, seharusnya: '' } }, { merek_tipe: '' }), 1, wil)
    expect(r.nama_beda).toBe('1')
    expect(r.nama_st).toBe('Gedung B')
    // dicentang tapi nilainya "(kosong)" ≠ kosong → dinyatakan berubah (petugas wajib menyebut yang seharusnya)
    const sama = barisUbah(brs({ spesifikasi: { sesuai: false, seharusnya: 'Gedung A' } }), 1, wil)
    expect(sama.nama_beda).toBe('')
  })

  it('luas dibandingkan sebagai angka: "100,00" = 100', () => {
    expect(barisUbah(brs({ luas: { sesuai: false, seharusnya: '100,00' } }), 1, wil).luas_beda).toBe('')
    expect(barisUbah(brs({ luas: { sesuai: false, seharusnya: '120' } }), 1, wil).luas_beda).toBe('1')
  })

  it('alamat: wilayah Provinsi→Desa + alamat detail; wilayah & detail dinilai terpisah', () => {
    const r = barisUbah(brs({ wilayah: { sesuai: false, wilayah_kode: 'W2' } }), 1, wil)
    expect(r.alamat_sb).toBe('Jawa Timur, Kediri, Kec. Mojo, Tamanan · Jl. Anu 1')
    expect(r.alamat_st).toBe('Jawa Timur, Kediri, Kec. Pare, Pare · Jl. Anu 1')
    expect(r.alamat_beda).toBe('1')
    const det = barisUbah(brs({ alamat_detail: { sesuai: false, seharusnya: 'Jl. Anu 2' } }), 1, wil)
    expect(det.alamat_st).toBe('Jawa Timur, Kediri, Kec. Mojo, Tamanan · Jl. Anu 2')
  })

  it('isian lama tanpa kode wilayah → jatuh ke teks yang dibekukan', () => {
    const r = barisUbah(brs({}, { wilayah_kode: null, wilayah: 'Desa X, Kec. Y' }), 1, wil)
    expect(r.alamat_sb).toBe('Desa X, Kec. Y · Jl. Anu 1')
  })

  it('koordinat: sesudah dari jawaban hanya bila Tidak Sesuai', () => {
    expect(barisUbah(brs({ latitude: -9, longitude: 9 }), 1, wil).koordinat_beda).toBe('')
    const r = barisUbah(brs({ koordinat: { sesuai: false }, latitude: -7.9, longitude: 112.2 }), 1, wil)
    expect(r.koordinat_sb).toBe('-7.8, 112.1')
    expect(r.koordinat_st).toBe('-7.9, 112.2')
    expect(r.koordinat_beda).toBe('1')
    expect(barisUbah(brs({ koordinat: { sesuai: false } }), 1, wil).koordinat_st).toBe('(kosong)')
  })
})

describe('foto — teks Ada/Tidak ada, tak pernah ditempel', () => {
  it('sebelumnya tak ada, sekarang ada → hijau', () => {
    const r = barisUbah(brs({}, { foto_paths: [] }, ['u1']), 1, wil)
    expect(r.foto_sb).toBe('Tidak ada'); expect(r.foto_st).toBe('Ada (1)'); expect(r.foto_beda).toBe('1')
  })
  it('register sudah punya & petugas tak mengubah → hitam', () => {
    const r = barisUbah(brs({}, { foto_paths: ['a', 'b'] }), 1, wil)
    expect(r.foto_sb).toBe('Ada (2)'); expect(r.foto_st).toBe('Ada (2)'); expect(r.foto_beda).toBe('')
  })
  it('Tidak Sesuai → foto terbaru, selalu berubah', () => {
    const r = barisUbah(brs({ foto_barang: { sesuai: false } }, { foto_paths: ['a'] }, ['u1', 'u2']), 1, wil)
    expect(r.foto_st).toBe('Ada (2 terbaru)'); expect(r.foto_beda).toBe('1')
  })
})

describe('susunan tabel & Excel', () => {
  const r = nilaiBarisLhi('III.B.8', brs({ spesifikasi: { sesuai: false, seharusnya: 'Gedung B' } }), 1, {}, wil)

  it('tiap kolom `dua` punya padanan _sb/_st/_beda di baris — tak ada sel kosong senyap', () => {
    const t = kolomLhiTampil('III.B.8', false)
    for (const k of t.filter(c => c.dua)) {
      for (const sfx of ['_sb', '_st', '_beda']) expect(r, `${k.key}${sfx}`).toHaveProperty(`${k.key}${sfx}`)
    }
    for (const k of t.filter(c => !c.dua)) expect(r, k.key).toHaveProperty(k.key)
  })

  it('layar & cetak SATU susunan; kode barang TIDAK ikut (laporannya III.B.12)', () => {
    expect(kolomLhiTampil('III.B.8', true)).toBe(kolomLhiTampil('III.B.8', false))
    expect(kolomLhiTampil('III.B.8', false).some(k => /kode/i.test(k.key))).toBe(false)
  })

  it('urutan kolom mengikuti contoh user', () => {
    expect(kolomLhiTampil('III.B.8', false).map(k => k.label)).toEqual([
      'No', 'NIBAR', 'Nama Barang', 'Merk/Tipe', 'Spesifikasi Lainnya', 'No Polisi', 'No Rangka',
      'No Mesin', 'No BPKB', 'Luas', 'Alamat', 'Titik Koordinat', 'Satuan', 'Keterangan', 'Foto', 'Catatan',
    ])
  })

  it('Excel: DUA baris per barang + "Kolom yang berubah"', () => {
    const x = barisExcelUbah([r])
    expect(x).toHaveLength(2)
    expect(x.map(o => o.Keadaan)).toEqual(['Sebelum', 'Sesudah'])
    expect(x[0]['Nama Barang']).toBe('Gedung A')
    expect(x[1]['Nama Barang']).toBe('Gedung B')
    expect(x[1]['Kolom yang berubah']).toBe('Nama Barang')
  })

  it('catatan: sebab beberapa register + catatan petugas', () => {
    const c = barisUbah(brs({ keberadaan: 'tidak_ditemukan', sebab_tidak_ada: 'beberapa_register', sebab_pecahan: ['G1', 'G2'], keterangan: 'cek' }), 1, wil)
    expect(c.catatan).toBe('Seharusnya 2 register (G1; G2) — tindak lanjut Pemecahan Barang — cek')
  })
})
