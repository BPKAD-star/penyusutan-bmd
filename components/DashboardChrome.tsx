'use client'
import { useState } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import ChatWidget from './ChatWidget'
import BroadcastPopup from './BroadcastPopup'

export default function DashboardChrome({ userName, userRole, children }: {
  userName: string
  userRole: string
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar userName={userName} onToggleSidebar={() => setSidebarOpen(o => !o)} />
      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && <Sidebar userName={userName} userRole={userRole} />}
        <main className="flex-1 overflow-auto bg-gray-50 min-w-0">{children}</main>
      </div>
      <ChatWidget />
      <BroadcastPopup userRole={userRole} />
    </div>
  )
}
