// Alat `rekap_perolehan` (pengguna istimewa Asisten AI) — dipisah dari
// toolsAdmin.ts 2026-09-30 karena berkas itu menembus 500 baris. Aturannya
// SAMA dgn Laporan Perolehan; lihat CLAUDE.md "alat rekap_perolehan".
import type { SupabaseClient } from '@supabase/supabase-js'
import { GOLONGAN_REKAP, JENIS_PEROLEHAN, CARA_PEROLEHAN_LABEL } from '@/lib/bmd'
import { formatRupiah2 } from '@/lib/export'
import { paginate } from '@/shared/db/paginate'
import { fetchVoidedAsetIds } from '@/lib/voidedAset'
import { periodeDiminta } from '@/lib/laporanPerolehanPermendagri'
import { muatSkpd, turunanSkpd, type SkpdRow } from './skpdPohon'

const MAKS_BARIS = 30
const rp = (n: number | null | undefined) => formatRupiah2(n)
const fmtN = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n)
const GOL_URAIAN: Record<string, string> = Object.fromEntries(GOLONGAN_REKAP.map(g => [g.kode, g.uraian]))

type BarisPerolehan = {
  id: number; jenis: string; nilai: number | null; skpd_tujuan: number | null; aset_id: string | null
  aset: { status: string; kode: string } | null
}

/** Jaring pengaman: jumlah baris ledger perolehan satu permintaan. 1 tahun ≈ 2 rb
 *  baris hari ini; tembus angka ini = jangan menjumlah potongan, tolak. */
const MAKS_BARIS_PEROLEHAN = 30_000

