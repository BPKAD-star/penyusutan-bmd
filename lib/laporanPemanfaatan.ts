// Pemuat Laporan Pemanfaatan — SATU sumber untuk halaman Pelaporan →
// Pemanfaatan (components/pelaporan/LaporanPemanfaatan.tsx) DAN alat baca
// Asisten AI (lib/chatbot/pengelolaan.ts). Dipindah dari komponennya
// 2026-09-30 begitu pemakai kedua muncul.
//
// Sumber = jurnal_header kategori 'pemanfaatan' + ledger. Keanggotaan per
// (header, aset) direplay urut id: `pemanfaatan` memasang, `pemanfaatan_selesai`
// menandai selesai (barangnya TETAP tampil sbg riwayat), `batal_pemanfaatan`
// membuang. Nilai pemanfaatan diambil dari header (`payload.nilai_pemanfaatan`),
// BUKAN `transaksi_bmd.nilai` — baris pemanfaatan selalu 0 (peristiwa netral).
//
// ⚠️ MELEMPAR saat query gagal. Sampai 2026-09-30 ketiga query di sini
// `const { data } = await` telanjang: query gagal terbaca sbg "belum ada
// pemanfaatan" — kegagalan senyap yang sama yang sudah ditutup di laporan lain.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  JENIS_PEMANFAATAN_LABEL, perluNilaiPemanfaatan, persenMasaPemanfaatan, bandPemanfaatan,
  type BandPemanfaatan,
} from '@/lib/pemanfaatan'

type HeaderPayload = {
  jenis_pemanfaatan?: string; mitra?: string; alamat_mitra?: string
  mulai?: string; berakhir?: string; peruntukan?: string; nilai_pemanfaatan?: number
}
export type BarisPemanfaatan = {
  // `skpdId` = SKPD yang MENCATAT perjanjian (jurnal_header.skpd_id, terkunci) &
  // `nilaiPerolehan` = nilai BARANG di register — dua-duanya dipakai tab Rekap per
  // SKPD (matriks SKPD × jenis aset). `asetId` supaya barang yang sama di dua
  // perjanjian tak dijumlah dua kali.
  skpdId: number; asetId: string; nilaiPerolehan: number
  key: string; skpd: string; jenis: string; jenisRaw: string; mitra: string
  kode: string; uraianBarang: string; nibar: string; nama: string
  merekTipe: string; spesifikasiLainnya: string
  noPolisi: string; noRangka: string; noMesin: string
  luas: number | string | null
  lingkup: string; mulai: string; berakhir: string; status: string
  // null = tak berlaku (Pinjam Pakai, non-profit) — beda dari 0 (berpendapatan
  // tapi belum diisi angkanya).
  nilai: number | null
  noDok: string
  tglDok: string
  persen: number | null
  band: BandPemanfaatan | null
}

type Header = { id: string; no_sk: string; tanggal: string; skpd_id: number; payload: HeaderPayload | null }
type Led = {
  id: number; header_id: string; jenis: string; nilai: number
  payload: { lingkup?: string; bagian?: string | null } | null
  aset: {
    id: string; kode: string; uraian_barang: string | null; nibar: string | null; nama_barang: string | null
    merek_tipe: string | null; spesifikasi_lainnya: string | null
    no_polisi: string | null; no_rangka: string | null; no_mesin: string | null
    luas: number | string | null; nilai_perolehan: number | null
  } | null
}

/**
 * Barang yang sedang/pernah dimanfaatkan.
 *
 * `descIds` = batasi ke SKPD ini (null = se-kabupaten) · `jenis` = saring jenis
 * pemanfaatan ('' = semua) · `hariIni` (YYYY-MM-DD) dioper, tidak dibaca dari
 * jam sistem di sini, supaya status Aktif/Berakhir & persentasenya bisa diuji.
 */
