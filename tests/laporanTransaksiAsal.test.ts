// Penjaga penanda "asal baris" di components/LaporanTransaksi.tsx.
//
// Latarnya (2026-09-07): user membuka Laporan Koreksi & menemukan 200 baris
// "Pencatatan Ganda" yang tak pernah ia entri. Diperiksa ke produksi —
// barisnya NYATA: 195 dari batch SQL "Import Gedung Bangunan Lengkap"
// 2026-07-10, 5 dari batch dedup impor 9–10 Juli, 2 dari migrasi 20260819_01.
// Versi pertama perbaikannya cuma MENANDAI barisnya; user menilai laporan tetap
// tak terbaca dgn 200 baris yang bukan pekerjaannya, jadi sejak sore yang sama
// penyaring "Asal baris" BERBAWAAN `menu` — barisnya DISEMBUNYIKAN (bukan
// dihapus: ledger append-only, & peristiwanya sudah dihitung Daftar Barang,
// Penyusutan, Laporan BMD, serta Rekonsiliasi).
//
// Aman karena DIUKUR: `sum(nilai)` seluruh 202 baris `koreksi_pencatatan_ganda`
// = Rp0, jadi menyembunyikannya tak menggeser satu rupiah pun — yang berubah
// cuma jumlah barisnya (216 -> 16).
//
// Yang dijaga di sini SATU hal, dan ia kelas kesalahan yang tak bersuara:
// **pembedanya `created_by`, BUKAN `header_id`.**
//
// Diverifikasi ke produksi 2026-09-07:
//   created_by NULL → 202 koreksi_pencatatan_ganda · 6 koreksi_nilai ·
//                     6 batal_koreksi_nilai · 2 batal_koreksi_pencatatan_ganda ·
//                     2 dari 8 batal_kapitalisasi        (semuanya batch SQL)
//   created_by ISI  → seluruh baris yang lahir dari menu
//   header_id NULL  → JUGA kena baris menu yang sah: batal_penghapusan 14/14,
//                     kapitalisasi 3/3, kapitalisasi_serap 3/3, dan 4 dari 14
//                     penghapusan_pemindahtanganan
//
// Jadi memakai `header_id` akan menuduh transaksi yang benar-benar dientri
// operator sebagai "perbaikan data admin" — tuduhan yang tercetak di layar DAN
// di berkas Excel, tanpa satu pun error.
//
// Kolom `created_by` ber-DEFAULT `auth.uid()` (diverifikasi ke
// information_schema), jadi tulisan dari klien yang login PASTI terisi &
// tulisan dari SQL Editor / service_role pasti kosong.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const BERKAS = path.join(path.resolve(__dirname, '..'), 'components/LaporanTransaksi.tsx')
const isi = () => fs.readFileSync(BERKAS, 'utf8')
/** Sumber tanpa baris komentar — supaya catatan penjelas tak ikut terbaca. */
const kode = () => isi().split('\n').filter(b => !b.trim().startsWith('//')).join('\n')

describe('LaporanTransaksi — penanda asal baris', () => {
  it('berkasnya ada & tak hampa', () => {
    expect(fs.existsSync(BERKAS)).toBe(true)
    expect(isi().length).toBeGreaterThan(2000)
  })

  it('`created_by` benar-benar DI-SELECT — kalau tidak, semua baris tertuduh', () => {
    // Kolom yang tak ikut di `.select()` datang sbg `undefined`, dan
    // `undefined == null` → SELURUH baris ditandai "perbaikan data". Kesalahan
    // yang paling gampang terjadi & paling tak bersuara di fitur ini.
    expect(kode(), 'created_by tak ada di select query').toMatch(/select\([^)]*created_by/)
  })

  it('pembedanya `created_by`, BUKAN `header_id`', () => {
    const k = kode()
    expect(k, 'fungsi pembeda `dariPerbaikanData` hilang').toContain('dariPerbaikanData')
    expect(k).toMatch(/dariPerbaikanData\s*=\s*\(r: Trx\)\s*=>\s*r\.created_by\s*==\s*null/)
    // ⚠️ `header_id` tak boleh dipakai menilai asal baris sama sekali di sini —
    // lihat angka produksinya di kepala berkas.
    expect(k, 'header_id dipakai menilai asal baris — itu SALAH (lihat kepala berkas)')
      .not.toContain('header_id')
  })

  it('SATU definisi asal baris, dipakai bersama layar & export', () => {
    // Empat salinan yang bisa menyimpang berarti kartu bilang "5 perbaikan
    // data" sementara tabelnya menandai 7 & Excel-nya menandai lain lagi.
    const k = kode()
    const def = [...k.matchAll(/const dariPerbaikanData/g)].length
    expect(def, 'definisi `dariPerbaikanData` lebih dari satu').toBe(1)
    // Dipakai di: penyaring, hitungan kartu, badge baris, & kolom Excel.
    expect([...k.matchAll(/dariPerbaikanData\(/g)].length).toBeGreaterThanOrEqual(4)
  })

  it("bawaan penyaringnya 'menu' — baris perbaikan data tak ikut tampil", () => {
    // Keputusan user 2026-09-07 (lihat kepala berkas). Aman karena barisnya
    // bernilai Rp0; kalau kelak ada jenis batch yang berduit, ukur ulang dulu.
    expect(kode()).toMatch(/useState<AsalBaris>\('menu'\)/)
  })

  it('yang tersaring TETAP disebut — laporan tak boleh diam-diam kurang baris', () => {
    // ⚠️ Batas minimum yang tak boleh ikut dicabut waktu stripnya dihapus:
    // laporan yang menyaring 200 baris tanpa mengatakannya adalah dokumen yang
    // TAK TERLIHAT TERPOTONG — kelas kesalahan paling mahal di modul pelaporan.
    const k = kode()
    expect(k, 'penghitung baris tersaring hilang').toContain('const nTersaring')
    expect(k, 'jumlah baris tersaring tak disebut di layar').toContain('nTersaring > 0')
    expect(k, 'kop cetak tak menyebut penyaring asal yang sedang aktif')
      .toContain("`Asal baris: ${ASAL_LABEL[asal]}`")
  })

  it('baris perbaikan data masih BISA dilihat — disembunyikan, bukan dihapus', () => {
    // Peristiwanya nyata & sudah dihitung empat laporan lain; mencabut satu-
    // satunya tempat ia bisa ditelusuri di aplikasi akan menghilangkan jejaknya.
    const k = kode()
    expect(k).toContain("semua: 'Semua asal")
    expect(k).toContain("perbaikan: 'Perbaikan data (admin)")
  })

  it('penyaring asal ikut ke Export & ke kop cetak', () => {
    const k = kode()
    // Berkas yang menyaring sebagian baris tanpa menyebutkannya adalah dokumen
    // yang tak terlihat terpotong — alasan yang sama dgn `barisCetak`.
    expect(k, 'ambilSemua() tak menerapkan penyaring asal').toContain('return saringAsal(hasil)')
    expect(k, 'kop cetak tak menyebut penyaring asal yang sedang aktif')
      .toContain("`Asal baris: ${ASAL_LABEL[asal]}`")
    expect(k, 'kolom Asal Baris tak ikut ke Excel').toContain("'Asal Baris'")
  })

  it('kendalinya cuma muncul kalau memang ada barisnya', () => {
    // Di menu yang seluruh barisnya lahir dari aplikasi (Penghapusan, per
    // 2026-09-07), kendali ini tak menyaring apa pun & hanya jadi kotak mati.
    expect([...kode().matchAll(/nPerbaikan > 0/g)].length).toBeGreaterThanOrEqual(1)
  })
})
