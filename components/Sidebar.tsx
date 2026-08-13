'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type NavNode =
  | { type: 'leaf'; href: string; label: string; external?: boolean }
  | { type: 'group'; label: string; icon?: React.ReactNode; children: NavNode[] }

const ic = (d: string) => <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />

const ICON = {
  dashboard: ic('M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'),
  pembukuan: ic('M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253'),
  daftar: ic('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4'),
  penyusutan: ic('M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z'),
  pelaporan: ic('M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'),
  ipa: ic('M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9'),
  gis: ic('M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7'),
  kendaraan: ic('M8 17a2 2 0 11-4 0 2 2 0 014 0zm12 0a2 2 0 11-4 0 2 2 0 014 0zM4 17H3v-4m0 0l2-5h9l4 5m-15 0h15m0 0h2v4h-1M13 8V5a1 1 0 00-1-1H4'),
  user: ic('M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z'),
  saldo: ic('M9 7h1m-1 4h1m4-4h1m-1 4h1m-6 8V5a2 2 0 012-2h6a2 2 0 012 2v14M5 21h14M9 21v-4a1 1 0 011-1h4a1 1 0 011 1v4'),
  building: ic('M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4'),
  external: ic('M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14'),
  logout: ic('M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1'),
}

const navTree: NavNode[] = [
  { type: 'leaf', href: '/dashboard', label: 'Dashboard' },
  {
    // RKBMD jadi grup 2026-08-10. Standar Harga PINDAH ke sini dari menu Admin
    // (SSH & SBSK) — bukan lagi urusan admin saja, karena SSH kini bak bersama
    // yang diisi seluruh SKPD. Rute lamanya tetap hidup sebagai pengalih.
    type: 'group', label: 'RKBMD', icon: ICON.pelaporan, children: [
      // DUA KELOMPOK BER-ALUR KEMBAR (keputusan user 2026-08-13): Standar Harga
      // dan RKBMD, masing-masing Usulan · Validasi · Pelaporan. Lima menu
      // per-jenis yang lama (SSH/SBSK/ASB/SBU/HSPK) DILEBUR jadi satu "Usulan
      // Standar Harga" — jenisnya dipilih di dalam layarnya, karena sekarang
      // yang membedakan alur bukan jenisnya melainkan tahap dokumennya.
      // ⚠️ Rute lamanya SENGAJA DIBIARKAN HIDUP (tidak dihapus, cuma tak lagi
      // di sidebar): halaman itu satu-satunya jalan admin menyunting/menghapus
      // baris yang terlanjur salah di bak bersama — alur usulan hanya bisa
      // MENAMBAH. Jangan dibuang sebelum ada penggantinya.
      {
        type: 'group', label: 'Standar Harga', children: [
          { type: 'leaf', href: '/dashboard/rkbmd/standar-harga/usulan', label: 'Usulan Standar Harga' },
          { type: 'leaf', href: '/dashboard/rkbmd/standar-harga/validasi', label: 'Validasi' },
          { type: 'leaf', href: '/dashboard/rkbmd/standar-harga/pelaporan', label: 'Pelaporan' },
        ],
      },
      {
        // "Perencanaan", bukan "RKBMD" lagi (permintaan user 2026-08-13):
        // "RKBMD > RKBMD" membingungkan dibaca, dan label kembar itu juga yang
        // dulu membuat saklar buka-tutupnya bertabrakan (lihat `jalur` di
        // renderNode). Penyebabnya sudah diperbaiki, tapi namanya tetap diganti
        // karena memang lebih jelas: Standar Harga = acuan, Perencanaan =
        // dokumen RKBMD-nya sendiri.
        type: 'group', label: 'Perencanaan', children: [
          { type: 'leaf', href: '/dashboard/rkbmd/usulan', label: 'Usulan RKBMD' },
          { type: 'leaf', href: '/dashboard/rkbmd/validasi', label: 'Validasi' },
          { type: 'leaf', href: '/dashboard/rkbmd/pelaporan', label: 'Pelaporan' },
        ],
      },
    ],
  },
  {
    type: 'group', label: 'Saldo Awal', icon: ICON.saldo, children: [
      { type: 'leaf', href: '/dashboard/saldo-awal/rekapitulasi', label: 'Rekapitulasi' },
      { type: 'leaf', href: '/dashboard/saldo-awal/daftar-barang', label: 'Daftar Barang Awal' },
    ],
  },
  {
    type: 'group', label: 'Pembukuan', icon: ICON.pembukuan, children: [
      {
        type: 'group', label: 'Cara Perolehan', children: [
          { type: 'leaf', href: '/dashboard/pembukuan/perolehan/pengadaan', label: 'Pengadaan' },
          { type: 'leaf', href: '/dashboard/pembukuan/perolehan/hibah', label: 'Hibah' },
          { type: 'leaf', href: '/dashboard/pembukuan/perolehan/tukar-menukar', label: 'Tukar Menukar' },
          { type: 'leaf', href: '/dashboard/pembukuan/perolehan/inventarisasi', label: 'Hasil Inventarisasi' },
          { type: 'leaf', href: '/dashboard/pembukuan/perolehan/lainnya', label: 'Perolehan Lainnya' },
        ],
      },
      {
        type: 'group', label: 'Pengelolaan', children: [
          { type: 'leaf', href: '/dashboard/pembukuan/pengelolaan/penggunaan', label: 'Penggunaan' },
          { type: 'leaf', href: '/dashboard/pembukuan/pengelolaan/penerimaan', label: 'Penerimaan Internal' },
          { type: 'leaf', href: '/dashboard/pembukuan/pengelolaan/pengeluaran', label: 'Pengeluaran Internal' },
          { type: 'leaf', href: '/dashboard/pembukuan/pengelolaan/pemanfaatan', label: 'Pemanfaatan' },
          { type: 'leaf', href: '/dashboard/pembukuan/pengelolaan/pengamanan', label: 'Pengamanan' },
          { type: 'leaf', href: '/dashboard/pembukuan/pengelolaan/reklasifikasi', label: 'Reklasifikasi' },
          { type: 'leaf', href: '/dashboard/pembukuan/pengelolaan/koreksi', label: 'Koreksi' },
          { type: 'leaf', href: '/dashboard/pembukuan/pengelolaan/kapitalisasi', label: 'Kapitalisasi' },
          { type: 'leaf', href: '/dashboard/pembukuan/pengelolaan/penghapusan', label: 'Penghapusan' },
        ],
      },
      { type: 'leaf', href: '/dashboard/pelaporan/lra', label: 'LRA' },
      { type: 'leaf', href: '/dashboard/pembukuan/kir', label: 'KIR' },
    ],
  },
  { type: 'leaf', href: '/dashboard/daftar-barang', label: 'Daftar Barang' },
  { type: 'leaf', href: '/dashboard/penyusutan', label: 'Penyusutan' },
  { type: 'leaf', href: '/dashboard/gis', label: 'GIS Tanah' },
  { type: 'leaf', href: '/dashboard/kendaraan', label: 'Kendaraan' },
  {
    type: 'group', label: 'Pelaporan', icon: ICON.pelaporan, children: [
      {
        type: 'group', label: 'Laporan Perolehan', children: [
          { type: 'leaf', href: '/dashboard/pelaporan/perolehan/pengadaan', label: 'Laporan Pengadaan' },
          { type: 'leaf', href: '/dashboard/pelaporan/perolehan/hibah', label: 'Laporan Hibah' },
          { type: 'leaf', href: '/dashboard/pelaporan/perolehan/tukar-menukar', label: 'Laporan Tukar Menukar' },
          { type: 'leaf', href: '/dashboard/pelaporan/perolehan/inventarisasi', label: 'Laporan Hasil Inventarisasi' },
          { type: 'leaf', href: '/dashboard/pelaporan/perolehan/lainnya', label: 'Laporan Perolehan Lainnya' },
        ],
      },
      {
        type: 'group', label: 'Laporan Pengelolaan', children: [
          { type: 'leaf', href: '/dashboard/pelaporan/pengelolaan/penggunaan', label: 'Laporan Penggunaan' },
          { type: 'leaf', href: '/dashboard/pelaporan/pengelolaan/penerimaan', label: 'Laporan Penerimaan Internal' },
          { type: 'leaf', href: '/dashboard/pelaporan/pengelolaan/pengeluaran', label: 'Laporan Pengeluaran Internal' },
          { type: 'leaf', href: '/dashboard/pelaporan/pengelolaan/reklasifikasi', label: 'Laporan Reklasifikasi' },
          { type: 'leaf', href: '/dashboard/pelaporan/pengelolaan/koreksi', label: 'Laporan Koreksi' },
          { type: 'leaf', href: '/dashboard/pelaporan/pengelolaan/kapitalisasi', label: 'Laporan Kapitalisasi' },
          { type: 'leaf', href: '/dashboard/pelaporan/pengelolaan/penghapusan', label: 'Laporan Penghapusan' },
          { type: 'leaf', href: '/dashboard/pelaporan/pengelolaan/pemanfaatan', label: 'Laporan Pemanfaatan' },
          { type: 'leaf', href: '/dashboard/pelaporan/pengelolaan/pengamanan', label: 'Laporan Pengamanan' },
        ],
      },
      { type: 'leaf', href: '/dashboard/pelaporan/bmd', label: 'Laporan BMD' },
      { type: 'leaf', href: '/dashboard/pelaporan/rekonsiliasi', label: 'Rekonsiliasi BMD' },
      // Tepat di bawah Rekonsiliasi, sengaja: alurnya "lihat Selisih → cek
      // laporan mana yang tak sepakat". BUKAN di menu Validasi mana pun —
      // inventarisasi/validasi & rkbmd/validasi keduanya soal penelaahan
      // usulan, bukan pemeriksaan angka.
      { type: 'leaf', href: '/dashboard/pelaporan/konsistensi', label: 'Uji Konsistensi' },
      { type: 'leaf', href: '/dashboard/pelaporan/rekonsiliasi/rincian', label: 'Rincian Transaksi (Bukti Dukung)' },
      { type: 'leaf', href: '/dashboard/pelaporan/kibar', label: 'KIBAR' },
      { type: 'leaf', href: '/dashboard/pelaporan/kir', label: 'KIR' },
    ],
  },
  {
    // LHI di sini BEDA dgn "Laporan Hasil Inventarisasi" di grup Pelaporan —
    // yang itu laporan cara perolehan (ledger `hasil_inventarisasi`).
    type: 'group', label: 'Inventarisasi', icon: ICON.pembukuan, children: [
      {
        // Satu menu per jenis aset — tiap jenis punya format LKI sendiri
        // (III.A.1–III.A.6). Pakai segmen path, bukan ?golongan=, supaya
        // penanda menu aktif (yang membandingkan pathname) tidak menyala
        // di kedelapan menu sekaligus.
        type: 'group', label: 'Lembar Kerja (LKI)', children: [
          { type: 'leaf', href: '/dashboard/inventarisasi/jenis/1.3.1', label: 'Tanah' },
          { type: 'leaf', href: '/dashboard/inventarisasi/jenis/1.3.2', label: 'Peralatan dan Mesin' },
          { type: 'leaf', href: '/dashboard/inventarisasi/jenis/1.3.3', label: 'Gedung dan Bangunan' },
          { type: 'leaf', href: '/dashboard/inventarisasi/jenis/1.3.4', label: 'Jalan, Jaringan dan Irigasi' },
          { type: 'leaf', href: '/dashboard/inventarisasi/jenis/1.3.5', label: 'Aset Tetap Lainnya' },
          { type: 'leaf', href: '/dashboard/inventarisasi/jenis/1.3.6', label: 'Konstruksi Dalam Pengerjaan' },
          { type: 'leaf', href: '/dashboard/inventarisasi/jenis/1.5.3', label: 'Aset Tidak Berwujud' },
          { type: 'leaf', href: '/dashboard/inventarisasi/jenis/1.5.4', label: 'Aset Lain-Lain' },
        ],
      },
      { type: 'leaf', href: '/dashboard/inventarisasi/validasi', label: 'Validasi' },
      { type: 'leaf', href: '/dashboard/inventarisasi/laporan', label: 'Laporan Hasil (LHI)' },
    ],
  },
  { type: 'leaf', href: '/dashboard/wasdal', label: 'WasDal' },
  {
    type: 'group', label: 'IPA', icon: ICON.ipa, children: [
      { type: 'leaf', href: '/dashboard/ipa', label: 'Dashboard IPA' },
      { type: 'leaf', href: '/dashboard/ipa/penilaian', label: 'Input Penilaian' },
    ],
  },
]

