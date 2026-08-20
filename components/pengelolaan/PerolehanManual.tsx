'use client'
// Cara Perolehan: Hibah / Tukar Menukar / Hasil Inventarisasi / Perolehan
// Lainnya — entry manual (draft + APPROVAL), pola sama Pengadaan tapi:
//   - 1 kartu header (No. Dokumen, Tgl Dokumen, Pihak (kondisional), Keterangan)
//     — bukan Kontrak+BAST terpisah. Dokumen ini SENDIRI acuannya.
//   - Tanpa Kode Rekening Belanja saat entry barang.
//   - Tanggal Perolehan diisi PER BARANG (bukan satu tanggal per header) —
//     bisa backdate ke tahun lama; penyusutannya di-restate mundur otomatis
//     oleh engine saat "Jalankan Engine" dijalankan ulang (lihat migrasi
//     20260707_02 yg membuka whitelist tahun_buku utk jenis-jenis ini).
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cekBolehBatal } from '@/lib/guardPembatalan'
import { useFotoThumbs, FotoSel } from '@/shared/ui/FotoBarang'
import { catatTransaksi } from '@/lib/transaksi'
import {
  periodeDariTanggal, GOLONGAN_DAFTAR_BARANG, kodeLevel3, fetchBatasKapitalisasi,
  klasifikasiKomptabel, fetchMasaManfaat, comparePeriode, periodeRange,
  previousPeriode, parsePeriode, formatPeriode,
} from '@/lib/bmd'
import { fieldsForKode, allSameGolongan, ASET_FIELD_COLS, ASET_NUM_COLS, angkaKolomAset } from '@/lib/asetFields'
import { generateNibars } from '@/lib/nibar'
import { formatRupiah } from '@/lib/export'
import { type ApprovalScope, SCOPE_KOSONG, fetchApprovalScope, bolehSetujuiJurnal } from '@/lib/roles'
import FormShell from './FormShell'
import EditSpesifikasiModal from './EditSpesifikasiModal'
import SkpdCombobox from '@/components/SkpdCombobox'
import { useDateBounds } from '@/components/useTahunBuku'
import { backdropClose } from '@/components/backdropClose'
import { useDraftSeleksi, DraftSearchBar, DraftBulkBar } from './draftSeleksi'
import { useKonfirmasi } from '@/shared/ui/konfirmasi'

export type KategoriPerolehan = 'hibah_masuk' | 'tukar_menukar' | 'hasil_inventarisasi' | 'perolehan_lainnya'

const todayStr = () => new Date().toISOString().slice(0, 10)

/**
 * Posisi umur barang BEKAS yang diterima pertengahan umur — dititipkan di
 * payload baris ledger, bentuknya sama persis dengan `pemecahan_masuk` supaya
 * engine bisa memakainya lewat satu cabang yang sama.
 *
 * Keputusan user 2026-08-20: pemkab mengakui tahun PEMBUATAN barang, jadi
 * barang hibah/tukar menukar/dsb yang dibangun 2024 lalu diserahkan Februari
 * 2026 masuk dengan akumulasi penyusutan 2024–2025 sudah menempel — bukan
 * mulai umur baru sejak BAST.
 *
 * DIHITUNG SEKALI DI SINI, lalu dibekukan. Sengaja bukan diturunkan engine dari
 * `aset.tgl_perolehan`: kolom itu masih bisa dikoreksi belakangan lewat menu
 * Koreksi, dan masa manfaat di kodefikasi bisa diperbarui — sementara angka yang
 * sudah masuk neraca tak boleh ikut bergerak. Pola & alasan yang sama dengan
 * checkpoint Tutup Tahun.
 *
 * Mengembalikan objek KOSONG (bukan nol-nol) kalau tak ada yang perlu dibawa —
 * barang yang perolehannya di periode BAST itu sendiri, atau golongan tanpa masa
 * manfaat (Tanah, ATL, KDP). Payload tanpa kunci checkpoint = engine memakai
 * jalur lama persis, jadi entry normal sama sekali tak berubah perilakunya.
 */
function checkpointBekas(
  nilai: number, tglPerolehan: string, periodeBast: string, masaTahun: number | undefined,
): Record<string, number> {
  if (!masaTahun || masaTahun <= 0 || !tglPerolehan) return {}
  const periodeAsal = periodeDariTanggal(tglPerolehan)
  if (comparePeriode(periodeAsal, periodeBast) >= 0) return {}

  // Semester yang SUDAH terpakai = sejak semester perolehan s.d. semester
  // SEBELUM BAST. Penyusutan di aplikasi ini mulai pada semester perolehan itu
  // sendiri, karena itu batas bawahnya periode sebelum `periodeAsal`.
  // `previousPeriode` bekerja pada objek Periode, `periodeRange` pada string —
  // jadi keduanya disambung lewat parse/format, bukan dipanggil berantai.
  const smtSebelum = (p: string) => formatPeriode(previousPeriode(parsePeriode(p)))
  const totalSmt = Math.max(1, Math.round(masaTahun * 2))
  const terpakai = Math.min(
    totalSmt,
    periodeRange(smtSebelum(periodeAsal), smtSebelum(periodeBast)).length,
  )
  const bebanPerSmt = Math.round(nilai / totalSmt)
  // Umur HABIS sebelum diserahkan → nilai buku 0, bukan sisa pembulatan.
  // Aturannya sama dengan engine: selisih pembulatan diserap di semester akhir.
  const habis = terpakai >= totalSmt
  const akumulasi = habis ? nilai : bebanPerSmt * terpakai
  return {
    nilai_buku_awal: nilai - akumulasi,
    akumulasi,
    sisa_masa_manfaat_smt: totalSmt - terpakai,
    masa_manfaat_smt: totalSmt,
    beban_per_smt: bebanPerSmt,
  }
}

// Satu DraftItem = satu unit barang (kuantitas dipecah saat ditambahkan, sama
// spt Pengadaan). tglPerolehan ikut per-unit (beda dari Pengadaan yg 1 tanggal
// BAST berlaku ke semua barang dlm 1 kontrak) — di sini setiap "Tambah ke
// Draft" bisa punya tanggal perolehan sendiri, termasuk backdate.
type DraftItem = {
  key: string; golongan: string; kode: string; uraianBarang: string
  tglPerolehan: string
  satuan: string; harga: string
  fields: Record<string, string>
  foto: string[]
}
type KodefikasiHasil = {
  kode: string; uraian: string | null
  nama_objek: string | null; nama_rincian: string | null; nama_sub_rincian: string | null
  masa_manfaat_tahun: number | null; batas_kapitalisasi: number | null
}
type HeaderPayload = { pihak?: string; dokumen_paths?: string[]; draft_items?: DraftItem[] }
type ApprovalStatus = 'pending' | 'disetujui' | 'ditolak'
type Header = {
  id: string; no_sk: string; tanggal: string; periode: string
  keterangan: string | null; payload: HeaderPayload
  approval_status: ApprovalStatus; approved_at: string | null
  created_by: string | null   // pemisahan tugas: pembuat tak boleh menyetujui sendiri
}
type JurnalLine = {
  /** id baris ledger event perolehannya — dipakai guard pembatalan. */
  trx_id: number
  aset_id: string; nibar: string | null; kode: string; uraian_barang: string | null; nama_barang: string | null
  satuan: string | null; intra_ekstra: string | null; nilai: number
  // ⚠️ DUA tanggal, dan sejak 2026-08-20 keduanya BEDA — jangan tertukar.
  // `tanggal`       = tanggal PERISTIWA (BAST), tanggal baris ledgernya.
  // `tgl_perolehan` = tanggal barang itu DIBUAT, yang menentukan NIBAR &
  //                   akumulasi bawaan. Inilah yang dipakai membangun ulang
  //                   draft saat Buka Kunci.
  tanggal: string; tgl_perolehan: string
  foto_paths: string[]
  fields: Record<string, string>
}
type Jurnal = Header & { lines: JurnalLine[]; total: number; hasLedger: boolean }

