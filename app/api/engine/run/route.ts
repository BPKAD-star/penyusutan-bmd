import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { hitungJadwalAset, type TrxLedger, type BandOverhaul } from '@/lib/engine/penyusutan'
import { parsePeriode } from '@/lib/bmd'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

type SupabaseAdmin = ReturnType<typeof createAdminClient>

const DEFAULT_LIMIT = 3000 // aset per batch — cukup kecil agar 1 invocation << batas waktu

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

// Engine di-BATCH per-aset (keyset by aset.id). Dulu satu invocation memuat
// SEMUA aset + SEMUA transaksi (218rb + 250rb) → timeout serverless (respons
// kosong → "Unexpected end of JSON input" di client). Sekarang tiap panggilan
// memproses `limit` aset (mulai setelah `after_id`), fetch HANYA transaksi aset
// batch itu, upsert hasilnya, lalu balikin `last_id`+`done` supaya CLIENT
// meng-loop batch berikutnya sampai selesai. Replay per-aset independen
// (hitungJadwalAset baca ledger aset itu sendiri) → aman dibatch.
export async function POST(req: Request) {
  const body = await req.json()
  const periode: string = body.periode
  const afterId: string = body.after_id || ''
  const limit: number = Math.min(Math.max(Number(body.limit) || DEFAULT_LIMIT, 1), 10000)

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
  const { data: profile } = await session.from('admin_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Hanya admin' }, { status: 403 })

  // Tahun terkunci (tutup buku) = angka final/teraudit, engine tak boleh
  // menimpanya lagi (lihat CLAUDE.md — Tahun Buku). Tahun tak terdaftar di
  // tahun_buku dianggap terkunci juga (fail-closed, sama seperti guard ledger).
  const { data: tb } = await session.from('tahun_buku').select('status').eq('tahun', tahunTarget).single()
  if ((tb?.status ?? 'terkunci') === 'terkunci') {
    return NextResponse.json({ error: `Tahun ${tahunTarget} sudah tutup buku (terkunci) — engine tidak bisa dijalankan ulang untuk periode ini.` }, { status: 403 })
  }

  const db: SupabaseAdmin = createAdminClient()

  // 1. Kumpulkan batch aset (keyset by id) via window 1000 sampai `limit` atau
  //    habis. Sengaja paging 1000-an, BUKAN `.limit(limit)` tunggal — PostgREST
  //    cap ~1000 baris/response, jadi limit besar bakal diam-diam kepotong.
  type AsetRow = { id: string; kode: string; nilai_perolehan: number; intra_ekstra: string | null; tgl_perolehan: string | null }
  const aset: AsetRow[] = []
  let cursor = afterId
  let reachedEnd = false
  while (aset.length < limit) {
    let aq = db.from('aset').select('id,kode,nilai_perolehan,intra_ekstra,tgl_perolehan').order('id').limit(1000)
    if (cursor) aq = aq.gt('id', cursor)
    const { data, error: asetErr } = await aq
    if (asetErr) return NextResponse.json({ error: `Ambil aset gagal: ${asetErr.message}` }, { status: 500 })
    if (!data || data.length === 0) { reachedEnd = true; break }
    aset.push(...(data as AsetRow[]))
    cursor = data[data.length - 1].id
    if (data.length < 1000) { reachedEnd = true; break }
  }
  if (aset.length === 0) {
    return NextResponse.json({ done: true, processed: 0, last_id: afterId, disusutkan: 0, total_beban: 0, rows_ditulis: 0, rows_dilindungi_tahun_terkunci: 0, tidak_disusutkan: 0 })
  }
  const asetIds = aset.map(a => a.id)

  // 2. Data referensi (kecil) + transaksi HANYA utk aset batch ini (per 200 id)
  const [kodefikasi, bands, trxs] = await Promise.all([
    fetchAll<{ kode: string; masa_manfaat_tahun: number | null }>(
      (f, t) => db.from('admin_kodefikasi_bmd').select('kode,masa_manfaat_tahun').range(f, t)),
    fetchAll<BandOverhaul>(
      (f, t) => db.from('admin_overhaul_band').select('kode_prefix,band_no,pct_min,pct_max,tambahan_tahun').range(f, t)),
    (async () => {
      const out: (TrxLedger & { aset_id: string })[] = []
      for (let i = 0; i < asetIds.length; i += 200) {
        const { data, error } = await db.from('transaksi_bmd')
          .select('id,aset_id,jenis,periode,tanggal,nilai,payload,created_at')
          .in('aset_id', asetIds.slice(i, i + 200)).order('id')
        if (error) throw new Error(error.message)
        if (data) out.push(...(data as (TrxLedger & { aset_id: string })[]))
      }
      return out
    })(),
  ])

  const masaMap = new Map<string, number>()
  for (const k of kodefikasi) if (k.masa_manfaat_tahun) masaMap.set(k.kode, k.masa_manfaat_tahun)

  const trxByAset = new Map<string, TrxLedger[]>()
  for (const t of trxs) {
    const arr = trxByAset.get(t.aset_id) || []
    arr.push(t)
    trxByAset.set(t.aset_id, arr)
  }

  // 3. Replay ledger per aset (engine baca dari histori — §1.2)
  const rows = []
  let dilewati = 0
  for (const a of aset) {
    const jadwal = hitungJadwalAset(a, trxByAset.get(a.id) || [], masaMap, bands, periode)
    if (jadwal.length === 0) { dilewati++; continue }
    rows.push(...jadwal)
  }

  // 3b. Jangan timpa periode yg tahunnya SUDAH terkunci (replay selalu mulai
  // dari baseline → bisa melintasi tahun terkunci di tengah). Filter per batch.
  const tahunTerlibat = [...new Set(rows.map(r => Number(r.periode.slice(0, 4))))]
  const { data: tbRows } = tahunTerlibat.length
    ? await db.from('tahun_buku').select('tahun,status').in('tahun', tahunTerlibat)
    : { data: [] as { tahun: number; status: string }[] }
  const statusTahun = new Map((tbRows || []).map(r => [r.tahun, r.status]))
  const isTerkunci = (periodeRow: string) => (statusTahun.get(Number(periodeRow.slice(0, 4))) ?? 'terkunci') === 'terkunci'
  const rowsDitulis = rows.filter(r => !isTerkunci(r.periode))
  const dilewatiTerkunci = rows.length - rowsDitulis.length

  // 4. Upsert hasil batch (safe re-run)
  const BATCH = 500
  for (let i = 0; i < rowsDitulis.length; i += BATCH) {
    const { error } = await db.from('penyusutan_semester')
      .upsert(rowsDitulis.slice(i, i + BATCH), { onConflict: 'aset_id,periode' })
    if (error) return NextResponse.json({ error: `Upsert gagal: ${error.message}` }, { status: 500 })
  }

  const periodeTarget = rowsDitulis.filter(r => r.periode === periode)
  return NextResponse.json({
    done: reachedEnd,                   // true kalau sudah mencapai akhir tabel aset
    processed: aset.length,             // aset diproses di batch ini
    last_id: cursor,                    // kursor (id terakhir) utk batch berikutnya
    periode,
    disusutkan: periodeTarget.filter(r => r.beban > 0).length,
    tidak_disusutkan: dilewati,
    total_beban: periodeTarget.reduce((s, r) => s + r.beban, 0),
    rows_ditulis: rowsDitulis.length,
    rows_dilindungi_tahun_terkunci: dilewatiTerkunci,
  })
}
