// Penjaga alat baca PENGELOLAAN Asisten AI. Yang dikunci kelas kesalahan yang
// SENYAP: daftar jenis koreksi yang menyimpang dari Laporan Koreksi, nilai
// perjanjian pemanfaatan yang terhitung berkali-kali, koreksi yang sudah
// dibatalkan ikut dihitung, dan menu yang GAGAL dibaca terbaca sbg "tidak ada".
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  JENIS_KOREKSI_CHAT, MENU_PENGELOLAAN, LABEL_MENU, jumlahNilai, muatMenu, rekapPengelolaan, daftarPengelolaan,
  type Butir, type KonteksPengelolaan,
} from './pengelolaan'

const AKAR = path.resolve(__dirname, '../..')

// ── Klien palsu yang MENGHORMATI eq / in / gt per tabel ─────────────────────
type Baris = Record<string, unknown>
function klien(tabel: Record<string, Baris[]>, gagal: string[] = []) {
  return {
    from(nama: string) {
      const k: { eq: [string, unknown][]; in: [string, unknown[]][]; gt: [string, number][] } = { eq: [], in: [], gt: [] }
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'order', 'limit', 'or', 'like', 'lte', 'gte', 'not', 'is']) b[m] = () => b
      b.eq = (c: string, v: unknown) => { k.eq.push([c, v]); return b }
      b.in = (c: string, v: unknown[]) => { k.in.push([c, v]); return b }
      b.gt = (c: string, v: number) => { k.gt.push([c, v]); return b }
      b.then = (ok: (v: unknown) => unknown) => {
        if (gagal.includes(nama)) return Promise.resolve({ data: null, error: { message: `tabel ${nama} timeout` } }).then(ok)
        const rows = (tabel[nama] || [])
          .filter(r => k.eq.every(([c, v]) => r[c] === v) && k.in.every(([c, v]) => v.includes(r[c]))
            && k.gt.every(([c, v]) => (r[c] as number) > v))
          .sort((a, c) => (Number(a.id) || 0) - (Number(c.id) || 0))
        return Promise.resolve({ data: rows, error: null }).then(ok)
      }
      return b
    },
  } as never
}

const K = (over: Partial<KonteksPengelolaan> = {}): KonteksPengelolaan => ({
  lingkup: { skpdId: null, desc: null, label: 'SELURUH KABUPATEN' },
  periode: '2026', hariIni: '2026-09-30', namaSkpd: new Map([[28, 'BKAD'], [50, 'Dinas Lain']]), ...over,
})
const butir = (b: Partial<Butir>): Butir => ({
  kelompok: 'x', tanggal: '2026-01-01', noDok: '-', skpd: '-', barang: '-', nibar: '-', kode: '-', nilai: 0, rinci: [], ...b,
})

describe('bentuk dasar', () => {
  it('tiap menu punya label', () => {
    for (const m of MENU_PENGELOLAAN) expect(LABEL_MENU[m], m).toBeTruthy()
  })

  it('JENIS_KOREKSI_CHAT KEMBAR dgn JENIS_KOREKSI di LaporanKoreksi.tsx', () => {
    // Komponen itu 'use client' — konstantanya tak bisa diimpor ke route server,
    // jadi kesamaannya dijaga di sini. Beda satu jenis = chatbot & Laporan
    // Koreksi menyebut jumlah berbeda tanpa satu pun error.
    const src = fs.readFileSync(path.join(AKAR, 'components/pelaporan/LaporanKoreksi.tsx'), 'utf8')
    const m = src.match(/const JENIS_KOREKSI = \[([\s\S]*?)\] as const/)
    expect(m, 'daftar JENIS_KOREKSI tak terbaca — pemindaian rusak').toBeTruthy()
    const dariKomponen = [...m![1].matchAll(/'([a-z_]+)'/g)].map(x => x[1])
    expect(dariKomponen.length).toBeGreaterThan(0)
    expect([...JENIS_KOREKSI_CHAT].sort()).toEqual(dariKomponen.sort())
  })

  it('HANYA-BACA: tak ada insert/update/upsert/delete/rpc', () => {
    const src = fs.readFileSync(path.join(__dirname, 'pengelolaan.ts'), 'utf8')
    expect(src).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/)
  })
})

