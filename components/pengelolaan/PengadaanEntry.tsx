'use client'
// Pengadaan Entry Manual — SATU halaman, SATU daftar gabungan.
// Non-fisik & Pekerjaan Konstruksi TIDAK lagi dipisah per-section: keduanya
// tampil dalam satu daftar yang diurutkan berdasarkan TANGGAL DOKUMEN KONTRAK
// (terbaru dulu). Jenis kontrak dibedakan lewat badge + layout kartunya sendiri
// (non-fisik: kartu 2 kolom Kontrak/BAST; konstruksi: kartu barang KDP + termin).
// Menambah lewat SATU tombol "+ Tambah Pengadaan" → pilih Non-fisik / Pekerjaan
// Konstruksi → form-nya muncul & daftar disembunyikan. Total atas = gabungan.
//
// Data + kartunya di-render langsung di sini memakai komponen mandiri yang
// diekspor tiap modul (PengadaanCard, KontrakDetail) + loader bersama
// (fetchPengadaanJurnals, fetchKonstruksiKontraks) supaya bisa di-interleave.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from './FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import { formatRupiah } from '@/lib/export'
import Pengadaan, { PengadaanCard, fetchPengadaanJurnals, useGolonganLabels, draftTotal, type Jurnal } from './Pengadaan'
import KonstruksiPengadaan, { KontrakDetail, fetchKonstruksiKontraks, kontrakTotal, type Kontrak } from './KonstruksiPengadaan'
import { type ApprovalScope, SCOPE_KOSONG, fetchApprovalScope, bolehSetujuiJurnal } from '@/lib/roles'

type Creating = null | 'nonfisik' | 'konstruksi'
type MergedItem =
  | { type: 'nonfisik'; id: string; tanggal: string; j: Jurnal }
  | { type: 'konstruksi'; id: string; tanggal: string; k: Kontrak }

// Badge + garis tepi berwarna supaya jenis kontrak langsung kelihatan di daftar
// gabungan (permintaan: dibedakan lewat layout saja, bukan section terpisah).
function TypeBadge({ konstruksi }: { konstruksi: boolean }) {
  return konstruksi ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
      🏗️ Konstruksi
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-teal/10 text-teal border border-teal/20">
      📦 Non Konstruksi
    </span>
  )
}