const namaFile = (path: string) => path.split('/').pop() || path
const toNum = (s: string) => { const n = parseFloat(String(s).replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n }
const toInt = (s: string) => { const n = parseInt(String(s).replace(/[^0-9]/g, ''), 10); return isNaN(n) ? 0 : n }
const newKey = () => Math.random().toString(36).slice(2)
const draftTotal = (items: DraftItem[]) => items.reduce((s, i) => s + toNum(i.harga), 0)

export default function PerolehanManual({ kategori, judul, pihakLabel }: {
  kategori: KategoriPerolehan; judul: string; pihakLabel: string | null
}) {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()

  const [skpdPathMap, setSkpdPathMap] = useState<Record<number, string>>({})
  const [golonganLabels, setGolonganLabels] = useState<Record<string, string>>({})
  const [skpd, setSkpd] = useState('')
  // Boleh approve kartu ini? admin = semua; pengurus_barang = hanya sub-OPD strict
  // di bawah nodenya DAN bukan kartu buatannya sendiri (pemisahan tugas — sejak
  // picker SKPD dibuka ke subtree). Penegak asli: trigger approval guard di DB.
  const [scope, setScope] = useState<ApprovalScope>(SCOPE_KOSONG)
  const bolehACCKartu = (j: Jurnal) => bolehSetujuiJurnal(scope, skpd, j.created_by)

  const [jurnals, setJurnals] = useState<Jurnal[]>([])
  const [loadingJurnal, setLoadingJurnal] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [mode, setMode] = useState<'list' | 'baru'>('list')
  const [editing, setEditing] = useState<Header | null>(null)
  const [specEdit, setSpecEdit] = useState<{ header: Jurnal; keys: string[] } | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    (async () => {
      type SkpdRow = { id: number; nama: string; level: number; parent_id: number | null }
      const rows: SkpdRow[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama,level,parent_id').range(from, from + 999)
        if (!data || data.length === 0) break
        rows.push(...(data as SkpdRow[]))
        if (data.length < 1000) break
      }
      const byId = new Map(rows.map(s => [s.id, s]))
      const paths: Record<number, string> = {}
      for (const s of rows) {
        const parts: string[] = []
        let cur: SkpdRow | undefined = s
        const seen = new Set<number>()
        while (cur && !seen.has(cur.id)) { seen.add(cur.id); parts.unshift(cur.nama); cur = cur.parent_id != null ? byId.get(cur.parent_id) : undefined }
        paths[s.id] = parts.join(' › ')
      }
      setSkpdPathMap(paths)
    })()
    ;(async () => {
      setScope(await fetchApprovalScope(supabase))
    })()
    ;(async () => {
      const { data: jenis } = await supabase.from('admin_jenis_aset').select('id,nama')
      const namaById = new Map((jenis || []).map(j => [j.id, j.nama]))
      const labels: Record<string, string> = {}
      await Promise.all(GOLONGAN_DAFTAR_BARANG.map(async prefix => {
        const { data } = await supabase.from('admin_kodefikasi_bmd')
          .select('jenis_aset_id').eq('kode_jenis', prefix).not('jenis_aset_id', 'is', null).limit(1)
        const id = data?.[0]?.jenis_aset_id
        labels[prefix] = (id != null && namaById.get(id)) || prefix
      }))
      setGolonganLabels(labels)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadJurnals = useCallback(async (skpdId: string) => {
    if (!skpdId) { setJurnals([]); return }
    setLoadingJurnal(true)

    const { data: headers } = await supabase.from('jurnal_header')
      .select('id,no_sk,tanggal,periode,keterangan,payload,approval_status,approved_at,created_by')
      .eq('kategori', kategori).eq('skpd_id', Number(skpdId))
      .order('tanggal', { ascending: false })
    const hs = (headers || []) as Header[]

    const jmap = new Map<string, Jurnal>()
    for (const h of hs) {
      const payload = h.payload || {}
      jmap.set(h.id, { ...h, payload: { ...payload, draft_items: (payload.draft_items || []) as DraftItem[] }, lines: [], total: 0, hasLedger: false })
    }

    const pendingIds = hs.filter(h => h.approval_status === 'pending').map(h => h.id)
    if (pendingIds.length > 0) {
      const { data: led } = await supabase.from('transaksi_bmd').select('header_id').in('header_id', pendingIds)
      for (const r of (led || []) as { header_id: string | null }[]) {
        const j = r.header_id && jmap.get(r.header_id); if (j) j.hasLedger = true
      }
    }

    const disetujuiIds = hs.filter(h => h.approval_status === 'disetujui').map(h => h.id)
    if (disetujuiIds.length > 0) {
      const { data } = await supabase.from('transaksi_bmd')
        .select(`id,header_id,nilai,tanggal,payload,aset:aset_id(id,nibar,uraian_barang,kode,satuan,intra_ekstra,status,tgl_perolehan,foto_paths,${ASET_FIELD_COLS.join(',')})`)
        .eq('jenis', kategori)
        .in('header_id', disetujuiIds)
        .order('id', { ascending: false })

      const rows = (data || []) as unknown as {
        id: number; header_id: string; nilai: number; tanggal: string
        payload: { tgl_perolehan_asli?: string | null } | null
        aset: ({
          id: string; nibar: string | null; nama_barang: string | null; uraian_barang: string | null; kode: string
          satuan: string | null; intra_ekstra: string | null; status: string; tgl_perolehan: string | null
          foto_paths: string[]
        } & Record<string, string | number | null>) | null
      }[]
      const seen = new Set<string>()
      for (const r of rows) {
        if (!r.aset || seen.has(r.aset.id)) continue
        seen.add(r.aset.id)
        if (r.aset.status !== 'aktif') continue
        const j = jmap.get(r.header_id)
        if (!j) continue
        const fields: Record<string, string> = {}
        for (const k of ASET_FIELD_COLS) { const v = r.aset[k]; if (v != null) fields[k] = String(v) }
        j.lines.push({
          trx_id: r.id, aset_id: r.aset.id, nibar: r.aset.nibar, kode: r.aset.kode, uraian_barang: r.aset.uraian_barang, nama_barang: r.aset.nama_barang,
          satuan: r.aset.satuan, intra_ekstra: r.aset.intra_ekstra, nilai: r.nilai, tanggal: r.tanggal,
          // Urutan cadangan SENGAJA begini: kolom `aset` dulu (nilai HIDUP —
          // ikut koreksi lewat menu Koreksi, sejalan dengan `fields` di bawah
          // yang juga dibaca dari aset), lalu `payload.tgl_perolehan_asli`
          // (beku di ledger saat approve), baru `r.tanggal`. Yang terakhir
          // cuma buat baris LAMA (sebelum 2026-08-20) — waktu itu tanggal
          // ledger memang SAMA dengan tanggal perolehan.
          tgl_perolehan: (r.aset.tgl_perolehan as string | null)
            || r.payload?.tgl_perolehan_asli || r.tanggal,
          foto_paths: r.aset.foto_paths || [], fields,
        })
        j.total += r.nilai
      }
    }
    setJurnals([...jmap.values()].filter(j =>
      j.approval_status === 'pending' || (j.approval_status === 'disetujui' && j.lines.length > 0)))
    setLoadingJurnal(false)
  }, [kategori]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadJurnals(skpd); setMode('list'); setEditing(null) }, [skpd, loadJurnals])

  const skpdNama = skpd ? skpdPathMap[Number(skpd)] : undefined

  const totalSemua = jurnals.reduce((s, j) => {
    if (j.approval_status === 'disetujui') return s + j.total
    if (j.approval_status === 'pending') return s + draftTotal(j.payload.draft_items || [])
    return s
  }, 0)

  async function cekNomorDipakai(noSk: string, excludeId?: string) {
    let q = supabase.from('jurnal_header').select('id').eq('kategori', kategori).eq('skpd_id', Number(skpd)).eq('no_sk', noSk).neq('approval_status', 'ditolak')
    if (excludeId) q = q.neq('id', excludeId)
    const { data: dup } = await q.limit(1)
    if (dup && dup.length > 0) return `No. Dokumen "${noSk}" sudah dipakai dokumen lain di SKPD ini.`
    return null
  }

  async function savePayload(headerId: string, payload: HeaderPayload) {
    const { error } = await supabase.from('jurnal_header').update({ payload }).eq('id', headerId)
    if (error) { setMsg(`Error: gagal menyimpan draft: ${error.message}`); return false }
    return true
  }
  async function tambahDraftItems(h: Jurnal, newItems: DraftItem[]) {
    const items = [...(h.payload.draft_items || []), ...newItems]
    const ok = await savePayload(h.id, { ...h.payload, draft_items: items })
    if (ok) loadJurnals(skpd)
  }
  async function hapusDraftItem(h: Jurnal, key: string) {
    const it = (h.payload.draft_items || []).find(i => i.key === key)
    if (!(await konfirmasi({
      nada: 'merah', ikon: '🗑', judul: 'Hapus barang ini dari draft?',
      subjudul: it?.fields?.nama_barang || it?.kode || undefined,
      isi: <>Barangnya belum pernah tercatat di Daftar Barang, jadi tak ada jejak yang ikut terhapus.</>,
      labelYa: 'Hapus',
    })).ya) return
    const items = (h.payload.draft_items || []).filter(i => i.key !== key)
    const ok = await savePayload(h.id, { ...h.payload, draft_items: items })
    if (ok) loadJurnals(skpd)
  }
  // Hapus massal (barang yang dicentang) — draft belum menyentuh ledger, cuma
  // UPDATE payload jurnal_header, jadi tak melanggar append-only.
  async function hapusDraftItems(h: Jurnal, keys: string[]) {
    if (keys.length === 0) return
    if (!(await konfirmasi({
      nada: 'merah', ikon: '🗑', judul: 'Hapus barang yang dicentang?',
      subjudul: `Dokumen ${h.no_sk}`,
      rincian: [{ label: 'Barang dicentang', nilai: `${keys.length} barang` }],
      isi: <>Centangnya bertahan lintas pencarian, jadi bisa ada barang terpilih yang sedang tidak
        kelihatan di layar. Angka di atas itu yang akan dibuang.</>,
      peringatan: <>Tidak bisa dibatalkan.</>,
      labelYa: `Hapus ${keys.length} barang`,
    })).ya) return
    const buang = new Set(keys)
    const items = (h.payload.draft_items || []).filter(i => !buang.has(i.key))
    const ok = await savePayload(h.id, { ...h.payload, draft_items: items })
    if (ok) loadJurnals(skpd)
  }
  async function applyDraftFields(h: Jurnal, keys: string[], fields: Record<string, string>, foto: { replace?: string[]; append?: string[] }) {
    const items = (h.payload.draft_items || []).map(i => {
      if (!keys.includes(i.key)) return i
      if (keys.length === 1) return { ...i, fields: { ...fields }, foto: foto.replace ?? i.foto }
      const nonEmpty: Record<string, string> = {}
      for (const [k, v] of Object.entries(fields)) if (v && v.trim()) nonEmpty[k] = v
      const foBaru = foto.append && foto.append.length > 0 ? [...i.foto, ...foto.append] : i.foto
      return { ...i, fields: { ...i.fields, ...nonEmpty }, foto: foBaru }
    })
    const ok = await savePayload(h.id, { ...h.payload, draft_items: items })
    if (ok) loadJurnals(skpd)
  }
  async function hapusDokumen(h: Jurnal) {
    if (h.hasLedger) {
      if (!(await konfirmasi({
        nada: 'merah', ikon: '📦', judul: 'Arsipkan dokumen ini?',
        subjudul: `Dokumen ${h.no_sk}`,
        isi: <>Dokumen ini <b>pernah disetujui</b>, jadi tidak bisa dihapus betulan. Ia diarsipkan:
          hilang dari daftar, dan No. Dokumen-nya bebas dipakai lagi.</>,
        peringatan: <>Riwayat ledgernya <b>tetap tersimpan</b> (append-only, tak bisa dihapus).
          Tidak bisa dibatalkan.</>,
        labelYa: 'Arsipkan',
      })).ya) return
      const { error } = await supabase.from('jurnal_header').update({ approval_status: 'ditolak' }).eq('id', h.id)
      if (error) { setMsg(`Error: gagal mengarsipkan dokumen: ${error.message}`); return }
      setMsg(`Dokumen ${h.no_sk} diarsipkan.`)
      loadJurnals(skpd)
      return
    }
    if (!(await konfirmasi({
      nada: 'merah', ikon: '🗑', judul: 'Hapus dokumen ini?',
      subjudul: `Dokumen ${h.no_sk}`,
      rincian: [{ label: 'Draft barang', nilai: `${(h.payload.draft_items || []).length} barang` }],
      isi: <>Dokumen ini belum pernah disetujui, jadi belum menyentuh ledger — dokumen &amp; seluruh
        draft barangnya dihapus betulan.</>,
      peringatan: <>Tidak bisa dibatalkan.</>,
      labelYa: 'Hapus dokumen',
    })).ya) return
    const { error } = await supabase.from('jurnal_header').delete().eq('id', h.id)
    if (error) { setMsg(`Error: gagal menghapus dokumen: ${error.message}`); return }
    setMsg(`Dokumen ${h.no_sk} dihapus.`)
    loadJurnals(skpd)
  }

  // ── Approve: materialize draft_items → aset + transaksi_bmd (tanggal PER ITEM) ─
  async function approveHeader(h: Jurnal) {
    const items = h.payload.draft_items || []
    if (items.length === 0) { setMsg('Error: dokumen ini belum ada barangnya — tambahkan dulu sebelum disetujui.'); return }
    for (const it of items) {
      if (!it.kode) { setMsg('Error: ada barang draft tanpa kode.'); return }
      if (!it.tglPerolehan) { setMsg(`Error: barang "${it.fields.nama_barang || it.kode}" belum ada tanggal perolehan.`); return }
      if (toNum(it.harga) <= 0) { setMsg(`Error: nilai "${it.fields.nama_barang || it.kode}" harus > 0.`); return }
    }
    // Beda dari Pengadaan: di sini TIAP BARANG punya tanggal perolehannya
    // sendiri (boleh backdate), jadi rentangnya yang ditampilkan — bukan satu
    // tanggal BAST. Kalau semuanya setanggal, rentangnya jadi satu tanggal.
    const tgls = items.map(i => i.tglPerolehan).filter(Boolean).sort()
    const rentang = tgls.length === 0 ? '—'
      : tgls[0] === tgls[tgls.length - 1] ? tgls[0]
      : `${tgls[0]} s.d. ${tgls[tgls.length - 1]}`
    if (!(await konfirmasi({
      nada: 'teal', ikon: '✓', judul: 'Setujui dokumen ini?',
      subjudul: `Dokumen ${h.no_sk}`,
      rincian: [
        { label: 'Barang dicatat', nilai: `${items.length} barang` },
        // DUA tanggal, dan bedanya menentukan angka: yang satu menentukan barang
        // muncul di periode laporan mana, yang satu menentukan sudah berapa lama
        // ia disusutkan. Sebelum 2026-08-20 keduanya dianggap satu.
        { label: 'Masuk pada', nilai: `${h.tanggal} (${periodeDariTanggal(h.tanggal)})` },
        { label: 'Tgl perolehan barang', nilai: rentang },
      ],
      isi: <>Barangnya <b>resmi tercatat</b> sejak periode BAST di atas, dan NIBAR-nya diterbitkan.
        Barang yang tanggal perolehannya <b>lebih tua</b> dari periode itu masuk dengan
        <b> akumulasi penyusutan yang sudah berjalan</b>, bukan umur baru. Sesudah ini kartunya
        terkunci — mengubahnya harus lewat Buka Kunci.</>,
      labelYa: 'Ya, setujui',
    })).ya) return

    setBusyId(h.id); setMsg('')

    const { data: skpdRow, error: skpdErr } = await supabase.from('admin_skpd').select('kode_skpd').eq('id', Number(skpd)).single()
    if (skpdErr || !skpdRow?.kode_skpd) {
      setMsg(`Error: gagal ambil kode lokasi SKPD utk generate NIBAR: ${skpdErr?.message || 'kode_skpd kosong'}`)
      setBusyId(null); return
    }

    const batasMap = await fetchBatasKapitalisasi(supabase, items.map(it => it.kode))
    const itemsWithKlas = items.map(it => ({
      ...it, intraEkstra: klasifikasiKomptabel(toNum(it.harga), batasMap.get(it.kode)),
      tahun: it.tglPerolehan.slice(0, 4),
    }))

    let nibarMap: Map<string, string>
    try {
      nibarMap = await generateNibars(supabase, itemsWithKlas, skpdRow.kode_skpd)
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`); setBusyId(null); return
    }

    const asetRows = itemsWithKlas.map(it => {
      const row: Record<string, unknown> = {
        nibar: nibarMap.get(it.key) || null, kode: it.kode, uraian_barang: it.uraianBarang || null, jumlah: 1,
        satuan: it.satuan.trim() || null, harga_satuan: toNum(it.harga), nilai_perolehan: toNum(it.harga),
        tgl_perolehan: it.tglPerolehan, skpd_id: Number(skpd), intra_ekstra: it.intraEkstra,
        cara_perolehan: kategori, status: 'aktif', foto_paths: it.foto,
      }
      for (const k of ASET_FIELD_COLS) {
        const v = it.fields[k]
        if (!v) continue
        // ⚠️ `angkaKolomAset`, BUKAN `toNum` (insiden 2026-08-20). `toNum` itu
        // pembaca RUPIAH — regexnya membuang tanda minus, jadi latitude Kediri
        // (−7,8; belahan SELATAN) tersimpan +7,8 dan titiknya melompat ke laut
        // dekat Filipina, tanpa satu pun error. Lihat lib/asetFields.ts.
        // `null` = tak terbaca sebagai angka → kolomnya JANGAN ditulis, supaya
        // isian keliru tak mendarat jadi 0 (latitude 0 = Teluk Guinea).
        if (ASET_NUM_COLS.has(k)) { const n = angkaKolomAset(v); if (n !== null) row[k] = n }
        else row[k] = v
      }
      return row
    })
    const { data: inserted, error: asetErr } = await supabase.from('aset').insert(asetRows).select('id,nilai_perolehan')
    if (asetErr || !inserted) { setMsg(`Error: gagal membuat barang: ${asetErr?.message}`); setBusyId(null); return }

    // ── Tanggal PERISTIWA vs tanggal PEROLEHAN (keputusan user 2026-08-20) ───
    // Baris ledger dicatat pada TANGGAL BAST/dokumen, bukan tanggal perolehan
    // barang. Dua sebab, dua-duanya nyata:
    //   (1) Barang yang diterima bisa DIBANGUN pihak pemberi bertahun-tahun
    //       sebelumnya. Mencatat barisnya di tahun itu ditolak guard tahun buku
    //       ("Tahun 2024 sudah tutup buku") — sampai 2026-08-20 itu membuat
    //       barang bekas MUSTAHIL dicatat sama sekali.
    //   (2) Barang itu baru jadi milik pemkab saat BAST. Kalau barisnya
    //       bertanggal 2024, ia akan muncul di Daftar Barang, Laporan BMD, &
    //       Rekonsiliasi SEJAK 2024 — mengubah angka tahun yang sudah dikunci
    //       dan sudah dilaporkan.
    // `aset.tgl_perolehan` TETAP tanggal aslinya (dipakai kolom Tahun Perolehan,
    // NIBAR, & dasar hitung umur di bawah). Yang memisahkan keduanya di sisi
    // tampilan: keempat jenis ini terdaftar di `LAHIR` (lib/visibilitas.ts).
    const periodeBast = periodeDariTanggal(h.tanggal)
    const masaMap = await fetchMasaManfaat(supabase, itemsWithKlas.map(it => it.kode))

    const trxRows = (inserted as { id: string; nilai_perolehan: number }[]).map((a, i) => {
      const it = itemsWithKlas[i]
      return {
        aset_id: a.id, jenis: kategori, periode: periodeBast,
        tanggal: h.tanggal, nilai: a.nilai_perolehan,
        skpd_tujuan: Number(skpd), header_id: h.id,
        payload: {
          pihak: h.payload.pihak || null,
          // Tanggal perolehan asli ikut direkam di ledger, bukan cuma di `aset`:
          // kolom `aset` bisa dikoreksi belakangan, sedangkan yang menjelaskan
          // angka di neraca harus ikut beku bersama barisnya (append-only).
          tgl_perolehan_asli: it.tglPerolehan,
          ...checkpointBekas(toNum(it.harga), it.tglPerolehan, periodeBast, masaMap.get(it.kode)),
        },
      }
    })
    const { error: trxErr } = await supabase.from('transaksi_bmd').insert(trxRows)
    if (trxErr) {
      // ⚠️ ROLLBACK WAJIB 'draft', BUKAN 'dihapus' (insiden 2026-08-20).
      // Visibilitas di repo ini diputuskan lewat REPLAY EVENT LEDGER
      // (`fn_dbar_hidden`), bukan dari `aset.status`; saringan status di sana
      // cuma `status <> 'draft'`. Aset yang terlanjur dibuat di sini BELUM
      // punya satu pun baris ledger — justru itu yang barusan gagal — jadi
      // 'dihapus' tak punya `SEMBUNYI` apa pun untuk direplay dan barangnya
      // TETAP TAMPIL di Daftar Barang, Penyusutan, & Laporan BMD. Waktu approve
      // diulang, barang yang sama masuk lagi → nilainya DOBEL, tanpa satu pun
      // error. 'draft' disaring SEMUA pembaca Lapis 1 tanpa perlu ledger, dan
      // rollback approve Konstruksi/KDP (lib/kdp.ts) memang sudah begitu.
      await supabase.from('aset').update({ status: 'draft' }).in('id', (inserted as { id: string }[]).map(a => a.id))
      setMsg(`Error: gagal mencatat transaksi: ${trxErr.message}`); setBusyId(null); return
    }

    const { data: { user } } = await supabase.auth.getUser()
    const { error: appErr } = await supabase.from('jurnal_header')
      .update({ approval_status: 'disetujui', approved_by: user?.id || null, approved_at: new Date().toISOString() })
      .eq('id', h.id)
    if (appErr) { setMsg(`Barang sudah tercatat, tapi status approval gagal diupdate: ${appErr.message}`); setBusyId(null); loadJurnals(skpd); return }

    setMsg(`Dokumen ${h.no_sk} disetujui — ${asetRows.length} barang resmi tercatat.`)
    setBusyId(null)
    loadJurnals(skpd)
  }

  async function unapproveHeader(j: Jurnal) {
    if (!(await konfirmasi({
      nada: 'amber', ikon: '🔓', judul: 'Buka kunci dokumen ini?',
      subjudul: `Dokumen ${j.no_sk}`,
      rincian: [{ label: 'Barang terdampak', nilai: `${j.lines.length} barang` }],
      isi: <>Barangnya kembali jadi draft dan <b>hilang dari Daftar Barang &amp; Penyusutan</b> sampai
        disetujui lagi.</>,
      peringatan: <><b>NIBAR digenerate ulang</b> saat disetujui berikutnya. Kalau ada barangnya yang
        sudah punya transaksi lebih baru, permintaan ini akan ditolak.</>,
      labelYa: 'Ya, buka kunci',
    })).ya) return
    setBusyId(j.id); setMsg('')
    // Guard rantai (rules.md §1.3) — satu sumber di lib/guardPembatalan.ts.
    // Pengadaan sudah memasangnya sejak lama; menu ini KELEWAT. `batal_*` di
    // sini soft-delete asetnya (lihat patchAsetDari di lib/transaksi.ts), jadi
    // membatalkannya di TENGAH rantai — barang yang sudah dikapitalisasi,
    // dialihkan, atau dimanfaatkan — merusak replay engine tanpa satu pun
    // pesan. Guard-nya fail-closed: query gagal = tidak boleh.
    const guard = await cekBolehBatal(
      supabase,
      j.lines.map(l => ({ aset_id: l.aset_id, trx_id: l.trx_id, label: l.nama_barang || l.uraian_barang || l.nibar })),
      `${judul.toLowerCase()} ini (mis. pengalihan/pemanfaatan/kapitalisasi)`,
    )
    if (!guard.boleh) { setMsg(`Error: ${guard.pesan}`); setBusyId(null); return }
    for (const l of j.lines) {
      const { error } = await catatTransaksi(supabase, {
        asetId: l.aset_id, jenis: `batal_${kategori}`, tanggal: l.tanggal, headerId: j.id,
        keterangan: `Unapprove dokumen ${j.no_sk} — dikembalikan ke draft`,
      })
      if (error) { setMsg(`Error: ${error}`); setBusyId(null); return }
    }
    const draftItems: DraftItem[] = j.lines.map(l => ({
      key: newKey(), golongan: kodeLevel3(l.kode), kode: l.kode, uraianBarang: l.uraian_barang || '',
      // ⚠️ WAJIB `l.tgl_perolehan`, BUKAN `l.tanggal` (regresi 2026-08-20).
      // Sejak baris ledger dicatat pada tanggal BAST, `l.tanggal` = 2026-02-24
      // sementara barangnya dibangun 2024. Memakai `l.tanggal` di sini bikin
      // Buka Kunci → Setujui ulang DIAM-DIAM menulis ulang tgl perolehan jadi
      // tanggal BAST, dan itu merusak dua hal sekaligus: segmen tahun NIBAR
      // (2024→2026, jadi NIBAR baru di prefiks lain), dan `checkpointBekas`
      // yang langsung `return {}` begitu periode perolehan = periode BAST —
      // artinya AKUMULASI PENYUSUTAN BAWAAN 2024–2025 HILANG dan barangnya
      // masuk lagi seolah baru. Tanpa satu pun error.
      tglPerolehan: l.tgl_perolehan, satuan: l.satuan || '', harga: String(l.nilai), fields: l.fields || {}, foto: l.foto_paths || [],
    }))
    const { error } = await supabase.from('jurnal_header')
      .update({ approval_status: 'pending', approved_by: null, approved_at: null, payload: { ...j.payload, draft_items: draftItems } })
      .eq('id', j.id)
    if (error) { setMsg(`Error: gagal buka kunci: ${error.message}`); setBusyId(null); return }
    setMsg(`Dokumen ${j.no_sk} dibuka kunci — kembali ke draft. Edit lalu setujui ulang.`)
    setBusyId(null)
    loadJurnals(skpd)
  }

  const pending = jurnals.filter(j => j.approval_status === 'pending')
  const disetujui = jurnals.filter(j => j.approval_status === 'disetujui')

  return (
    <FormShell judul={judul} msg={msg}
      deskripsi="Pilih SKPD, buat dokumen (draft), lengkapi barang, lalu tunggu persetujuan admin."
      headerRight={skpd ? (
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-gray-400">Total {judul} ({skpdNama})</p>
          <p className="text-lg font-bold text-gray-900">{formatRupiah(totalSemua)}</p>
        </div>
      ) : undefined}>
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">Lokasi / SKPD :</label>
          <SkpdCombobox lockToOperator value={skpd} onChange={id => { setSkpd(id); setMsg('') }}
            placeholder="Ketik nama SKPD / Sub OPD / Lokasi..." />
        </div>
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Pilih SKPD di atas untuk melihat & membuat dokumen {judul.toLowerCase()}.
        </div>
      ) : mode === 'baru' ? (
        <DokumenForm judul={judul} pihakLabel={pihakLabel} skpdNama={skpdNama || ''}
          cekNomorDipakai={cekNomorDipakai}
          kategori={kategori} skpdId={Number(skpd)}
          onCancel={() => setMode('list')}
          onSaved={() => { setMode('list'); setMsg('Dokumen tersimpan sbg draft — lengkapi barang lalu tunggu persetujuan admin.'); loadJurnals(skpd) }}
        />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{skpdNama} — {jurnals.length} dokumen {judul.toLowerCase()}</span>
            <button className="btn-primary" onClick={() => { setMsg(''); setMode('baru') }}>+ Tambah {judul}</button>
          </div>

          {loadingJurnal ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Memuat dokumen...</div>
          ) : jurnals.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Belum ada {judul.toLowerCase()} untuk SKPD ini.</div>
          ) : (
            <>
              {pending.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-amber-700">⏳ Menunggu Persetujuan ({pending.length})</h3>
                  {pending.map(h => (
                    <PendingCard key={h.id} h={h} isAdmin={bolehACCKartu(h)} busy={busyId === h.id}
                      golonganLabels={golonganLabels} pihakLabel={pihakLabel}
                      onEditHeader={() => setEditing(h)}
                      onHapusDokumen={() => hapusDokumen(h)}
                      onTambah={items => tambahDraftItems(h, items)}
                      onHapusItem={key => hapusDraftItem(h, key)}
                      onHapusItems={keys => hapusDraftItems(h, keys)}
                      onEditSpes={keys => setSpecEdit({ header: h, keys })}
                      onApprove={() => approveHeader(h)}
                    />
                  ))}
                </section>
              )}
              {disetujui.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-600">✓ Disetujui ({disetujui.length})</h3>
                  {disetujui.map(j => (
                    <ApprovedCard key={j.id} j={j} isAdmin={bolehACCKartu(j)} busy={busyId === j.id} pihakLabel={pihakLabel}
                      onUnapprove={() => unapproveHeader(j)}
                    />
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      )}

      {editing && (
        <EditHeaderModal header={editing} judul={judul} pihakLabel={pihakLabel} kategori={kategori} cekNomorDipakai={cekNomorDipakai}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setMsg('Header dokumen diperbarui.'); loadJurnals(skpd) }}
        />
      )}
      {specEdit && (() => {
        const items = (specEdit.header.payload.draft_items || []).filter(i => specEdit.keys.includes(i.key))
        const single = items.length === 1 ? items[0] : null
        return (
          <EditSpesifikasiModal
            title={single ? (single.fields.nama_barang || single.kode) : `${items.length} barang dicentang`}
            fieldKeys={fieldsForKode(items[0]?.kode || '')}
            initialFields={single ? single.fields : {}}
            initialFoto={single ? single.foto : []}
            single={!!single}
            storagePrefix={single ? `draft/${single.key}` : `draft/${specEdit.header.id}`}
            onClose={() => setSpecEdit(null)}
            onSave={async (fields, foto) => {
              await applyDraftFields(specEdit.header, specEdit.keys, fields, foto)
              setSpecEdit(null)
            }}
          />
        )
      })()}
    </FormShell>
  )
}

async function bukaDokumen(path: string) {
  const supabase = createClient()
  const { data } = await supabase.storage.from('dokumen-sumber').createSignedUrl(path, 3600)
  if (data?.signedUrl) window.open(data.signedUrl, '_blank')
}

function DokumenLinks({ paths }: { paths: string[] }) {
  if (paths.length === 0) return null
  return (
    <p className="text-xs text-gray-500 mt-1">
      Dokumen:{' '}
      {paths.map(p => (
        <button key={p} onClick={() => bukaDokumen(p)} className="underline text-teal hover:opacity-80 mr-2">{namaFile(p)}</button>
      ))}
    </p>
  )
}

// ── Kartu "Menunggu Persetujuan" ─────────────────────────────────────────────
function PendingCard({ h, isAdmin, busy, golonganLabels, pihakLabel, onEditHeader, onHapusDokumen, onTambah, onHapusItem, onHapusItems, onEditSpes, onApprove }: {
  h: Jurnal; isAdmin: boolean; busy: boolean; golonganLabels: Record<string, string>; pihakLabel: string | null
  onEditHeader: () => void; onHapusDokumen: () => void
  onTambah: (items: DraftItem[]) => void
  onHapusItem: (key: string) => void
  onHapusItems: (keys: string[]) => void
  onEditSpes: (keys: string[]) => void
  onApprove: () => void
}) {
  const items = h.payload.draft_items || []
  const [showTambah, setShowTambah] = useState(items.length === 0)
  const fotoUrls = useFotoThumbs(items.map(i => i.foto[0]).filter(Boolean))
  // Pencarian + seleksi + aksi massal: modul bersama dgn Pengadaan.
  const sel = useDraftSeleksi(items)

  return (
    <div className="card overflow-hidden border-amber-200">
      <div className="p-4 border-b border-gray-100 bg-amber-50/40">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
          <div className="bg-white rounded-lg border border-gray-100 p-3">
            <p className="text-[11px] font-semibold text-gray-500 mb-1">DOKUMEN</p>
            <p className="text-sm font-semibold text-gray-800">{h.no_sk}</p>
            <p className="text-xs text-gray-500">Tgl {h.tanggal} · {h.periode}</p>
            {pihakLabel && h.payload?.pihak && (
              <p className="text-xs text-gray-500 mt-1">{pihakLabel}: {h.payload.pihak}</p>
            )}
            {h.keterangan && <p className="text-xs text-gray-400 mt-1">{h.keterangan}</p>}
            <DokumenLinks paths={h.payload?.dokumen_paths || []} />
          </div>
          <div className="flex flex-col items-end justify-between">
            <div className="text-right">
              <p className="text-xs text-gray-400">Estimasi Total</p>
              <p className="font-semibold text-gray-800">{formatRupiah(draftTotal(items))}</p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button title="Edit dokumen" onClick={onEditHeader}
                className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">✎</button>
              <button title={h.hasLedger ? 'Arsipkan dokumen ini (ledger tetap tersimpan, No Dokumen bisa dipakai lagi)' : 'Hapus draft dokumen ini'}
                onClick={onHapusDokumen}
                className="inline-flex items-center justify-center w-8 h-8 rounded bg-red-500 hover:bg-red-600 text-white">🗑</button>
            </div>
          </div>
        </div>
      </div>

      {items.length > 0 && (
        <>
          <DraftSearchBar q={sel.q} setQ={sel.setQ} jml={sel.terlihat.length} total={items.length} />
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-th w-8 text-center">
                    <input type="checkbox" checked={sel.allChecked} onChange={sel.toggleAll}
                      title={sel.q ? 'Centang semua barang pada hasil pencarian' : 'Centang semua barang'} />
                  </th>
                  <th className="table-th w-8 text-center"></th>
                  <th className="table-th">Uraian Barang</th>
                  <th className="table-th">Spesifikasi Nama Barang</th>
                  <th className="table-th w-24 text-center">Tgl Perolehan</th>
                  <th className="table-th w-12 text-center">Foto</th>
                  <th className="table-th w-16 text-center">Satuan</th>
                  <th className="table-th w-28 text-right">Nilai/item</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sel.terlihat.map(it => (
                  <DraftRow key={it.key} item={it} checked={sel.checked.has(it.key)}
                    onToggle={() => sel.toggleOne(it.key)}
                    onDelete={() => onHapusItem(it.key)}
                    fotoUrl={it.foto[0] ? fotoUrls[it.foto[0]] : undefined} />
                ))}
                {sel.terlihat.length === 0 && (
                  <tr><td colSpan={8} className="table-td text-center text-xs text-gray-400 py-6">Tak ada barang yang cocok dengan pencarian.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {sel.dipilih.length > 0 && (
            <DraftBulkBar jml={sel.dipilih.length} tersembunyi={sel.tersembunyi}
              sameGol={allSameGolongan(sel.dipilih.map(i => i.kode))}
              onEdit={() => onEditSpes(sel.dipilih.map(i => i.key))}
              onHapus={() => onHapusItems(sel.dipilih.map(i => i.key))} />
          )}
        </>
      )}

      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/40">
        {showTambah ? (
          <TambahBarangPanel golonganLabels={golonganLabels}
            onTambah={newItems => { onTambah(newItems); setShowTambah(false) }}
            onCancel={() => setShowTambah(false)} />
        ) : (
          <button className="btn-secondary text-xs" onClick={() => setShowTambah(true)}>+ Tambah Barang</button>
        )}
      </div>

      <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-500">{items.length} barang</span>
        {isAdmin ? (
          <button className="btn-primary text-xs" disabled={busy || items.length === 0} onClick={onApprove}>
            {busy ? 'Memproses...' : '✓ Setujui'}
          </button>
        ) : (
          <span className="text-xs text-gray-400">Menunggu tinjauan admin.</span>
        )}
      </div>
    </div>
  )
}

function DraftRow({ item, checked, onToggle, onDelete, fotoUrl }: {
  item: DraftItem; checked: boolean; onToggle: () => void
  onDelete: () => void; fotoUrl?: string
}) {
  return (
    <tr>
      <td className="table-td text-center"><input type="checkbox" checked={checked} onChange={onToggle} /></td>
      <td className="table-td text-center">
        <button onClick={onDelete} title="Hapus barang ini" className="inline-flex items-center justify-center w-7 h-7 rounded bg-red-500 hover:bg-red-600 text-white">🗑</button>
      </td>
      <td className="table-td">
        <p className="text-xs text-gray-800 font-medium truncate max-w-[220px]">{item.uraianBarang || '-'}</p>
        <p className="text-[11px] text-gray-400">{item.kode}</p>
      </td>
      <td className="table-td">
        <p className="text-xs text-gray-600 truncate max-w-[200px]" title={item.fields?.nama_barang || ''}>
          {item.fields?.nama_barang || <span className="text-amber-600">⚠ Belum diisi</span>}
        </p>
      </td>
      <td className="table-td text-center text-xs text-gray-600">{item.tglPerolehan || <span className="text-amber-600">⚠</span>}</td>
      <td className="table-td text-center">
        <FotoSel paths={item.foto} thumbUrl={fotoUrl} judul={item.fields?.nama_barang || item.uraianBarang} />
      </td>
      <td className="table-td text-center text-xs text-gray-600">{item.satuan || '-'}</td>
      <td className="table-td text-right text-xs text-gray-600">{formatRupiah(toNum(item.harga))}</td>
    </tr>
  )
}

// Panel "+ Tambah Barang": pilih Jenis BMD → cari kode → satuan/qty/harga/tgl → split langsung.
function TambahBarangPanel({ golonganLabels, onTambah, onCancel }: {
  golonganLabels: Record<string, string>
  onTambah: (items: DraftItem[]) => void
  onCancel: () => void
}) {
  const supabase = createClient()
  const [golongan, setGolongan] = useState('')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<KodefikasiHasil[]>([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState<KodefikasiHasil | null>(null)
  const [satuanList, setSatuanList] = useState<{ id: number; nama: string }[]>([])
  const [satuan, setSatuan] = useState('')
  const [qty, setQty] = useState('1')
  const [harga, setHarga] = useState('')
  const [tglPerolehan, setTglPerolehan] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.from('admin_satuan_bmd').select('id,nama').order('nama').then(({ data }) => setSatuanList(data || []))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function cari() {
    if (!golongan) { setErr('Pilih Jenis BMD dulu.'); return }
    setErr(''); setSearching(true)
    let q = supabase.from('admin_kodefikasi_bmd')
      .select('kode,uraian,nama_objek,nama_rincian,nama_sub_rincian,masa_manfaat_tahun,batas_kapitalisasi').eq('aktif', true).like('kode', `${golongan}.%`)
    if (search.trim()) q = q.or(`kode.ilike.${search.trim()}%,uraian.ilike.%${search.trim()}%`)
    const { data } = await q.limit(30)
    setResults((data || []) as KodefikasiHasil[])
    setSearching(false)
  }

  function pilih(r: KodefikasiHasil) {
    setPicked(r)
    setResults([])
  }

  function simpan() {
    if (!picked) { setErr('Pilih kode barang dulu.'); return }
    const n = toInt(qty)
    if (n < 1) { setErr('Kuantitas minimal 1.'); return }
    if (toNum(harga) <= 0) { setErr('Nilai harus > 0.'); return }
    if (!tglPerolehan) { setErr('Tanggal perolehan wajib diisi.'); return }
    if (tglPerolehan > todayStr()) { setErr('Tanggal perolehan tidak boleh di masa depan.'); return }
    const uraian = picked.uraian || ''
    const items: DraftItem[] = Array.from({ length: n }, () => ({
      key: newKey(), golongan, kode: picked.kode, uraianBarang: uraian,
      tglPerolehan, satuan: satuan.trim(), harga,
      fields: { nama_barang: uraian }, foto: [],
    }))
    onTambah(items)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Jenis BMD</label>
          <select className="select-filter" value={golongan} onChange={e => { setGolongan(e.target.value); setPicked(null); setResults([]) }}>
            <option value="">— pilih jenis —</option>
            {GOLONGAN_DAFTAR_BARANG.map(g => <option key={g} value={g}>{g} — {golonganLabels[g] || '...'}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-gray-500 mb-1">Cari kode / nama baku (opsional)</label>
          <input className="select-filter w-full" value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); cari() } }} placeholder="mis. 'komputer'..." />
        </div>
        <button className="btn-secondary text-xs" onClick={cari} disabled={searching || !golongan}>{searching ? 'Mencari...' : 'Cari'}</button>
        <button className="btn-secondary text-xs" onClick={onCancel}>Batal</button>
      </div>

      {results.length > 0 && (
        <div className="border border-gray-100 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-50 bg-white">
          {results.map(r => (
            <button key={r.kode} onClick={() => pilih(r)} className="w-full text-left px-3 py-2 hover:bg-teal/5 text-xs">
              <span className="font-medium text-gray-700">{r.kode}</span>
              <span className="text-gray-500"> — {r.uraian || '(tanpa uraian)'} · {golonganLabels[kodeLevel3(r.kode)] || ''}</span>
            </button>
          ))}
        </div>
      )}

      {picked && (
        <div className="bg-white border border-gray-100 rounded-lg p-3 space-y-3">
          <div className="grid grid-cols-[140px_1fr] gap-y-1 text-xs">
            <span className="text-gray-500">Kode</span><span className="font-medium text-gray-700">{picked.kode}</span>
            <span className="text-gray-500">Objek</span><span className="font-medium text-gray-700">{picked.nama_objek || '-'}</span>
            <span className="text-gray-500">Rincian Objek</span><span className="font-medium text-gray-700">{picked.nama_rincian || '-'}</span>
            <span className="text-gray-500">Sub Rincian Objek</span><span className="font-medium text-gray-700">{picked.nama_sub_rincian || '-'}</span>
            <span className="text-gray-500">Uraian Barang</span><span className="font-medium text-gray-700">{picked.uraian || '-'}</span>
            <span className="text-gray-500">Masa Manfaat</span><span className="font-medium text-gray-700">{picked.masa_manfaat_tahun != null ? `${picked.masa_manfaat_tahun} tahun` : '-'}</span>
            <span className="text-gray-500">Nilai Kapitalisasi</span><span className="font-medium text-gray-700">{formatRupiah(picked.batas_kapitalisasi)}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Satuan</label>
              <select className="select-filter w-full text-sm" value={satuan} onChange={e => setSatuan(e.target.value)}>
                <option value="">— pilih satuan —</option>
                {satuanList.map(s => <option key={s.id} value={s.nama}>{s.nama}</option>)}
              </select>
            </div>
            <div><label className="block text-xs text-gray-500 mb-1">Kuantitas</label><input className="select-filter w-full text-sm" inputMode="numeric" value={qty} onChange={e => setQty(e.target.value)} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Nilai / item</label><input className="select-filter w-full text-sm" inputMode="numeric" value={harga} onChange={e => setHarga(e.target.value)} /></div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tgl Perolehan</label>
              <input type="date" className="select-filter w-full text-sm" max={todayStr()} value={tglPerolehan}
                onChange={e => setTglPerolehan(e.target.value)} placeholder="Wajib diisi" />
            </div>
          </div>
          <p className="text-xs text-gray-400">Tgl Perolehan boleh backdate ke tahun lama — penyusutannya dihitung mundur otomatis saat engine dijalankan ulang. Kuantitas &gt; 1 langsung dipecah jadi beberapa barang terpisah — spesifikasi & foto diisi per-unit setelah ini (✎ Edit Spesifikasi).</p>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <button className="btn-primary text-xs" onClick={simpan}>Tambah ke Draft</button>
        </div>
      )}
      {!picked && err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  )
}

// ── Kartu "Disetujui" — READ-ONLY (terkunci) ────────────────────────────────
function ApprovedCard({ j, isAdmin, busy, pihakLabel, onUnapprove }: {
  j: Jurnal; isAdmin: boolean; busy: boolean; pihakLabel: string | null
  onUnapprove: () => void
}) {
  const fotoUrls = useFotoThumbs(j.lines.map(l => l.foto_paths[0]).filter(Boolean))

  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-gray-100 bg-gray-50/60">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
          <div className="bg-white rounded-lg border border-gray-100 p-3">
            <p className="text-[11px] font-semibold text-gray-500 mb-1">DOKUMEN</p>
            <p className="text-sm font-semibold text-gray-800">{j.no_sk}</p>
            <p className="text-xs text-gray-500">Tgl {j.tanggal} · {j.periode}</p>
            {pihakLabel && j.payload?.pihak && <p className="text-xs text-gray-500 mt-1">{pihakLabel}: {j.payload.pihak}</p>}
            <DokumenLinks paths={j.payload?.dokumen_paths || []} />
            {j.approved_at && <p className="text-xs text-teal mt-1">Disetujui {j.approved_at.slice(0, 10)}</p>}
          </div>
          <div className="flex flex-col items-end justify-between">
            <div className="text-right">
              <p className="text-xs text-gray-400">Total</p>
              <p className="font-semibold text-gray-800">{formatRupiah(j.total)}</p>
            </div>
            {isAdmin ? (
              <button title="Buka kunci (unapprove) — kembalikan ke draft utk diedit" onClick={onUnapprove} disabled={busy}
                className="btn-secondary text-xs mt-2">{busy ? 'Memproses...' : '🔓 Buka Kunci'}</button>
            ) : (
              <span className="text-[11px] text-gray-400 mt-2">🔒 Terkunci</span>
            )}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-th">Uraian Barang / NIBAR</th>
              <th className="table-th">Spesifikasi Nama Barang</th>
              <th className="table-th w-24 text-center">Tgl Perolehan</th>
              <th className="table-th w-12 text-center">Foto</th>
              <th className="table-th w-16 text-center">Satuan</th>
              <th className="table-th w-20 text-center">Komptabel</th>
              <th className="table-th w-28 text-right">Nilai</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {j.lines.map(l => {
              const fotoUrl = l.foto_paths[0] ? fotoUrls[l.foto_paths[0]] : undefined
              return (
                <tr key={l.aset_id}>
                  <td className="table-td">
                    <p className="font-medium text-gray-800 text-xs truncate max-w-[220px]">{l.uraian_barang || '-'}</p>
                    <p className="text-[11px] text-gray-400">{l.kode} · {l.nibar || '(NIBAR belum diisi)'}</p>
                  </td>
                  <td className="table-td">
                    <p className="text-xs text-gray-600 truncate max-w-[200px]" title={l.nama_barang || ''}>
                      {l.nama_barang || <span className="text-amber-600">⚠ Belum diisi</span>}
                    </p>
                  </td>
                  <td className="table-td text-center text-xs">{l.tanggal}</td>
                  <td className="table-td text-center">
                    <FotoSel paths={l.foto_paths} thumbUrl={fotoUrl} judul={l.nama_barang || l.uraian_barang} />
                  </td>
                  <td className="table-td text-center text-xs">{l.satuan || '-'}</td>
                  <td className="table-td text-center text-xs capitalize">{l.intra_ekstra || '-'}</td>
                  <td className="table-td text-right text-xs">{formatRupiah(l.nilai)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Form dokumen baru — HANYA header, tanpa barang ──────────────────────────
function DokumenForm({ kategori, skpdId, skpdNama, judul, pihakLabel, cekNomorDipakai, onCancel, onSaved }: {
  kategori: KategoriPerolehan; skpdId: number; skpdNama: string; judul: string; pihakLabel: string | null
  cekNomorDipakai: (noSk: string, excludeId?: string) => Promise<string | null>
  onCancel: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const dateBounds = useDateBounds()
  const [noDok, setNoDok] = useState('')
  const [tglDok, setTglDok] = useState(todayStr())
  const [pihak, setPihak] = useState('')
  const [ket, setKet] = useState('')
  const [dokPaths, setDokPaths] = useState<string[]>([])
  const [dokUploading, setDokUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function uploadDokumen(files: FileList | null) {
    if (!files || files.length === 0) return
    setDokUploading(true)
    for (const file of Array.from(files)) {
      const path = `${kategori}/${crypto.randomUUID()}/${file.name}`
      const { error } = await supabase.storage.from('dokumen-sumber').upload(path, file)
      if (error) { setErr(`Gagal upload "${file.name}": ${error.message}`); continue }
      setDokPaths(prev => [...prev, path])
    }
    setDokUploading(false)
  }
  async function hapusDokumen(path: string) {
    await supabase.storage.from('dokumen-sumber').remove([path])
    setDokPaths(prev => prev.filter(p => p !== path))
  }

  async function simpan() {
    if (!noDok.trim()) { setErr('No. Dokumen wajib diisi.'); return }
    if (pihakLabel && !pihak.trim()) { setErr(`${pihakLabel} wajib diisi.`); return }
    setErr(''); setSaving(true)
    const dup = await cekNomorDipakai(noDok.trim())
    if (dup) { setErr(dup); setSaving(false); return }
    const payload: HeaderPayload = { pihak: pihak.trim() || undefined, dokumen_paths: dokPaths, draft_items: [] }
    const { error } = await supabase.from('jurnal_header').insert({
      skpd_id: skpdId, kategori, jenis: null, sub_jenis: null,
      no_sk: noDok.trim(), tanggal: tglDok, keterangan: ket.trim() || null,
      payload, approval_status: 'pending',
    })
    if (error) { setErr(`Gagal menyimpan dokumen: ${error.message}`); setSaving(false); return }
    setSaving(false); onSaved()
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-semibold text-gray-800">{judul} Baru — {skpdNama}</h2>
        <button className="btn-secondary text-xs" onClick={onCancel}>← Kembali</button>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">No. Dokumen (BAST)</label>
          <input className="select-filter w-full" value={noDok} onChange={e => setNoDok(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Tgl Dokumen</label>
          <input type="date" className="select-filter w-full" min={dateBounds.min} max={dateBounds.max}
            value={tglDok} onChange={e => setTglDok(e.target.value)} />
          <p className="text-xs text-gray-400 mt-1">Periode: {periodeDariTanggal(tglDok)}</p>
        </div>
        {pihakLabel && (
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">{pihakLabel}</label>
            <input className="select-filter w-full" value={pihak} onChange={e => setPihak(e.target.value)} />
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Keterangan</label>
          <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Dokumen (foto / PDF, bisa lebih dari satu)</label>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple
            onChange={e => uploadDokumen(e.target.files)} disabled={dokUploading} className="text-xs" />
          {dokUploading && <p className="text-xs text-gray-400 mt-1">Mengunggah...</p>}
          {dokPaths.length > 0 && (
            <ul className="mt-2 space-y-1">
              {dokPaths.map(p => (
                <li key={p} className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="truncate">{namaFile(p)}</span>
                  <button onClick={() => hapusDokumen(p)} className="text-red-500 hover:text-red-700" title="Hapus dokumen">×</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex justify-end pt-2">
        <button className="btn-primary" onClick={simpan} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Dokumen'}</button>
      </div>
    </div>
  )
}

// ── Modal edit header ────────────────────────────────────────────────────────
function EditHeaderModal({ header, judul, pihakLabel, kategori, cekNomorDipakai, onClose, onSaved }: {
  header: Header; judul: string; pihakLabel: string | null; kategori: KategoriPerolehan
  cekNomorDipakai: (noSk: string, excludeId?: string) => Promise<string | null>
  onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const dateBounds = useDateBounds()
  const p = header.payload || {}
  const [noDok, setNoDok] = useState(header.no_sk)
  const [tgl, setTgl] = useState(header.tanggal)
  const [ket, setKet] = useState(header.keterangan || '')
  const [pihak, setPihak] = useState(p.pihak || '')
  const [dokPaths, setDokPaths] = useState<string[]>(p.dokumen_paths || [])
  const [dokUploading, setDokUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const pindahSemester = periodeDariTanggal(tgl) !== header.periode

  async function uploadDokumen(files: FileList | null) {
    if (!files || files.length === 0) return
    setDokUploading(true)
    for (const file of Array.from(files)) {
      const path = `${kategori}/${crypto.randomUUID()}/${file.name}`
      const { error } = await supabase.storage.from('dokumen-sumber').upload(path, file)
      if (error) { setErr(`Gagal upload "${file.name}": ${error.message}`); continue }
      setDokPaths(prev => [...prev, path])
    }
    setDokUploading(false)
  }
  async function hapusDokumen(path: string) {
    await supabase.storage.from('dokumen-sumber').remove([path])
    setDokPaths(prev => prev.filter(p => p !== path))
  }

  async function simpan() {
    if (!noDok.trim()) { setErr('No. Dokumen wajib diisi.'); return }
    if (pihakLabel && !pihak.trim()) { setErr(`${pihakLabel} wajib diisi.`); return }
    if (pindahSemester) {
      setErr(`Tanggal masuk ${periodeDariTanggal(tgl)}, sedangkan jurnal ini di ${header.periode}. Pindah semester tidak diizinkan — batalkan & buat jurnal baru.`)
      return
    }
    setErr(''); setSaving(true)
    const dup = await cekNomorDipakai(noDok.trim(), header.id)
    if (dup) { setErr(dup); setSaving(false); return }
    const payload: HeaderPayload = { ...header.payload, pihak: pihak.trim() || undefined, dokumen_paths: dokPaths }
    const { error } = await supabase.from('jurnal_header')
      .update({ no_sk: noDok.trim(), tanggal: tgl, keterangan: ket.trim() || null, payload })
      .eq('id', header.id)
    if (error) { setErr(`Gagal menyimpan: ${error.message}`); setSaving(false); return }
    setSaving(false); onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onClose)}>
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-800">Edit {judul}</h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">No. Dokumen</label>
            <input className="select-filter w-full" value={noDok} onChange={e => setNoDok(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tgl Dokumen <span className="text-gray-400">(tetap di {header.periode})</span></label>
            <input type="date" className="select-filter w-full sm:w-64" max={dateBounds.max} value={tgl} onChange={e => setTgl(e.target.value)} />
            {pindahSemester && <p className="text-xs text-red-600 mt-1">Tanggal ini masuk {periodeDariTanggal(tgl)} — di luar semester jurnal.</p>}
          </div>
          {pihakLabel && (
            <div><label className="block text-xs text-gray-500 mb-1">{pihakLabel}</label><input className="select-filter w-full" value={pihak} onChange={e => setPihak(e.target.value)} /></div>
          )}
          <div><label className="block text-xs text-gray-500 mb-1">Keterangan</label><input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} /></div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Dokumen (foto / PDF, bisa lebih dari satu)</label>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple
              onChange={e => uploadDokumen(e.target.files)} disabled={dokUploading} className="text-xs" />
            {dokUploading && <p className="text-xs text-gray-400 mt-1">Mengunggah...</p>}
            {dokPaths.length > 0 && (
              <ul className="mt-2 space-y-1">
                {dokPaths.map(p => (
                  <li key={p} className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="truncate">{namaFile(p)}</span>
                    <button onClick={() => hapusDokumen(p)} className="text-red-500 hover:text-red-700" title="Hapus dokumen">×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={simpan} disabled={saving || pindahSemester}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </div>
    </div>
  )
}
