// ============================================================================
// KDP / Proyek Konstruksi — model PER-BARANG (redesign 2026-07-12).
//
// Paket (proyek_konstruksi) = sampul. KDP Barang = baris `aset` (1.3.6) ditaut
// lewat proyek_barang (+ komponen). Termin/BAST menambah nilai SATU barang.
// Saat siap: reklas gabung beberapa barang → aset tetap; biaya bersama
// (perencanaan/pengawasan/biaya_umum) dibagi PROPORSIONAL ke nilai fisik output.
//
// Tetap satu ledger (transaksi_bmd), append-only. Jenis event:
//   akumulasi_kdp       : termin disetujui → nilai barang KDP naik
//   batal_akumulasi_kdp : koreksi termin (event balik)
//   kdp_selesai_masuk   : aset tetap hasil diakui pd tgl BAPP (baseline penyusutan)
//   kdp_selesai_keluar  : nilai barang KDP turun saat direklas
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import { periodeDariTanggal, klasifikasiKomptabel, fetchBatasKapitalisasi } from '@/lib/bmd'
import { generateNibars } from '@/lib/nibar'
import { ASET_FIELD_COLS, ASET_NUM_COLS } from '@/lib/asetFields'

// ── MODEL MERGE-KE-PENGADAAN: 1 kontrak konstruksi = 1 kartu jurnal_header ──
// (kategori 'konstruksi'). Semua data di payload; aset KDP dibuat SAAT approve.
export type PembayaranKdp = {
  komponen: 'perencanaan' | 'fisik' | 'biaya_umum' | 'pengawasan'
  no_bast?: string | null; tgl_bast: string; kode_rekening?: string | null; nominal: number; keterangan?: string | null
}
// Satu barang KDP dalam kontrak (redesign multi-KDP 2026-07-13): 1 kontrak
// konstruksi bisa berisi BEBERAPA barang (mis. paket jalan → beberapa ruas),
// tiap barang = 1 aset KDP (1.3.6) dgn rincian termin sendiri. Nilai barang =
// TOTAL termin-nya. Approve/unapprove ATOMIK per kontrak (semua barang sekaligus).
export type BarangKdp = {
  key: string
  kode: string                       // kode kodefikasi KDP (golongan 1.3.6)
  nama: string                       // nama barang KDP
  spec?: Record<string, string>      // spesifikasi (Tanah-like)
  foto?: string[]
  pembayaran: PembayaranKdp[]        // termin/BAST barang ini
  aset_id?: string | null            // diisi saat approve (utk unapprove)
}
export type KontrakKonstruksiPayload = {
  nama_pekerjaan: string; sumber?: string
  program?: string | null; kegiatan?: string | null; sub_kegiatan?: string | null
  ppk?: string | null; penyedia?: string | null; nilai_kontrak?: number | null
  keterangan?: string | null
  // INFO saja (bukan auto-kapitalisasi) — reklas & kapitalisasi tetap manual nanti.
  kap_info?: { menambah: boolean; target_aset_id?: string | null; target_nama?: string | null }
  barang?: BarangKdp[]               // MODEL BARU (multi-KDP)
  // ── LEGACY single-KDP (payload versi lama) — dibaca utk kompat & migrasi-on-read ──
  kode_kdp?: string
  pembayaran?: PembayaranKdp[]
  spec?: Record<string, string>
  foto?: string[]
  aset_id?: string | null
}

const newKeyKdp = () => Math.random().toString(36).slice(2)

// Normalisasi payload (lama/baru) → array barang. Payload lama (single-KDP:
// kode_kdp + pembayaran flat) dipetakan jadi SATU barang implisit supaya kontrak
// lama tetap tampil/diproses benar tanpa migrasi data.
export function barangKdpList(p: KontrakKonstruksiPayload): BarangKdp[] {
  if (Array.isArray(p.barang)) return p.barang
  if (p.kode_kdp) return [{
    key: 'legacy', kode: p.kode_kdp, nama: p.nama_pekerjaan,
    spec: p.spec, foto: p.foto, pembayaran: p.pembayaran || [], aset_id: p.aset_id ?? null,
  }]
  return []
}