export async function rekapPerolehan(
  sb: SupabaseClient, periode: string, cara: string, skpdId: unknown, perSkpd: boolean, perGolongan: boolean,
): Promise<string> {
  if (periode && !/^\d{4}(-S[12])?$/.test(periode)) return 'GAGAL: periode harus berformat TAHUN (2026) atau TAHUN-S1 / TAHUN-S2 (2026-S1).'
  if (cara && !(JENIS_PEROLEHAN as readonly string[]).includes(cara)) {
    return `GAGAL: cara harus salah satu dari ${JENIS_PEROLEHAN.join(', ')}.`
  }
  const jenisList: string[] = cara ? [cara] : [...JENIS_PEROLEHAN]

  let scope: Set<number> | null = null
  let semua: SkpdRow[] = []
  let label = 'SELURUH KABUPATEN'
  const punyaSkpd = skpdId != null && skpdId !== ''
  if (punyaSkpd) {
    const akar = Number(skpdId)
    if (!Number.isInteger(akar)) return 'GAGAL: skpd_id harus angka bulat (ambil dari cari_skpd).'
    semua = await muatSkpd(sb)
    const ada = semua.find(x => x.id === akar)
    if (!ada) return `GAGAL: SKPD dengan id ${akar} tidak ditemukan.`
    const ids = turunanSkpd(semua, akar)
    scope = new Set(ids)
    label = `${ada.nama}${ids.length > 1 ? ` beserta ${ids.length - 1} unit di bawahnya` : ''}`
  } else if (perSkpd) {
    semua = await muatSkpd(sb)
  }

  // ── Tarik baris ledger, per jenis, keyset ──────────────────────────────────
  // Bentuk query SAMA dgn LaporanPerolehan (`jenis` = eq + urut id) supaya ikut
  // dilayani partial index idx_trx_perolehan_id (20260820_03). SKPD & golongan
  // disaring di MEMORI: barisnya hanya ribuan, dan menyaring di server lewat
  // `skpd_tujuan.in.(…694 id…)` adalah bentuk yang berkali-kali jadi sebab timeout.
  const per = periodeDiminta(periode)
  const baris: BarisPerolehan[] = []
  for (const jenis of jenisList) {
    const dapat = await paginate<number, BarisPerolehan>(`transaksi ${jenis}`, kursor => {
      let q = sb.from('transaksi_bmd')
        .select('id,jenis,nilai,skpd_tujuan,aset_id,aset:aset_id(status,kode)')
        .eq('jenis', jenis)
      if (per.length === 1) q = q.eq('periode', per[0])
      else if (per.length > 1) q = q.in('periode', per)
      if (kursor !== null) q = q.gt('id', kursor)
      return q.order('id').limit(1000) as unknown as PromiseLike<{ data: BarisPerolehan[] | null; error: { message: string } | null }>
    })
    baris.push(...dapat)
    if (baris.length > MAKS_BARIS_PEROLEHAN) {
      return `GAGAL: perolehan yang cocok lebih dari ${MAKS_BARIS_PEROLEHAN} transaksi — persempit periode atau cara agar angkanya tidak terpotong.`
    }
  }

  // ── Buang yang dibatalkan/duplikat — aturan Laporan Perolehan ─────────────
  // Aset berstatus `aktif` PASTI tak ter-void (lihat komentar di LaporanPerolehan),
  // jadi hanya yang non-aktif yang perlu ditanyakan. `aset` null (tak terbaca)
  // tetap ditanyakan: fail-closed. fetchVoidedAsetIds MELEMPAR kalau gagal →
  // jatuh ke "GAGAL:", TIDAK ke angka tanpa saringan.
  const perluDicek = [...new Set(baris.filter(r => r.aset_id && r.aset?.status !== 'aktif').map(r => r.aset_id as string))]
  const voided = perluDicek.length ? await fetchVoidedAsetIds(sb, [], perluDicek) : new Set<string>()
  const hidup = baris.filter(r => !(r.aset_id && voided.has(r.aset_id)))
  const dibuang = baris.length - hidup.length

  const dalam = scope ? hidup.filter(r => r.skpd_tujuan != null && scope.has(r.skpd_tujuan)) : hidup
  const cari = `${periode || 'semua periode'}${cara ? ` · ${CARA_PEROLEHAN_LABEL[cara] || cara}` : ''}`
  if (dalam.length === 0) {
    return `Tidak ada perolehan (${cari}) di ${label}${dibuang ? ` (${dibuang} transaksi dibuang karena dibatalkan/duplikat)` : ''}.`
  }

  const nilai = (r: BarisPerolehan) => Number(r.nilai) || 0
  const totN = dalam.length
  const totRp = dalam.reduce((t, r) => t + nilai(r), 0)

  const perCara = new Map<string, { n: number; rp: number }>()
  for (const r of dalam) {
    const c = perCara.get(r.jenis) || { n: 0, rp: 0 }
    c.n += 1; c.rp += nilai(r)
    perCara.set(r.jenis, c)
  }
  const keluar: string[] = [
    `Perolehan BMD · ${cari} · ${label} (sumber sama dgn Laporan Perolehan):`,
    ...JENIS_PEROLEHAN.filter(j => perCara.has(j)).map(j => {
      const c = perCara.get(j) as { n: number; rp: number }
      return `- ${CARA_PEROLEHAN_LABEL[j] || j}: ${fmtN(c.n)} barang · Rp${rp(c.rp)}`
    }),
    perCara.size > 1 ? `TOTAL: ${fmtN(totN)} barang · Rp${rp(totRp)}` : '',
  ]

  if (perGolongan) {
    const g = new Map<string, { n: number; rp: number }>()
    for (const r of dalam) {
      const kd = r.aset?.kode ? r.aset.kode.split('.').slice(0, 3).join('.') : '(kode tak terbaca)'
      const c = g.get(kd) || { n: 0, rp: 0 }
      c.n += 1; c.rp += nilai(r)
      g.set(kd, c)
    }
    keluar.push('Per golongan:', ...[...g.entries()].sort((a, b) => b[1].rp - a[1].rp)
      .map(([kd, c]) => `- ${kd} ${GOL_URAIAN[kd] || ''}: ${fmtN(c.n)} barang · Rp${rp(c.rp)}`))
  }

  if (perSkpd) {
    const byId = new Map(semua.map(x => [x.id, x]))
    const kunci = (id: number): number => {
      if (punyaSkpd) return id
      let s = byId.get(id)
      for (let i = 0; s && s.parent_id != null && i < 10; i++) s = byId.get(s.parent_id)
      return s ? s.id : id
    }
    const ps = new Map<number, { n: number; rp: number }>()
    for (const r of dalam) {
      if (r.skpd_tujuan == null) continue
      const k = kunci(r.skpd_tujuan)
      const c = ps.get(k) || { n: 0, rp: 0 }
      c.n += 1; c.rp += nilai(r)
      ps.set(k, c)
    }
    const urut = [...ps.entries()].sort((a, b) => b[1].rp - a[1].rp)
    keluar.push(
      `Per ${punyaSkpd ? 'unit' : 'SKPD induk'} (${urut.length} SKPD, urut nilai terbesar):`,
      ...urut.slice(0, MAKS_BARIS).map(([id, c]) => `- ${byId.get(id)?.nama || `SKPD ${id}`}: ${fmtN(c.n)} barang · Rp${rp(c.rp)}`),
      urut.length > MAKS_BARIS ? `(Terpotong di ${MAKS_BARIS} — masih ada ${urut.length - MAKS_BARIS} lainnya.)` : '',
    )
  }

  keluar.push(
    `Catatan: satu transaksi = satu barang; nilai = nilai perolehan saat dicatat. ${dibuang ? `${dibuang} transaksi sudah dibuang karena dibatalkan/duplikat. ` : ''}`
    + 'Angka ini BEDA dari Dashboard/rekap_aset (aset aktif hari ini): barang yang kelak dihapus tetap terhitung di sini. Termin konstruksi (KDP) tidak termasuk.',
  )
  return keluar.filter(Boolean).join('\n')
}
