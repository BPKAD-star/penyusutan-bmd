// ============================================================================
// KDP / Pengadaan Konstruksi — model MERGE-KE-PENGADAAN (final 2026-07-13).
//
// 1 kontrak konstruksi = 1 kartu jurnal_header (kategori 'konstruksi'), bisa
// berisi BEBERAPA barang KDP (payload.barang[], multi-KDP) — semua di payload,
// TANPA tabel proyek_* (tabel Opsi B lama di-drop migrasi 20260713_01; fungsi
// yang memakainya sudah dihapus dari file ini 2026-07-13).
//
// Tetap satu ledger (transaksi_bmd), append-only. Jenis event:
//   akumulasi_kdp       : termin kontrak disetujui → nilai barang KDP naik
//   batal_akumulasi_kdp : buka kunci kontrak (event balik)
//   kdp_selesai_masuk / kdp_selesai_keluar : reklas KDP → aset tetap saat BAPP
//   (enum sudah ada di DB; alur reklasnya belum dibangun ulang di model ini)
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
// Info "menambah masa manfaat aset existing" — INFO saja (bukan auto-kapitalisasi),
// reklas & kapitalisasi tetap manual nanti (menu Reklasifikasi). PER-BARANG sejak
// redesign 2026-07-13 (dulu per-kontrak): 1 kontrak bisa berisi banyak KDP, tiap
// KDP bisa menambah manfaat aset induk yg BEDA (mis. 2 ruas jalan berbeda).
export type KapInfo = { menambah: boolean; target_aset_id?: string | null; target_nama?: string | null }
export type BarangKdp = {
  key: string
  kode: string                       // kode kodefikasi KDP (golongan 1.3.6)
  nama: string                       // nama barang KDP
  spec?: Record<string, string>      // spesifikasi (Tanah-like)
  foto?: string[]
  pembayaran: PembayaranKdp[]        // termin/BAST barang ini
  kap_info?: KapInfo | null          // aset induk (GB/JIJ) yg ditambah manfaatnya, kalau ada
  aset_id?: string | null            // diisi saat approve (utk unapprove)
}
export type KontrakKonstruksiPayload = {
  nama_pekerjaan: string; sumber?: string
  program?: string | null; kegiatan?: string | null; sub_kegiatan?: string | null
  ppk?: string | null; penyedia?: string | null; nilai_kontrak?: number | null
  keterangan?: string | null
  barang?: BarangKdp[]               // MODEL BARU (multi-KDP)
  // ── LEGACY single-KDP (payload versi lama) — dibaca utk kompat & migrasi-on-read ──
  kode_kdp?: string
  pembayaran?: PembayaranKdp[]
  spec?: Record<string, string>
  foto?: string[]
  aset_id?: string | null
  kap_info?: KapInfo                 // legacy: dulu per-kontrak, sekarang per-barang (BarangKdp.kap_info)
}

// Normalisasi payload (lama/baru) → array barang. Payload lama (single-KDP:
// kode_kdp + pembayaran flat) dipetakan jadi SATU barang implisit supaya kontrak
// lama tetap tampil/diproses benar tanpa migrasi data.
export function barangKdpList(p: KontrakKonstruksiPayload): BarangKdp[] {
  if (Array.isArray(p.barang)) return p.barang
  if (p.kode_kdp) return [{
    key: 'legacy', kode: p.kode_kdp, nama: p.nama_pekerjaan,
    spec: p.spec, foto: p.foto, pembayaran: p.pembayaran || [], kap_info: p.kap_info, aset_id: p.aset_id ?? null,
  }]
  return []
}

// Payload tanpa field legacy singleton (dipakai saat menulis ulang payload versi
// baru supaya tak ada dua sumber kebenaran yang ambigu).
function stripLegacy(p: KontrakKonstruksiPayload): KontrakKonstruksiPayload {
  const { kode_kdp: _k, pembayaran: _p, spec: _s, foto: _f, aset_id: _a, kap_info: _ki, ...rest } = p
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
  // tgl_perolehan KDP = tgl BAST TERAKHIR (termin paling akhir) — keputusan user
  // 2026-07-13. KDP tak disusutkan; ini murni pencatatan, baseline penyusutan
  // sesungguhnya ditetapkan saat reklas ke aset tetap (tgl BAPP). Tahun NIBAR
  // ikut tahun tgl ini juga.
  const tglBarang = (b: BarangKdp) => (b.pembayaran || []).map(x => x.tgl_bast).sort().slice(-1)[0] || h.tanggal
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
    const { data: trxs } = await supabase.from('transaksi_bmd').select('id,aset_id,tanggal,nilai').in('aset_id', asetIds).eq('jenis', 'akumulasi_kdp')
    const akum = (trxs || []) as { id: number; aset_id: string; tanggal: string; nilai: number }[]
    // Guard rantai: kalau ada barang KDP yg sudah punya transaksi LEBIH BARU
    // setelah akumulasi terakhirnya (mis. reklas ke aset jadi, koreksi, penghapusan),
    // buka kunci DIBLOKIR — soft-delete di tengah rantai merusak replay engine.
    // Batalkan transaksi yg lebih baru itu dulu.
    const maxAkum = new Map<string, number>()
    for (const t of akum) maxAkum.set(t.aset_id, Math.max(maxAkum.get(t.aset_id) ?? 0, t.id))
    for (const [aid, threshold] of maxAkum) {
      const { count } = await supabase.from('transaksi_bmd')
        .select('id', { count: 'exact', head: true }).eq('aset_id', aid).gt('id', threshold)
      if ((count || 0) > 0) return { error: 'Ada barang KDP dengan transaksi LEBIH BARU setelah akumulasi terakhir (mis. reklas/koreksi/penghapusan) — batalkan transaksi itu dulu sebelum buka kunci.' }
    }
    const balik = akum.map(t => ({
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

async function skpdKode(supabase: SupabaseClient, skpdId: number): Promise<string> {
  const { data } = await supabase.from('admin_skpd').select('kode_skpd').eq('id', skpdId).single()
  return (data as { kode_skpd?: string } | null)?.kode_skpd || ''
}
