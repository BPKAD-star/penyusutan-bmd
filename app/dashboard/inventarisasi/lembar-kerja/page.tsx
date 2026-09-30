'use client'
// Lembar Kerja Inventarisasi — SATU halaman untuk seluruh jenis aset; jenisnya
// dipilih di dalam halaman (keputusan user 2026-10-01, pengganti 8 sub-menu
// Sidebar). `?jenis=<kode|semua>` dibaca PemilihJenis.
import LembarKerjaInventarisasi from '@/components/inventarisasi/LembarKerjaInventarisasi'

export default function Page() {
  return <LembarKerjaInventarisasi />
}
