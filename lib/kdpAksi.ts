// Aksi tulis kartu Pekerjaan Konstruksi model paket (2026-10-07):
// SETUJUI / BATAL per termin. Aturan murninya di lib/kdp.ts; penegak terakhirnya
// RPC `fn_kdp_setujui_termin` / `fn_kdp_batal_termin` / `fn_kdp_batal_semua`
// (migrasi 20261007_03, admin pemda saja).
//
// Menyetujui termin PERTAMA sebuah barang butuh baris `aset`-nya. Baris itu
// DISIAPKAN di sini (status 'draft', NIBAR dari generateNibars — satu jalur
// penomoran dgn menu Cara Perolehan lain), aset_id-nya dicatat di payload kartu,
// baru RPC yang menghidupkannya. Kalau RPC gagal, aset draft itu dipakai ulang
// percobaan berikutnya — tak ada aset yatim yang tertinggal.
import type { SupabaseClient } from '@supabase/supabase-js'
import { ASAL_USUL_AWAL } from '@/lib/bmd'
import { generateNibars } from '@/lib/nibar'
import { ASET_FIELD_COLS, ASET_NUM_COLS, angkaKolomAset } from '@/lib/asetFields'
import {
  barangKdpList, ringkasBarangKdp, kekuranganNamaKdp, kekuranganTermin, tahunKartuKdp,
  namaBarangKdp, type BarangKdp, type KontrakKonstruksiPayload,
} from '@/lib/kdp'

type Kartu = { id: string; skpd_id: number; tanggal: string; payload: KontrakKonstruksiPayload }

async function bacaKartu(supabase: SupabaseClient, headerId: string): Promise<Kartu> {
  const { data, error } = await supabase.from('jurnal_header')
    .select('id,skpd_id,tanggal,payload').eq('id', headerId).single()
  if (error || !data) throw new Error(`Gagal membaca kartu: ${error?.message || 'tidak ditemukan'}`)
  return data as Kartu
}

/** Kolom aset dari spesifikasi barang di kartu. */
function kolomSpek(b: BarangKdp): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of ASET_FIELD_COLS) {
    const v = b.spec?.[k]
    if (!v) continue
    // Yang tak terbaca sbg angka DILEWATI, bukan jadi 0 (0 = koordinat sah).
    if (ASET_NUM_COLS.has(k)) { const n = angkaKolomAset(v); if (n !== null) out[k] = n }
    else out[k] = v
  }
  return out
}

/**
 * Pastikan barang punya baris aset (draft) yang mencerminkan spesifikasi kartu
 * SAAT INI. Barang yang sudah punya termin disetujui tak disentuh (spesifikasinya
 * sudah di register — perubahan lewat menu Koreksi).
 */
