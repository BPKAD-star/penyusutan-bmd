'use client'
// Combobox pencarian SKPD / Sub OPD / Sub Sub OPD (Lokasi) — ketik utk filter,
// panah bawah/atas utk pindah sorotan, Enter utk pilih. Bisa pilih node level mana
// pun (bukan cuma SKPD induk). Dipakai di SEMUA menu sebagai pengganti <select>.
//   - onChange(id)          : untuk form entry (pilih SATU pemilik/lokasi pasti).
//   - onChangeSelection(sel): untuk laporan/filter (pilih node + SEMUA turunannya
//                             → descendantIds utk query .in('skpd_id', ...)).
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type SkpdRow = { id: number; nama: string; level: number; parent_id: number | null }
export type SkpdSelection = { skpdId: number | null; descendantIds: number[] | null }

export default function SkpdCombobox({ value, onChange, onChangeSelection, placeholder, allowClear, rootOnly, lockToOperator }: {
  value?: string
  onChange?: (id: string) => void
  onChangeSelection?: (sel: SkpdSelection) => void
  placeholder?: string
  allowClear?: boolean
  rootOnly?: boolean // hanya SKPD induk (parent_id null) — dipakai target Pengalihan Status
  // Kalau true DAN user login non-admin: combobox dibatasi ke SKPD yang melekat
  // pada user. Admin tetap bebas. RLS tetap penjaga sesungguhnya; ini murni UX
  // supaya operator tidak bingung melihat SKPD lain padahal datanya sudah
  // dibatasi. JANGAN pasang di picker "tujuan" (Pengalihan Status) — operator
  // memang pilih SKPD lain.
  //
  // Opsinya = node user + SELURUH turunannya (default terpilih = node user, jadi
  // tampilan awal sama spt sebelum fitur ini ada). Berlaku utk dua-duanya:
  //   - onChangeSelection (filter/laporan) → mempersempit cakupan tampilan.
  //   - onChange (form entry) → memilih PEMILIK barang; sejak 2026-07-27 operator
  //     boleh mencatat atas nama sub-OPD, tidak lagi selalu di SKPD induk.
  //     ⚠️ Ini yang membuat migrasi 20260727_01 perlu: begitu Pengurus Barang
  //     bisa bikin kartu Cara Perolehan atas nama sub-OPD, tanpa guard dia bisa
  //     menyetujui kartunya sendiri (fn_is_pengurus_barang_atas hanya menolak
  //     node SENDIRI). Guard itu menutupnya lewat created_by.
  // Pengecualian: `rootOnly` tidak pernah masuk mode subtree (memang harus SKPD
  // induk), dan node tanpa turunan tetap tampil terkunci mati.
  lockToOperator?: boolean
}) {
  const supabase = createClient()
  const [all, setAll] = useState<SkpdRow[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const [internalId, setInternalId] = useState('') // dipakai kalau `value` tak dikontrol (menu laporan)
  const [lockSkpd, setLockSkpd] = useState<number | null>(null) // SKPD operator utk mode terkunci
  const appliedRef = useRef(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const effectiveId = value !== undefined ? value : internalId

  useEffect(() => {
    (async () => {
      const rows: SkpdRow[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama,level,parent_id').range(from, from + 999)
        if (!data || data.length === 0) break
        rows.push(...(data as SkpdRow[]))
        if (data.length < 1000) break
      }
      setAll(rows)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Mode terkunci: cari role + skpd_id user. Hanya kunci utk non-admin ber-SKPD.
  useEffect(() => {
    if (!lockToOperator) return
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !alive) return
      const { data } = await supabase.from('admin_profiles').select('role,skpd_id').eq('id', user.id).single()
      if (!alive) return
      const p = data as { role?: string; skpd_id?: number | null } | null
      if (p && p.role !== 'admin' && p.skpd_id) setLockSkpd(p.skpd_id)
    })()
    return () => { alive = false }
  }, [lockToOperator]) // eslint-disable-line react-hooks/exhaustive-deps

  // Begitu daftar SKPD termuat & user terkunci diketahui, set pilihan sekali.
  useEffect(() => {
    if (lockSkpd == null || appliedRef.current || all.length === 0) return
    if (!all.some(s => s.id === lockSkpd)) return
    appliedRef.current = true
    setInternalId(String(lockSkpd))
    onChange?.(String(lockSkpd))
    onChangeSelection?.({ skpdId: lockSkpd, descendantIds: descendants(lockSkpd) })
  }, [lockSkpd, all]) // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map(all.map(s => [s.id, s])), [all])
  const childrenOf = useMemo(() => {
    const m = new Map<number, number[]>()
    for (const s of all) if (s.parent_id != null) { const a = m.get(s.parent_id) || []; a.push(s.id); m.set(s.parent_id, a) }
    return m
  }, [all])

  function pathOf(id: number): string {
    const parts: string[] = []
    let cur = byId.get(id)
    const seen = new Set<number>()
    while (cur && !seen.has(cur.id)) { seen.add(cur.id); parts.unshift(cur.nama); cur = cur.parent_id != null ? byId.get(cur.parent_id) : undefined }
    return parts.join(' › ')
  }
  function descendants(id: number): number[] {
    const out = [id]; const stack = [id]
    while (stack.length) { const cur = stack.pop()!; for (const c of childrenOf.get(cur) || []) { out.push(c); stack.push(c) } }
    return out
  }

  // Filter/laporan vs form entry — dibedakan dari callback yang dipasang, sesuai
  // kontrak di kepala berkas. Bedanya cuma ARTI memilih node user sendiri:
  // di filter = "semua unit saya" (agregat), di form = "milik SKPD induk".
  const modeFilter = onChangeSelection != null

  // MODE SUBTREE (lihat prop lockToOperator): user terkunci → boleh menjelajah ke
  // bawah node-nya sendiri, tidak pernah keluar dari situ.
  //   - `!rootOnly`   : picker yang memang wajib SKPD induk (target Pengalihan
  //                     Status) tidak ikut — menjelajah ke sub-unit tak berlaku.
  //   - `length > 1`  : node tanpa unit di bawahnya (mis. pengurus pembantu di
  //                     sub-OPD daun) tak punya yang bisa dipilih → biarkan
  //                     terkunci mati spt semula, jangan kasih combobox kosong.
  const lockDescIds = useMemo(
    () => (lockSkpd == null ? null : descendants(lockSkpd)),
    [lockSkpd, childrenOf] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const subtreeMode = lockDescIds != null && !rootOnly && lockDescIds.length > 1
  const subtreeIds = useMemo(() => (subtreeMode ? new Set(lockDescIds!) : null), [subtreeMode, lockDescIds])

  const options = useMemo(
    // Di mode filter, node user sendiri sengaja TIDAK masuk daftar — sudah
    // diwakili baris "— Semua unit di X —", supaya tak ada dua entri yang sama
    // artinya. Di mode form node itu justru pilihan sah (barang milik induk).
    () => all.filter(s => (!rootOnly || s.parent_id == null)
      && (!subtreeIds || (subtreeIds.has(s.id) && !(modeFilter && s.id === lockSkpd))))
      .map(s => ({ id: s.id, label: pathOf(s.id) })).sort((a, b) => a.label.localeCompare(b.label)),
    [all, byId, rootOnly, subtreeIds, lockSkpd, modeFilter] // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const selectedLabel = effectiveId ? pathOf(Number(effectiveId)) : ''
  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () => (q ? options.filter(o => o.label.toLowerCase().includes(q)) : options).slice(0, 60),
    [q, options]
  )

  function pilih(id: number) {
    setInternalId(String(id))
    onChange?.(String(id))
    onChangeSelection?.({ skpdId: id, descendantIds: descendants(id) })
    setOpen(false); setQuery('')
  }
  function clear() {
    // Di mode subtree, "kosongkan" = kembali ke node user, BUKAN kosong/null.
    // Filter: wajib begini — descendantIds null → query kehilangan filter
    // skpd_id → idx_aset_skpd tak kepakai → itu persis penyebab timeout
    // GIS/Kendaraan yang dibereskan migrasi 20260720_01 (RLS tetap menutup,
    // tapi lambatnya balik). Form: pemilik barang tak boleh kosong sama sekali.
    if (subtreeMode) { pilih(lockSkpd!); return }
    setInternalId('')
    onChange?.('')
    onChangeSelection?.({ skpdId: null, descendantIds: null })
    setOpen(false); setQuery('')
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); setQuery(''); setHi(0); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[hi]) pilih(filtered[hi].id) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.children[hi] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [hi, open])

  // Mode terkunci MATI (operator non-admin, picker form entry): tampilkan
  // SKPD-nya, tak bisa diubah. Filter/laporan tidak lewat sini — lihat subtreeMode.
  if (lockSkpd != null && !subtreeMode) {
    return (
      <div className="relative flex-1">
        <input
          readOnly disabled
          className="select-filter w-full bg-gray-100 text-gray-600 cursor-not-allowed"
          title="Terkunci ke SKPD Anda"
          value={all.length ? pathOf(lockSkpd) : 'Memuat...'}
        />
      </div>
    )
  }

  return (
    <div className="relative flex-1" ref={boxRef}>
      <div className="flex items-center gap-2">
        <input
          className="select-filter w-full"
          placeholder={subtreeMode && modeFilter ? 'Ketik utk cari Sub OPD / Sub Sub OPD...' : (placeholder || 'Ketik utk cari SKPD / Sub OPD / Lokasi...')}
          value={open ? query : selectedLabel}
          onFocus={() => { setOpen(true); setQuery(''); setHi(0) }}
          onChange={e => { setQuery(e.target.value); setHi(0); if (!open) setOpen(true) }}
          onKeyDown={onKeyDown}
        />
        {/* Di mode subtree, × = balik ke node user → sembunyikan kalau memang
            sudah di situ (tidak ada yang bisa dikembalikan). */}
        {(subtreeMode ? effectiveId !== String(lockSkpd) : (allowClear && effectiveId)) && !open && (
          <button type="button" onClick={clear}
            title={!subtreeMode ? 'Kosongkan' : modeFilter ? 'Kembali ke seluruh unit' : 'Kembali ke SKPD induk'}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none flex-shrink-0">×</button>
        )}
      </div>
      {open && (
        <div ref={listRef} className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg divide-y divide-gray-50">
          {/* Baris pintas ini cuma utk mode filter ("semua unit saya"). Di mode
              form node induk sudah jadi opsi biasa di daftar bawah — tidak perlu,
              dan kata "semua" justru menyesatkan (pemilik barang harus satu). */}
          {(allowClear || (subtreeMode && modeFilter)) && (
            <button type="button" onClick={clear} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs text-gray-500 italic">
              {subtreeMode && modeFilter ? `— Semua unit di ${byId.get(lockSkpd!)?.nama || 'SKPD Anda'} —` : '— Semua / kosongkan —'}
            </button>
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">Tidak ditemukan.</div>
          ) : filtered.map((o, i) => (
            <button key={o.id} type="button"
              onMouseEnter={() => setHi(i)}
              onClick={() => pilih(o.id)}
              className={`w-full text-left px-3 py-2 text-xs ${i === hi ? 'bg-teal/10 text-gray-800' : 'text-gray-700 hover:bg-teal/5'}`}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
