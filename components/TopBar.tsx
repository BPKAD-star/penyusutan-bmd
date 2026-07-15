'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import TahunKerjaBadge from './TahunKerjaBadge'
import { useIsViewer } from './useIsViewer'

export default function TopBar({ userName, onToggleSidebar }: {
  userName: string
  onToggleSidebar: () => void
}) {
  const router = useRouter()
  const supabase = createClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const isViewer = useIsViewer()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0 relative z-20">
      {/* Kiri: hamburger + brand */}
      <div className="flex items-center gap-3">
        <button onClick={onToggleSidebar}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors" aria-label="Toggle sidebar">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="w-8 h-8 bg-teal rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-800 text-lg leading-none">BMD last game</span>
          <span className="text-[10px] font-semibold bg-amber-400 text-white px-1.5 py-0.5 rounded">Kabupaten Kediri</span>
        </div>
      </div>

      {/* Kanan: badge tahun kerja + user dropdown */}
      <div className="flex items-center gap-3">
        {isViewer && (
          <span className="text-[11px] font-semibold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg flex items-center gap-1" title="Akun Pengawas: hanya bisa melihat, tidak bisa mengubah data">
            👁 Baca-saja
          </span>
        )}
        <TahunKerjaBadge />
        <div className="relative">
          <button onClick={() => setMenuOpen(v => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <span className="w-7 h-7 rounded-full bg-navy text-white text-xs font-bold flex items-center justify-center">
              {userName.charAt(0).toUpperCase()}
            </span>
            <span className="text-sm text-gray-700">Welcome, <span className="font-medium">{userName}</span></span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-40">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-800 truncate">{userName}</p>
                  <p className="text-xs text-gray-400">Akun</p>
                </div>
                <button onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Keluar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