describe('jumlahNilai', () => {
  it('nilai ber-kunciNilai dihitung SEKALI per kunci (perjanjian 3 barang ≠ 3× nilainya)', () => {
    expect(jumlahNilai([
      butir({ nilai: 100, kunciNilai: 'h1' }), butir({ nilai: 100, kunciNilai: 'h1' }),
      butir({ nilai: 100, kunciNilai: 'h1' }), butir({ nilai: 40, kunciNilai: 'h2' }),
    ])).toBe(140)
  })
  it('null (tanpa nilai, mis. Pinjam Pakai) dilewati; tanpa kunci dijumlah biasa', () => {
    expect(jumlahNilai([butir({ nilai: null }), butir({ nilai: 5 }), butir({ nilai: 7 })])).toBe(12)
  })
})

// ── Koreksi: satu-satunya logika yang DISALIN dari komponennya ──────────────
const ASET = (skpd: number) => ({ nibar: 'N', nama_barang: 'Meja', kode: '1.3.2.05.01.01.001', skpd_id: skpd })
const HDR = (skpd: number) => ({ no_sk: 'SK-1', tanggal: '2026-08-01', skpd_id: skpd, keterangan: null })
const LEDGER_KOREKSI: Baris[] = [
  { id: 1, jenis: 'koreksi_nilai', periode: '2026-S2', tanggal: '2026-08-01', nilai: 500, created_by: 'u1', aset_id: 'a1',
    payload: { nilai_lama: 1000, nilai_perolehan_baru: 1500 }, header: HDR(28), aset: ASET(28), keterangan: null },
  // Sudah DIBATALKAN (lihat baris id 9) — tak boleh dihitung.
  { id: 2, jenis: 'koreksi_nilai', periode: '2026-S2', tanggal: '2026-08-02', nilai: 9000, created_by: 'u1', aset_id: 'a2',
    payload: null, header: HDR(28), aset: ASET(28), keterangan: null },
  // Perbaikan data admin (created_by null) — disembunyikan tapi DISEBUT.
  { id: 3, jenis: 'koreksi_pencatatan_ganda', periode: '2026-S2', tanggal: '2026-08-03', nilai: 0, created_by: null, aset_id: 'a3',
    payload: null, header: null, aset: ASET(28), keterangan: null },
  // Dicatat SKPD 50; asetnya kini di SKPD 28 — SKPD-nya ikut HEADER (50).
  { id: 4, jenis: 'koreksi_spesifikasi', periode: '2026-S2', tanggal: '2026-08-04', nilai: 0, created_by: 'u2', aset_id: 'a4',
    payload: null, header: HDR(50), aset: ASET(28), keterangan: null },
  { id: 9, jenis: 'batal_koreksi_nilai', periode: '2026-S2', tanggal: '2026-08-05', nilai: 0, created_by: 'u1', aset_id: 'a2',
    payload: { target_trx_id: 2 }, header: null, aset: null, keterangan: null },
]

describe('koreksi (aturan Laporan Koreksi)', () => {
  it('membuang yang dibatalkan & perbaikan data admin, dan MENYEBUT jumlah yang disembunyikan', async () => {
    const h = await muatMenu(klien({ transaksi_bmd: LEDGER_KOREKSI }), 'koreksi', K())
    expect(h.butir.map(b => b.nilai).sort()).toEqual([0, 500])        // id 1 & 4 saja
    expect(h.catatan.join(' ')).toContain('1 baris perbaikan data admin')
    expect(h.butir.find(b => b.nilai === 500)!.rinci.join(' ')).toMatch(/1\.000,00 → Rp1\.500,00/)
  })
  it('lingkup SKPD memakai SKPD PENCATAT jurnal (header), bukan posisi barang hari ini', async () => {
    const sb = klien({ transaksi_bmd: LEDGER_KOREKSI })
    const bkad = await muatMenu(sb, 'koreksi', K({ lingkup: { skpdId: 28, desc: [28], label: 'BKAD' } }))
    expect(bkad.butir).toHaveLength(1)                                  // id 1; id 4 milik SKPD 50
    const lain = await muatMenu(sb, 'koreksi', K({ lingkup: { skpdId: 50, desc: [50], label: 'Dinas Lain' } }))
    expect(lain.butir).toHaveLength(1)
    expect(lain.butir[0].skpd).toBe('Dinas Lain')
  })
})

