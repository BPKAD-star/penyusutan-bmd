'use client'
// Menu Inventarisasi → Tindak Lanjut (Fase 1, 2026-10-02).
// Daftar temuan dari LHI yang SUDAH DIVALIDASI + status yang dilacak OTOMATIS
// dari keadaan barang saat ini (lib/tindakLanjut.ts). Halaman ini MURNI BACA:
// tidak mengubah register maupun ledger. Pekerjaannya dikerjakan SKPD di menu
// terkait lewat tombol "Kerjakan →"; begitu disimpan di sana, statusnya di sini
// berubah sendiri saat dimuat ulang.
//
// Fase 3: temuan yang tak terlacak otomatis bisa DITANDAI SELESAI MANUAL dgn
// catatan wajib (tabel `inventarisasi_tindak_lanjut`), dan admin/auditor dapat
// tab Rekap per SKPD.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import FormShell from '@/components/pengelolaan/FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import { useSkpdTree } from '@/components/useSkpdTree'
import { useProfilRole } from '@/components/useProfilRole'
import { DokumenLinks } from '@/components/pengelolaan/DokumenBastField'
import TandaManualModal from '@/components/inventarisasi/TandaManualModal'
import RekapTindakLanjut from '@/components/inventarisasi/RekapTindakLanjut'
import { createClient } from '@/lib/supabase/client'
import { LHI_LABEL, LHI_URUT, type LhiKode } from '@/lib/inventarisasi'
import { STATUS_TL_LABEL, type MenuTL, type StatusTL } from '@/lib/tindakLanjut'
import { batalkanTandaManual, muatTindakLanjut, type TemuanTLMuat } from '@/lib/tindakLanjutData'
import { useAsyncData } from '@/shared/ui/useAsyncData'
import { useKonfirmasi, konfirmasiGagal } from '@/shared/ui/konfirmasi'

const TAHUN_INI = new Date().getFullYear()

// Kelas ditulis UTUH (Tailwind memindai teks literal).
const BADGE: Record<StatusTL, string> = {
  belum: 'bg-red-50 text-red-700 border-red-200',
  proses: 'bg-amber-50 text-amber-700 border-amber-200',
  selesai: 'bg-teal/10 text-teal border-teal/30',
  manual: 'bg-gray-50 text-gray-500 border-gray-200',
}

// Tautan "Kerjakan →" membawa parameter ISIAN OTOMATIS (Fase 2): menu tujuan
// membuka form dgn barang, kode tujuan, atau nilai "seharusnya" dari LKI sudah
// terisi. Tak ada yang tersimpan sampai operator menekan Simpan di sana.
const P = '/dashboard/pembukuan/pengelolaan'
const qs = (o: Record<string, string | number | null | undefined>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])).toString()

const MENU: Record<MenuTL, { label: string; href: (t: TemuanTLMuat) => string }> = {
  reklasifikasi: { label: 'Reklasifikasi', href: t => `${P}/reklasifikasi?${qs({ skpd: t.skpdId, aset: t.asetId, kode: t.kodeTujuan, alasan: t.alasanReklas })}` },
  koreksi: { label: 'Koreksi', href: t => `${P}/koreksi?${qs({ skpd: t.skpdId, tl: t.isianId, lhi: t.lhi })}` },
  kapitalisasi: { label: 'Kapitalisasi', href: t => `${P}/kapitalisasi?${qs({ skpd: t.skpdId, induk: t.relasi?.induk, anak: t.relasi?.anak })}` },
  penghapusan: { label: 'Penghapusan', href: () => `${P}/penghapusan` },
  rkbmd_penghapusan: { label: 'RKBMD Penghapusan', href: () => '/dashboard/rkbmd/usulan' },
  pengamanan: { label: 'Pengamanan', href: t => `${P}/pengamanan?${qs({ skpd: t.skpdId, nibar: t.snapshot?.nibar })}` },
  pemanfaatan: { label: 'Pemanfaatan', href: t => `${P}/pemanfaatan?${qs({ skpd: t.skpdId, nibar: t.snapshot?.nibar })}` },
  hasil_inventarisasi: { label: 'Hasil Inventarisasi', href: t => `/dashboard/pembukuan/perolehan/inventarisasi?${qs({ skpd: t.skpdId, tl: t.isianId })}` },
}

