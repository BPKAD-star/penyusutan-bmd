// Helper pencatatan transaksi BMD: 1 record ledger immutable + update state aset
// dari record itu (PLAN §1.1). Ledger ditulis DULUAN (sumber kebenaran), baru
// state aset disesuaikan. Koreksi kesalahan = transaksi baru, bukan edit.
import type { SupabaseClient } from '@supabase/supabase-js'
import { periodeDariTanggal } from '@/lib/bmd'

export type TransaksiInput = {
  asetId: string
  jenis: string
  tanggal?: string          // default hari ini
  nilai?: number
  skpdAsal?: number | null
  skpdTujuan?: number | null
  headerId?: string | null  // jurnal_header terkait (mis. batal_pengadaan → header kontrak aslinya, utk lacak balik saat "hapus kontrak sepenuhnya")
  payload?: Record<string, unknown>
  keterangan?: string
}

export async function catatTransaksi(supabase: SupabaseClient, t: TransaksiInput): Promise<{ error?: string }> {
  const tanggal = t.tanggal || new Date().toISOString().slice(0, 10)
  const periode = periodeDariTanggal(tanggal)

  const { error: trxError } = await supabase.from('transaksi_bmd').insert({
    aset_id: t.asetId,
    jenis: t.jenis,
    periode,
    tanggal,
    nilai: t.nilai ?? 0,
    skpd_asal: t.skpdAsal ?? null,
    skpd_tujuan: t.skpdTujuan ?? null,
    header_id: t.headerId ?? null,
    payload: t.payload ?? {},
    keterangan: t.keterangan ?? null,
  })
  if (trxError) return { error: `Gagal mencatat transaksi: ${trxError.message}` }

  // State aset "sekarang" menyusul dari transaksi (§1.1)
  const patch = patchAsetDari(t)
  if (patch) {
    const { error: asetError } = await supabase.from('aset').update(patch).eq('id', t.asetId)
    if (asetError) return { error: `Transaksi tercatat, tapi update aset gagal: ${asetError.message}` }
  }
  return {}
}

// Kolom aset yang boleh dikembalikan oleh batal_koreksi_spesifikasi (dari
// payload.prev). Sama cakupan dgn field yang bisa diubah koreksi_spesifikasi +
// foto_paths. Null DIIZINKAN (kembalikan field ke kosong).
const KOREKSI_SPEK_COLS = new Set([
  'nama_barang', 'spesifikasi_lainnya', 'merek_tipe', 'satuan',
  'nomor_dokumen_kepemilikan', 'nama_dokumen_kepemilikan', 'jenis_hak', 'tanggal_dokumen_kepemilikan',
  'no_polisi', 'no_bpkb', 'no_rangka', 'no_mesin', 'asal_usul', 'kondisi_barang',
  'wilayah_kode', 'alamat_detail', 'penggunaan_pengamanan', 'keterangan',
  'luas', 'tahun_pengadaan', 'latitude', 'longitude', 'foto_paths',
])

// Ambil field spesifikasi dari sub-payload (`spek` / `spek_prev`) dgn whitelist
// yang sama seperti koreksi spesifikasi. `izinkanKosong` = arah PEMULIHAN
// (batal): null & string kosong ikut ditulis, supaya field yang dulu memang
// kosong benar-benar kembali kosong — sama persis alasannya dgn
// `batal_koreksi_spesifikasi`.
function patchSpek(spek: unknown, izinkanKosong: boolean): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (!spek || typeof spek !== 'object' || Array.isArray(spek)) return patch
  for (const [k, v] of Object.entries(spek as Record<string, unknown>)) {
    if (!KOREKSI_SPEK_COLS.has(k)) continue
    if (izinkanKosong) { patch[k] = v; continue }
    if (typeof v === 'string' && v.trim() !== '') patch[k] = v
    else if (typeof v === 'number' && Number.isFinite(v)) patch[k] = v
    else if (Array.isArray(v)) patch[k] = v
  }
  return patch
}

