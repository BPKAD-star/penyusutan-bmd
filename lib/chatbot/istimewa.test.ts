import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { daftarIstimewa, penggunaIstimewa } from './istimewa'
import { TOOL_DEFS_ADMIN, NAMA_TOOL_ADMIN, jalankanToolAdmin } from './toolsAdmin'
import { TOOL_DEFS, jalankanTool } from './tools'

const ID = 'fa915199-3df2-4c79-807f-54aad3c8381e'

describe('daftarIstimewa (fail-closed)', () => {
  it('membaca UUID dipisah koma, mengabaikan spasi & huruf besar', () => {
    const s = daftarIstimewa(` ${ID.toUpperCase()} , d6e5ea72-e34d-4be5-9bda-da4ffada3dfd `)
    expect(s.has(ID)).toBe(true)
    expect(s.size).toBe(2)
  })
  it('env kosong / tak terdefinisi = tak ada yang istimewa', () => {
    expect(daftarIstimewa(undefined).size).toBe(0)
    expect(daftarIstimewa('').size).toBe(0)
  })
  it('menolak yang bukan UUID (mis. nama, email, id pegawai salah ketik)', () => {
    expect(daftarIstimewa('adimas, kabkediribpkad@gmail.com, 123').size).toBe(0)
  })
})

describe('penggunaIstimewa', () => {
  const asal = process.env.CHATBOT_USER_ISTIMEWA
  afterEach(() => { process.env.CHATBOT_USER_ISTIMEWA = asal })
  it('hanya id yang terdaftar', () => {
    process.env.CHATBOT_USER_ISTIMEWA = ID
    expect(penggunaIstimewa(ID)).toBe(true)
    expect(penggunaIstimewa('d6e5ea72-e34d-4be5-9bda-da4ffada3dfd')).toBe(false)
    expect(penggunaIstimewa(null)).toBe(false)
    expect(penggunaIstimewa(undefined)).toBe(false)
  })
})