/** Temuan yang bisa masuk Surat Usulan Reklasifikasi — ada kode tujuannya & belum direklas. */
const bisaDiusulkan = (t: TemuanTLMuat) => !!t.perluReklas

export default function TindakLanjut() {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const { byId, rootOf } = useSkpdTree()
  const { role } = useProfilRole()
  // Rekap per SKPD untuk Pengelola (admin) & auditor — pola LHI. Auditor cuma
  // MEMBACA: tombol tandai disembunyikan (RLS tetap penjaga akhirnya).
  const bolehRekap = role === 'admin' || role === 'pengawas'
  const bolehTulis = role !== null && role !== 'pengawas'
  const [tab, setTab] = useState<'daftar' | 'rekap'>('daftar')
  const [menandai, setMenandai] = useState<TemuanTLMuat | null>(null)
  const kelompokInduk = useCallback((id: number) => rootOf(id)?.id ?? id, [rootOf])
  const [tahun, setTahun] = useState(TAHUN_INI)
  const [skpdIds, setSkpdIds] = useState<number[] | null>(null)
  const [fStatus, setFStatus] = useState<StatusTL | 'semua'>('semua')
  const [fLhi, setFLhi] = useState<LhiKode | 'semua'>('semua')
  const { data, loading, error, run } = useAsyncData<TemuanTLMuat[]>()
  const kunci = `${tahun}|${(skpdIds || []).join(',')}`
  // Centang untuk Surat Usulan Reklasifikasi — SATU SKPD per surat.
  const [usul, setUsul] = useState<Record<string, TemuanTLMuat>>({})

  useEffect(() => { setUsul({}); void run(() => muatTindakLanjut(supabase, { tahun, skpdIds })) }, [kunci, run]) // eslint-disable-line react-hooks/exhaustive-deps

  const usulList = Object.values(usul)
  const usulSkpd = [...new Set(usulList.map(t => t.skpdId))]
  const toggleUsul = (t: TemuanTLMuat) => setUsul(p => {
    const n = { ...p }
    if (n[t.id]) delete n[t.id]; else n[t.id] = t
    return n
  })
  const hrefSurat = usulSkpd.length === 1
    ? `/cetak/usulan-reklas?${qs({ skpd: usulSkpd[0], tahun, ids: usulList.map(t => t.id).join(',') })}`
    : null

  const muatUlang = () => void run(() => muatTindakLanjut(supabase, { tahun, skpdIds }))

  async function batalkanTanda(t: TemuanTLMuat) {
    if (!t.tandaManual) return
    const id = t.tandaManual.id
    try {
      const h = await konfirmasi({
        nada: 'amber', ikon: '↩', judul: 'Batalkan tanda selesai?',
        subjudul: `${t.snapshot?.nama_barang || '-'} · ${t.lhi}`,
        isi: <>Temuan ini kembali berstatus <b>Tandai manual</b>. Catatan &amp; dokumen pendukungnya dihapus dari tanda ini.</>,
        labelYa: 'Ya, batalkan tanda',
        kerjakan: async () => { await batalkanTandaManual(supabase, id) },
      })
      if (h.ya) muatUlang()
    } catch (e) {
      await konfirmasiGagal(konfirmasi, e instanceof Error ? e.message : String(e))
    }
  }

  const semua = data || []
  // Rekap mengikuti Format LHI (bukan Status — rekap justru menghitung status).
  const untukRekap = useMemo(() => semua.filter(t => fLhi === 'semua' || t.lhi === fLhi), [semua, fLhi])
  const hitung = useMemo(() => {
    const c: Record<StatusTL, number> = { belum: 0, proses: 0, selesai: 0, manual: 0 }
    for (const t of semua) c[t.status]++
    return c
  }, [semua])
  const baris = useMemo(() => semua
    .filter(t => (fStatus === 'semua' || t.status === fStatus) && (fLhi === 'semua' || t.lhi === fLhi))
    .sort((a, b) => (byId.get(a.skpdId)?.nama || '').localeCompare(byId.get(b.skpdId)?.nama || '')
      || LHI_URUT.indexOf(a.lhi) - LHI_URUT.indexOf(b.lhi) || a.id.localeCompare(b.id)),
  [semua, fStatus, fLhi, byId])

  return (
    <FormShell judul="Tindak Lanjut Inventarisasi"
      deskripsi="Temuan dari LHI yang sudah divalidasi. Status dilacak otomatis dari keadaan barang di register — kerjakan lewat menu terkait, statusnya menyesuaikan sendiri."
      msg=""
      headerRight={
        <div className="flex items-center gap-2">
          {usulList.length > 0 && (hrefSurat
            ? <a href={hrefSurat} target="_blank" rel="noopener noreferrer" className="btn-primary text-sm">🖨 Surat Usulan Reklas ({usulList.length})</a>
            : <span title="Satu surat untuk satu SKPD — centang temuan dari SKPD yang sama"
                className="px-4 py-2 rounded-lg text-sm border border-gray-200 text-gray-400 cursor-not-allowed">🖨 Surat Usulan Reklas — pilih satu SKPD saja</span>)}
          <button onClick={muatUlang} className="btn-secondary text-sm">↻ Muat ulang</button>
        </div>
      }>
      {bolehRekap && (
        <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm">
          {([['daftar', 'Daftar Temuan'], ['rekap', 'Rekap per SKPD']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)}
              className={`px-4 py-1.5 rounded-md transition-colors ${tab === v ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
              {l}
            </button>
          ))}
        </div>
      )}
      <div className="card p-4 mb-4 space-y-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">SKPD</label>
          <SkpdCombobox lockToOperator allowClear onChangeSelection={sel => setSkpdIds(sel.descendantIds)}
            placeholder="Semua SKPD — atau ketik nama SKPD..." />
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tahun Inventarisasi</label>
            <select className="select-filter" value={tahun} onChange={e => setTahun(Number(e.target.value))}>
              {[TAHUN_INI, TAHUN_INI - 1, TAHUN_INI - 2].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[280px]">
            <label className="block text-xs text-gray-500 mb-1">Format LHI</label>
            <select className="select-filter w-full" value={fLhi} onChange={e => setFLhi(e.target.value as LhiKode | 'semua')}>
              <option value="semua">Semua format</option>
              {LHI_URUT.map(k => <option key={k} value={k}>{k} — {LHI_LABEL[k]}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['semua', 'belum', 'proses', 'selesai', 'manual'] as const).map(s => (
            <button key={s} onClick={() => setFStatus(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border ${fStatus === s ? 'bg-teal text-white border-teal' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {s === 'semua' ? `Semua (${semua.length})` : `${STATUS_TL_LABEL[s]} (${hitung[s]})`}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error} — status tidak ditampilkan supaya tak ada temuan yang terbaca &ldquo;belum dikerjakan&rdquo; padahal datanya gagal dimuat.
        </div>
      )}

      <div className="card p-4 overflow-x-auto">
        {loading ? (
          <p className="py-8 text-center text-sm text-gray-400">Memuat temuan...</p>
        ) : error ? null : tab === 'rekap' && bolehRekap ? (
          <RekapTindakLanjut temuan={untukRekap} byId={byId} rootOf={kelompokInduk} tahun={tahun} />
        ) : semua.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Belum ada temuan dari isian inventarisasi tahun {tahun} yang sudah divalidasi.</p>
        ) : baris.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Tidak ada temuan yang cocok dengan penyaring.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-2 font-medium" title="Centang untuk Surat Usulan Reklasifikasi">Usul</th>
                <th className="py-2 pr-3 font-medium">SKPD</th>
                <th className="py-2 pr-3 font-medium">Barang</th>
                <th className="py-2 pr-3 font-medium">Temuan</th>
                <th className="py-2 pr-3 font-medium">Tindak Lanjut</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium">Kerjakan</th>
              </tr>
            </thead>
            <tbody>
              {baris.map(t => (
                <tr key={t.id} className="border-b border-gray-100 align-top">
                  <td className="py-2 pr-2">
                    {bisaDiusulkan(t) && (
                      <input type="checkbox" checked={!!usul[t.id]} onChange={() => toggleUsul(t)}
                        title="Masukkan ke Surat Usulan Reklasifikasi" />
                    )}
                  </td>
                  <td className="py-2 pr-3 text-gray-700">{byId.get(t.skpdId)?.nama || t.skpdId}</td>
                  <td className="py-2 pr-3">
                    <p className="text-gray-800">{t.snapshot?.nama_barang || t.snapshot?.uraian_barang || '(belum tercatat)'}</p>
                    <p className="text-[10px] text-gray-400 break-all">{t.snapshot?.nibar || '-'}</p>
                    <p className="text-[10px] text-gray-400">{t.snapshot?.kode || t.golongan}</p>
                  </td>
                  <td className="py-2 pr-3">
                    <p className="font-medium text-gray-700">{t.lhi}</p>
                    <p className="text-gray-500">{LHI_LABEL[t.lhi]}</p>
                  </td>
                  <td className="py-2 pr-3">
                    <p className="text-gray-800">{t.tindakan}</p>
                    {t.tahap.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {t.tahap.map((h, i) => (
                          <li key={i} className={h.selesai ? 'text-teal' : h.selesai === null ? 'text-gray-400' : 'text-gray-600'}>
                            {h.selesai ? '✓' : h.selesai === null ? '–' : '○'} {h.label}
                          </li>
                        ))}
                      </ul>
                    )}
                    {t.catatan && !t.tandaManual && <p className="mt-1 text-[10px] text-gray-400">{t.catatan}</p>}
                    {t.tandaManual && <DokumenLinks paths={t.tandaManual.dokumen_paths} label="Dokumen tanda" />}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`inline-block px-2 py-0.5 rounded border text-[11px] font-medium ${BADGE[t.status]}`}>{STATUS_TL_LABEL[t.status]}</span>
                  </td>
                  <td className="py-2">
                    <div className="flex flex-col gap-1">
                      {t.status !== 'selesai' && t.menu.map(m => (
                        <Link key={m} href={MENU[m].href(t)} className="text-teal hover:underline whitespace-nowrap">{MENU[m].label} →</Link>
                      ))}
                      {bolehTulis && t.bolehManual && !t.tandaManual && (
                        <button onClick={() => setMenandai(t)} className="text-left text-gray-700 hover:underline whitespace-nowrap">✓ Tandai selesai</button>
                      )}
                      {bolehTulis && t.tandaManual && (
                        <button onClick={() => void batalkanTanda(t)} className="text-left text-amber-700 hover:underline whitespace-nowrap">↩ Batalkan tanda</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-[11px] text-gray-400">
          Kode tujuan reklas yang tertulis hanya <b>usulan</b> — kode barang di register baru berubah setelah SKPD menyimpan Reklasifikasi
          (dengan surat usulan sebagai dokumen sumber). Centang kolom <b>Usul</b> lalu cetak <b>Surat Usulan Reklas</b> (satu SKPD per
          surat). Tombol Kerjakan membuka menunya dengan isian dari LKI sudah terisi. Temuan yang tak bisa dilacak otomatis
          (status <b>Tandai manual</b>) ditandai selesai di sini dengan catatan; selebihnya halaman ini tidak mengubah data apa pun.
        </p>
      </div>
      {menandai && (
        <TandaManualModal temuan={menandai} onClose={() => setMenandai(null)}
          onSaved={() => { setMenandai(null); muatUlang() }} />
      )}
    </FormShell>
  )
}
