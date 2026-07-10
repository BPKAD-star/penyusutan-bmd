import { createClient } from '@/lib/supabase/server'
import { GOLONGAN_REKAP, kodeLevel3 } from '@/lib/bmd'
import CaraPerolehanCards from '@/components/dashboard/CaraPerolehanCards'
import MutasiTransferCards from '@/components/dashboard/MutasiTransferCards'
import PenghapusanCards, { type PenghapusanData } from '@/components/dashboard/PenghapusanCards'

const PERIODE = '2026-S1'

function formatRp(val: number) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(val)
}
const nf = (n: number) => n.toLocaleString('id-ID')

type SB = ReturnType<typeof createClient>

// transaksi_bmd bersifat append-only: batal (pengalihan/penghapusan) DICATAT
// sebagai baris baru, bukan menghapus baris lama — jadi hitung baris mentah
// bisa kebesaran (baris yang sudah "dibatalkan" tetap ikut terhitung). Untuk
// dapat angka yang mencerminkan kondisi TERKINI, cek balik ke status/skpd_id
// aset saat ini (satu-satunya sumber yang sudah dikurangi efek pembatalan).

// Transfer masih "berlaku" kalau skpd_id aset SEKARANG sama dengan skpd_tujuan
// baris transaksi itu (kalau sudah dibatalkan/dikembalikan, aset.skpd_id sudah
// kembali ke skpd_asal — baris lama otomatis tak terhitung). Dipakai utk kedua
// jenis transfer: 'pengalihan_status' (lintas SKPD induk) & 'mutasi_internal'
// (dalam satu SKPD induk).
async function countTransferAktif(sb: SB, jenis: string): Promise<number> {
  let n = 0
  try {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('transaksi_bmd')
        .select('skpd_tujuan, aset(skpd_id)')
        .eq('jenis', jenis)
        .range(from, from + 999)
      if (error || !data || data.length === 0) break
      for (const r of data as unknown as { skpd_tujuan: number; aset: { skpd_id: number } | null }[]) {
        if (r.aset && r.aset.skpd_id === r.skpd_tujuan) n++
      }
      if (data.length < 1000) break
    }
  } catch { /* transaksi_bmd/aset belum ada → 0 */ }
  return n
}

// Penghapusan: hanya hitung baris yang aset-nya MASIH status 'dihapus' saat
// ini (kalau sudah di-batal_penghapusan, aset kembali 'aktif' — tak terhitung).
// 5 kategori: 4 mekanisme pemindahtanganan (sub_jenis) + 1 sebab lainnya (jenis
// sendiri, force majeure dkk) — masing-masing dgn jumlah barang & total nilai.
async function countPenghapusan(sb: SB): Promise<PenghapusanData> {
  const out: PenghapusanData = {
    hibah: { n: 0, nilai: 0 }, jual: { n: 0, nilai: 0 }, tukar: { n: 0, nilai: 0 },
    modal: { n: 0, nilai: 0 }, sebabLain: { n: 0, nilai: 0 },
  }
  try {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('transaksi_bmd')
        .select('jenis, nilai, payload, aset(status)')
        .in('jenis', ['penghapusan_pemindahtanganan', 'penghapusan_sebab_lain'])
        .range(from, from + 999)
      if (error || !data || data.length === 0) break
      for (const r of data as unknown as { jenis: string; nilai: number; payload: { sub_jenis?: string }; aset: { status: string } | null }[]) {
        if (r.aset?.status !== 'dihapus') continue
        const nilai = r.nilai || 0
        if (r.jenis === 'penghapusan_sebab_lain') { out.sebabLain.n++; out.sebabLain.nilai += nilai; continue }
        const sub = r.payload?.sub_jenis
        if (sub === 'hibah') { out.hibah.n++; out.hibah.nilai += nilai }
        else if (sub === 'penjualan') { out.jual.n++; out.jual.nilai += nilai }
        else if (sub === 'tukar_menukar') { out.tukar.n++; out.tukar.nilai += nilai }
        else if (sub === 'penyertaan_modal') { out.modal.n++; out.modal.nilai += nilai }
        else { out.sebabLain.n++; out.sebabLain.nilai += nilai } // fallback data lama tanpa sub_jenis dikenal
      }
      if (data.length < 1000) break
    }
  } catch { /* transaksi_bmd/aset belum ada → 0 */ }
  return out
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
    hapus,
  ] = await Promise.all([
    scanAset(supabase),
    countTransferAktif(supabase, 'pengalihan_status'),
    countTransferAktif(supabase, 'mutasi_internal'),
    countPenghapusan(supabase),
  ])
  const gol = scan.gol
  const cn = scan.caraNilai
  const cc = scan.caraCount
  const totalRegister = Object.values(gol).reduce((s, v) => s + v.count, 0)
  const totalNilai = Object.values(gol).reduce((s, v) => s + v.nilai, 0)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Ringkasan BMD Kabupaten Kediri — Periode {PERIODE}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Total Nilai BMD</p>
          <p className="text-2xl font-bold text-teal">{formatRp(totalNilai)}</p>
        </div>
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
          approved={{ pengadaan: cc['pengadaan'] || 0, hibah: cc['hibah_masuk'] || 0, tukarMenukar: cc['tukar_menukar'] || 0, inventarisasi: cc['hasil_inventarisasi'] || 0, lainnya: cc['perolehan_lainnya'] || 0 }}
          approvedNilai={{ pengadaan: cn['pengadaan'] || 0, hibah: cn['hibah_masuk'] || 0, tukarMenukar: cn['tukar_menukar'] || 0, inventarisasi: cn['hasil_inventarisasi'] || 0, lainnya: cn['perolehan_lainnya'] || 0 }} />
      </Section>

      {/* Mutasi & transfer */}
      <Section title="Mutasi & Transfer" sub="Perpindahan barang antar / dalam SKPD — proporsi sudah di-acc vs masih menunggu persetujuan">
        <MutasiTransferCards approved={{ transfer, mutasiInternal }} />
      </Section>

      {/* Penghapusan */}
      <Section title="Penghapusan Barang" sub="Barang yang dihapus dari laporan (data tetap tersimpan) — klik utk rincian per SKPD">
        <PenghapusanCards data={hapus} />
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
