'use client'
// ============================================================================
// Strip peringatan "nama SKPD gagal dimuat".
//
// Pasangan wajib `useNamaSkpdMap` (2026-09-16). Hook itu menyediakan saluran
// `err` supaya kegagalan tak lagi ditelan — tapi saluran yang tak pernah
// dirender sama saja dengan menelannya, cuma lebih panjang. Komponen ini yang
// membuat kewajiban itu semurah satu baris, jadi tak ada alasan melewatkannya.
//
// ⚠️ AMBER, bukan merah, dan itu bukan soal selera: nama SKPD adalah LABEL di
// atas angka yang sudah benar — tak satu pun perhitungan bergantung padanya.
// Merah (yang di repo ini berarti "daftar dibatalkan") akan berbohong.
// ============================================================================
export default function PeringatanNamaSkpd({ err }: { err: string }) {
  if (!err) return null
  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      {err} — angkanya tetap benar; yang terdampak cuma nama SKPD yang ditampilkan.
    </div>
  )
}