describe('kapitalisasi & pemanfaatan (lewat pemuat laporannya)', () => {
  it('kapitalisasi: yang dibatalkan dibuang; nilai = selisih nilai perolehan induk', async () => {
    const sb = klien({ transaksi_bmd: [
      { id: 1, jenis: 'kapitalisasi', periode: '2026-S1', tanggal: '2026-03-01', skpd_asal: 28, skpd: { nama: 'BKAD' },
        aset: { nibar: 'N1', nama_barang: 'Gedung A', kode: '1.3.3.01.01.01.001' },
        payload: { no_dokumen: 'D-1', snapshot: { np_lama: 1000, np_baru: 1400, nb_lama: 800, nb_baru: 1200 }, anak: [{ id: 'x', nibar: 'NX', nama: 'Rehab', nilai: 400 }] } },
      { id: 2, jenis: 'kapitalisasi', periode: '2026-S1', tanggal: '2026-03-02', skpd_asal: 28, skpd: { nama: 'BKAD' },
        aset: { nibar: 'N2', nama_barang: 'Gedung B', kode: '1.3.3.01.01.01.001' }, payload: { anak: [] } },
      { id: 3, jenis: 'batal_kapitalisasi', periode: '2026-S1', tanggal: '2026-03-02', skpd_asal: 28, skpd: null, aset: null,
        payload: { target_trx_id: 2 } },
    ] })
    const h = await muatMenu(sb, 'kapitalisasi', K())
    expect(h.butir).toHaveLength(1)
    expect(h.butir[0].nilai).toBe(400)
    expect(h.butir[0].rinci.join(' ')).toContain('1 barang diserap: Rehab')
  })

  it('pemanfaatan: perjanjian 2 barang → nilainya dijumlah SEKALI; yang dibatalkan hilang', async () => {
    const aset = (id: string) => ({ id, kode: '1.3.3.01.01.01.001', uraian_barang: 'Gedung', nibar: `N${id}`, nama_barang: `Ruang ${id}`,
      merek_tipe: null, spesifikasi_lainnya: null, no_polisi: null, no_rangka: null, no_mesin: null, luas: null })
    const sb = klien({
      jurnal_header: [{ id: 'h1', no_sk: 'PJ-1', tanggal: '2026-01-05', skpd_id: 28, kategori: 'pemanfaatan',
        payload: { jenis_pemanfaatan: 'sewa', mitra: 'Bank X', mulai: '2026-01-01', berakhir: '2026-12-31', nilai_pemanfaatan: 1200 } }],
      admin_skpd: [{ id: 28, nama: 'BKAD' }],
      transaksi_bmd: [
        { id: 1, header_id: 'h1', jenis: 'pemanfaatan', nilai: 0, payload: { lingkup: 'seluruh' }, aset: aset('a') },
        { id: 2, header_id: 'h1', jenis: 'pemanfaatan', nilai: 0, payload: { lingkup: 'sebagian', bagian: 'Lt. 1' }, aset: aset('b') },
        { id: 3, header_id: 'h1', jenis: 'pemanfaatan', nilai: 0, payload: null, aset: aset('c') },
        { id: 4, header_id: 'h1', jenis: 'batal_pemanfaatan', nilai: 0, payload: null, aset: aset('c') },
      ],
    })
    const h = await muatMenu(sb, 'pemanfaatan', K())
    expect(h.butir).toHaveLength(2)
    expect(jumlahNilai(h.butir)).toBe(1200)
    expect(h.butir[0].kelompok).toBe('Sewa · Aktif')
  })
})

describe('jawaban', () => {
  it('menu yang GAGAL dibaca ditulis GAGAL — tak pernah "tidak ada", dan menu lain tetap terbaca', async () => {
    const sb = klien({ transaksi_bmd: LEDGER_KOREKSI }, ['jurnal_header'])
    const r = await rekapPengelolaan(sb, K(), null)
    expect(r).toMatch(/Pemanfaatan: GAGAL dibaca — .*jurnal_header timeout/)
    expect(r).toContain('JANGAN anggap nol')
    expect(r).toMatch(/■ Koreksi: 2 baris/)
  })
  it('daftar: kata_kunci menyaring, dan jumlah asalnya tetap disebut saat kosong', async () => {
    const sb = klien({ transaksi_bmd: LEDGER_KOREKSI })
    const ada = await daftarPengelolaan(sb, K(), 'koreksi', 'meja')
    expect(ada).toMatch(/2 baris/)
    const kosong = await daftarPengelolaan(sb, K(), 'koreksi', 'traktor')
    expect(kosong).toContain('tidak ada yang cocok (dari 2 baris)')
  })
})