const adminGroup: NavNode = {
  type: 'group', label: 'Admin', icon: ICON.user, children: [
    { type: 'leaf', href: '/dashboard/admin/skpd', label: 'SKPD' },
    { type: 'leaf', href: '/dashboard/admin/usulan-pengurus', label: 'Usulan Pengurus Barang' },
    { type: 'leaf', href: '/dashboard/admin/pegawai', label: 'Daftar Pegawai' },
    { type: 'leaf', href: '/dashboard/admin/user', label: 'Daftar User' },
    { type: 'leaf', href: '/dashboard/admin/satuan', label: 'Daftar Satuan' },
    { type: 'leaf', href: '/dashboard/admin/kodefikasi', label: 'Kodefikasi BMD' },
    { type: 'leaf', href: '/dashboard/admin/overhaul', label: 'Overhaul Band' },
    // SSH & SBSK pindah ke RKBMD > Standar Harga (2026-08-10).
    { type: 'leaf', href: '/dashboard/dokumen-sumber', label: 'Dokumen Sumber' },
    { type: 'leaf', href: '/dashboard/admin/tutup-tahun', label: 'Tutup Tahun' },
    { type: 'leaf', href: '/dashboard/admin/broadcast', label: 'Broadcast' },
  ],
}

// Admin terbatas utk operator SKPD (role 'user'): hanya Kodefikasi (view-only,
// tombol toggle disembunyikan) & Dokumen Sumber (view/download; upload Pengamanan
// per-SKPD tetap jalan lewat canUpload di komponennya).
const adminGroupOperator: NavNode = {
  type: 'group', label: 'Admin', icon: ICON.user, children: [
    { type: 'leaf', href: '/dashboard/admin/usulan-pengurus', label: 'Usulan Pengurus Barang' },
    { type: 'leaf', href: '/dashboard/admin/kodefikasi', label: 'Kodefikasi BMD' },
    { type: 'leaf', href: '/dashboard/dokumen-sumber', label: 'Dokumen Sumber' },
  ],
}

