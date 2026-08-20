// ============================================================================
// Barang BEKAS yang diterima pertengahan umur (keputusan user 2026-08-20).
//
// Hibah/Tukar Menukar/Hasil Inventarisasi/Perolehan Lainnya bisa berupa barang
// yang DIBANGUN pihak pemberi bertahun-tahun sebelum BAST-nya. Pemkab mengakui
// tahun pembuatannya, jadi barang itu masuk SUDAH membawa akumulasi penyusutan
// — bukan mulai umur baru sejak BAST.
//
// Posisinya dihitung saat approve (PerolehanManual `checkpointBekas`) lalu
// DIBEKUKAN di payload baris ledger; engine tinggal melanjutkan dari situ.
// Berkas ini mengunci sisi engine-nya.
//
// Ditulis terpisah dari penyusutan.test.ts karena sifatnya beda: yang di sana
// KARAKTERISASI (mengunci perilaku yang sudah ada), yang di sini menetapkan
// perilaku BARU.
// ============================================================================
import { describe, it, expect } from 'vitest'
import { hitungJadwalAset, type TrxLedger, type AsetEngine } from './penyusutan'

const KODE_PM = '1.3.2.02.01.02.003' // Peralatan & Mesin → disusutkan
const MASA_TAHUN = 10                // → 20 semester
const NILAI = 100_000_000            // → beban 5.000.000/semester

const aset = (over: Partial<AsetEngine> = {}): AsetEngine => ({
  id: 'aset-1', kode: KODE_PM, nilai_perolehan: NILAI,
  intra_ekstra: 'intra', tgl_perolehan: '2024-01-05', ...over,
})

const trx = (over: Partial<TrxLedger> & Pick<TrxLedger, 'jenis' | 'periode'>): TrxLedger => ({
  tanggal: `${over.periode.slice(0, 4)}-0${over.periode.endsWith('S1') ? '3' : '9'}-01`,
  nilai: 0, payload: {}, created_at: `${over.periode.slice(0, 4)}-01-01T00:00:00Z`, ...over,
})

/** Baris perolehan manual BER-checkpoint — bentuk payloadnya sama persis dengan
 *  `pemecahan_masuk`, itu sebabnya engine bisa memakai satu cabang yang sama. */
const bekas = (o: {
  jenis?: string; periode?: string; nilai?: number
  nilaiBuku?: number; akumulasi?: number; sisaSmt?: number; masaSmt?: number; bebanSmt?: number
} = {}): TrxLedger => trx({
  jenis: o.jenis ?? 'hibah_masuk',
  periode: o.periode ?? '2026-S1',
  nilai: o.nilai ?? NILAI,
  payload: {
    tgl_perolehan_asli: '2024-01-05',
    nilai_buku_awal: o.nilaiBuku ?? 80_000_000,
    akumulasi: o.akumulasi ?? 20_000_000,
    sisa_masa_manfaat_smt: o.sisaSmt ?? 16,
    masa_manfaat_smt: o.masaSmt ?? 20,
    beban_per_smt: o.bebanSmt ?? 5_000_000,
  },
})

const jalankan = (a: AsetEngine, trxs: TrxLedger[], target: string) =>
  hitungJadwalAset(a, trxs, new Map([[KODE_PM, MASA_TAHUN]]), [], target)

describe('perolehan manual — barang bekas (checkpoint di payload)', () => {
  it('melanjutkan akumulasi bawaan, bukan mulai dari nol', () => {
    // Dibangun 2024-S1, diserahkan 2026-S1 → 4 semester sudah terpakai
    // (2024-S1, 2024-S2, 2025-S1, 2025-S2) = akumulasi 20jt dari 20 semester.
    const hasil = jalankan(aset(), [bekas()], '2026-S1')

    expect(hasil).toHaveLength(1)
    const r = hasil[0]
    expect(r.periode).toBe('2026-S1')
    expect(r.nilai_perolehan).toBe(NILAI)      // perolehan PENUH, bukan nilai buku
    expect(r.nilai_buku_awal).toBe(80_000_000) // posisi saat diterima
    expect(r.beban).toBe(5_000_000)
    expect(r.akumulasi).toBe(25_000_000)       // 20jt bawaan + 5jt semester ini
    expect(r.nilai_buku_akhir).toBe(75_000_000)
    expect(r.sisa_semester).toBe(15)
  })

  it('TIDAK menghitung ulang periode sebelum BAST — tahun terkunci tak tersentuh', () => {
    // Barangnya "ada" sejak 2024, tapi jadwalnya HANYA boleh mulai di periode
    // BAST. Kalau engine memundurkan titik mulainya, ia akan menghasilkan baris
    // 2024–2025 yang periodenya sudah dikunci & sudah dilaporkan.
    const hasil = jalankan(aset(), [bekas()], '2026-S2')
    expect(hasil.map(r => r.periode)).toEqual(['2026-S1', '2026-S2'])
  })

  it('barang yang umurnya sudah HABIS sebelum diserahkan: nilai buku 0, tak menyusut lagi', () => {
    const hasil = jalankan(
      aset(),
      [bekas({ akumulasi: NILAI, nilaiBuku: 0, sisaSmt: 0 })],
      '2026-S1',
    )
    const r = hasil[0]
    expect(r.akumulasi).toBe(NILAI)
    expect(r.nilai_buku_akhir).toBe(0)
    // Sisa semester nol → tak boleh ada beban baru; kalau ini gagal, engine
    // menyusutkan barang yang sudah habis umurnya sampai nilai bukunya minus.
    expect(r.beban).toBe(0)
  })

  it('tanpa checkpoint di payload → perilaku LAMA persis (umur penuh, akumulasi 0)', () => {
    // Ini yang menjamin seluruh baris perolehan yang SUDAH ADA di produksi tak
    // berubah angkanya sedikit pun oleh perubahan 2026-08-20.
    const hasil = jalankan(
      aset(),
      [trx({ jenis: 'hibah_masuk', periode: '2026-S1', nilai: NILAI })],
      '2026-S1',
    )
    const r = hasil[0]
    expect(r.akumulasi).toBe(5_000_000)        // baru satu semester
    expect(r.nilai_buku_akhir).toBe(95_000_000)
    expect(r.sisa_semester).toBe(19)
  })

  it('berlaku untuk keempat jenis Cara Perolehan manual', () => {
    for (const jenis of ['hibah_masuk', 'tukar_menukar', 'hasil_inventarisasi', 'perolehan_lainnya']) {
      const r = jalankan(aset(), [bekas({ jenis })], '2026-S1')[0]
      expect(r, jenis).toBeDefined()
      expect(r.akumulasi, jenis).toBe(25_000_000)
    }
  })
})
