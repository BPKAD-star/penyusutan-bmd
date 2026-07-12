// ============================================================================
// KDP / Proyek Konstruksi — materialisasi ke ledger (Fase 2).
// Tabel proyek_konstruksi/proyek_termin = lapisan kelola (editable). Angka
// finansial ditulis sbg event di transaksi_bmd (satu ledger, append-only):
//   akumulasi_kdp       : termin disetujui → nilai KDP (aset 1.3.6) naik
//   batal_akumulasi_kdp : koreksi termin (event balik)
//   kdp_selesai_masuk   : aset tetap hasil carve-out diakui pd tgl BAPP (aset BARU)
//   kdp_selesai_keluar  : saldo KDP turun sebesar total yg dicarve
// Pola aset & NIBAR mengikuti approve Pengadaan (components/pengelolaan/Pengadaan.tsx).
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import { periodeDariTanggal, klasifikasiKomptabel, fetchBatasKapitalisasi } from '@/lib/bmd'
import { generateNibars } from '@/lib/nibar'

type Termin = { id: string; proyek_id: string; komponen: string; tanggal: string; nilai: number; status: string }
type Proyek = { id: string; skpd_id: number; aset_kdp_id: string | null; kode_kdp: string | null; nama_pekerjaan: string }

async function skpdKode(supabase: SupabaseClient, skpdId: number): Promise<string> {
  const { data } = await supabase.from('admin_skpd').select('kode_skpd').eq('id', skpdId).single()
  return (data as { kode_skpd?: string } | null)?.kode_skpd || ''
}

async function nilaiKdp(supabase: SupabaseClient, asetId: string): Promise<number> {
  const { data } = await supabase.from('aset').select('nilai_perolehan').eq('id', asetId).single()
  return Number((data as { nilai_perolehan?: number } | null)?.nilai_perolehan || 0)
}

const hariIni = () => new Date().toISOString().slice(0, 10)

/**
 * Buat paket + aset KDP (1.3.6, nilai 0) sekaligus. Aset dibuat di awal supaya
 * spesifikasi (Tanah-like) bisa diisi lewat EditSpesifikasiModal SEBELUM termin
 * disetujui. Termin cukup menambah nilai lewat event akumulasi.
 */
export async function buatPaket(supabase: SupabaseClient, args: {
  skpdId: number; namaPekerjaan: string; kodeKdp: string
  noKontrak?: string | null; tglKontrak?: string | null; nilaiKontrak?: number | null
  program?: string | null; kegiatan?: string | null; subKegiatan?: string | null
  namaPenyedia?: string | null; ppk?: string | null
}): Promise<{ error?: string; proyekId?: string }> {
  const { data: pRow, error: pErr } = await supabase.from('proyek_konstruksi').insert({
    skpd_id: args.skpdId, nama_pekerjaan: args.namaPekerjaan, kode_kdp: args.kodeKdp,
    no_kontrak: args.noKontrak || null, tgl_kontrak: args.tglKontrak || null, nilai_kontrak: args.nilaiKontrak ?? null,
    program: args.program || null, kegiatan: args.kegiatan || null, sub_kegiatan: args.subKegiatan || null,
    nama_penyedia: args.namaPenyedia || null, ppk: args.ppk || null,
  }).select('id').single()
  if (pErr || !pRow) return { error: `Gagal membuat paket: ${pErr?.message}` }
  const proyekId = (pRow as { id: string }).id

  const kodeSkpd = await skpdKode(supabase, args.skpdId)
  const tahun = String(new Date(args.tglKontrak || hariIni()).getFullYear())
  const nibarMap = await generateNibars(supabase as never, [{ key: 'kdp', kode: args.kodeKdp, intraEkstra: 'intra', tahun }], kodeSkpd)
  const { data: aset, error: aErr } = await supabase.from('aset').insert({
    nibar: nibarMap.get('kdp') || null, kode: args.kodeKdp,
    uraian_barang: args.namaPekerjaan, nama_barang: args.namaPekerjaan,
    jumlah: 1, nilai_perolehan: 0, tgl_perolehan: args.tglKontrak || hariIni(),
    skpd_id: args.skpdId, intra_ekstra: 'intra', cara_perolehan: 'pengadaan', status: 'aktif',
  }).select('id').single()
  if (aErr || !aset) return { error: `Paket dibuat, tapi aset KDP gagal: ${aErr?.message}`, proyekId }
  await supabase.from('proyek_konstruksi').update({ aset_kdp_id: (aset as { id: string }).id }).eq('id', proyekId)
  return { proyekId }
}

