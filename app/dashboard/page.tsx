import { createClient } from '@/lib/supabase/server'

const PERIODE = '2026-S1'

function formatRp(val: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val)
}

export default async function DashboardHome() {
  const supabase = createClient()

  const [totalBeban, totalNilaiBuku, totalAset, topSkpd] = await Promise.all([
    supabase.from('penyusutan_periode').select('beban_penyusutan').eq('periode', PERIODE),
    supabase.from('penyusutan_periode').select('nilai_buku_akhir').eq('periode', PERIODE),
    supabase.from('penyusutan_periode').select('nibar', { count: 'exact', head: true }).eq('periode', PERIODE),
    supabase.from('penyusutan_periode')
      .select('skpd_id, beban_penyusutan, skpd(nama)')
      .eq('periode', PERIODE)
      .limit(1000),
  ])

  const sumBeban = (totalBeban.data || []).reduce((s, r) => s + (r.beban_penyusutan || 0), 0)
  const sumNilaiBuku = (totalNilaiBuku.data || []).reduce((s, r) => s + (r.nilai_buku_akhir || 0), 0)

  // Aggregate per SKPD
  const skpdMap: Record<string, { nama: string; beban: number }> = {}
  for (const r of topSkpd.data || []) {
    const skpdData = r.skpd as unknown as { nama: string } | null
    const nama = skpdData?.nama || '-'
    if (!skpdMap[nama]) skpdMap[nama] = { nama, beban: 0 }
    skpdMap[nama].beban += r.beban_penyusutan || 0
  }
  const top5 = Object.values(skpdMap).sort((a, b) => b.beban - a.beban).slice(0, 5)

  const cards = [
    { label: 'Total Beban Penyusutan', value: formatRp(sumBeban), sub: `Periode ${PERIODE}`, color: 'bg-teal' },
    { label: 'Total Nilai Buku', value: formatRp(sumNilaiBuku), sub: 'Setelah penyusutan', color: 'bg-navy' },
    { label: 'Total Aset', value: (totalAset.count || 0).toLocaleString('id-ID'), sub: 'Aset aktif', color: 'bg-amber-500' },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Ringkasan BMD Kabupaten Kediri — Periode {PERIODE}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {cards.map(c => (
          <div key={c.label} className={`${c.color} rounded-xl p-5 text-white`}>
            <p className="text-white/70 text-xs font-medium uppercase tracking-wider">{c.label}</p>
            <p className="text-2xl font-bold mt-2 leading-tight">{c.value}</p>
            <p className="text-white/60 text-xs mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Top 5 SKPD */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Top 5 SKPD — Beban Penyusutan Tertinggi</h2>
        <div className="space-y-3">
          {top5.map((s, i) => {
            const pct = sumBeban > 0 ? (s.beban / sumBeban) * 100 : 0
            return (
              <div key={s.nama}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-700 font-medium">{i + 1}. {s.nama}</span>
                  <span className="text-gray-500">{formatRp(s.beban)}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-teal rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
