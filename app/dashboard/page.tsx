import { createClient } from '@/lib/supabase/server'
import { GOLONGAN_REKAP, kodeLevel3 } from '@/lib/bmd'
import CaraPerolehanCards from '@/components/dashboard/CaraPerolehanCards'

const PERIODE = '2026-S1'

function formatRp(val: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val)
}
const nf = (n: number) => n.toLocaleString('id-ID')

type SB = ReturnType<typeof createClient>

// Count aman: kalau tabel belum ada (mis. transaksi_bmd belum di-migrate) → 0.
async function safeCount(build: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  try {
    const { count, error } = await build
    return error ? 0 : (count || 0)
  } catch {
    return 0
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countTrx(sb: SB, apply: (q: any) => any): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base: any = sb.from('transaksi_bmd').select('*', { count: 'exact', head: true })
  return safeCount(apply(base))
}

// Satu kali scan register aset (aktif): rekap per golongan (unit + nilai) DAN
// count+nilai per cara_perolehan (utk dashboard donut) — hemat, tanpa query ekstra.
// PENTING: "disetujui" count HARUS dari aset aktif, BUKAN dari jumlah baris ledger
// jenis='pengadaan' (append-only, permanen — tak berkurang walau barangnya di-
// batal_pengadaan/unapprove kemudian, krn itu cuma nambah baris baru, bukan hapus
// baris lama). Register aset (status='aktif') adalah satu-satunya sumber yg
// mencerminkan kondisi TERKINI (sudah dikurangi soft-delete).
async function scanAset(sb: SB): Promise<{
  gol: Record<string, { count: number; nilai: number }>
  caraNilai: Record<string, number>
  caraCount: Record<string, number>
}> {
  const gol: Record<string, { count: number; nilai: number }> = {}
  const caraNilai: Record<string, number> = {}
  const caraCount: Record<string, number> = {}
  try {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('aset')
        .select('kode,nilai_perolehan,cara_perolehan').eq('status', 'aktif').range(from, from + 999)
      if (error || !data || data.length === 0) break
      for (const r of data as { kode: string; nilai_perolehan: number; cara_perolehan: string }[]) {
        const g = kodeLevel3(r.kode)
        const v = r.nilai_perolehan || 0
        gol[g] ??= { count: 0, nilai: 0 }
        gol[g].count += 1
        gol[g].nilai += v
        caraNilai[r.cara_perolehan] = (caraNilai[r.cara_perolehan] || 0) + v
        caraCount[r.cara_perolehan] = (caraCount[r.cara_perolehan] || 0) + 1
      }
      if (data.length < 1000) break
    }
  } catch { /* tabel aset belum ada → kosong */ }
  return { gol, caraNilai, caraCount }
}

export default async function DashboardHome() {
  const supabase = createClient()

  const [
    scan,
    transfer, mutasiInternal,
    hapusTotalPemindah, hapusHibah, hapusJual, hapusSebabLain,
  ] = await Promise.all([
    scanAset(supabase),
    countTrx(supabase, q => q.eq('jenis', 'pengalihan_status')),
    countTrx(supabase, q => q.eq('jenis', 'mutasi_internal')),
    countTrx(supabase, q => q.eq('jenis', 'penghapusan_pemindahtanganan')),
    countTrx(supabase, q => q.eq('jenis', 'penghapusan_pemindahtanganan').eq('payload->>sub_jenis', 'hibah')),
    countTrx(supabase, q => q.eq('jenis', 'penghapusan_pemindahtanganan').eq('payload->>sub_jenis', 'penjualan')),
    countTrx(supabase, q => q.eq('jenis', 'penghapusan_sebab_lain')),
  ])
  const gol = scan.gol
  const cn = scan.caraNilai
  const cc = scan.caraCount
  const hapusSebabLainnya = hapusSebabLain + Math.max(0, hapusTotalPemindah - hapusHibah - hapusJual)
  const totalRegister = Object.values(gol).reduce((s, v) => s + v.count, 0)
  const totalNilai = Object.values(gol).reduce((s, v) => s + v.nilai, 0)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Ringkasan BMD Kabupaten Kediri — Periode {PERIODE}</p>
      </div>

      {/* Total aset per jenis: jumlah unit + nilai rekapitulasi (harga perolehan) */}
      <Section title="Total Aset per Jenis"
        sub={`Register BMD — ${nf(totalRegister)} aset · ${formatRp(totalNilai)}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {GOLONGAN_REKAP.map(g => {
            const d = gol[g.kode] || { count: 0, nilai: 0 }
            return (
              <div key={g.kode} className="card p-4">
                <p className="text-[11px] text-gray-400">{g.kode}</p>
                <p className="text-xs text-gray-600 leading-tight mt-0.5 h-8">{g.uraian}</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{nf(d.count)} <span className="text-xs font-normal text-gray-400">unit</span></p>
                <p className="text-xs font-medium text-teal mt-1">{formatRp(d.nilai)}</p>
              </div>
            )
          })}
        </div>
      </Section>

      {/* Perolehan */}
      <Section title="Total Barang per Cara Perolehan" sub="Jumlah barang masuk berdasarkan cara perolehan — klik utk rincian disetujui/menunggu">
        <CaraPerolehanCards
          approved={{ pengadaan: cc['pengadaan'] || 0, hibah: cc['hibah_masuk'] || 0, inventarisasi: cc['hasil_inventarisasi'] || 0, lainnya: cc['perolehan_lainnya'] || 0 }}
          approvedNilai={{ pengadaan: cn['pengadaan'] || 0, hibah: cn['hibah_masuk'] || 0, inventarisasi: cn['hasil_inventarisasi'] || 0, lainnya: cn['perolehan_lainnya'] || 0 }} />
      </Section>

      {/* Mutasi & transfer */}
      <Section title="Mutasi & Transfer" sub="Perpindahan barang antar / dalam SKPD">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Transfer Keluar SKPD" value={transfer} note="Pengalihan status (penghapusan)" />
          <StatCard label="Transfer Masuk SKPD" value={transfer} note="Sisi terima pengalihan status" />
          <StatCard label="Pengeluaran Internal" value={mutasiInternal} note="Mutasi antar sub-SKPD" />
          <StatCard label="Penerimaan Internal" value={mutasiInternal} note="Sisi terima mutasi internal" />
        </div>
      </Section>

      {/* Penghapusan */}
      <Section title="Penghapusan Barang" sub="Barang yang dihapus dari laporan (data tetap tersimpan)">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatCard label="Karena Hibah" value={hapusHibah} />
          <StatCard label="Karena Penjualan" value={hapusJual} />
          <StatCard label="Karena Sebab Lainnya" value={hapusSebabLainnya} note="Tukar-menukar, penyertaan modal, force majeure" />
        </div>
      </Section>
    </div>
  )
}

function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        <p className="text-xs text-gray-400">{sub}</p>
      </div>
      {children}
    </div>
  )
}

function StatCard({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-600 leading-tight h-8">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{value.toLocaleString('id-ID')}</p>
      {note && <p className="text-[11px] text-gray-400 mt-1 leading-tight">{note}</p>}
    </div>
  )
}