/** Setujui satu termin (admin) → materialize: buat/naikkan KDP + event akumulasi. */
export async function setujuiTermin(supabase: SupabaseClient, terminId: string): Promise<{ error?: string }> {
  const { data: tRow } = await supabase.from('proyek_termin')
    .select('id,proyek_id,komponen,tanggal,nilai,status').eq('id', terminId).single()
  const termin = tRow as Termin | null
  if (!termin) return { error: 'Termin tidak ditemukan.' }
  if (termin.status === 'disetujui') return { error: 'Termin sudah disetujui.' }

  const { data: pRow } = await supabase.from('proyek_konstruksi')
    .select('id,skpd_id,aset_kdp_id,kode_kdp,nama_pekerjaan').eq('id', termin.proyek_id).single()
  const proyek = pRow as Proyek | null
  if (!proyek) return { error: 'Paket tidak ditemukan.' }
  const kdpAsetId = proyek.aset_kdp_id
  if (!kdpAsetId) return { error: 'Aset KDP belum ada pada paket ini.' }
  const saldo = await nilaiKdp(supabase, kdpAsetId)
  const saldoBaru = saldo + Number(termin.nilai || 0)

  // Event ledger akumulasi (period-correct dari tgl termin) → dapat id utk tautan.
  const { data: trx, error: trxErr } = await supabase.from('transaksi_bmd').insert({
    aset_id: kdpAsetId,
    jenis: 'akumulasi_kdp',
    periode: periodeDariTanggal(termin.tanggal),
    tanggal: termin.tanggal,
    nilai: Number(termin.nilai || 0),
    skpd_tujuan: proyek.skpd_id,
    payload: { proyek_id: proyek.id, termin_id: termin.id, komponen: termin.komponen, nilai_perolehan_baru: saldoBaru },
  }).select('id').single()
  if (trxErr || !trx) return { error: `Gagal mencatat akumulasi KDP: ${trxErr?.message}` }

  await supabase.from('aset').update({ nilai_perolehan: saldoBaru }).eq('id', kdpAsetId)
  const { error: tErr } = await supabase.from('proyek_termin')
    .update({ status: 'disetujui', trx_id: (trx as { id: number }).id }).eq('id', termin.id)
  if (tErr) return { error: `Akumulasi tercatat, tapi status termin gagal: ${tErr.message}` }
  return {}
}

/** Batal termin yang sudah disetujui → event balik + saldo KDP turun, termin balik draft. */
export async function batalTermin(supabase: SupabaseClient, terminId: string): Promise<{ error?: string }> {
  const { data: tRow } = await supabase.from('proyek_termin')
    .select('id,proyek_id,komponen,tanggal,nilai,status').eq('id', terminId).single()
  const termin = tRow as Termin | null
  if (!termin) return { error: 'Termin tidak ditemukan.' }
  if (termin.status !== 'disetujui') return { error: 'Hanya termin yang sudah disetujui yang perlu dibatalkan.' }

  const { data: pRow } = await supabase.from('proyek_konstruksi').select('id,aset_kdp_id').eq('id', termin.proyek_id).single()
  const kdpAsetId = (pRow as { aset_kdp_id?: string | null } | null)?.aset_kdp_id
  if (!kdpAsetId) return { error: 'Aset KDP tidak ditemukan.' }

  const saldo = await nilaiKdp(supabase, kdpAsetId)
  const saldoBaru = Math.max(0, saldo - Number(termin.nilai || 0))

  const { error: trxErr } = await supabase.from('transaksi_bmd').insert({
    aset_id: kdpAsetId,
    jenis: 'batal_akumulasi_kdp',
    periode: periodeDariTanggal(termin.tanggal),
    tanggal: termin.tanggal,
    nilai: -Number(termin.nilai || 0),
    payload: { proyek_id: termin.proyek_id, termin_id: termin.id, nilai_perolehan_baru: saldoBaru },
  })
  if (trxErr) return { error: `Gagal mencatat pembatalan: ${trxErr.message}` }

  await supabase.from('aset').update({ nilai_perolehan: saldoBaru }).eq('id', kdpAsetId)
  await supabase.from('proyek_termin').update({ status: 'draft', trx_id: null }).eq('id', termin.id)
  return {}
}

export type OutputKdp = { kode: string; nama: string; spesifikasi?: string | null; nilai: number }

/**
 * Alokasi biaya bersama proporsional ke nilai fisik langsung tiap output.
 * `saldoCarve` = total yg dicarve saat ini (fisik + bersama). Return nilai final
 * per output (Σ hasil = saldoCarve, selisih pembulatan diserap output terakhir).
 */
export function hitungAlokasi(saldoCarve: number, nilaiFisik: number[]): number[] {
  const n = nilaiFisik.length
  if (n === 0) return []
  const totalFisik = nilaiFisik.reduce((s, v) => s + v, 0)
  const bersama = saldoCarve - totalFisik
  const out = nilaiFisik.map(v =>
    totalFisik > 0 ? Math.round(v + bersama * (v / totalFisik)) : Math.round(saldoCarve / n))
  // Serap selisih pembulatan di output terakhir supaya Σ == saldoCarve.
  const selisih = saldoCarve - out.reduce((s, v) => s + v, 0)
  out[n - 1] += selisih
  return out
}

