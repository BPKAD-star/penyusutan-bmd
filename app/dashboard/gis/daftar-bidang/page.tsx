import { redirect } from 'next/navigation'

// Rute sub-menu lama (2026-09-11..2026-09-25) — DIBIARKAN HIDUP sbg pengalih
// (pola SSH/HSPK, rules.md) supaya tautan yang terlanjur tersebar (bookmark,
// riwayat) tak mati. Tampilannya sekarang tab "Daftar Bidang" DI DALAM
// /dashboard/gis sendiri (keputusan user 2026-09-26, GIS Tanah balik jadi
// SATU menu sidebar) — `?view=daftar-bidang` dibaca app/dashboard/gis/page.tsx
// utk langsung membuka tab itu.
export default function Page() {
  redirect('/dashboard/gis?view=daftar-bidang')
}
