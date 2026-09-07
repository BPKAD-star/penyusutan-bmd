'use client'
// Menu Pelaporan → Pengelolaan → Reklasifikasi.
//
// ⚠️ Sejak 2026-09-07 halaman ini TIDAK lagi memakai `LaporanTransaksi` yang
// generik: ia butuh penyaring ARAH (penambahan / pengurangan) di atas tiga tab
// — Daftar Transaksi · Rekap per SKPD · Format Permendagri IV.F.2–F.6 — dan
// komponen generik itu tak punya satu pun di antaranya.
//
// ⚠️ Kepindahan ini ikut menutup CACAT LAMA yang senyap: `LaporanTransaksi`
// menyaring SKPD lewat `skpd_asal`/`skpd_tujuan`, dan baris ledger reklasifikasi
// **tidak punya kedua kolom itu** (barangnya tak berpindah SKPD, cuma berganti
// kodefikasi) — jadi memilih SKPD di menu lama menghasilkan **0 transaksi** yang
// kelihatan sah. Penggantinya menyaring lewat `aset.skpd_id`; alasan & ongkosnya
// di kepala lib/laporanReklas.ts.
//
// ⚠️ Saringan `batal_reklas` (`BATAL_TARGET_JENIS.reklasifikasi`) yang dulu
// dikirim sebagai prop dari sini pindah ke dalam pemuatnya — dan di sana ia
// TERSCOPE ke aset yang memang ditanya, bukan menyapu seluruh ledger.
import LaporanReklas from '@/components/pelaporan/LaporanReklas'

export default function Page() {
  return <LaporanReklas />
}