/**
 * Penyelesaian (BAPP), full atau partial: tiap output → aset tetap baru
 * (mulai disusutkan dari tgl BAPP), saldo KDP turun sebesar total carve.
 * `final=true` → wajib menghabiskan saldo & tandai paket selesai.
 */
export async function selesaikanProyek(
  supabase: SupabaseClient,
  args: { proyekId: string; tglBapp: string; outputs: OutputKdp[]; final: boolean },
): Promise<{ error?: string }> {
  const { proyekId, tglBapp, outputs, final } = args
  if (outputs.length === 0) return { error: 'Minimal satu output aset.' }
  if (outputs.some(o => !o.kode || o.nilai <= 0)) return { error: 'Tiap output wajib punya kode & nilai > 0.' }

  const { data: pRow } = await supabase.from('proyek_konstruksi')
    .select('id,skpd_id,aset_kdp_id').eq('id', proyekId).single()
  const proyek = pRow as { id: string; skpd_id: number; aset_kdp_id: string | null } | null
  if (!proyek || !proyek.aset_kdp_id) return { error: 'Paket belum punya KDP (belum ada termin disetujui).' }

  const saldo = await nilaiKdp(supabase, proyek.aset_kdp_id)
  const carveTotal = outputs.reduce((s, o) => s + o.nilai, 0)
  if (carveTotal > saldo + 0.5) return { error: `Total output (${carveTotal}) melebihi saldo KDP (${saldo}).` }
  if (final && Math.abs(carveTotal - saldo) > 0.5) return { error: `Penyelesaian final harus menghabiskan saldo KDP (${saldo}).` }

  const kodeSkpd = await skpdKode(supabase, proyek.skpd_id)
  const tahun = String(new Date(tglBapp).getFullYear())
  const batasMap = await fetchBatasKapitalisasi(supabase, outputs.map(o => o.kode))
  const withKlas = outputs.map((o, i) => ({
    ...o, key: `out${i}`, intraEkstra: klasifikasiKomptabel(o.nilai, batasMap.get(o.kode)),
  }))
  const nibarMap = await generateNibars(
    supabase as never,
    withKlas.map(o => ({ key: o.key, kode: o.kode, intraEkstra: o.intraEkstra, tahun })),
    kodeSkpd,
  )

  const asetRows = withKlas.map(o => ({
    nibar: nibarMap.get(o.key) || null,
    kode: o.kode,
    uraian_barang: o.nama,
    nama_barang: o.nama,
    spesifikasi: o.spesifikasi || null,
    jumlah: 1,
    nilai_perolehan: o.nilai,
    tgl_perolehan: tglBapp,
    skpd_id: proyek.skpd_id,
    intra_ekstra: o.intraEkstra,
    cara_perolehan: 'pengadaan',
    status: 'aktif',
  }))
  const { data: inserted, error: aErr } = await supabase.from('aset').insert(asetRows).select('id')
  if (aErr || !inserted) return { error: `Gagal membuat aset hasil: ${aErr?.message}` }
  const newIds = (inserted as { id: string }[]).map(a => a.id)

  const periode = periodeDariTanggal(tglBapp)
  const masukRows = newIds.map((id, i) => ({
    aset_id: id,
    jenis: 'kdp_selesai_masuk',
    periode,
    tanggal: tglBapp,
    nilai: withKlas[i].nilai,
    skpd_tujuan: proyek.skpd_id,
    payload: { proyek_id: proyekId, kdp_aset_id: proyek.aset_kdp_id },
  }))
  const { error: mErr } = await supabase.from('transaksi_bmd').insert(masukRows)
  if (mErr) {
    await supabase.from('aset').update({ status: 'dihapus' }).in('id', newIds)
    return { error: `Gagal mencatat aset hasil: ${mErr.message}` }
  }

  const saldoBaru = saldo - carveTotal
  const { error: kErr } = await supabase.from('transaksi_bmd').insert({
    aset_id: proyek.aset_kdp_id,
    jenis: 'kdp_selesai_keluar',
    periode,
    tanggal: tglBapp,
    nilai: -carveTotal,
    payload: { proyek_id: proyekId, nilai_perolehan_baru: saldoBaru, output_aset_ids: newIds },
  })
  if (kErr) return { error: `Aset hasil dibuat, tapi pengurangan KDP gagal: ${kErr.message}` }

  await supabase.from('aset').update({ nilai_perolehan: saldoBaru }).eq('id', proyek.aset_kdp_id)
  if (final || saldoBaru <= 0.5) {
    await supabase.from('proyek_konstruksi').update({ status: 'selesai' }).eq('id', proyekId)
  }
  return {}
}