export async function siapkanAsetKdp(supabase: SupabaseClient, headerId: string, barangKey: string, tglBast: string): Promise<string> {
  const h = await bacaKartu(supabase, headerId)
  const barangs = barangKdpList(h.payload)
  const b = barangs.find(x => x.key === barangKey)
  if (!b) throw new Error('Barang tidak ditemukan di kartu ini (muat ulang halaman).')
  if (b.aset_id && ringkasBarangKdp(b).nDisetujui > 0) return b.aset_id

  const kurangNama = kekuranganNamaKdp(barangs)
  if (kurangNama) throw new Error(kurangNama)
  if (!b.foto || b.foto.length === 0) throw new Error(`Barang "${namaBarangKdp(b)}" belum ada foto — lengkapi dulu lewat Edit Spesifikasi.`)

  // uraian BAKU kodefikasi (KIR, Kendaraan & kartu membaca kolom tersimpan ini).
  const { data: kodef, error: kErr } = await supabase.from('admin_kodefikasi_bmd').select('uraian').eq('kode', b.kode).maybeSingle()
  if (kErr) throw new Error(`Gagal membaca kodefikasi barang: ${kErr.message}`)
  const isi = {
    kode: b.kode, uraian_barang: (kodef as { uraian?: string } | null)?.uraian || b.nama,
    nama_barang: b.spec?.nama_barang?.trim() || b.nama, foto_paths: b.foto || [], ...kolomSpek(b),
  }

  if (b.aset_id) {
    // Aset draft dari percobaan/persetujuan sebelumnya — samakan dgn kartu.
    const { data, error } = await supabase.from('aset').update(isi).eq('id', b.aset_id).eq('status', 'draft').select('id')
    if (error) throw new Error(`Gagal memperbarui aset barang: ${error.message}`)
    if (!data || data.length === 0) throw new Error('Aset barang ini tidak dalam keadaan draft — muat ulang halaman.')
    return b.aset_id
  }

  const { data: s, error: sErr } = await supabase.from('admin_skpd').select('kode_skpd').eq('id', h.skpd_id).single()
  if (sErr) throw new Error(`Gagal membaca kode SKPD: ${sErr.message}`)
  // NIBAR ikut tahun termin pertama yang disetujui — memang saat itu ia terbit.
  const nibar = (await generateNibars(supabase as never,
    [{ key: b.key, kode: b.kode, intraEkstra: 'intra', tahun: tglBast.slice(0, 4) }],
    (s as { kode_skpd?: string }).kode_skpd || '')).get(b.key)
  const { data: aset, error: aErr } = await supabase.from('aset').insert({
    ...isi, nibar: nibar || null, jumlah: 1, nilai_perolehan: 0, tgl_perolehan: tglBast, skpd_id: h.skpd_id,
    intra_ekstra: 'intra', cara_perolehan: 'pengadaan', status: 'draft', asal_usul: ASAL_USUL_AWAL.pengadaan,
  }).select('id').single()
  if (aErr || !aset) throw new Error(`Gagal menyiapkan aset barang: ${aErr?.message}`)
  const asetId = (aset as { id: string }).id

  const barangBaru = barangs.map(x => x.key === barangKey ? { ...x, aset_id: asetId } : x)
  const { error: uErr } = await supabase.from('jurnal_header')
    .update({ payload: { ...h.payload, barang: barangBaru } }).eq('id', headerId)
  if (uErr) throw new Error(`Gagal mencatat aset barang di kartu: ${uErr.message}`)
  return asetId
}

/** Setujui satu termin (admin pemda). Melempar dgn pesan yang siap ditampilkan. */
export async function setujuiTerminKdp(supabase: SupabaseClient, headerId: string, barangKey: string, terminId: string): Promise<void> {
  const h = await bacaKartu(supabase, headerId)
  const b = barangKdpList(h.payload).find(x => x.key === barangKey)
  const t = b?.pembayaran.find(x => x.id === terminId)
  if (!b || !t) throw new Error('Termin tidak ditemukan di kartu ini (muat ulang halaman).')
  const kurang = kekuranganTermin(t, h.payload.kontrak || [], tahunKartuKdp(h.tanggal))
  if (kurang.length) throw new Error(kurang.join('\n'))
  const asetId = await siapkanAsetKdp(supabase, headerId, barangKey, t.tgl_bast)
  const { error } = await supabase.rpc('fn_kdp_setujui_termin', { p_header: headerId, p_termin_id: terminId, p_aset_id: asetId })
  if (error) throw new Error(error.message)
}

export async function batalTerminKdp(supabase: SupabaseClient, headerId: string, terminId: string): Promise<void> {
  const { error } = await supabase.rpc('fn_kdp_batal_termin', { p_header: headerId, p_termin_id: terminId })
  if (error) throw new Error(error.message)
}

export async function batalSemuaTerminKdp(supabase: SupabaseClient, headerId: string): Promise<number> {
  const { data, error } = await supabase.rpc('fn_kdp_batal_semua', { p_header: headerId })
  if (error) throw new Error(error.message)
  return Number(data || 0)
}
