// Label + "tone" (masuk/keluar/netral) per jenis transaksi_bmd, dipakai KIBAR
// (app/kibar/[nibar]) buat render timeline riwayat 1 barang. "masuk" = barang
// lahir/muncul/nilai naik, "keluar" = barang hilang dari register/nilai
// terserap, "netral" = barang tetap ada tapi atributnya berubah (koreksi,
// reklasifikasi, transfer SKPD).
export type Tone = 'masuk' | 'keluar' | 'netral'

export const KIBAR_JENIS_LABEL: Record<string, { label: string; tone: Tone }> = {
  saldo_awal: { label: 'Saldo Awal (Baseline e-BMD 2025)', tone: 'masuk' },
  saldo_awal_checkpoint: { label: 'Checkpoint Saldo Awal (Tutup Tahun)', tone: 'netral' },
  pengadaan: { label: 'Pengadaan', tone: 'masuk' },
  hibah_masuk: { label: 'Hibah', tone: 'masuk' },
  tukar_menukar: { label: 'Tukar Menukar (Perolehan)', tone: 'masuk' },
  hasil_inventarisasi: { label: 'Hasil Inventarisasi', tone: 'masuk' },
  perolehan_lainnya: { label: 'Perolehan Lainnya', tone: 'masuk' },
  mutasi_internal: { label: 'Mutasi Internal (antar sub-SKPD)', tone: 'netral' },
  pengalihan_status: { label: 'Pengalihan Status Penggunaan (antar SKPD)', tone: 'netral' },
  reklas_kode: { label: 'Reklasifikasi Kesalahan Kodefikasi', tone: 'netral' },
  reklas_komptabel: { label: 'Reklasifikasi Komptabel', tone: 'netral' },
  reklas_golongan: { label: 'Reklasifikasi Perubahan Fungsi BMD', tone: 'netral' },
  koreksi_nilai: { label: 'Koreksi Nilai', tone: 'netral' },
  koreksi_spesifikasi: { label: 'Koreksi Spesifikasi', tone: 'netral' },
  koreksi_kuantitas: { label: 'Koreksi Kuantitas', tone: 'netral' },
  koreksi_pencatatan_ganda: { label: 'Koreksi Pencatatan Ganda (Digabung — Duplikat)', tone: 'keluar' },
  kapitalisasi: { label: 'Kapitalisasi (Rehab/Penambahan Nilai)', tone: 'masuk' },
  kapitalisasi_serap: { label: 'Diserap ke Aset Induk (Kapitalisasi)', tone: 'keluar' },
  penghapusan_pemindahtanganan: { label: 'Penghapusan — Pemindahtanganan', tone: 'keluar' },
  penghapusan_sebab_lain: { label: 'Penghapusan — Sebab Lain', tone: 'keluar' },
  batal_pengadaan: { label: 'Pembatalan Pengadaan (Koreksi)', tone: 'keluar' },
  batal_hibah_masuk: { label: 'Pembatalan Hibah (Koreksi)', tone: 'keluar' },
  batal_hasil_inventarisasi: { label: 'Pembatalan Hasil Inventarisasi (Koreksi)', tone: 'keluar' },
  batal_perolehan_lainnya: { label: 'Pembatalan Perolehan Lainnya (Koreksi)', tone: 'keluar' },
  batal_tukar_menukar: { label: 'Pembatalan Tukar Menukar (Koreksi)', tone: 'keluar' },
  batal_penghapusan: { label: 'Pembatalan Penghapusan (Muncul Kembali)', tone: 'masuk' },
  batal_kapitalisasi: { label: 'Pembatalan Kapitalisasi', tone: 'netral' },
}

const SUB_JENIS_LABEL: Record<string, string> = {
  hibah: 'Hibah', penjualan: 'Penjualan', tukar_menukar: 'Tukar Menukar', penyertaan_modal: 'Penyertaan Modal',
}

const formatRp = (v: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(v)

// Ringkasan 1 baris dari payload, spesifik per jenis — dipakai KIBAR biar
// timeline-nya nggak cuma nampilin "keterangan" mentah. Tidak exhaustive utk
// SEMUA kemungkinan payload key, cukup yang paling sering dibutuhkan audit.
// `skpdAsal`/`skpdTujuan` = NAMA SKPD (sudah di-resolve pemanggil dari kolom
// transaksi_bmd.skpd_asal/skpd_tujuan — bukan dari payload, krn itu kolom biasa).
export function kibarDetail(
  jenis: string,
  payload: Record<string, unknown> | null,
  skpdAsal?: string | null,
  skpdTujuan?: string | null,
): string | null {
  const p = payload || {}
  switch (jenis) {
    case 'koreksi_nilai': {
      const lama = Number(p.nilai_lama ?? 0), baru = Number(p.nilai_perolehan_baru ?? 0)
      return `${formatRp(lama)} → ${formatRp(baru)}`
    }
    case 'kapitalisasi': {
      const rehab = Number(p.nilai_rehab ?? 0), baru = Number(p.nilai_perolehan_baru ?? 0)
      const persen = p.persen_rehab != null ? ` (${p.persen_rehab}%)` : ''
      return `Rehab ${formatRp(rehab)}${persen} — nilai jadi ${formatRp(baru)}`
    }
    case 'penghapusan_pemindahtanganan': {
      const sub = typeof p.sub_jenis === 'string' ? p.sub_jenis : ''
      return SUB_JENIS_LABEL[sub] || sub || null
    }
    case 'reklas_kode':
    case 'reklas_golongan':
      return p.kode_baru ? `Kode baru: ${p.kode_baru}` : null
    case 'koreksi_pencatatan_ganda':
      return p.survivor_nibar ? `Digabung ke NIBAR: ${p.survivor_nibar}` : null
    case 'kapitalisasi_serap':
      return p.induk_nibar ? `Diserap ke NIBAR induk: ${p.induk_nibar}` : null
    case 'batal_kapitalisasi':
      return p.no_dokumen ? `Dokumen: ${p.no_dokumen}` : null
    case 'pengalihan_status':
    case 'mutasi_internal': {
      const base = skpdAsal && skpdTujuan ? `${skpdAsal} → ${skpdTujuan}` : null
      return p.reversal ? `${base ? base + ' — ' : ''}Pengembalian ke SKPD asal` : base
    }
    default:
      return null
  }
}
