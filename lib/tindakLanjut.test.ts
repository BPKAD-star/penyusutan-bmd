import { describe, expect, it } from 'vitest'
import {
  KODE_ASET_HILANG, KODE_DALAM_PENELUSURAN, asetDibutuhkan, kodePinjamPakai, kodeRusakBerat,
  kodeTidakOperasional, temuanDariIsian, type AsetKini, type IsianTL, type KonteksTL,
} from '@/lib/tindakLanjut'
import type { InvJawaban } from '@/lib/inventarisasi'

const ASET: AsetKini = {
  id: 'A', kode: '1.3.3.01.01.01.001', status: 'aktif', nama_barang: 'Gedung Kantor', kondisi_barang: 'Baik',
  satuan: 'Unit', wilayah_kode: '35.06.25.2001', alamat_detail: 'Jl. Lama', merek_tipe: null,
  no_polisi: null, no_rangka: null, no_mesin: null, no_bpkb: null, spesifikasi_lainnya: null,
  luas: 100, keterangan: null, latitude: null, longitude: null, foto_paths: ['f1.jpg'],
  pengamanan: null, pemanfaatan: null,
}

const isian = (jawaban: InvJawaban, over: Partial<IsianTL> = {}): IsianTL => ({
  id: 'I1', aset_id: 'A', golongan: '1.3.3',
  snapshot: { kode: ASET.kode, kondisi: 'Baik', nama_barang: 'Gedung Kantor', foto_paths: ['f1.jpg'] },
  jawaban: { keberadaan: 'ada', kondisi: 'B', ...jawaban }, ...over,
})

const ctx = (aset: AsetKini[] = [ASET], jenis: Record<string, string> = {}, usul: string[] = []): KonteksTL => ({
  aset: new Map(aset.map(a => [a.id, a])), jenisTerakhir: new Map(Object.entries(jenis)), usulHapus: new Set(usul),
})

const satu = (s: IsianTL, c: KonteksTL, lhi: string) => {
  const t = temuanDariIsian(s, c).find(x => x.lhi === lhi)
  if (!t) throw new Error(`temuan ${lhi} tak ada`)
  return t
}

describe('kode tujuan reklas ke Aset Lain-Lain', () => {
  it('mengikuti golongan asal, sesuai master kodefikasi', () => {
    expect(kodeRusakBerat('1.3.2')).toBe('1.5.4.01.01.01.002')
    expect(kodeRusakBerat('1.3.5')).toBe('1.5.4.01.01.01.005')
    expect(kodeRusakBerat('1.3.6')).toBeNull() // KDP tak punya kode RB
    expect(kodePinjamPakai('1.3.1')).toBe('1.5.4.01.01.03.009')
    expect(kodePinjamPakai('1.3.3')).toBe('1.5.4.01.01.03.011')
    expect(kodePinjamPakai('1.3.5')).toBe('1.5.4.01.01.03.013')
    expect(kodeTidakOperasional('1.3.6')).toBe('1.5.4.01.01.02.006')
    expect(kodeRusakBerat('1.5.4')).toBeNull()
  })
})

