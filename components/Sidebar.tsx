'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type NavLeaf = { href: string; label: string; external?: boolean; icon: React.ReactNode }
type NavGroup = { label: string; icon: React.ReactNode; children: { href: string; label: string }[] }
type NavItem = NavLeaf | NavGroup

const ic = (d: string) => (
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
)

const navItems: NavItem[] = [
  {
    href: '/dashboard', label: 'Dashboard',
    icon: ic('M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'),
  },
  {
    label: 'Pembukuan',
    icon: ic('M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253'),
    children: [
      { href: '/dashboard/pembukuan/perolehan', label: 'Cara Perolehan' },
      { href: '/dashboard/pembukuan/pengelolaan', label: 'Pengelolaan' },
    ],
  },
  {
    href: '/dashboard/daftar-barang', label: 'Daftar Barang',
    icon: ic('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4'),
  },
  {
    href: '/dashboard/penyusutan', label: 'Penyusutan',
    icon: ic('M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z'),
  },
  {
    label: 'Pelaporan',
    icon: ic('M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'),
    children: [
      { href: '/dashboard/pelaporan/perolehan', label: 'Pelaporan Perolehan' },
      { href: '/dashboard/pelaporan/pengelolaan', label: 'Pelaporan Pengelolaan' },
    ],
  },
  {
    href: 'https://ipabmdkabkediri.vercel.app/login', label: 'IPA', external: true,
    icon: ic('M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9'),
  },
  {
    href: 'https://gisbmdkabkediri.vercel.app/', label: 'GIS BMD', external: true,
    icon: ic('M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7'),
  },
]

const adminItems: NavLeaf[] = [
  {
    href: '/dashboard/admin', label: 'Manajemen User',
    icon: ic('M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z'),
  },
]

export default function Sidebar({ userName, userRole }: { userName: string; userRole: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)

  const linkCls = (active: boolean) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
      active ? 'bg-teal text-white font-medium' : 'text-white/60 hover:text-white hover:bg-white/10'
    }`

  function renderLeaf(item: NavLeaf) {
    const body = (
      <>
        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {item.icon}
        </svg>
        {item.label}
        {item.external && (
          <svg className="w-3.5 h-3.5 ml-auto opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {ic('M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14')}
          </svg>
        )}
      </>
    )
    return item.external ? (
      <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer" className={linkCls(false)}>
        {body}
      </a>
    ) : (
      <Link key={item.href} href={item.href} className={linkCls(isActive(item.href))}>
        {body}
      </Link>
    )
  }

  function renderGroup(group: NavGroup) {
    const groupActive = group.children.some(c => isActive(c.href))
    return (
      <div key={group.label}>
        <div className={`flex items-center gap-3 px-3 py-2.5 text-sm ${groupActive ? 'text-white font-medium' : 'text-white/60'}`}>
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {group.icon}
          </svg>
          {group.label}
        </div>
        <div className="ml-5 border-l border-white/10 pl-2 space-y-0.5">
          {group.children.map(c => (
            <Link key={c.href} href={c.href}
              className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive(c.href) ? 'bg-teal text-white font-medium' : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}>
              {c.label}
            </Link>
          ))}
        </div>
      </div>
    )
  }

  return (
    <aside className="w-64 bg-navy flex flex-col h-full flex-shrink-0">
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-teal rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {ic('M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4')}
            </svg>
          </div>
          <div>
            <p className="text-white text-sm font-semibold leading-tight">BMD Kab. Kediri</p>
            <p className="text-white/40 text-xs">Barang Milik Daerah</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="text-white/30 text-xs font-semibold uppercase tracking-wider px-3 mb-2">Menu</p>
        {navItems.map(item => ('children' in item ? renderGroup(item) : renderLeaf(item)))}

        {userRole === 'admin' && (
          <>
            <p className="text-white/30 text-xs font-semibold uppercase tracking-wider px-3 mb-2 mt-6">Admin</p>
            {adminItems.map(renderLeaf)}
          </>
        )}
      </nav>

      {/* User info + logout */}
      <div className="px-3 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">{userName}</p>
            <p className="text-white/40 text-xs capitalize">{userRole}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 text-sm transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {ic('M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1')}
          </svg>
          Keluar
        </button>
      </div>
    </aside>
  )
}