function patchAsetDari(t: TransaksiInput): Record<string, unknown> | null {
  const p = t.payload ?? {}
  switch (t.jenis) {
    case 'mutasi_internal':
    case 'pengalihan_status':
      return t.skpdTujuan ? { skpd_id: t.skpdTujuan } : null
    case 'reklas_kode':
      return p.kode_baru ? { kode: p.kode_baru } : null
    case 'reklas_golongan':
      // Perubahan Fungsi BMD (lintas golongan) — patch kode SAMA seperti
      // reklas_kode; bedanya cuma di engine (fresh-start vs retroaktif,
      // lihat lib/engine/penyusutan.ts).
      return p.kode_baru ? { kode: p.kode_baru } : null
    case 'reklas_komptabel':
      return typeof p.intra_ekstra === 'string' ? { intra_ekstra: p.intra_ekstra } : null
    case 'koreksi_nilai':
      // nilai = delta ±; nilai_perolehan baru dikirim caller (menghindari race)
      return typeof p.nilai_perolehan_baru === 'number' ? { nilai_perolehan: p.nilai_perolehan_baru } : null
    case 'koreksi_spesifikasi': {
      const patch: Record<string, unknown> = {}
      for (const k of [
        'nama_barang', 'spesifikasi_lainnya', 'merek_tipe', 'satuan',
        'nomor_dokumen_kepemilikan', 'nama_dokumen_kepemilikan', 'jenis_hak', 'tanggal_dokumen_kepemilikan',
        'no_polisi', 'no_bpkb', 'no_rangka', 'no_mesin',
        'asal_usul', 'kondisi_barang',
        // Lokasi (menu Koreksi Spesifikasi — non-tanah; tanah tetap lewat GIS).
        'wilayah_kode', 'alamat_detail', 'penggunaan_pengamanan', 'keterangan',
      ] as const) {
        if (typeof p[k] === 'string' && p[k]) patch[k] = p[k]
      }
      if (typeof p.luas === 'number' && p.luas > 0) patch.luas = p.luas
      if (typeof p.tahun_pengadaan === 'number' && p.tahun_pengadaan > 0) patch.tahun_pengadaan = p.tahun_pengadaan
      // Koordinat peta (numeric) — caller mengirim number; 0 valid utk latitude khatulistiwa.
      if (typeof p.latitude === 'number') patch.latitude = p.latitude
      if (typeof p.longitude === 'number') patch.longitude = p.longitude
      if (Array.isArray(p.foto_paths)) patch.foto_paths = p.foto_paths
      return Object.keys(patch).length ? patch : null
    }
    case 'kapitalisasi':
      return typeof p.nilai_perolehan_baru === 'number' ? { nilai_perolehan: p.nilai_perolehan_baru } : null
    case 'akumulasi_kdp':
    case 'batal_akumulasi_kdp':
    case 'kdp_selesai_keluar':
      // Nilai KDP (aset 1.3.6) naik/turun; saldo baru dikirim caller (hindari race),
      // sama pola dgn kapitalisasi/koreksi_nilai. KDP tak disusutkan → cuma nilai.
      return typeof p.nilai_perolehan_baru === 'number' ? { nilai_perolehan: p.nilai_perolehan_baru } : null
    case 'kdp_selesai_masuk':
      // Event pada aset tetap BARU hasil carve-out. Aset sudah dibuat lengkap dgn
      // nilai_perolehan-nya, jadi tak perlu patch tambahan di sini.
      return null
    case 'penghapusan_pemindahtanganan':
    case 'penghapusan_sebab_lain':
      // Soft-delete: hilang dari laporan, tetap tersimpan di DB (§5 no.11)
      return { status: 'dihapus' }
    case 'batal_pengadaan':
      // Koreksi input pasca-approve (mis. kelebihan kuantitas dari Pengadaan):
      // barang dianggap tidak pernah ada — soft-delete, dicatat mundur ke tgl
      // pengadaan aslinya (bukan hari ini) supaya hilang dari SEMUA periode.
      return { status: 'dihapus' }
    case 'batal_hibah_masuk':
    case 'batal_tukar_menukar':
    case 'batal_hasil_inventarisasi':
    case 'batal_perolehan_lainnya':
      // Unapprove (Buka Kunci) dokumen Hibah/Tukar Menukar/Hasil Inventarisasi/
      // Perolehan Lainnya — sama pola persis dgn batal_pengadaan di atas.
      return { status: 'dihapus' }
    case 'koreksi_pencatatan_ganda':
      // Gabung barang duplikat: yang BUKAN survivor soft-delete, dicatat
      // mundur ke tgl perolehan aslinya sendiri (bukan hari ini) — sama pola
      // dgn batal_pengadaan, cuma beda jenis ledger biar kebeda di audit.
      return { status: 'dihapus' }
    case 'pemecahan_keluar':
      // Pemecahan Barang: INDUK di-retire (soft-delete). Penyusutan berhenti
      // sejak periode pemecahan; induk hilang dari laporan (SEMBUNYI).
      return { status: 'dihapus' }
    case 'pemecahan_masuk':
      // Pecahan (aset BARU) sudah dibuat lengkap dgn nilai_perolehan-nya sebelum
      // event ini — sama pola dgn kdp_selesai_masuk. Tak perlu patch tambahan.
      return null
    case 'batal_pemecahan':
      // Batal pemecahan: INDUK aktif lagi (penyusutan lanjut di engine).
      return { status: 'aktif' }
    case 'batal_pemecahan_masuk':
      // Batal pemecahan: PECAHAN dibuang (soft-delete). Ledger pemecahan_masuk-nya
      // tetap tersimpan utk audit (append-only).
      return { status: 'dihapus' }
    case 'penggabungan_keluar':
      // Penggabungan Barang: barang SUMBER dilebur ke induk (soft-delete).
      // Nilainya tidak hilang — ia pindah ke induk lewat penggabungan_masuk.
      return { status: 'dihapus' }
    case 'penggabungan_masuk': {
      // INDUK: nilai perolehan di register jadi jumlah seluruh anggota. WAJIB
      // ada — Daftar Barang membaca `aset.nilai_perolehan` TERKINI, jadi tanpa
      // patch ini 35 baris pagar (Rp25.252.500) menyusut jadi satu baris
      // Rp721.500 dan Rp24,5 juta lenyap dari register tanpa pesan apa pun.
      const patch: Record<string, unknown> = {}
      if (typeof p.nilai_perolehan_baru === 'number') patch.nilai_perolehan = p.nilai_perolehan_baru
      // `payload.spek` = spesifikasi HASIL gabungan (nama & satuan barunya —
      // "Pagar Besi 125 m", satuan "Unit" menggantikan "Meter Persegi").
      // Dititipkan di event ini, bukan baris koreksi_spesifikasi tersendiri,
      // supaya satu peristiwa tetap satu baris ledger per aset: baris kedua
      // akan jadi "transaksi lebih baru" yang memblokir pembatalannya sendiri.
      Object.assign(patch, patchSpek(p.spek, false))
      return Object.keys(patch).length ? patch : null
    }
    case 'batal_penggabungan':
      // Batal penggabungan: barang sumber aktif & tampil lagi (pola batal_pemecahan).
      return { status: 'aktif' }
    case 'batal_penggabungan_masuk': {
      // INDUK kembali ke nilai perolehan sebelum digabung (dikirim caller sbg
      // nilai_perolehan_baru = payload.nilai_lama, pola batal_koreksi_nilai) DAN
      // ke spesifikasi sebelum digabung (`spek_prev`, null diizinkan — pola
      // batal_koreksi_spesifikasi). Statusnya tak disentuh: induk tak pernah
      // dihapus, jadi tak ada yang perlu dihidupkan lagi.
      const patch: Record<string, unknown> = {}
      if (typeof p.nilai_perolehan_baru === 'number') patch.nilai_perolehan = p.nilai_perolehan_baru
      Object.assign(patch, patchSpek(p.spek_prev, true))
      return Object.keys(patch).length ? patch : null
    }
    case 'batal_penghapusan':
      // Kebalikan penghapusan: barang kembali aktif, penyusutan lanjut lagi.
      return { status: 'aktif' }
    case 'kapitalisasi_serap':
      // Barang anak diserap ke induk: hilang dari laporan, penyusutan berhenti.
      return { status: 'dihapus' }
    case 'batal_kapitalisasi': {
      // Batal kapitalisasi: induk → nilai perolehan kembali (payload.nilai_perolehan_baru),
      // barang anak → status aktif lagi. Keduanya di-set aktif (induk memang sudah aktif).
      const patch: Record<string, unknown> = { status: 'aktif' }
      if (typeof p.nilai_perolehan_baru === 'number') patch.nilai_perolehan = p.nilai_perolehan_baru
      return patch
    }
    case 'batal_koreksi_nilai':
      // Batal koreksi nilai: kembalikan nilai_perolehan ke nilai_lama (dikirim
      // caller sbg nilai_perolehan_baru). Engine juga mengabaikan koreksi_nilai
      // target (target_trx_id) supaya beban penyusutan ikut kembali.
      return typeof p.nilai_perolehan_baru === 'number' ? { nilai_perolehan: p.nilai_perolehan_baru } : null
    case 'batal_koreksi_spesifikasi': {
      // Kembalikan field aset ke nilai SEBELUM koreksi (payload.prev). Null
      // DIIZINKAN (kembalikan ke kosong) — beda dari koreksi_spesifikasi yg cuma
      // menimpa nilai non-kosong.
      const prev = (p.prev && typeof p.prev === 'object' && !Array.isArray(p.prev)) ? p.prev as Record<string, unknown> : null
      if (!prev) return null
      const patch: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(prev)) if (KOREKSI_SPEK_COLS.has(k)) patch[k] = v
      return Object.keys(patch).length ? patch : null
    }
    case 'batal_koreksi_pencatatan_ganda':
      // Kebalikan gabung duplikat: barang yg tadinya di-soft-delete aktif lagi
      // (pola SAMA batal_penghapusan). Engine berhenti=false + MUNCUL di Daftar Barang.
      return { status: 'aktif' }
    default:
      return null
  }
}