const iconFor = (label: string): React.ReactNode => {
  if (label === 'IPA') return ICON.ipa
  if (label === 'GIS Tanah') return ICON.gis
  if (label === 'Kendaraan') return ICON.kendaraan
  if (label === 'Daftar Barang') return ICON.daftar
  if (label === 'Penyusutan') return ICON.penyusutan
  if (label === 'Dashboard') return ICON.dashboard
  if (label === 'RKBMD') return ICON.pelaporan
  if (label === 'Inventarisasi') return ICON.daftar
  if (label === 'WasDal') return ICON.building
  return null
}

function leafHrefs(node: NavNode): string[] {
  return node.type === 'leaf' ? [node.href] : node.children.flatMap(leafHrefs)
}

export default function Sidebar({ userName, userRole }: { userName: string; userRole: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState<Record<string, boolean>>({})

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname === href || pathname.startsWith(href + '/')

  const groupActive = (node: NavNode) => leafHrefs(node).some(h => !h.startsWith('http') && isActive(h))
  const menuTree = userRole === 'admin' ? [...navTree, adminGroup] : [...navTree, adminGroupOperator]

  // ⚠️ `jalur` = kunci buka-tutup, dirakit dari SELURUH jalur label — bukan
  // labelnya saja. Dulu `open[node.label]`, dan itu membuat dua grup bernama
  // sama BERBAGI SATU SAKLAR: menekan grup "RKBMD" di dalam grup "RKBMD" ikut
  // membalik yang luar, sehingga seluruh menu menutup sendiri. Bug-nya tak
  // kelihatan sampai ada label kembar, jadi jangan dikembalikan ke label saja
  // hanya karena "sekarang toh tak ada yang kembar".
  function renderNode(node: NavNode, depth: number, indukJalur = ''): React.ReactNode {
    const pad = { paddingLeft: `${0.75 + depth * 0.85}rem` }
    const jalur = `${indukJalur}/${node.label}`

    if (node.type === 'leaf') {
      const active = !node.external && isActive(node.href)
      const cls = `flex items-center gap-3 pr-3 py-2 rounded-lg text-sm transition-colors ${
        active ? 'bg-teal text-white font-medium' : 'text-white/60 hover:text-white hover:bg-white/10'
      }`
      const icon = depth === 0 ? iconFor(node.label) : null // ikon cuma utk top-level; nested selalu titik (konsisten antar grup)
      const body = (
        <>
          {icon
            ? <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">{icon}</svg>
            : <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-white' : 'bg-white/30'}`} />}
          <span className="truncate">{node.label}</span>
          {node.external && (
            <svg className="w-3.5 h-3.5 ml-auto opacity-50 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">{ICON.external}</svg>
          )}
        </>
      )
      return node.external ? (
        <a key={node.href} href={node.href} target="_blank" rel="noopener noreferrer" className={cls} style={pad}>{body}</a>
      ) : (
        <Link key={node.href} href={node.href} className={cls} style={pad}>{body}</Link>
      )
    }

    // group
    const active = groupActive(node)
    const isOpen = open[jalur] ?? active
    return (
      <div key={jalur}>
        <button
          onClick={() => setOpen(o => ({ ...o, [jalur]: !(o[jalur] ?? active) }))}
          className={`w-full flex items-center gap-3 pr-3 py-2 rounded-lg text-sm transition-colors ${
            active ? 'bg-white/10 text-white font-medium' : 'text-white/60 hover:text-white hover:bg-white/10'
          }`}
          style={pad}
        >
          {node.icon
            ? <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">{node.icon}</svg>
            : <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-white/80' : 'bg-white/30'}`} />}
          <span className="truncate">{node.label}</span>
          <svg className={`w-4 h-4 ml-auto flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {ic('M9 5l7 7-7 7')}
          </svg>
        </button>
        {isOpen && (
          <div className="mt-0.5 space-y-0.5">
            {node.children.map(c => renderNode(c, depth + 1, jalur))}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside className="w-64 bg-gradient-to-b from-navy-dark via-navy to-navy-light flex flex-col h-full flex-shrink-0">
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="text-white/30 text-xs font-semibold uppercase tracking-wider px-3 mb-2">Menu</p>
        {menuTree.map(n => renderNode(n, 0))}
      </nav>
    </aside>
  )
}