// Payload tanpa field legacy singleton (dipakai saat menulis ulang payload versi
// baru supaya tak ada dua sumber kebenaran yang ambigu).
function stripLegacy(p: KontrakKonstruksiPayload): KontrakKonstruksiPayload {
  const { kode_kdp: _k, pembayaran: _p, spec: _s, foto: _f, aset_id: _a, ...rest } = p
  return rest
}

const toNumStr = (s: string) => { const n = parseFloat(String(s).replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n }

/**
 * Approve 1 kontrak konstruksi → materialize SEMUA barang KDP sekaligus (atomik):
 * tiap barang = 1 aset KDP (1.3.6) senilai total termin-nya + event akumulasi_kdp
 * per pembayaran. Aset dibuat dulu semua, lalu SELURUH event ledger di-insert
 * dalam satu batch (all-or-nothing) — kalau gagal, semua aset yg terlanjur dibuat
 * disembunyikan (status 'draft') & belum ada satu pun event ledger yg tertulis.
 */
export async function approveKontrakKonstruksi(supabase: SupabaseClient, headerId: string): Promise<{ error?: string }> {
  const { data: hRow } = await supabase.from('jurnal_header').select('id,skpd_id,no_sk,tanggal,payload,approval_status').eq('id', headerId).single()
  const h = hRow as { id: string; skpd_id: number; no_sk: string; tanggal: string; payload: KontrakKonstruksiPayload; approval_status: string } | null
  if (!h) return { error: 'Kontrak tidak ditemukan.' }
  if (h.approval_status === 'disetujui') return { error: 'Kontrak sudah disetujui.' }
  const p = h.payload
  const barangs = barangKdpList(p)
  if (barangs.length === 0) return { error: 'Belum ada barang KDP — tambahkan dulu.' }
  for (const b of barangs) {
    if (!b.kode) return { error: 'Ada barang tanpa kode KDP.' }
    const bayar = b.pembayaran || []
    const total = bayar.reduce((s, x) => s + Number(x.nominal || 0), 0)
    if (bayar.length === 0 || total <= 0) return { error: `Barang "${b.nama || b.kode}" belum ada pembayaran (nilai 0) — lengkapi atau hapus dulu.` }
  }

  const kodeSkpd = await skpdKode(supabase, h.skpd_id)
  const tglBarang = (b: BarangKdp) => (b.pembayaran || []).map(x => x.tgl_bast).sort()[0] || h.tanggal
  const nibarInput = barangs.map(b => ({ key: b.key, kode: b.kode, intraEkstra: 'intra' as const, tahun: String(new Date(tglBarang(b)).getFullYear()) }))
  const nibarMap = await generateNibars(supabase as never, nibarInput, kodeSkpd)

  // Pass 1: buat semua aset KDP (belum ada ledger — aman kalau gagal di tengah).
  const createdAsetIds: string[] = []
  const asetIdByKey = new Map<string, string>()
  for (const b of barangs) {
    const total = (b.pembayaran || []).reduce((s, x) => s + Number(x.nominal || 0), 0)
    const asetRow: Record<string, unknown> = {
      nibar: nibarMap.get(b.key) || null, kode: b.kode,
      uraian_barang: b.nama, nama_barang: b.nama,
      jumlah: 1, nilai_perolehan: total, tgl_perolehan: tglBarang(b), skpd_id: h.skpd_id,
      intra_ekstra: 'intra', cara_perolehan: 'pengadaan', status: 'aktif', foto_paths: b.foto || [],
    }
    for (const k of ASET_FIELD_COLS) { const v = b.spec?.[k]; if (v) asetRow[k] = ASET_NUM_COLS.has(k) ? toNumStr(v) : v }
    const { data: aset, error: aErr } = await supabase.from('aset').insert(asetRow).select('id').single()
    if (aErr || !aset) {
      if (createdAsetIds.length) await supabase.from('aset').update({ status: 'draft' }).in('id', createdAsetIds)
      return { error: `Gagal membuat aset KDP "${b.nama}": ${aErr?.message}` }
    }
    const id = (aset as { id: string }).id
    createdAsetIds.push(id); asetIdByKey.set(b.key, id)
  }

  // Pass 2: SEMUA event akumulasi_kdp dalam satu insert (all-or-nothing).
  const trxRows = barangs.flatMap(b => (b.pembayaran || []).map(x => ({
    aset_id: asetIdByKey.get(b.key), jenis: 'akumulasi_kdp', periode: periodeDariTanggal(x.tgl_bast), tanggal: x.tgl_bast,
    nilai: Number(x.nominal || 0), skpd_tujuan: h.skpd_id, header_id: headerId,
    payload: { komponen: x.komponen, no_bast: x.no_bast || null, kode_rekening: x.kode_rekening || null },
  })))
  const { error: tErr } = await supabase.from('transaksi_bmd').insert(trxRows)
  if (tErr) { await supabase.from('aset').update({ status: 'draft' }).in('id', createdAsetIds); return { error: `Gagal mencatat pembayaran: ${tErr.message}` } }

  const barangOut: BarangKdp[] = barangs.map(b => ({ ...b, aset_id: asetIdByKey.get(b.key) || null }))
  const { data: { user } } = await supabase.auth.getUser()
  const { error: uErr } = await supabase.from('jurnal_header')
    .update({ approval_status: 'disetujui', approved_by: user?.id || null, approved_at: new Date().toISOString(), payload: { ...stripLegacy(p), barang: barangOut } })
    .eq('id', headerId)
  if (uErr) return { error: `Aset tercatat, tapi status kontrak gagal: ${uErr.message}` }
  return {}
}

/**
 * Buka kunci (unapprove) → untuk SEMUA barang KDP: balik tiap pembayaran
 * (batal_akumulasi_kdp) + sembunyikan asetnya (status 'draft'). Kalau kontrak
 * punya 10 barang, ke-10-nya hilang dari Daftar Barang/Penyusutan sampai
 * disetujui ulang. Kontrak → pending, aset_id tiap barang dikosongkan.
 */
export async function unapproveKontrakKonstruksi(supabase: SupabaseClient, headerId: string): Promise<{ error?: string }> {
  const { data: hRow } = await supabase.from('jurnal_header').select('id,payload,approval_status').eq('id', headerId).single()
  const h = hRow as { id: string; payload: KontrakKonstruksiPayload; approval_status: string } | null
  if (!h) return { error: 'Kontrak tidak ditemukan.' }
  if (h.approval_status !== 'disetujui') return { error: 'Kontrak belum disetujui.' }
  const barangs = barangKdpList(h.payload)
  const asetIds = barangs.map(b => b.aset_id).filter((x): x is string => !!x)

  if (asetIds.length) {
    // Event balik per akumulasi (append-only), satu batch utk semua barang.
    const { data: trxs } = await supabase.from('transaksi_bmd').select('aset_id,tanggal,nilai').in('aset_id', asetIds).eq('jenis', 'akumulasi_kdp')
    const balik = ((trxs || []) as { aset_id: string; tanggal: string; nilai: number }[]).map(t => ({
      aset_id: t.aset_id, jenis: 'batal_akumulasi_kdp', periode: periodeDariTanggal(t.tanggal), tanggal: t.tanggal,
      nilai: -Number(t.nilai || 0), header_id: headerId, payload: {},
    }))
    if (balik.length) {
      const { error: bErr } = await supabase.from('transaksi_bmd').insert(balik)
      if (bErr) return { error: `Gagal mencatat pembatalan: ${bErr.message}` }
    }
    await supabase.from('aset').update({ status: 'draft', nilai_perolehan: 0 }).in('id', asetIds)
  }

  const barangCleared: BarangKdp[] = barangs.map(b => ({ ...b, aset_id: null }))
  const { error } = await supabase.from('jurnal_header')
    .update({ approval_status: 'pending', approved_by: null, approved_at: null, payload: { ...stripLegacy(h.payload), barang: barangCleared } })
    .eq('id', headerId)
  if (error) return { error: `Gagal buka kunci: ${error.message}` }
  return {}
}

const hariIni = () => new Date().toISOString().slice(0, 10)

async function skpdKode(supabase: SupabaseClient, skpdId: number): Promise<string> {
  const { data } = await supabase.from('admin_skpd').select('kode_skpd').eq('id', skpdId).single()
  return (data as { kode_skpd?: string } | null)?.kode_skpd || ''
}
async function nilaiAset(supabase: SupabaseClient, asetId: string): Promise<number> {
  const { data } = await supabase.from('aset').select('nilai_perolehan').eq('id', asetId).single()
  return Number((data as { nilai_perolehan?: number } | null)?.nilai_perolehan || 0)
}

// ── Paket (sampul; TIDAK bikin aset — barang dibuat per rincian) ────────────
export async function buatPaket(supabase: SupabaseClient, args: {
  skpdId: number; namaPekerjaan: string
  noKontrak?: string | null; tglKontrak?: string | null; nilaiKontrak?: number | null
  program?: string | null; kegiatan?: string | null; subKegiatan?: string | null
  namaPenyedia?: string | null; ppk?: string | null
}): Promise<{ error?: string; proyekId?: string }> {
  const { data, error } = await supabase.from('proyek_konstruksi').insert({
    skpd_id: args.skpdId, nama_pekerjaan: args.namaPekerjaan,
    no_kontrak: args.noKontrak || null, tgl_kontrak: args.tglKontrak || null, nilai_kontrak: args.nilaiKontrak ?? null,
    program: args.program || null, kegiatan: args.kegiatan || null, sub_kegiatan: args.subKegiatan || null,
    nama_penyedia: args.namaPenyedia || null, ppk: args.ppk || null,
  }).select('id').single()
  if (error || !data) return { error: `Gagal membuat paket: ${error?.message}` }
  return { proyekId: (data as { id: string }).id }
}

// ── Barang KDP baru (aset 1.3.6 Rp0 + tautan) ───────────────────────────────
export async function tambahBarang(supabase: SupabaseClient, args: {
  proyekId: string; skpdId: number; komponen: string; kode: string; namaBarang: string
}): Promise<{ error?: string; barangId?: string; asetId?: string }> {
  const kodeSkpd = await skpdKode(supabase, args.skpdId)
  const tahun = String(new Date(hariIni()).getFullYear())
  const nibarMap = await generateNibars(supabase as never, [{ key: 'b', kode: args.kode, intraEkstra: 'intra', tahun }], kodeSkpd)
  const { data: aset, error } = await supabase.from('aset').insert({
    nibar: nibarMap.get('b') || null, kode: args.kode,
    uraian_barang: args.namaBarang, nama_barang: args.namaBarang,
    jumlah: 1, nilai_perolehan: 0, tgl_perolehan: hariIni(), skpd_id: args.skpdId,
    intra_ekstra: 'intra', cara_perolehan: 'pengadaan', status: 'draft', // tersembunyi dari Daftar Barang sampai termin disetujui
  }).select('id').single()
  if (error || !aset) return { error: `Gagal membuat barang KDP: ${error?.message}` }
  const asetId = (aset as { id: string }).id
  const { data: link, error: lErr } = await supabase.from('proyek_barang')
    .insert({ proyek_id: args.proyekId, aset_id: asetId, komponen: args.komponen }).select('id').single()
  if (lErr || !link) return { error: `Gagal menautkan barang: ${lErr?.message}` }
  return { barangId: (link as { id: string }).id, asetId }
}

// ── Termin/BAST (draft) terhadap satu barang ────────────────────────────────
export async function tambahTermin(supabase: SupabaseClient, args: {
  proyekId: string; barangId: string; komponen: string
  noBast?: string | null; tglBast: string; kodeRekening?: string | null; nominal: number; keterangan?: string | null
}): Promise<{ error?: string }> {
  const { error } = await supabase.from('proyek_termin').insert({
    proyek_id: args.proyekId, barang_id: args.barangId, komponen: args.komponen,
    uraian: args.keterangan || null, no_bast: args.noBast || null, kode_rekening: args.kodeRekening || null,
    tanggal: args.tglBast, nilai: args.nominal,
  })
  if (error) return { error: `Gagal menyimpan termin: ${error.message}` }
  return {}
}

/**
 * Satu langkah: cari barang KDP (per proyek+komponen+kode) — kalau belum ada
 * dibuatin, lalu catat termin/BAST-nya. Nama barang default dari uraian kode
 * (diedit belakangan di Spesifikasi). Barang dikelompokkan by kode+komponen.
 */
export async function tambahRincian(supabase: SupabaseClient, args: {
  proyekId: string; skpdId: number; komponen: string; kode: string; namaDefault: string
  noBast?: string | null; tglBast: string; kodeRekening?: string | null; nominal: number; keterangan?: string | null
}): Promise<{ error?: string }> {
  const { data: existing } = await supabase.from('proyek_barang')
    .select('id,aset:aset_id(kode)').eq('proyek_id', args.proyekId).eq('komponen', args.komponen).eq('status', 'kdp')
  let barangId = ((existing || []) as unknown as { id: string; aset: { kode: string } | null }[])
    .find(b => b.aset?.kode === args.kode)?.id
  if (!barangId) {
    const r = await tambahBarang(supabase, { proyekId: args.proyekId, skpdId: args.skpdId, komponen: args.komponen, kode: args.kode, namaBarang: args.namaDefault })
    if (r.error || !r.barangId) return { error: r.error || 'Gagal membuat barang.' }
    barangId = r.barangId
  }
  return tambahTermin(supabase, { proyekId: args.proyekId, barangId, komponen: args.komponen, noBast: args.noBast, tglBast: args.tglBast, kodeRekening: args.kodeRekening, nominal: args.nominal, keterangan: args.keterangan })
}

async function asetDariBarang(supabase: SupabaseClient, barangId: string): Promise<string | null> {
  const { data } = await supabase.from('proyek_barang').select('aset_id').eq('id', barangId).single()
  return (data as { aset_id?: string } | null)?.aset_id || null
}

/** Setujui termin (admin) → akumulasi ke aset barang-nya. */
export async function setujuiTermin(supabase: SupabaseClient, terminId: string): Promise<{ error?: string }> {
  const { data: t } = await supabase.from('proyek_termin').select('id,barang_id,tanggal,nilai,status').eq('id', terminId).single()
  const termin = t as { id: string; barang_id: string | null; tanggal: string; nilai: number; status: string } | null
  if (!termin) return { error: 'Termin tidak ditemukan.' }
  if (termin.status === 'disetujui') return { error: 'Termin sudah disetujui.' }
  if (!termin.barang_id) return { error: 'Termin tidak tertaut barang.' }
  const asetId = await asetDariBarang(supabase, termin.barang_id)
  if (!asetId) return { error: 'Barang KDP tidak ditemukan.' }

  const saldoBaru = (await nilaiAset(supabase, asetId)) + Number(termin.nilai || 0)
  const { data: trx, error } = await supabase.from('transaksi_bmd').insert({
    aset_id: asetId, jenis: 'akumulasi_kdp', periode: periodeDariTanggal(termin.tanggal), tanggal: termin.tanggal,
    nilai: Number(termin.nilai || 0), payload: { termin_id: termin.id, nilai_perolehan_baru: saldoBaru },
  }).select('id').single()
  if (error || !trx) return { error: `Gagal mencatat akumulasi: ${error?.message}` }
  // Nilai naik + barang jadi RESMI (draft → aktif) → mulai tampil di Daftar Barang.
  await supabase.from('aset').update({ nilai_perolehan: saldoBaru, status: 'aktif' }).eq('id', asetId)
  const { error: tErr } = await supabase.from('proyek_termin').update({ status: 'disetujui', trx_id: (trx as { id: number }).id }).eq('id', termin.id)
  if (tErr) return { error: `Akumulasi tercatat, tapi status termin gagal: ${tErr.message}` }
  return {}
}

/** Batal termin yang sudah disetujui → event balik, nilai barang turun, termin → draft. */
export async function batalTermin(supabase: SupabaseClient, terminId: string): Promise<{ error?: string }> {
  const { data: t } = await supabase.from('proyek_termin').select('id,barang_id,tanggal,nilai,status').eq('id', terminId).single()
  const termin = t as { id: string; barang_id: string | null; tanggal: string; nilai: number; status: string } | null
  if (!termin) return { error: 'Termin tidak ditemukan.' }
  if (termin.status !== 'disetujui') return { error: 'Hanya termin disetujui yang perlu dibatalkan.' }
  if (!termin.barang_id) return { error: 'Termin tidak tertaut barang.' }
  const asetId = await asetDariBarang(supabase, termin.barang_id)
  if (!asetId) return { error: 'Barang KDP tidak ditemukan.' }

  const saldoBaru = Math.max(0, (await nilaiAset(supabase, asetId)) - Number(termin.nilai || 0))
  const { error } = await supabase.from('transaksi_bmd').insert({
    aset_id: asetId, jenis: 'batal_akumulasi_kdp', periode: periodeDariTanggal(termin.tanggal), tanggal: termin.tanggal,
    nilai: -Number(termin.nilai || 0), payload: { termin_id: termin.id, nilai_perolehan_baru: saldoBaru },
  })
  if (error) return { error: `Gagal mencatat pembatalan: ${error.message}` }
  await supabase.from('aset').update({ nilai_perolehan: saldoBaru }).eq('id', asetId)
  await supabase.from('proyek_termin').update({ status: 'draft', trx_id: null }).eq('id', termin.id)
  return {}
}

/** Hapus barang KDP (hanya jika belum ada termin disetujui). */
export async function hapusBarang(supabase: SupabaseClient, barangId: string): Promise<{ error?: string }> {
  const { data: appr } = await supabase.from('proyek_termin').select('id').eq('barang_id', barangId).eq('status', 'disetujui').limit(1)
  if (appr && appr.length > 0) return { error: 'Barang punya termin disetujui — batalkan dulu.' }
  const asetId = await asetDariBarang(supabase, barangId)
  const { error } = await supabase.from('proyek_barang').delete().eq('id', barangId) // cascade termin draft
  if (error) return { error: `Gagal menghapus barang: ${error.message}` }
  // Barang belum resmi (tanpa ledger) → set 'draft' supaya TERSEMBUNYI dari Daftar
  // Barang (yang saring 'draft'). 'dihapus' malah tetap tampil krn tak ada event SEMBUNYI.
  if (asetId) await supabase.from('aset').update({ status: 'draft' }).eq('id', asetId)
  return {}
}

/** Hapus paket (hanya jika belum ada termin disetujui di seluruh paket). */
export async function hapusPaket(supabase: SupabaseClient, proyekId: string): Promise<{ error?: string }> {
  const { data: appr } = await supabase.from('proyek_termin').select('id').eq('proyek_id', proyekId).eq('status', 'disetujui').limit(1)
  if (appr && appr.length > 0) return { error: 'Ada termin disetujui — batalkan dulu sebelum menghapus paket.' }
  const { data: barangs } = await supabase.from('proyek_barang').select('aset_id').eq('proyek_id', proyekId)
  const asetIds = ((barangs || []) as { aset_id: string }[]).map(b => b.aset_id)
  // Jaga transisi: paket model LAMA (gumpalan) punya aset_kdp_id, bukan proyek_barang.
  const { data: pk } = await supabase.from('proyek_konstruksi').select('aset_kdp_id').eq('id', proyekId).single()
  const kdpLama = (pk as { aset_kdp_id?: string | null } | null)?.aset_kdp_id
  if (kdpLama) asetIds.push(kdpLama)
  const { error } = await supabase.from('proyek_konstruksi').delete().eq('id', proyekId) // cascade barang+termin
  if (error) return { error: `Gagal menghapus paket: ${error.message}` }
  // 'draft' → tersembunyi dari Daftar Barang (barang belum resmi / tanpa ledger).
  if (asetIds.length) await supabase.from('aset').update({ status: 'draft' }).in('id', asetIds)
  return {}
}

// ── Reklas: gabung barang KDP → aset tetap, biaya bersama proporsional ──────
export type ReklasOutput = { kode: string; nama: string; fisikBarangId: string }

type EventRow = {
  aset_id: string; jenis: string; periode: string; tanggal: string; nilai: number
  skpd_tujuan?: number; payload: Record<string, unknown>
}

export async function reklasKdp(supabase: SupabaseClient, args: {
  proyekId: string; skpdId: number; tglBapp: string
  outputs: ReklasOutput[]        // tiap output = satu barang FISIK → satu aset tetap
  bersamaBarangIds: string[]     // barang biaya bersama, dibagi proporsional ke output
  final: boolean
}): Promise<{ error?: string }> {
  const { proyekId, skpdId, tglBapp, outputs, bersamaBarangIds, final } = args
  if (outputs.length === 0) return { error: 'Pilih minimal satu barang fisik sebagai output.' }
  if (outputs.some(o => !o.kode || !o.nama)) return { error: 'Tiap output butuh kode golongan & nama.' }

  const allIds = [...outputs.map(o => o.fisikBarangId), ...bersamaBarangIds]
  const { data: barangs } = await supabase.from('proyek_barang').select('id,aset_id').in('id', allIds)
  const asetOf = new Map(((barangs || []) as { id: string; aset_id: string }[]).map(b => [b.id, b.aset_id]))
  if (allIds.some(id => !asetOf.get(id))) return { error: 'Ada barang yang tidak ditemukan.' }

  const fisikVals = await Promise.all(outputs.map(o => nilaiAset(supabase, asetOf.get(o.fisikBarangId)!)))
  const bersamaVals = await Promise.all(bersamaBarangIds.map(id => nilaiAset(supabase, asetOf.get(id)!)))
  const fisikTotal = fisikVals.reduce((s, v) => s + v, 0)
  const bersamaTotal = bersamaVals.reduce((s, v) => s + v, 0)
  if (fisikTotal <= 0) return { error: 'Nilai barang fisik masih 0 — belum ada termin disetujui.' }

  const n = outputs.length
  const alloc = fisikVals.map((v, i) => (i === n - 1 ? 0 : Math.round(bersamaTotal * v / fisikTotal)))
  alloc[n - 1] = bersamaTotal - alloc.slice(0, -1).reduce((s, v) => s + v, 0)
  const finalVals = fisikVals.map((v, i) => v + alloc[i])

  // Aset tetap hasil
  const kodeSkpd = await skpdKode(supabase, skpdId)
  const tahun = String(new Date(tglBapp).getFullYear())
  const batasMap = await fetchBatasKapitalisasi(supabase, outputs.map(o => o.kode))
  const withKlas = outputs.map((o, i) => ({
    key: `o${i}`, kode: o.kode, nama: o.nama, nilai: finalVals[i],
    intraEkstra: klasifikasiKomptabel(finalVals[i], batasMap.get(o.kode)),
  }))
  const nibarMap = await generateNibars(supabase as never, withKlas.map(o => ({ key: o.key, kode: o.kode, intraEkstra: o.intraEkstra, tahun })), kodeSkpd)
  const asetRows = withKlas.map(o => ({
    nibar: nibarMap.get(o.key) || null, kode: o.kode, uraian_barang: o.nama, nama_barang: o.nama,
    jumlah: 1, nilai_perolehan: o.nilai, tgl_perolehan: tglBapp, skpd_id: skpdId,
    intra_ekstra: o.intraEkstra, cara_perolehan: 'pengadaan', status: 'aktif',
  }))
  const { data: inserted, error: aErr } = await supabase.from('aset').insert(asetRows).select('id')
  if (aErr || !inserted) return { error: `Gagal membuat aset hasil: ${aErr?.message}` }
  const outAsetIds = (inserted as { id: string }[]).map(a => a.id)
  const periode = periodeDariTanggal(tglBapp)

  const masukRows: EventRow[] = outAsetIds.map((id, i) => ({
    aset_id: id, jenis: 'kdp_selesai_masuk', periode, tanggal: tglBapp, nilai: finalVals[i],
    skpd_tujuan: skpdId, payload: { proyek_id: proyekId },
  }))
  const { error: mErr } = await supabase.from('transaksi_bmd').insert(masukRows)
  if (mErr) { await supabase.from('aset').update({ status: 'dihapus' }).in('id', outAsetIds); return { error: `Gagal mencatat aset hasil: ${mErr.message}` } }

  // Keluar: fisik barang penuh → output-nya; bersama barang dibagi proporsional
  const keluarRows: EventRow[] = []
  outputs.forEach((o, i) => {
    keluarRows.push({ aset_id: asetOf.get(o.fisikBarangId)!, jenis: 'kdp_selesai_keluar', periode, tanggal: tglBapp, nilai: -fisikVals[i], payload: { proyek_id: proyekId, nilai_perolehan_baru: 0, output_aset: outAsetIds[i] } })
  })
  bersamaBarangIds.forEach((id, bi) => {
    let sisa = bersamaVals[bi]
    outputs.forEach((o, i) => {
      const porsi = i === n - 1 ? sisa : Math.round(bersamaVals[bi] * fisikVals[i] / fisikTotal)
      sisa -= porsi
      if (porsi !== 0) keluarRows.push({ aset_id: asetOf.get(id)!, jenis: 'kdp_selesai_keluar', periode, tanggal: tglBapp, nilai: -porsi, payload: { proyek_id: proyekId, nilai_perolehan_baru: 0, output_aset: outAsetIds[i] } })
    })
  })
  const { error: kErr } = await supabase.from('transaksi_bmd').insert(keluarRows)
  if (kErr) return { error: `Aset hasil dibuat, tapi pengurangan KDP gagal: ${kErr.message}` }

  const consumedBarangIds = [...outputs.map(o => o.fisikBarangId), ...bersamaBarangIds]
  const consumedAsetIds = consumedBarangIds.map(id => asetOf.get(id)!)
  // Barang KDP habis diserap ke aset tetap → soft-delete (hilang dari Daftar Barang).
  await supabase.from('aset').update({ nilai_perolehan: 0, status: 'dihapus' }).in('id', consumedAsetIds)
  await supabase.from('proyek_barang').update({ status: 'selesai' }).in('id', consumedBarangIds)

  const { data: sisaKdp } = await supabase.from('proyek_barang').select('id').eq('proyek_id', proyekId).eq('status', 'kdp').limit(1)
  if (final || !sisaKdp || sisaKdp.length === 0) {
    if (!sisaKdp || sisaKdp.length === 0) await supabase.from('proyek_konstruksi').update({ status: 'selesai' }).eq('id', proyekId)
  }
  return {}
}
