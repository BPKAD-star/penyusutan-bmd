'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { setTahunKerjaTersimpan, getTahunKerjaTersimpan } from '@/lib/tahunKerja'

type TahunRow = { tahun: number; status: 'terbuka' | 'terkunci' }

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [tahunList, setTahunList] = useState<TahunRow[]>([])
  const [tahunKerja, setTahunKerjaState] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('tahun_buku').select('tahun,status').order('tahun', { ascending: false })
      const rows = (data as TahunRow[]) || []
      setTahunList(rows)
      const tersimpan = getTahunKerjaTersimpan()
      const terbuka = rows.filter(r => r.status === 'terbuka').map(r => r.tahun)
      const defaultTahun = tersimpan && rows.some(r => String(r.tahun) === tersimpan)
        ? tersimpan
        : (terbuka.length > 0 ? String(Math.max(...terbuka)) : rows[0] ? String(rows[0].tahun) : '')
      setTahunKerjaState(defaultTahun)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email atau password salah.')
      setLoading(false)
    } else {
      if (tahunKerja) setTahunKerjaTersimpan(tahunKerja)
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo area */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-teal rounded-2xl mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">BMD Kabupaten Kediri</h1>
          <p className="text-navy-light/60 text-sm mt-1">Sistem Pengelolaan Barang Milik Daerah</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-gray-800 mb-6">Masuk ke Sistem</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/30"
                placeholder="email@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/30"
                placeholder="••••••••"
              />
            </div>
            {tahunList.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tahun Kerja</label>
                <select
                  value={tahunKerja}
                  onChange={e => setTahunKerjaState(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/30"
                >
                  {tahunList.map(r => (
                    <option key={r.tahun} value={r.tahun}>
                      {r.tahun} — {r.status === 'terbuka' ? 'Terbuka' : 'Terkunci (final/teraudit)'}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Menentukan tampilan default laporan setelah masuk — bukan pembatas. Bisa diganti kapan saja di tiap menu.
                </p>
              </div>
            )}
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-navy text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-navy-light transition-colors disabled:opacity-60"
            >
              {loading ? 'Memproses...' : 'Masuk'}
            </button>
          </form>
        </div>

        <p className="text-center text-white/30 text-xs mt-6">
          BKAD Kabupaten Kediri — Bidang BMD
        </p>
      </div>
    </div>
  )
}