describe('status dilacak dari KEADAAN barang', () => {
  it('III.B.12 selesai hanya kalau kode register = kode baru', () => {
    const s = isian({ kode_barang: { sesuai: false, kode_baru: '1.3.3.01.01.02.004' } })
    expect(satu(s, ctx(), 'III.B.12').status).toBe('belum')
    expect(satu(s, ctx([{ ...ASET, kode: '1.3.3.01.01.02.004' }]), 'III.B.12').status).toBe('selesai')
    // reklasnya dibatalkan → kode kembali → status ikut kembali "Belum"
    expect(satu(s, ctx([ASET]), 'III.B.12').status).toBe('belum')
  })

  it('III.B.8 per kolom: sebagian dikoreksi = Sebagian', () => {
    const s = isian({
      alamat_detail: { sesuai: false, seharusnya: 'Jl.  Baru ' },
      luas: { sesuai: false, seharusnya: '120.5' },
      wilayah: { sesuai: false, wilayah_kode: '35.06.25.2006' },
    })
    expect(satu(s, ctx(), 'III.B.8').status).toBe('belum')
    const sebagian = satu(s, ctx([{ ...ASET, alamat_detail: 'jl. baru' }]), 'III.B.8')
    expect(sebagian.status).toBe('proses')
    expect(sebagian.tahap.filter(t => t.selesai).map(t => t.label)).toEqual(['Alamat Detail'])
    const semua = satu(s, ctx([{ ...ASET, alamat_detail: 'Jl. Baru', luas: 120.5, wilayah_kode: '35.06.25.2006' }]), 'III.B.8')
    expect(semua.status).toBe('selesai')
  })

  it('III.B.8 foto: selesai kalau register punya foto yang BELUM ada saat diinventarisasi', () => {
    const s = isian({ foto_barang: { sesuai: false } })
    expect(satu(s, ctx(), 'III.B.8').status).toBe('belum')
    expect(satu(s, ctx([{ ...ASET, foto_paths: ['f1.jpg', 'f2.jpg'] }]), 'III.B.8').status).toBe('selesai')
  })

  it('III.B.8 data teknis JIJ belum punya kolom register → tak bisa dilacak', () => {
    const s = isian({ jenis_perkerasan: { sesuai: false, seharusnya: 'Aspal' } }, { golongan: '1.3.4' })
    expect(satu(s, ctx(), 'III.B.8').status).toBe('manual')
  })

  it('III.B.7 Rusak Berat: reklas → usulan → dihapus, bertahap', () => {
    const s = isian({ kondisi: 'RB' })
    const awal = satu(s, ctx(), 'III.B.7')
    expect(awal.kodeTujuan).toBe('1.5.4.01.01.01.003')
    expect(awal.status).toBe('belum')
    const direklas = { ...ASET, kode: '1.5.4.01.01.01.003' }
    expect(satu(s, ctx([direklas]), 'III.B.7').status).toBe('proses')
    expect(satu(s, ctx([direklas], {}, ['A']), 'III.B.7').tahap.map(t => t.selesai)).toEqual([true, true, false])
    const habis = satu(s, ctx([{ ...direklas, status: 'dihapus' }], { A: 'penghapusan_sebab_lain' }), 'III.B.7')
    expect(habis.status).toBe('selesai')
  })

  it('III.B.7 bukan RB: cukup kondisi register diperbarui', () => {
    const s = isian({ kondisi: 'RR' })
    expect(satu(s, ctx(), 'III.B.7').status).toBe('belum')
    expect(satu(s, ctx([{ ...ASET, kondisi_barang: 'Rusak Ringan' }]), 'III.B.7').status).toBe('selesai')
  })

  it('III.B.1 hilang: barang yang sudah dihapus menuntaskan semua tahap', () => {
    const s = isian({ keberadaan: 'hilang' })
    expect(satu(s, ctx(), 'III.B.1').kodeTujuan).toBe(KODE_ASET_HILANG)
    expect(satu(s, ctx([{ ...ASET, status: 'dihapus' }], { A: 'penghapusan_sebab_lain' }), 'III.B.1').status).toBe('selesai')
    // nonaktif KARENA hal lain (dipecah) bukan penghapusan
    expect(satu(s, ctx([{ ...ASET, status: 'dihapus' }], { A: 'pemecahan_keluar' }), 'III.B.1').status).toBe('belum')
  })

  it('III.B.2: sebab pasti → langsung hapus; tanpa sebab → telusuri dulu', () => {
    const pasti = satu(isian({ keberadaan: 'tidak_ditemukan', sebab_tidak_ada: 'force_majeure' }), ctx(), 'III.B.2')
    expect(pasti.kodeTujuan).toBeUndefined()
    expect(pasti.tahap).toHaveLength(2)
    const telusur = satu(isian({ keberadaan: 'tidak_ditemukan' }), ctx(), 'III.B.2')
    expect(telusur.kodeTujuan).toBe(KODE_DALAM_PENELUSURAN)
  })

  it('III.B.3: anak yang diserap kapitalisasi = selesai; dibatalkan = belum', () => {
    const s = isian({ atribusi: 'ya_induk_diketahui', induk: { aset_id: 'B', nama_barang: 'Induk' } })
    expect(satu(s, ctx(), 'III.B.3').status).toBe('belum')
    expect(satu(s, ctx([{ ...ASET, status: 'dihapus' }], { A: 'kapitalisasi_serap' }), 'III.B.3').status).toBe('selesai')
    expect(satu(s, ctx([ASET], { A: 'batal_kapitalisasi' }), 'III.B.3').status).toBe('belum')
  })

  it('III.B.3 "direhab jadi bangunan baru": yang diserap bangunan BARU-nya', () => {
    const s = isian({ keberadaan: 'tidak_ditemukan', sebab_tidak_ada: 'rehab_bangunan_baru', sebab_relasi: { aset_id: 'C' } })
    const anak: AsetKini = { ...ASET, id: 'C', status: 'dihapus' }
    expect(satu(s, ctx([ASET, anak], { C: 'kapitalisasi_serap' }), 'III.B.3').status).toBe('selesai')
    expect(asetDibutuhkan([s])).toEqual(['A', 'C'])
  })

  it('III.B.6 pinjam pakai Pusat → kode Pinjam Pakai + perjanjian Pemanfaatan', () => {
    const s = isian({ penggunaan: { pihak: 'pempus', nama: 'KPU', dasar_ada: true } })
    const t = satu(s, ctx(), 'III.B.6')
    expect(t.kodeTujuan).toBe('1.5.4.01.01.03.011')
    const reklas = { ...ASET, kode: '1.5.4.01.01.03.011' }
    expect(satu(s, ctx([reklas]), 'III.B.6').status).toBe('proses')
    expect(satu(s, ctx([{ ...reklas, pemanfaatan: 'Pinjam Pakai — KPU' }]), 'III.B.6').status).toBe('selesai')
    expect(satu(isian({ penggunaan: { pihak: 'pihak_lain' } }), ctx(), 'III.B.6').kodeTujuan).toBe('1.5.4.01.01.02.003')
  })

  it('III.B.5: selesai kalau barang sudah punya kustodian Pengamanan', () => {
    const s = isian({ penggunaan: { pihak: 'pemda', nama_pemakai: 'Budi', status_pemakai: 'PNS' } })
    expect(satu(s, ctx(), 'III.B.5').status).toBe('belum')
    expect(satu(s, ctx([{ ...ASET, pengamanan: 'Budi (NIP 1)' }]), 'III.B.5').status).toBe('selesai')
    // jenis barang di luar Pengamanan → tak bisa dilacak
    expect(satu(s, ctx([{ ...ASET, kode: '1.3.1.01.01.01.001' }]), 'III.B.5').status).toBe('manual')
  })

  it('III.B.9: salah satu kembaran dinonaktifkan Pencatatan Ganda', () => {
    const s = isian({ ganda: true, ganda_data: { aset_id: 'D' } })
    const d: AsetKini = { ...ASET, id: 'D' }
    expect(satu(s, ctx([ASET, d]), 'III.B.9').status).toBe('belum')
    expect(satu(s, ctx([ASET, { ...d, status: 'dihapus' }], { D: 'koreksi_pencatatan_ganda' }), 'III.B.9').status).toBe('selesai')
  })

  it('III.B.13: induk dipecah = selesai', () => {
    const s = isian({ keberadaan: 'tidak_ditemukan', sebab_tidak_ada: 'beberapa_register', sebab_pecahan: ['G1', 'G2'] })
    expect(satu(s, ctx(), 'III.B.13').status).toBe('belum')
    expect(satu(s, ctx([{ ...ASET, status: 'dihapus' }], { A: 'pemecahan_keluar' }), 'III.B.13').status).toBe('selesai')
  })

  it('III.B.4, III.B.10, III.B.11 = tandai manual', () => {
    expect(satu(isian({ atribusi: 'ya_induk_tidak_diketahui' }), ctx(), 'III.B.4').status).toBe('manual')
    expect(satu(isian({ tanah_milik: 'pihak_lain' }), ctx(), 'III.B.10').status).toBe('manual')
    expect(satu(isian({ baru: { kode_barang: '1.3.3.01.01.10.001' } }, { aset_id: null }), ctx(), 'III.B.11').status).toBe('manual')
  })

  it('barang yang tak terbaca (RLS/terhapus dari cakupan) tak pernah dianggap selesai', () => {
    const s = isian({ kode_barang: { sesuai: false, kode_baru: '1.3.3.01.01.02.004' }, alamat_detail: { sesuai: false, seharusnya: 'x' } })
    const t = temuanDariIsian(s, ctx([]))
    expect(t.every(x => x.status !== 'selesai')).toBe(true)
  })
})