export async function muatPemanfaatan(
  supabase: SupabaseClient, p: { descIds: number[] | null; jenis: string; hariIni: string },
): Promise<BarisPemanfaatan[]> {
  let hq = supabase.from('jurnal_header')
    .select('id,no_sk,tanggal,skpd_id,payload').eq('kategori', 'pemanfaatan')
  if (p.descIds && p.descIds.length > 0) hq = hq.in('skpd_id', p.descIds)
  const { data: headers, error: hErr } = await hq.order('tanggal', { ascending: false })
  if (hErr) throw new Error(`gagal membaca perjanjian pemanfaatan: ${hErr.message}`)
  let hs = (headers || []) as unknown as Header[]
  if (p.jenis) hs = hs.filter(h => (h.payload?.jenis_pemanfaatan || '') === p.jenis)
  if (hs.length === 0) return []

  const skpdIds = [...new Set(hs.map(h => h.skpd_id))]
  const { data: skpdRows, error: sErr } = await supabase.from('admin_skpd').select('id,nama').in('id', skpdIds)
  if (sErr) throw new Error(`gagal membaca nama SKPD: ${sErr.message}`)
  const skpdNama: Record<number, string> = Object.fromEntries(
    ((skpdRows || []) as { id: number; nama: string }[]).map(s => [s.id, s.nama]))
  const hById = new Map(hs.map(h => [h.id, h]))

  const { data: led, error: lErr } = await supabase.from('transaksi_bmd')
    .select('id,header_id,jenis,nilai,payload,aset:aset_id(id,kode,uraian_barang,nibar,nama_barang,' +
      'merek_tipe,spesifikasi_lainnya,no_polisi,no_rangka,no_mesin,luas,nilai_perolehan)')
    .in('jenis', ['pemanfaatan', 'pemanfaatan_selesai', 'batal_pemanfaatan'] as never)
    .in('header_id', hs.map(h => h.id)).order('id', { ascending: true })
  if (lErr) throw new Error(`gagal membaca transaksi pemanfaatan: ${lErr.message}`)
  const ledRows = (led || []) as unknown as Led[]

  const acc = new Map<string, {
    kode: string; uraianBarang: string; nibar: string; nama: string
    merekTipe: string; spesifikasiLainnya: string
    noPolisi: string; noRangka: string; noMesin: string; luas: number | string | null
    lingkup: string; selesai: boolean; headerId: string
    asetId: string; nilaiPerolehan: number
  }>()
  for (const r of ledRows) {
    if (!r.aset || !hById.has(r.header_id)) continue
    const key = `${r.header_id}|${r.aset.id}`
    if (r.jenis === 'pemanfaatan') {
      acc.set(key, {
        kode: r.aset.kode || '-', uraianBarang: r.aset.uraian_barang || '-',
        nibar: r.aset.nibar || '-', nama: r.aset.nama_barang || '-',
        merekTipe: r.aset.merek_tipe || '-', spesifikasiLainnya: r.aset.spesifikasi_lainnya || '-',
        noPolisi: r.aset.no_polisi || '-', noRangka: r.aset.no_rangka || '-', noMesin: r.aset.no_mesin || '-',
        luas: r.aset.luas,
        lingkup: r.payload?.lingkup === 'sebagian' ? `Sebagian${r.payload?.bagian ? ` — ${r.payload.bagian}` : ''}` : 'Seluruhnya',
        selesai: false, headerId: r.header_id,
        asetId: r.aset.id, nilaiPerolehan: r.aset.nilai_perolehan ?? 0,
      })
    } else if (r.jenis === 'pemanfaatan_selesai') {
      const cur = acc.get(key); if (cur) cur.selesai = true
    } else { acc.delete(key) }
  }
  const today = p.hariIni
  const out: BarisPemanfaatan[] = []
  for (const [key, v] of acc) {
    const h = hById.get(v.headerId)!
    const pl = h.payload || {}
    const jenisRaw = pl.jenis_pemanfaatan || ''
    const status = v.selesai ? 'Selesai' : (pl.berakhir && today > pl.berakhir ? 'Berakhir' : 'Aktif')
    const mulai = pl.mulai || ''
    const berakhir = pl.berakhir || ''
    const persen = persenMasaPemanfaatan(mulai, berakhir, today)
    // Nilai TIDAK datang dari `transaksi_bmd.nilai` (baris pemanfaatan SELALU
    // 0 — event netral) melainkan dari nominal yang dientri di header
    // (jurnal_header.payload.nilai_pemanfaatan). null = jenisnya memang tak
    // berpendapatan (Pinjam Pakai); angka (termasuk 0) = berpendapatan tapi
    // mungkin belum diisi.
    out.push({
      skpdId: h.skpd_id, asetId: v.asetId, nilaiPerolehan: v.nilaiPerolehan,
      key, skpd: skpdNama[h.skpd_id] || '-', jenis: JENIS_PEMANFAATAN_LABEL[jenisRaw] || (jenisRaw || '-'), jenisRaw,
      mitra: pl.mitra || '-',
      kode: v.kode, uraianBarang: v.uraianBarang, nibar: v.nibar, nama: v.nama,
      merekTipe: v.merekTipe, spesifikasiLainnya: v.spesifikasiLainnya,
      noPolisi: v.noPolisi, noRangka: v.noRangka, noMesin: v.noMesin, luas: v.luas,
      lingkup: v.lingkup,
      mulai, berakhir, status,
      nilai: perluNilaiPemanfaatan(jenisRaw) ? (pl.nilai_pemanfaatan ?? 0) : null,
      noDok: h.no_sk, tglDok: h.tanggal, persen, band: persen == null ? null : bandPemanfaatan(persen),
    })
  }
  return out
}
