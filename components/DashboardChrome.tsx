'use client'
import { useState } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import ChatWidget from './ChatWidget'
import BroadcastPopup from './BroadcastPopup'
import { KonfirmasiProvider } from '@/shared/ui/konfirmasi'
import type { JenisKelamin } from './AvatarPegawai'

export default function DashboardChrome({ userName, userRole, userJk, children }: {
  userName: string
  userRole: string
  /** 'L' | 'P' | '' — kosong berarti tak diketahui, avatar jatuh ke huruf awal. */
  userJk: JenisKelamin
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // KonfirmasiProvider dipasang di SINI — satu host untuk seluruh dashboard.
  // Sengaja bukan per halaman: konfirmasi sering dipicu dari dalam modal lain,
  // dan host yang ikut dibongkar bersama pemanggilnya akan menutup pop-upnya
  // sendiri di tengah jalan. Lihat shared/ui/konfirmasi.tsx.
  return (
    <KonfirmasiProvider>
      <div className="flex flex-col h-screen overflow-hidden">
        <TopBar userName={userName} userJk={userJk} onToggleSidebar={() => setSidebarOpen(o => !o)} />
        <div className="flex flex-1 overflow-hidden">
          {sidebarOpen && <Sidebar userName={userName} userRole={userRole} />}
          <main className="flex-1 overflow-auto bg-gray-50 min-w-0">{children}</main>
        </div>
        <ChatWidget />
        <BroadcastPopup userRole={userRole} />
      </div>
    </KonfirmasiProvider>
  )
}