export default function PengadaanEntry() {
  const supabase = createClient()
  const [skpd, setSkpd] = useState('')
  const [creating, setCreating] = useState<Creating>(null)
  const [pickOpen, setPickOpen] = useState(false)
  const [nfJurnals, setNfJurnals] = useState<Jurnal[]>([])
  const [kKontraks, setKKontraks] = useState<Kontrak[]>([])
  const [msg, setMsg] = useState('')

  // ⚠️ "Memuat pengadaan..." HANYA untuk SKPD yang datanya belum tampil, BUKAN
  // tiap `refresh`. Layar itu menggantikan seluruh daftar kartu, jadi
  // <PengadaanCard/> & <KontrakDetail/> ikut TERBONGKAR berikut state di
  // dalamnya: pop-up Edit Spesifikasi yang sedang terbuka, kotak Cari draft,
  // dan CENTANG barang yang sengaja dirancang bertahan lintas pencarian
  // (draftSeleksi). Padahal `onChanged` dipanggil setiap kali satu barang
  // ditambah/dihapus/disunting — jadi tiap satu perubahan kecil membuang
  // seluruh pilihan operator. Sama sebabnya dgn pop-up Ajukan RKBMD yang
  // menghilang sendiri (2026-08-14): gerbang `loading` dipasang DI ATAS
  // komponen yang menyimpan state.
  const [skpdTampil, setSkpdTampil] = useState('')
  const memuatAwal = skpdTampil !== skpd
  const [scope, setScope] = useState<ApprovalScope>(SCOPE_KOSONG)
  const golonganLabels = useGolonganLabels()
  // Per-kartu: selain cakupan SKPD, pembuat kartu tak boleh menyetujui sendiri
  // (pemisahan tugas — sejak picker SKPD dibuka ke subtree). Penegak asli:
  // trigger fn_jurnal_header_approval_guard (migrasi 20260727_01).
  const bolehACCKartu = (createdBy: string | null) => bolehSetujuiJurnal(scope, skpd, createdBy)
  const skpdRef = useRef(skpd); skpdRef.current = skpd

  useEffect(() => { (async () => setScope(await fetchApprovalScope(supabase)))() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(async (skpdId: string) => {
    if (!skpdId) { setNfJurnals([]); setKKontraks([]); setSkpdTampil(''); return }
    const [nf, k] = await Promise.all([
      fetchPengadaanJurnals(supabase, skpdId),
      fetchKonstruksiKontraks(supabase, skpdId),
    ])
    setNfJurnals(nf); setKKontraks(k); setSkpdTampil(skpdId)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload(skpd); setCreating(null); setPickOpen(false); setMsg('') }, [skpd, reload])
  const refresh = useCallback(() => reload(skpdRef.current), [reload])
  const exitCreate = () => { setCreating(null); refresh() }

  // Total gabungan (Non-fisik + Konstruksi): non-fisik disetujui dari ledger
  // (sudah dedup di loader → j.total); draft dari estimasi draft_items;
  // konstruksi = Σ termin semua barang KDP.
  const total =
    nfJurnals.reduce((s, j) => s + (j.approval_status === 'disetujui' ? j.total : draftTotal(j.payload.draft_items || [])), 0) +
    kKontraks.reduce((s, k) => s + kontrakTotal(k.payload), 0)

  // Satu daftar, diurutkan by tanggal dokumen kontrak (terbaru dulu).
  const merged: MergedItem[] = [
    ...nfJurnals.map((j): MergedItem => ({ type: 'nonfisik', id: j.id, tanggal: j.tanggal, j })),
    ...kKontraks.map((k): MergedItem => ({ type: 'konstruksi', id: k.id, tanggal: k.tanggal, k })),
  ].sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : 0))

  return (
    <FormShell judul="Pengadaan" msg=""
      deskripsi="Pilih SKPD — semua pengadaan (Non Konstruksi & Konstruksi) tampil dalam satu daftar, diurutkan berdasarkan tanggal dokumen kontrak."
      headerRight={skpd ? (
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-gray-400">Total Pengadaan</p>
          <p className="text-lg font-bold text-gray-900">{formatRupiah(total)}</p>
        </div>
      ) : undefined}>
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">Lokasi / SKPD :</label>
          <SkpdCombobox lockToOperator value={skpd} onChange={setSkpd} placeholder="Ketik nama SKPD / Sub OPD / Lokasi..." />
        </div>
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Pilih SKPD di atas untuk melihat & membuat pengadaan.</div>
      ) : creating === 'nonfisik' ? (
        <Pengadaan skpdProp={skpd} embedded startCreate onExit={exitCreate} />
      ) : creating === 'konstruksi' ? (
        <KonstruksiPengadaan skpdProp={skpd} embedded startCreate onExit={exitCreate} />
      ) : (
        <div className="space-y-6">
          {msg && (
            <div className={`p-3 rounded-lg text-sm max-w-2xl ${msg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{merged.length} kontrak pengadaan</span>
            <div className="relative">
              <button className="btn-primary" onClick={() => setPickOpen(v => !v)}>+ Tambah Pengadaan</button>
              {pickOpen && (
                <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden text-sm">
                  {/* ⚠️ Label saja yang berganti (user 2026-09-01): "Non-fisik"
                      → "Non Konstruksi", "Pekerjaan Fisik Konstruksi" →
                      "Konstruksi". Nilai `Creating` ('nonfisik'/'konstruksi')
                      & kategori `jurnal_header` SENGAJA TIDAK ikut — yang
                      terakhir itu data tersimpan di DB. */}
                  <button className="block w-full text-left px-4 py-2.5 hover:bg-gray-50 whitespace-nowrap" onClick={() => { setPickOpen(false); setCreating('nonfisik') }}>Non Konstruksi</button>
                  <button className="block w-full text-left px-4 py-2.5 hover:bg-gray-50 whitespace-nowrap border-t border-gray-100" onClick={() => { setPickOpen(false); setCreating('konstruksi') }}>Konstruksi</button>
                </div>
              )}
            </div>
          </div>

          {memuatAwal ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Memuat pengadaan...</div>
          ) : merged.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Belum ada pengadaan untuk SKPD ini.</div>
          ) : (
            <div className="space-y-5">
              {merged.map(it => (
                <div key={`${it.type}-${it.id}`} className="space-y-1.5">
                  <TypeBadge konstruksi={it.type === 'konstruksi'} />
                  {it.type === 'nonfisik' ? (
                    <PengadaanCard j={it.j} skpdId={Number(skpd)} golonganLabels={golonganLabels}
                      isAdmin={bolehACCKartu(it.j.created_by)} onChanged={refresh} onMsg={setMsg} />
                  ) : (
                    <KontrakDetail inline kontrak={it.k} isAdmin={bolehACCKartu(it.k.created_by)}
                      onBack={refresh} onChanged={refresh} onMsg={setMsg} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </FormShell>
  )
}
