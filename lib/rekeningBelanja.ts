// ============================================================================
// Kecocokan Kode Rekening Belanja ↔ Jenis Aset — PERINGATAN, bukan larangan.
//
// Aturannya sederhana: pengadaan aset tetap normalnya dibiayai Belanja Modal
// (5.2.xx), dan tiap jenis aset punya objek belanja modalnya sendiri. Kalau
// operator memilih rekening di luar itu, ia ditanya sekali — TIDAK diblokir,
// karena ada kasus sah (mis. barang yang memang dibeli dari belanja operasi lalu
// dikapitalisasi).
//
// ⚠️ DIPINDAH KE SINI 2026-08-27 (dulu konstanta lokal di Pengadaan.tsx) karena
// pintu KEDUA membutuhkannya: termin Pekerjaan Konstruksi. Ini kemunculan kedua
// sebuah ATURAN, bukan sekadar JSX yang mirip — CODING-STANDARD §1.2 menyuruh
// mengekstraknya sejak kemunculan kedua, sebab dua salinan yang menyimpang akan
// membuat dua pintu memperingatkan hal yang berbeda untuk rekening yang sama.
// ============================================================================

/**
 * Jenis BMD (golongan level-3) → objek Belanja Modal (5.2.0x) yang lazim.
 * Golongan yang tidak terdaftar (mis. 1.5.4 Aset Lain-Lain) sengaja tak
 * diperiksa kecocokan objeknya — isinya campuran, jadi tebakan apa pun akan
 * memperingatkan operator untuk hal yang benar.
 */
export const REK_MODAL_PER_GOLONGAN: Record<string, string[]> = {
  '1.3.1': ['5.2.01'],           // Tanah
  '1.3.2': ['5.2.02'],           // Peralatan dan Mesin
  '1.3.3': ['5.2.03'],           // Gedung dan Bangunan
  '1.3.4': ['5.2.04'],           // Jalan, Jaringan dan Irigasi
  '1.3.5': ['5.2.05'],           // Aset Tetap Lainnya
  '1.3.6': ['5.2.03', '5.2.04'], // KDP (gedung / JIJ)
  '1.5.3': ['5.2.06'],           // Aset Tidak Berwujud
}

/** Objek rekening = 3 segmen pertama, mis. '5.2.02.10.002.00003' → '5.2.02'. */
export const objekRekening = (kode: string) => kode.split('.').slice(0, 3).join('.')

/**
 * Peringatan (bukan blokir) untuk satu pasangan rekening × golongan.
 * Array kosong = tidak ada yang perlu ditanyakan.
 *
 * `namaGolongan` cuma untuk kalimatnya; kosong → kodenya saja yang disebut.
 */
export function cekWarningRekening(rekening: string, golongan: string, namaGolongan?: string): string[] {
  const rek = (rekening || '').trim()
  // Rekening belum dipilih bukan kesalahan di sini — kewajibannya (kalau ada)
  // ditegakkan validasi form masing-masing pintu, bukan oleh peringatan ini.
  if (!rek) return []

  if (!rek.startsWith('5.2.')) {
    return [`Kode rekening ${rek} berada DI LUAR Belanja Modal (5.2). ` +
      'Pengadaan aset tetap normalnya memakai kode 5.2.xx. Yakin memakai kode rekening ini?']
  }

  const objek = objekRekening(rek)
  const expected = REK_MODAL_PER_GOLONGAN[golongan]
  if (!expected || expected.includes(objek)) return []

  const nama = namaGolongan || golongan
  return [`Jenis aset ${golongan} — ${nama} biasanya memakai rekening ` +
    `${expected.map(e => `${e}.xx`).join(' / ')}, tetapi kode rekening yang dipilih ada di objek ` +
    `${objek}. Jenis aset & kode rekening TIDAK SINKRON. Yakin melanjutkan?`]
}
