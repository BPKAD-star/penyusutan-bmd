'use client'
// Bahan peniru FORM LKI (Lembar Kerja Inventarisasi) untuk materi "Inventarisasi
// Tanah" & "Inventarisasi Gedung dan Bangunan". Bentuknya mengikuti
// components/inventarisasi/LkiForm.tsx: kotak biru "Tercatat", radio Sesuai /
// Tidak Sesuai, bagian berkode huruf.
//
// ⚠️ Judul bagian, label radio, & pesan DISALIN dari LkiForm.tsx (Seksi, SesuaiRadio,
// KotakTercatat) dan lib/inventarisasi.ts (SEBAB_TIDAK_ADA, kekuranganLki). Kalau
// label di aplikasi diganti, sesuaikan di sini — peserta mencari tulisan yang sama
// dengan yang ditunjukkan di paparan. Tak ada test yang menjaganya.
import type { ReactNode } from 'react'

/** Satu bagian form: kode huruf + judul (sama dgn `Seksi` di LkiForm). */
// `besar` = ukuran untuk slide yang kartunya JADI isi utama (bukan tiruan kecil di
// sudut): huruf ±2–3 px lebih besar supaya terbaca dari belakang ruangan.
export function SeksiMock({ kode, judul, sorot, besar, children }: { kode: string; judul: string; sorot?: boolean; besar?: boolean; children?: ReactNode }) {
  return (
    <div className={`pt-2 ${sorot ? 'rounded-lg bg-amber-50/60 ring-2 ring-amber-200 px-2 pb-2 -mx-2' : 'border-t border-gray-100'}`}>
      <p className={`${besar ? 'text-[15.5px] mb-2.5' : 'text-[11.5px] mb-1.5'} font-semibold text-gray-700`}><span className="text-gray-400 mr-1">{kode}.</span>{judul}</p>
      {children}
    </div>
  )
}

/** Kotak biru "Tercatat" — nilai yang sedang berlaku di register. */
export const Tercatat = ({ nilai, besar }: { nilai: ReactNode; besar?: boolean }) => (
  <div className={`rounded-md bg-blue-50 border border-blue-100 ${besar ? 'px-3 py-1.5' : 'px-2 py-1'}`}>
    <p className={`${besar ? 'text-[10.5px]' : 'text-[8.5px]'} font-medium text-blue-400 uppercase tracking-wide`}>Tercatat</p>
    <p className={`${besar ? 'text-[14px]' : 'text-[11px]'} text-blue-900 leading-snug`}>{nilai}</p>
  </div>
)

/** Satu pilihan radio. */
export const Radio = ({ label, aktif, besar }: { label: ReactNode; aktif?: boolean; besar?: boolean }) => (
  <span className={`inline-flex items-center ${besar ? 'gap-2 text-[14.5px]' : 'gap-1.5 text-[11px]'} text-gray-700`}>
    <span className={`${besar ? 'w-4 h-4' : 'w-3 h-3'} flex-shrink-0 rounded-full border flex items-center justify-center ${aktif ? 'border-teal' : 'border-gray-400'}`}>
      {aktif && <span className={`${besar ? 'w-2 h-2' : 'w-1.5 h-1.5'} rounded-full bg-teal`} />}
    </span>
    {label}
  </span>
)

/** Kotak isian bergaya input. */
export const Ketik = ({ nilai, kosong, besar }: { nilai: ReactNode; kosong?: boolean; besar?: boolean }) => (
  <div className={`${besar ? 'h-9 text-[13.5px]' : 'h-7 text-[11px]'} rounded-md border border-gray-300 bg-white px-2 flex items-center truncate ${kosong ? 'text-gray-400' : 'text-gray-700'}`}>{nilai}</div>
)

/**
 * Bagian ber-radio Sesuai / Tidak Sesuai. `pilih` = jawaban yang sedang ditunjukkan
 * (`undefined` = belum dijawab, KEDUA radio polos — seperti aplikasi sejak 2026-09-24).
 * `seharusnya` = isian yang muncul begitu Tidak Sesuai dipilih.
 */
export function SesuaiMock({ lama, pilih, seharusnya, ket }: {
  lama: ReactNode; pilih?: 'sesuai' | 'tidak'; seharusnya?: ReactNode; ket?: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Tercatat nilai={lama} />
      <div className="flex items-center gap-4">
        <Radio label="Sesuai" aktif={pilih === 'sesuai'} />
        <Radio label="Tidak Sesuai" aktif={pilih === 'tidak'} />
      </div>
      {pilih === 'tidak' && seharusnya != null && <Ketik nilai={seharusnya} />}
      {ket && <p className="text-[10px] text-gray-400 leading-snug">{ket}</p>}
    </div>
  )
}

/** Foto kecil bergaya (pengganti foto sungguhan). */
export function FotoKecil({ ukuran = 40, baru }: { ukuran?: number; baru?: boolean }) {
  return (
    <span className="relative inline-block flex-shrink-0">
      <svg width={ukuran} height={ukuran} viewBox="0 0 34 34" className="rounded border border-gray-200" aria-hidden>
        <rect width="34" height="34" fill="#dbeafe" />
        <circle cx="26" cy="9" r="3.5" fill="#fde68a" />
        <path d="M0 28 L10 15 L18 24 L24 18 L34 29 V34 H0z" fill="#0d9488" fillOpacity=".75" />
      </svg>
      {baru && <span className="absolute -top-1.5 -right-1.5 px-1 rounded bg-amber-400 text-white text-[8px] font-bold leading-[13px]">BARU</span>}
    </span>
  )
}

/** Peta mini bergaya (pengganti MapPicker sungguhan) dengan satu pin. */
export function PetaMini({ tinggi = 96, pinBaru }: { tinggi?: number; pinBaru?: boolean }) {
  return (
    <div className="relative rounded-md border border-gray-300 overflow-hidden bg-[#e8efe4]" style={{ height: tinggi }}>
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden>
        <path d="M0 70 C40 55 70 85 110 65 S170 55 200 70" fill="none" stroke="#fff" strokeWidth="5" />
        <path d="M60 0 C65 30 55 60 70 100" fill="none" stroke="#fff" strokeWidth="4" />
        <path d="M130 0 C125 40 150 70 140 100" fill="none" stroke="#f5f1d8" strokeWidth="3" />
        <rect x="75" y="20" width="26" height="18" fill="#cfe3cc" />
        <rect x="150" y="25" width="30" height="22" fill="#d9e6d6" />
      </svg>
      <span className="absolute left-[38%] top-[34%] -translate-x-1/2 -translate-y-full text-[16px] leading-none text-gray-400" title="titik tercatat">📍</span>
      {pinBaru && <span className="absolute left-[62%] top-[48%] -translate-x-1/2 -translate-y-full text-[18px] leading-none">📍</span>}
    </div>
  )
}