describe('alat admin', () => {
  it('nama tidak bertabrakan dengan alat biasa', () => {
    const biasa = new Set(TOOL_DEFS.map(t => t.name))
    for (const n of NAMA_TOOL_ADMIN) expect(biasa.has(n)).toBe(false)
  })
  it('HANYA-BACA: berkas tak memanggil insert/update/upsert/delete', () => {
    // SELURUH berkas alat istimewa, bukan cuma toolsAdmin.ts — alatnya kini
    // tersebar di beberapa berkas, dan berkas baru yang lolos dari pemindai ini
    // bisa menulis tanpa ada yang memerahkan.
    for (const f of ['toolsAdmin.ts', 'perolehan.ts', 'pengelolaan.ts', 'skpdPohon.ts', 'lraKir.ts']) {
      expect(readFileSync(join(__dirname, f), 'utf8'), f).not.toMatch(/\.(insert|update|upsert|delete)\(/)
    }
    const src = readFileSync(join(__dirname, 'toolsAdmin.ts'), 'utf8')
    // rpc hanya boleh fungsi baca yang dikenal
    const rpc = [...src.matchAll(/\.rpc\('([a-z_]+)'/g)].map(m => m[1])
    expect(rpc).toEqual(['fn_rekap_bmd', 'fn_chatbot_hitung_barang'])
  })
  it('alat tak dikenal ditolak dgn GAGAL:, bukan hasil kosong', async () => {
    const r = await jalankanToolAdmin({} as never, 'hapus_semua', {})
    expect(r).toMatch(/^GAGAL:/)
  })
  it('validasi masukan: periode & skpd_id ngawur ditolak sebelum menyentuh DB', async () => {
    const boom = new Proxy({}, { get() { throw new Error('DB tersentuh') } }) as never
    expect(await jalankanToolAdmin(boom, 'rekap_bmd_skpd', { periode: '2026' })).toMatch(/^GAGAL:/)
    expect(await jalankanToolAdmin(boom, 'rekap_bmd_skpd', { periode: '2026-S1', skpd_id: 'abc' })).toMatch(/^GAGAL:/)
    expect(await jalankanToolAdmin(boom, 'status_rkbmd', { tahun_anggaran: 1 })).toMatch(/^GAGAL:/)
    expect(await jalankanToolAdmin(boom, 'status_rkbmd', { tahun_anggaran: 2027, jenis: 'x' })).toMatch(/^GAGAL:/)
  })
  it('hitung_barang: masukan ngawur ditolak sebelum menyentuh DB', async () => {
    const boom = new Proxy({}, { get() { throw new Error('DB tersentuh') } }) as never
    expect(await jalankanToolAdmin(boom, 'hitung_barang', {})).toMatch(/^GAGAL:/)
    expect(await jalankanToolAdmin(boom, 'hitung_barang', { kode: '1.3.2; drop table aset' })).toMatch(/^GAGAL:/)
    expect(await jalankanToolAdmin(boom, 'hitung_barang', { kata_kunci: 'laptop', skpd_id: 'abc' })).toMatch(/^GAGAL:/)
  })
  it('hitung_barang: tiap KODE dilaporkan terpisah, sub-unit BKAD ikut, ID dikirim ke fungsi', async () => {
    const skpd = [
      { id: 28, nama: 'Badan Keuangan dan Aset Daerah', parent_id: null, level: 1 },
      { id: 29, nama: 'Bidang Aset', parent_id: 28, level: 2 },
      { id: 50, nama: 'Dinas Lain', parent_id: null, level: 1 },
    ]
    let dikirim: Record<string, unknown> | null = null
    const sb = {
      from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: skpd, error: null }) }) }) }),
      rpc: async (fn: string, args: Record<string, unknown>) => {
        expect(fn).toBe('fn_chatbot_hitung_barang')
        dikirim = args
        return { data: [
          { kode: '1.3.2.10.01.02.002', uraian: 'Lap Top', skpd_id: null, jumlah: 21, nilai_perolehan: 266422581.15 },
          { kode: '1.3.2.05.01.05.094', uraian: 'Laptop', skpd_id: null, jumlah: 3, nilai_perolehan: 30000000 },
        ], error: null }
      },
    } as never
    const r = await jalankanToolAdmin(sb, 'hitung_barang', { kata_kunci: 'laptop', skpd_id: 28 })
    expect(dikirim).toMatchObject({ p_kata: 'laptop', p_kode: null, p_skpd_ids: [28, 29], p_per_skpd: false })
    expect(r).toContain('beserta 1 unit di bawahnya')
    expect(r).toMatch(/1\.3\.2\.10\.01\.02\.002 · Lap Top: 21 unit/)
    expect(r).toMatch(/1\.3\.2\.05\.01\.05\.094 · Laptop: 3 unit/)
    expect(r).toContain('TOTAL: 24 unit')
  })
  it('hitung_barang: per SKPD se-kabupaten menggabungkan unit ke SKPD induk', async () => {
    const skpd = [
      { id: 28, nama: 'BKAD', parent_id: null, level: 1 },
      { id: 29, nama: 'Bidang Aset', parent_id: 28, level: 2 },
    ]
    const sb = {
      from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: skpd, error: null }) }) }) }),
      rpc: async () => ({ data: [
        { kode: 'K1', uraian: 'X', skpd_id: 28, jumlah: 2, nilai_perolehan: 10 },
        { kode: 'K1', uraian: 'X', skpd_id: 29, jumlah: 5, nilai_perolehan: 20 },
      ], error: null }),
    } as never
    const r = await jalankanToolAdmin(sb, 'hitung_barang', { kata_kunci: 'x', per_skpd: true })
    expect(r).toMatch(/- BKAD: 7 unit/)
    expect(r).not.toContain('Bidang Aset')
  })
  it('hitung_barang: error database TIDAK berubah jadi "tidak ada barang"', async () => {
    const sb = { rpc: async () => ({ data: null, error: { message: 'kata kunci terlalu umum: cocok dengan 90 kode barang' } }) } as never
    const r = await jalankanToolAdmin(sb, 'hitung_barang', { kata_kunci: 'meja' })
    expect(r).toMatch(/^GAGAL/)
    expect(r).toContain('terlalu umum')
  })
  it('hitung_barang: hasil kosong dinyatakan kosong, bukan GAGAL', async () => {
    const sb = { rpc: async () => ({ data: [], error: null }) } as never
    expect(await jalankanToolAdmin(sb, 'hitung_barang', { kata_kunci: 'zzz' })).toMatch(/^Tidak ada barang aktif/)
  })
  it('setiap alat punya skema yang lengkap', () => {
    for (const t of TOOL_DEFS_ADMIN) {
      expect(t.description.length).toBeGreaterThan(20)
      expect(t.input_schema.type).toBe('object')
    }
  })
})

