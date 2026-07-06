import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { hitungJadwalAset, type TrxLedger, type BandOverhaul } from '@/lib/engine/penyusutan'
import { parsePeriode } from '@/lib/bmd'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

type SupabaseAdmin = ReturnType<typeof createAdminClient>

async function fetchAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  const size = 1000
  for (let from = 0; ; from += size) {
    const { data, error } = await query(from, from + size - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < size) break
  }
  return out
}

export async function POST(req: Request) {
  const { periode } = await req.json()
  let tahunTarget: number
  try {
    tahunTarget = parsePeriode(periode).tahun
  } catch {
    return NextResponse.json({ error: 'Periode tidak valid (format YYYY-S1/YYYY-S2)' }, { status: 400 })
  }

  // Hanya admin yang boleh menjalankan engine
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await session.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Hanya admin' }, { status: 403 })

  // Tahun terkunci (tutup buku) = angka final/teraudit, engine tak boleh
  // menimpanya lagi (lihat CLAUDE.md — Tahun Buku). Tahun tak terdaftar di
  // tahun_buku dianggap terkunci juga (fail-closed, sama seperti guard ledger).
  const { data: tb } = await session.from('tahun_buku').select('status').eq('tahun', tahunTarget).single()
  if ((tb?.status ?? 'terkunci') === 'terkunci') {
    return NextResponse.json({ error: `Tahun ${tahunTarget} sudah tutup buku (terkunci) — engine tidak bisa dijalankan ulang untuk periode ini.` }, { status: 403 })
  }

  const db: SupabaseAdmin = createAdminClient()

  // 1. Data referensi
  const [aset, trxs, kodefikasi, bands] = await Promise.all([
    fetchAll<{ id: string; kode: string; nilai_perolehan: number; intra_ekstra: string | null; tgl_perolehan: string | null }>(
      (f, t) => db.from('aset').select('id,kode,nilai_perolehan,intra_ekstra,tgl_perolehan').range(f, t)),
    fetchAll<TrxLedger & { aset_id: string }>(
      (f, t) => db.from('transaksi_bmd').select('id,aset_id,jenis,periode,tanggal,nilai,payload,created_at').order('id').range(f, t)),
    fetchAll<{ kode: string; masa_manfaat_tahun: number | null }>(
      (f, t) => db.from('kodefikasi_bmd').select('kode,masa_manfaat_tahun').range(f, t)),
    fetchAll<BandOverhaul>(
      (f, t) => db.from('overhaul_band').select('kode_prefix,band_no,pct_min,pct_max,tambahan_tahun').range(f, t)),
  ])

  const masaMap = new Map<string, number>()
  for (const k of kodefikasi) if (k.masa_manfaat_tahun) masaMap.set(k.kode, k.masa_manfaat_tahun)

  const trxByAset = new Map<string, TrxLedger[]>()
  for (const t of trxs) {
    const arr = trxByAset.get(t.aset_id) || []
    arr.push(t)
    trxByAset.set(t.aset_id, arr)
  }

  // 2. Replay ledger per aset (engine baca dari histori — §1.2)
  const rows = []
  let dilewati = 0
  for (const a of aset) {
    const jadwal = hitungJadwalAset(a, trxByAset.get(a.id) || [], masaMap, bands, periode)
    if (jadwal.length === 0) { dilewati++; continue }
    rows.push(...jadwal)
  }

  // 2b. Jangan timpa periode yg tahunnya SUDAH terkunci (tutup buku), walau
  // ikut terhitung ulang di memori krn replay selalu mulai dari baseline.
  // Cek target periode di atas cuma cegah run kalau TARGET-nya sendiri
  // terkunci — tapi replay tetap melintasi tahun² sebelumnya yg mungkin
  // sudah dikunci (mis. run 2027 setelah 2026 ditutup). Filter di sini yg
  // benar-benar melindungi baris tersimpan tahun terkunci dari tertimpa.
  const tahunTerlibat = [...new Set(rows.map(r => Number(r.periode.slice(0, 4))))]
  const { data: tbRows } = await db.from('tahun_buku').select('tahun,status').in('tahun', tahunTerlibat)
  const statusTahun = new Map((tbRows || []).map(r => [r.tahun, r.status]))
  const isTerkunci = (periodeRow: string) => (statusTahun.get(Number(periodeRow.slice(0, 4))) ?? 'terkunci') === 'terkunci'
  const rowsDitulis = rows.filter(r => !isTerkunci(r.periode))
  const dilewatiTerkunci = rows.length - rowsDitulis.length

  // 3. Upsert hasil (safe re-run)
  const BATCH = 500
  for (let i = 0; i < rowsDitulis.length; i += BATCH) {
    const { error } = await db.from('penyusutan_semester')
      .upsert(rowsDitulis.slice(i, i + BATCH), { onConflict: 'aset_id,periode' })
    if (error) return NextResponse.json({ error: `Upsert gagal: ${error.message}` }, { status: 500 })
  }

  const periodeTarget = rowsDitulis.filter(r => r.periode === periode)
  return NextResponse.json({
    success: true,
    periode,
    total_aset: aset.length,
    disusutkan: periodeTarget.filter(r => r.beban > 0).length,
    tidak_disusutkan: dilewati,
    total_beban: periodeTarget.reduce((s, r) => s + r.beban, 0),
    rows_ditulis: rowsDitulis.length,
    rows_dilindungi_tahun_terkunci: dilewatiTerkunci,
  })
}
