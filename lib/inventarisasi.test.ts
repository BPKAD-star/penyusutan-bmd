import { describe, it, expect } from 'vitest'
import {
  kekuranganLki, klasifikasiLhi, konfigLki, labelPosisi, labelTransaksi, type InvBaris, type InvJawaban,
} from './inventarisasi'
import { belumDiinventarisasi } from './inventarisasiData'

const aset = (jawaban: InvJawaban) => ({ aset_id: 'a-1', jawaban })
const baru = (jawaban: InvJawaban) => ({ aset_id: null, jawaban })

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
      alamat: { sesuai: false },
      no_rangka: { sesuai: false, seharusnya: 'MH1JB' },
    }))
    expect(k).toContain('Nama Spesifikasi Barang (D) yang seharusnya')
    expect(k).toContain('Kode Barang yang seharusnya (B–C)')
    expect(k).toContain('Alamat yang seharusnya (J)')
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

describe('kekuranganLki — BMD Belum Tercatat (III.A.7)', () => {
  it('kode, jumlah, satuan, kondisi wajib', () => {
    expect(kekuranganLki(baru({}))).toEqual(['Kode Barang', 'Jumlah', 'Satuan Barang', 'Kondisi Barang'])
    expect(kekuranganLki(baru({ baru: { kode_barang: '1.3.2.01', jumlah: 1, satuan: 'Unit', kondisi: 'B' } }))).toEqual([])
  })

  it('jumlah 0 / negatif tak sah', () => {
    expect(kekuranganLki(baru({ baru: { kode_barang: 'x', jumlah: 0, satuan: 'Unit', kondisi: 'B' } }))).toEqual(['Jumlah'])
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

describe('konfigLki — atribusi digerbang, merekTipe/nomorKendaraan/titikKoordinat diturunkan dari GOLONGAN_FIELDS (2026-09-25)', () => {
  it('atribusi hanya untuk golongan yang lazim direhab/upgrade & digabung ke induk', () => {
    expect(konfigLki('1.3.2').atribusi).toBe(true) // Peralatan & Mesin
    expect(konfigLki('1.3.3').atribusi).toBe(true) // Gedung & Bangunan
    expect(konfigLki('1.3.4').atribusi).toBe(true) // Jalan, Jaringan & Irigasi
    expect(konfigLki('1.5.3').atribusi).toBe(true) // Aset Tidak Berwujud
    expect(konfigLki('1.3.1').atribusi).toBe(false) // Tanah
    expect(konfigLki('1.3.5').atribusi).toBe(false) // Aset Tetap Lainnya
    expect(konfigLki('1.3.6').atribusi).toBe(false) // KDP
    expect(konfigLki('1.5.4').atribusi).toBe(false) // Aset Lain-Lain
  })

  it('titik koordinat kini true untuk SEMUA golongan — register semuanya punya latitude/longitude', () => {
    for (const g of ['1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.5.3', '1.5.4']) {
      expect(konfigLki(g).titikKoordinat).toBe(true)
    }
  })

  it('merekTipe & nomorKendaraan tetap sama seperti sebelum diturunkan dari GOLONGAN_FIELDS', () => {
    expect(konfigLki('1.3.2').merekTipe).toBe(true)
    expect(konfigLki('1.3.5').merekTipe).toBe(true)
    expect(konfigLki('1.3.6').merekTipe).toBe(true)
    expect(konfigLki('1.5.3').merekTipe).toBe(true)
    expect(konfigLki('1.5.4').merekTipe).toBe(true)
    expect(konfigLki('1.3.1').merekTipe).toBe(false)
    expect(konfigLki('1.3.3').merekTipe).toBe(false)
    expect(konfigLki('1.3.4').merekTipe).toBe(false)

    expect(konfigLki('1.3.2').nomorKendaraan).toBe(true)
    for (const g of ['1.3.1', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.5.3', '1.5.4']) {
      expect(konfigLki(g).nomorKendaraan).toBe(false)
    }
  })

  it('golongan manual (jijTeknis/pemakaiRumahNegara/tanahMilik/hilangVsTidakDitemukan) tak berubah', () => {
    expect(konfigLki('1.3.4').jijTeknis).toBe(true)
    expect(konfigLki('1.3.3').pemakaiRumahNegara).toBe(true)
    expect(konfigLki('1.3.3').tanahMilik).toBe(true)
    expect(konfigLki('1.3.4').tanahMilik).toBe(true)
    expect(konfigLki('1.3.2').hilangVsTidakDitemukan).toBe(true)
    expect(konfigLki('1.3.1').hilangVsTidakDitemukan).toBe(false)
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