// ── rekap_perolehan ─────────────────────────────────────────────────────────
// Klien palsu yang MENGHORMATI filter (eq/in/gt) — supaya yang diuji benar-benar
// logika alatnya (saringan void, periode, SKPD, pengelompokan), bukan sekadar
// bentuk panggilannya.
type Kondisi = { eq: Record<string, unknown>; in: Record<string, unknown[]>; gt: Record<string, number> }
function klienPerolehan(ledger: Record<string, unknown>[], skpd: Record<string, unknown>[]) {
  const dibangun = (tabel: string) => {
    const k: Kondisi = { eq: {}, in: {}, gt: {} }
    const b: Record<string, unknown> = {
      select: () => b, order: () => b, limit: () => b,
      eq: (c: string, v: unknown) => { k.eq[c] = v; return b },
      in: (c: string, v: unknown[]) => { k.in[c] = v; return b },
      gt: (c: string, v: number) => { k.gt[c] = v; return b },
      then: (ok: (v: unknown) => unknown) => {
        if (tabel === 'admin_skpd') return Promise.resolve({ data: skpd, error: null }).then(ok)
        let rows = ledger.filter(r =>
          Object.entries(k.eq).every(([c, v]) => r[c] === v)
          && Object.entries(k.in).every(([c, v]) => v.includes(r[c]))
          && Object.entries(k.gt).every(([c, v]) => (r[c] as number) > v))
        rows = rows.sort((a, c) => (a.id as number) - (c.id as number)).slice(0, 1000)
        return Promise.resolve({ data: rows, error: null }).then(ok)
      },
    }
    return b
  }
  return { from: dibangun } as never
}
const SKPD = [
  { id: 28, nama: 'BKAD', parent_id: null, level: 1 },
  { id: 29, nama: 'Bidang Aset', parent_id: 28, level: 2 },
  { id: 50, nama: 'Dinas Lain', parent_id: null, level: 1 },
]
const AKTIF = { status: 'aktif', kode: '1.3.2.10.01.02.002' }
const TANAH = { status: 'aktif', kode: '1.3.1.01.01.01.001' }
const LEDGER = [
  { id: 1, jenis: 'hibah_masuk', periode: '2026-S1', nilai: 100, skpd_tujuan: 28, aset_id: 'a1', aset: AKTIF },
  { id: 2, jenis: 'hibah_masuk', periode: '2026-S2', nilai: 200, skpd_tujuan: 29, aset_id: 'a2', aset: TANAH },
  { id: 3, jenis: 'hibah_masuk', periode: '2026-S2', nilai: 400, skpd_tujuan: 50, aset_id: 'a3', aset: AKTIF },
  // Dibatalkan (asetnya non-aktif + ada batal_hibah_masuk) — HARUS dibuang.
  { id: 4, jenis: 'hibah_masuk', periode: '2026-S1', nilai: 9000, skpd_tujuan: 28, aset_id: 'a4', aset: { status: 'dihapus', kode: '1.3.2.10.01.02.002' } },
  { id: 5, jenis: 'pengadaan', periode: '2026-S1', nilai: 50, skpd_tujuan: 28, aset_id: 'a5', aset: AKTIF },
  // Baris pembatal itu sendiri (dibaca alat void lewat in('jenis', VOID_JENIS)).
  { id: 6, jenis: 'batal_hibah_masuk', periode: '2026-S1', nilai: 0, skpd_tujuan: null, aset_id: 'a4', aset: null },
]

describe('rekap_perolehan', () => {
  it('menjumlah per cara & membuang transaksi yang dibatalkan (aturan Laporan Perolehan)', async () => {
    const r = await jalankanToolAdmin(klienPerolehan(LEDGER, SKPD), 'rekap_perolehan', { periode: '2026' })
    expect(r).toContain('Hibah: 3 barang · Rp700')          // 100+200+400, BUKAN +9000
    expect(r).toContain('Pengadaan: 1 barang · Rp50')
    expect(r).toContain('TOTAL: 4 barang · Rp750')
    expect(r).toContain('1 transaksi sudah dibuang karena dibatalkan/duplikat')
  })
  it('periode tahun = S1+S2; satu semester = hanya semester itu', async () => {
    const s1 = await jalankanToolAdmin(klienPerolehan(LEDGER, SKPD), 'rekap_perolehan', { periode: '2026-S1', cara: 'hibah_masuk' })
    expect(s1).toContain('Hibah: 1 barang · Rp100')
  })
  it('skpd_id membawa sub-unitnya', async () => {
    const r = await jalankanToolAdmin(klienPerolehan(LEDGER, SKPD), 'rekap_perolehan', { periode: '2026', cara: 'hibah_masuk', skpd_id: 28 })
    expect(r).toContain('beserta 1 unit di bawahnya')
    expect(r).toContain('Hibah: 2 barang · Rp300')          // a1 (BKAD) + a2 (Bidang Aset), tanpa Dinas Lain
  })
  it('per_skpd se-kabupaten menggabungkan unit ke induk, urut nilai terbesar', async () => {
    const r = await jalankanToolAdmin(klienPerolehan(LEDGER, SKPD), 'rekap_perolehan', { periode: '2026', cara: 'hibah_masuk', per_skpd: true })
    expect(r).toMatch(/- Dinas Lain: 1 barang · Rp400[\s\S]*- BKAD: 2 barang · Rp300/)
    expect(r).not.toContain('Bidang Aset')
  })
  it('per_golongan mengelompokkan ke level-3 dari kode aset', async () => {
    const r = await jalankanToolAdmin(klienPerolehan(LEDGER, SKPD), 'rekap_perolehan', { periode: '2026', cara: 'hibah_masuk', per_golongan: true })
    expect(r).toMatch(/- 1\.3\.2 .*: 2 barang · Rp500/)
    expect(r).toMatch(/- 1\.3\.1 .*: 1 barang · Rp200/)
  })
  it('masukan ngawur ditolak sebelum menyentuh DB', async () => {
    const boom = new Proxy({}, { get() { throw new Error('DB tersentuh') } }) as never
    expect(await jalankanToolAdmin(boom, 'rekap_perolehan', { periode: 'tahun ini' })).toMatch(/^GAGAL:/)
    expect(await jalankanToolAdmin(boom, 'rekap_perolehan', { cara: 'penghapusan_sebab_lain' })).toMatch(/^GAGAL:/)
    expect(await jalankanToolAdmin(boom, 'rekap_perolehan', { skpd_id: 'x' })).toMatch(/^GAGAL:/)
  })
  it('kegagalan database menjadi GAGAL:, BUKAN "tidak ada perolehan"', async () => {
    const rusak = { from: () => { const b: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'in', 'gt', 'order', 'limit']) b[m] = () => b
      b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'statement timeout' } }).then(ok); return b } } as never
    const r = await jalankanToolAdmin(rusak, 'rekap_perolehan', { periode: '2026' })
    expect(r).toMatch(/^GAGAL:/)
    expect(r).toContain('statement timeout')
  })
  it('hasil kosong dinyatakan kosong', async () => {
    expect(await jalankanToolAdmin(klienPerolehan([], SKPD), 'rekap_perolehan', { periode: '2030' })).toMatch(/^Tidak ada perolehan/)
  })
  it('memakai JENIS_PEROLEHAN dari lib/bmd (satu sumber), bukan daftar sendiri', () => {
    const src = readFileSync(join(__dirname, 'perolehan.ts'), 'utf8')
    expect(src).toMatch(/JENIS_PEROLEHAN/)
    expect(src).not.toMatch(/'hasil_inventarisasi'/)
  })
})

// ── cari_barang (alat dasar, dipakai SEMUA pengguna) ────────────────────────
describe('cari_barang lewat fn_chatbot_cari_barang', () => {
  const baris = { nibar: 'N1', kode: '1.3.2.02.01.04.001', nama_barang: 'Sepeda Motor', uraian_barang: 'Sepeda Motor',
    merek_tipe: 'Honda', no_polisi: 'AG 3837 GP', no_rangka: 'MH1', no_mesin: 'JF1', nilai_perolehan: 15000000,
    tgl_perolehan: '2019-01-01', intra_ekstra: 'intra', kondisi_barang: 'Baik', skpd_nama: 'BKAD' }

  it('memanggil fungsinya & menampilkan nomor polisi + SKPD pemilik', async () => {
    let dikirim: unknown = null
    const sb = { rpc: async (fn: string, a: unknown) => { expect(fn).toBe('fn_chatbot_cari_barang'); dikirim = a; return { data: [baris], error: null } } } as never
    const r = await jalankanTool(sb, 'cari_barang', { kata_kunci: 'AG 3837 GP' })
    expect(dikirim).toMatchObject({ p_kata: 'AG 3837 GP', p_golongan: null })
    expect(r).toContain('no. polisi AG 3837 GP')
    expect(r).toContain('SKPD BKAD')
  })
  it('kata kunci < 3 karakter ditolak sebelum menyentuh DB (trigram tak terpakai → sapu seluruh tabel)', async () => {
    const boom = new Proxy({}, { get() { throw new Error('DB tersentuh') } }) as never
    expect(await jalankanTool(boom, 'cari_barang', { kata_kunci: 'AG' })).toMatch(/^GAGAL:/)
  })
  it('timeout/galat database → GAGAL, bukan "tidak ada barang"', async () => {
    const sb = { rpc: async () => ({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }) } as never
    const r = await jalankanTool(sb, 'cari_barang', { kata_kunci: 'motor' })
    expect(r).toMatch(/^GAGAL/)
    expect(r).toContain('statement timeout')
  })
  it('fungsi belum terpasang (migrasi telat) → jatuh ke query lama, bukan mati', async () => {
    let lewatTabel = false
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'or', 'like', 'limit']) b[m] = () => b
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [baris], error: null }).then(ok)
    const sb = {
      rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }),
      from: () => { lewatTabel = true; return b },
    } as never
    const r = await jalankanTool(sb, 'cari_barang', { kata_kunci: 'motor' })
    expect(lewatTabel).toBe(true)
    expect(r).toContain('Sepeda Motor')
  })
})
