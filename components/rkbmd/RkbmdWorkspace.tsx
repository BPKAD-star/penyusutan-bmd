'use client'
// Shell modul RKBMD: pemilih Tahun Anggaran + SKPD + versi (murni/perubahan),
// tab per 5 jenis, siklus dokumen (buat draft → ajukan → telaah setuju/tolak →
// buka kunci). Non-ledger: approve hanya membekukan status.
//
// BENTUK BERKARTU (migrasi 20260810_02, keputusan user 2026-08-10): RKBMD
// Pengadaan berisi BEBERAPA kartu, satu kartu = satu Program/Kegiatan/Sub
// Kegiatan dengan beberapa item barang di dalamnya — polanya mengikuti entry
// Pengadaan. Semua kartu diisi dulu, baru SATU KALI diajukan. Penolakan berlaku
// untuk SELURUH dokumen (semua kartu ikut kembali ke SKPD), lalu diajukan ulang.
// Empat jenis lain (pemeliharaan/pemanfaatan/pemindahtanganan/penghapusan)
// tetap datar: itemnya menempel langsung ke dokumen, `paket_id` NULL.
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import { backdropClose } from '@/components/backdropClose'
import SkpdCombobox from '@/components/SkpdCombobox'
import ProgramPicker from '@/components/ProgramPicker'
import RkbmdPengadaanForm from '@/components/rkbmd/RkbmdPengadaanForm'
import RkbmdAsetForm from '@/components/rkbmd/RkbmdAsetForm'
import RkbmdLampiran from '@/components/rkbmd/RkbmdLampiran'
import { formatRupiah } from '@/lib/export'
import {
  RKBMD_JENIS, STATUS_META, type RkbmdJenis, type RkbmdVersi,
  type RkbmdHeader, type RkbmdItem, type RkbmdPaket,
} from '@/lib/rkbmd'

const TAHUN_DEFAULT = new Date().getFullYear() + 1
const HEADER_COLS =
  'id,skpd_id,tahun_anggaran,jenis,versi,parent_id,keterangan,status,catatan_telaah,diajukan_at,approved_at,created_at,dokumen_paths,dokumen_diunggah_at,nihil'
const PAKET_COLS = 'id,rkbmd_id,no_urut,program,kegiatan,sub_kegiatan,keterangan'

export default function RkbmdWorkspace() {
  const supabase = createClient()
  const [isAdmin, setIsAdmin] = useState(false)
  const [tahun, setTahun] = useState(TAHUN_DEFAULT)
  const [skpd, setSkpd] = useState('')
  const [versi, setVersi] = useState<RkbmdVersi>('murni')
  const [jenis, setJenis] = useState<RkbmdJenis>('pengadaan')

  const [headers, setHeaders] = useState<Record<string, RkbmdHeader>>({}) // key = jenis
  const [items, setItems] = useState<RkbmdItem[]>([])
  const [pakets, setPakets] = useState<RkbmdPaket[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const header = headers[jenis] as RkbmdHeader | undefined
  const canEditContent = !!header && (header.status === 'draft' || header.status === 'ditolak')

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('admin_profiles').select('role').eq('id', user.id).single()
      setIsAdmin((data as { role?: string } | null)?.role === 'admin')
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadHeaders = useCallback(async () => {
    if (!skpd) { setHeaders({}); setItems([]); setPakets([]); return }
    setLoading(true); setMsg('')
    const { data, error } = await supabase.from('rkbmd').select(HEADER_COLS)
      .eq('skpd_id', Number(skpd)).eq('tahun_anggaran', tahun).eq('versi', versi)
    if (error) setMsg(`Error: ${error.message}`)
    const map: Record<string, RkbmdHeader> = {}
    for (const h of (data || []) as RkbmdHeader[]) map[h.jenis] = h
    setHeaders(map)
    setLoading(false)
  }, [skpd, tahun, versi]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadHeaders() }, [loadHeaders])

  // Kartu + item dimuat bersama: keduanya berubah bareng tiap kali dokumen
  // diganti atau isinya disunting, dan tampilan kartu butuh dua-duanya.
  const loadIsi = useCallback(async (rkbmdId: string | undefined) => {
    if (!rkbmdId) { setItems([]); setPakets([]); return }
    const [pk, it] = await Promise.all([
      supabase.from('rkbmd_paket').select(PAKET_COLS).eq('rkbmd_id', rkbmdId).order('no_urut'),
      supabase.from('rkbmd_item').select('*').eq('rkbmd_id', rkbmdId).order('no_urut'),
    ])
    if (pk.error || it.error) { setMsg(`Error: ${(pk.error || it.error)!.message}`); return }
    setPakets((pk.data || []) as RkbmdPaket[])
    setItems((it.data || []) as RkbmdItem[])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadIsi(header?.id) }, [header?.id, loadIsi])

  async function buatDokumen() {
    if (!skpd) { setMsg('Error: pilih SKPD dulu.'); return }
    setBusy(true); setMsg('')
    let parent_id: string | null = null
    if (versi === 'perubahan') {
      const { data: murni } = await supabase.from('rkbmd').select('id,status')
        .eq('skpd_id', Number(skpd)).eq('tahun_anggaran', tahun).eq('jenis', jenis).eq('versi', 'murni').maybeSingle()
      if (!murni || (murni as { status: string }).status !== 'disetujui') {
        setMsg('Error: Perubahan RKBMD hanya bisa dibuat setelah RKBMD murni jenis ini DISETUJUI.')
        setBusy(false); return
      }
      parent_id = (murni as { id: string }).id
    }
    const { error } = await supabase.from('rkbmd').insert({
      skpd_id: Number(skpd), tahun_anggaran: tahun, jenis, versi, parent_id, status: 'draft',
    })
    if (error) setMsg(`Error: ${error.message}`)
    else { setMsg('Dokumen RKBMD dibuat (draft).'); await loadHeaders() }
    setBusy(false)
  }

  async function patchHeader(patch: Partial<RkbmdHeader>, okMsg: string) {
    if (!header) return
    setBusy(true); setMsg('')
    const { error } = await supabase.from('rkbmd').update(patch).eq('id', header.id)
    if (error) setMsg(`Error: ${error.message}`)
    else { setMsg(okMsg); await loadHeaders() }
    setBusy(false)
  }

  async function hapusDokumen() {
    if (!header) return
    if (!confirm('Hapus dokumen RKBMD ini beserta SELURUH kartu & itemnya? Tidak bisa dibatalkan.')) return
    setBusy(true); setMsg('')
    const { error } = await supabase.from('rkbmd').delete().eq('id', header.id)
    if (error) setMsg(`Error: ${error.message}`)
    else { setMsg('Dokumen dihapus.'); await loadHeaders() }
    setBusy(false)
  }

  return (
    <FormShell
      judul="RKBMD"
      deskripsi="Rencana Kebutuhan Barang Milik Daerah — perencanaan tahun anggaran berikutnya (Permendagri 19/2016 jo. 7/2024)."
      msg={msg}
    >
      {/* Filter */}
      <div className="card p-5 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tahun Anggaran</label>
            <input type="number" className="select-filter w-28" value={tahun}
              onChange={e => setTahun(Number(e.target.value) || TAHUN_DEFAULT)} />
          </div>
          <div className="min-w-[280px]">
            <label className="block text-xs text-gray-500 mb-1">SKPD / Lokasi</label>
            <SkpdCombobox lockToOperator value={skpd} onChange={id => { setSkpd(id); setMsg('') }} placeholder="Ketik nama SKPD..." />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Versi</label>
            <select className="select-filter" value={versi} onChange={e => setVersi(e.target.value as RkbmdVersi)}>
              <option value="murni">RKBMD (murni)</option>
              <option value="perubahan">Perubahan RKBMD</option>
            </select>
          </div>
        </div>
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Pilih SKPD untuk mulai menyusun RKBMD.</div>
      ) : (
        <>
          {/* Tabs jenis */}
          <div className="flex flex-wrap gap-1 mb-4 border-b border-gray-100">
            {RKBMD_JENIS.map(j => {
              const h = headers[j.key]
              const active = jenis === j.key
              return (
                <button key={j.key} onClick={() => setJenis(j.key)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    active ? 'border-teal text-teal' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  {j.label}
                  {h && <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full align-middle ${STATUS_META[h.status].cls}`}>
                    {STATUS_META[h.status].label}
                  </span>}
                </button>
              )
            })}
          </div>

          {loading ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Memuat...</div>
          ) : !header ? (
            <div className="card p-8 text-center">
              <p className="text-sm text-gray-500 mb-1">{RKBMD_JENIS.find(j => j.key === jenis)!.deskripsi}</p>
              <p className="text-xs text-gray-400 mb-4">
                Belum ada dokumen {versi === 'perubahan' ? 'Perubahan ' : ''}RKBMD {jenis} untuk SKPD ini, TA {tahun}.
              </p>
              <button className="btn-primary" onClick={buatDokumen} disabled={busy}>
                {busy ? 'Membuat...' : `Buat RKBMD ${RKBMD_JENIS.find(j => j.key === jenis)!.label}`}
              </button>
            </div>
          ) : (
            <DokumenPanel
              header={header} items={items} pakets={pakets} isAdmin={isAdmin} busy={busy} canEditContent={canEditContent}
              // ⚠️ Header IKUT dimuat ulang tiap isi berubah, bukan cuma item/kartunya.
              // Sejak migrasi 20260813_01, menyunting isi membuat DB MENCABUT
              // lampiran (dan menarik status 'diajukan' kembali ke 'draft') lewat
              // trigger — tanpa memuat ulang header, layar masih memamerkan
              // "✓ Terlampir" & tombol Ajukan hidup padahal DB sudah menolaknya.
              reloadIsi={async () => { await loadIsi(header.id); await loadHeaders() }}
              reloadHeader={loadHeaders} onMsg={setMsg}
              onAjukan={() => patchHeader({ status: 'diajukan' }, 'RKBMD diajukan untuk ditelaah.')}
              onTarik={() => patchHeader({ status: 'draft' }, 'Pengajuan ditarik kembali ke draft.')}
              onHapus={hapusDokumen}
              onNihil={(v) => patchHeader({ nihil: v }, v
                ? 'Dokumen dinyatakan NIHIL — lampirkan pernyataan bertanda tangan, lalu ajukan.'
                : 'Pernyataan nihil dibatalkan — dokumen kembali bisa diisi.')}
            />
          )}
        </>
      )}
    </FormShell>
  )
}

// ── Panel satu dokumen RKBMD ──────────────────────────────────────────────
// ⚠️ `onBukaKunci` SUDAH TIDAK ADA (keputusan user 2026-08-13): membuka kunci
// dokumen yang sudah ditetapkan adalah wewenang Pengelola Barang, dan kini
// berkumpul satu pintu bersama Setujui & Tolak di menu RKBMD → Validasi.
// Jangan dikembalikan ke sini — layar ini milik SKPD penyusun.
function DokumenPanel({
  header, items, pakets, isAdmin, busy, canEditContent, reloadIsi, reloadHeader, onMsg,
  onAjukan, onTarik, onHapus, onNihil,
}: {
  header: RkbmdHeader; items: RkbmdItem[]; pakets: RkbmdPaket[]
  isAdmin: boolean; busy: boolean; canEditContent: boolean
  reloadIsi: () => void; reloadHeader: () => void; onMsg: (m: string) => void
  onAjukan: () => void; onTarik: () => void
  onHapus: () => void; onNihil: (v: boolean) => void
}) {
  const supabase = createClient()
  const berkartu = header.jenis === 'pengadaan'
  const total = items.reduce((s, it) => s + (it.total_anggaran || 0), 0)
  // Syarat mengajukan sekarang diperiksa DI DALAM pop-up Ajukan (AjukanModal),
  // bukan dengan mematikan tombolnya di sini: tombol mati tanpa keterangan
  // membuat operator menebak apa yang kurang. Penegak sesungguhnya tetap
  // trigger DB — `fn_rkbmd_status_guard` (lampiran) + `fn_rkbmd_nihil_guard`.
  const [ajukanOpen, setAjukanOpen] = useState(false)
  // Menyatakan nihil hanya masuk akal saat dokumennya memang masih kosong; DB
  // menolak kalau tidak, tapi tombol yang pasti gagal lebih baik tak ada.
  const bolehNihil = canEditContent && (header.nihil || (items.length === 0 && pakets.length === 0))

  async function tambahKartu() {
    const next = Math.max(0, ...pakets.map(p => p.no_urut || 0)) + 1
    const { error } = await supabase.from('rkbmd_paket').insert({ rkbmd_id: header.id, no_urut: next })
    if (error) onMsg(`Error: gagal menambah kartu: ${error.message}`)
    else reloadIsi()
  }

  return (
    <div className="space-y-4">
      {/* Status + aksi siklus */}
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_META[header.status].cls}`}>
            {STATUS_META[header.status].label}
          </span>
          {header.nihil ? (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">NIHIL</span>
          ) : (
            <span className="text-xs text-gray-400">
              {berkartu && `${pakets.length} kartu · `}{items.length} item · Total {formatRupiah(total)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Tombol Cetak KEMBALI ke sini (keputusan user 2026-08-13, membalik
              keputusan 2026-08-10 yang memindahkannya ke menu Pelaporan).
              Yang berubah bukan seleranya, tapi PERAN lembarnya: dalam alur
              baru, lembar per-SKPD dicetak dulu, ditandatangani kepala kantor,
              lalu hasil pindaiannya jadi SYARAT menekan Ajukan. Ia berubah dari
              KELUARAN jadi MASUKAN — tempatnya di layar tempat operator SKPD
              bekerja, bukan di menu hilir milik Pengelola. Cetak se-Kabupaten
              TETAP di Pelaporan.
              Sengaja tak dibatasi status: draft pun boleh dicetak — justru itu
              gunanya, tanda tangan dibutuhkan SEBELUM diajukan. */}
          {/* "Tambah Kartu" naik ke baris aksi, SEJAJAR dengan Ajukan
              (permintaan user 2026-08-13). Dulu ia menempel di bawah kartu
              terakhir, jadi di dokumen yang sudah berisi beberapa kartu
              operator harus menggulir ke dasar halaman tiap kali mau menambah
              satu lagi. Tombol yang sama tetap ada di kartu kosong sbg ajakan
              awal — di sana ia bagian dari penjelasan "satu kartu = satu sub
              kegiatan", bukan sekadar tombol. */}
          {berkartu && canEditContent && !header.nihil && (
            <button className="btn-primary text-sm" onClick={tambahKartu} disabled={busy}>
              + Tambah Kartu Program/Kegiatan
            </button>
          )}
          {/* Pernyataan NIHIL — hanya saat dokumennya masih bisa disunting &
              memang kosong. Ditaruh sebelum Ajukan karena urutan kerjanya
              begitu: nyatakan nihil → cetak → tanda tangan → unggah → ajukan. */}
          {bolehNihil && (
            header.nihil ? (
              <button className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200"
                onClick={() => onNihil(false)} disabled={busy}
                title="Batalkan pernyataan nihil supaya dokumen ini bisa diisi lagi">
                Batalkan NIHIL
              </button>
            ) : (
              // Kuning (permintaan user 2026-08-13): NIHIL itu PERNYATAAN, bukan
              // aksi rutin — warnanya sengaja beda dari tombol biasa supaya tak
              // terpencet sebagai "lanjut".
              <button className="text-sm text-white bg-amber-500 hover:bg-amber-600 px-3 py-1.5 rounded-lg"
                onClick={() => { if (confirm('Nyatakan dokumen RKBMD ini NIHIL — tidak ada usulan untuk jenis & tahun ini?')) onNihil(true) }}
                disabled={busy}
                title="Untuk SKPD yang memang tidak punya usulan pada jenis & tahun ini">
                Nyatakan NIHIL
              </button>
            )
          )}
        </div>
      </div>

      {/* Lampiran hanya ditampilkan saat dokumen SUDAH TAK BISA DISUNTING —
          sebagai bukti apa yang terlanjur dikirim, supaya operator bisa
          memeriksanya tanpa membuka menu Validasi. Selama masih draft/ditolak,
          unggahnya pindah ke pop-up Ajukan (keputusan user 2026-08-13): di
          sanalah ia benar-benar dibutuhkan, dan menaruhnya di sini membuat
          operator mengunggah lebih dulu lalu lupa menekan Ajukan. */}
      {!canEditContent && (header.dokumen_paths?.length ?? 0) > 0 && (
        <RkbmdLampiran
          rkbmdId={header.id}
          paths={header.dokumen_paths || []}
          diunggahAt={header.dokumen_diunggah_at}
          canEdit={false}
          onChanged={reloadHeader}
        />
      )}

      {header.status === 'ditolak' && header.catatan_telaah && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          <span className="font-medium">Catatan telaah:</span> {header.catatan_telaah}
          <span className="block text-xs mt-1 text-red-600/80">
            Seluruh kartu di dokumen ini kembali bisa disunting. Perbaiki lalu ajukan ulang.
          </span>
        </div>
      )}

      {/* NIHIL menggantikan SELURUH badan dokumen. Menyisakan tabel kosong di
          bawahnya cuma mengaburkan yang baru saja dinyatakan — dan tombol
          "Tambah" yang tetap terlihat akan gagal di trigger DB. */}
      {header.nihil ? (
        <div className="card p-8 text-center">
          <p className="text-sm font-semibold text-gray-700">Usulan NIHIL</p>
          <p className="text-xs text-gray-500 mt-1 max-w-xl mx-auto">
            SKPD ini menyatakan tidak ada usulan RKBMD {RKBMD_JENIS.find(j => j.key === header.jenis)?.label} untuk
            TA {header.tahun_anggaran}. Cetak lembar usulan di atas, mintakan tanda tangan kepala kantor,
            unggah pindaiannya, lalu ajukan seperti dokumen biasa.
          </p>
          {canEditContent && (
            <p className="text-xs text-gray-400 mt-3">
              Berubah pikiran? Tekan <span className="font-medium">Batalkan NIHIL</span> di atas.
            </p>
          )}
        </div>
      ) : berkartu ? (
        <>
          {pakets.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-sm text-gray-500 mb-1">Belum ada kartu program/kegiatan.</p>
              <p className="text-xs text-gray-400 mb-4">
                Satu kartu = satu Sub Kegiatan, berisi beberapa item barang. Buat sebanyak yang dibutuhkan,
                baru ajukan sekali ke Pengelola Barang.
              </p>
              {canEditContent && <button className="btn-primary" onClick={tambahKartu} disabled={busy}>+ Tambah Kartu</button>}
            </div>
          ) : (
            pakets.map(p => (
              <KartuPaket key={p.id} paket={p} header={header}
                items={items.filter(i => i.paket_id === p.id)}
                canEdit={canEditContent} onMsg={onMsg} reloadIsi={reloadIsi} />
            ))
          )}
          <div className="card p-4 flex items-center justify-between">
            <span className="text-sm text-gray-600">Total seluruh kartu ({items.length} item)</span>
            <span className="text-lg font-bold text-gray-900">{formatRupiah(total)}</span>
          </div>
        </>
      ) : (
        <DaftarItemDatar header={header} items={items} canEdit={canEditContent}
          reloadIsi={reloadIsi} onMsg={onMsg} />
      )}

      {/* ── Bilah aksi PENUTUP (tata letak ditentukan user 2026-08-13) ───────
          Di ATAS cuma aksi MENYUSUN (Tambah Kartu, Nyatakan NIHIL); yang
          MENGAKHIRI dokumen ada di sini, di ujung halaman — urutannya sama
          dengan urutan kerjanya: cetak → tanda tangan → ajukan. Sebelumnya
          semuanya bertumpuk di satu baris atas, sehingga "Ajukan" duduk
          bersebelahan dengan "Tambah Kartu" padahal keduanya berlawanan arah. */}
      <div className="card p-4 flex flex-wrap items-center justify-end gap-2">
        <a href={`/cetak/rkbmd?id=${header.id}`} target="_blank" rel="noopener noreferrer"
          className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200"
          title="Cetak lembar usulan untuk ditandatangani kepala kantor">
          🖨 Cetak lembar usulan
        </a>

        {(header.status === 'draft' || header.status === 'ditolak') && (
          <>
            {/* Tombol ini TIDAK lagi langsung mengirim. Ia membuka pop-up yang
                menagih lampiran bertanda tangan — gerbang yang sama tetap
                ditegakkan trigger DB, ini cuma membuat syaratnya terlihat pada
                saat operator benar-benar berniat mengirim. */}
            <button className="btn-primary" onClick={() => setAjukanOpen(true)} disabled={busy}>
              {header.status === 'ditolak' ? 'Ajukan ulang' : 'Ajukan'}
            </button>
            <button
              className="text-sm text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-200"
              onClick={onHapus} disabled={busy}>
              Hapus dokumen
            </button>
          </>
        )}

        {header.status === 'diajukan' && !isAdmin && (
          <button className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200"
            onClick={onTarik} disabled={busy}>Tarik kembali</button>
        )}
        {/* Setujui/Tolak/Buka Kunci SENGAJA TIDAK ADA DI LAYAR INI (keputusan
            user 2026-08-13): ketiganya wewenang Pengelola Barang dan berkumpul
            di RKBMD → Validasi. Dua pintu untuk satu keputusan berarti salah
            satunya pasti dipakai tanpa membuka lampiran. */}
        {(header.status === 'diajukan' || header.status === 'disetujui') && isAdmin && (
          <a href="/dashboard/rkbmd/validasi"
            className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200"
            title="Setujui, tolak, & buka kunci dikerjakan di antrean telaah">
            Telaah di menu Validasi →
          </a>
        )}
      </div>

      {ajukanOpen && (
        <AjukanModal
          header={header}
          adaIsi={items.length > 0 || header.nihil}
          busy={busy}
          onChanged={reloadHeader}
          onAjukan={() => { setAjukanOpen(false); onAjukan() }}
          onClose={() => setAjukanOpen(false)}
        />
      )}
    </div>
  )
}

// ── Pop-up "Ajukan" ─────────────────────────────────────────────────────────
// Lampiran bertanda tangan ditagih DI SINI, bukan sebagai kartu permanen di
// halaman (keputusan user 2026-08-13). Alasannya soal urutan kerja: kartu yang
// selalu terpampang membuat operator mengunggah lebih dulu lalu lupa menekan
// Ajukan, sementara pop-up ini muncul tepat ketika ia sudah berniat mengirim —
// dan kalau lampirannya belum ada, di situlah tempat paling tepat menjelaskan
// caranya. Penegak sesungguhnya tetap trigger `fn_rkbmd_status_guard`.
function AjukanModal({ header, adaIsi, busy, onChanged, onAjukan, onClose }: {
  header: RkbmdHeader
  /** Ada item, atau dokumen sudah dinyatakan NIHIL. */
  adaIsi: boolean
  busy: boolean
  onChanged: () => void
  onAjukan: () => void
  onClose: () => void
}) {
  const adaLampiran = (header.dokumen_paths?.length ?? 0) > 0
  const alasan = !adaIsi
    ? 'Dokumen masih kosong — tambahkan item, atau nyatakan NIHIL.'
    : !adaLampiran ? 'Unggah dulu lembar usulan bertanda tangan (PDF).' : undefined

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onClose)}>
      <div className="card w-full max-w-2xl max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-800">Ajukan RKBMD ke Pengelola Barang</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Pengajuan wajib disertai lembar usulan yang sudah ditandatangani kepala kantor.
            </p>
          </div>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none flex-shrink-0" onClick={onClose}>×</button>
        </div>

        <div className="p-5 space-y-4">
          {!adaIsi && (
            <div className="p-3 rounded-lg bg-amber-50 text-amber-800 text-sm">
              Dokumen ini belum berisi apa pun. Tambahkan item dulu — atau kalau SKPD Anda memang tidak
              punya usulan untuk jenis &amp; tahun ini, tekan <span className="font-medium">Nyatakan NIHIL</span>.
            </div>
          )}

          {!adaLampiran && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Belum ada lampiran — begini urutannya:</p>
              <ol className="text-sm text-gray-600 space-y-1 list-decimal pl-5">
                <li>Tekan <span className="font-medium">🖨 Cetak lembar usulan</span> di bawah, lalu cetak lembarnya.</li>
                <li>Mintakan tanda tangan <span className="font-medium">kepala kantor</span>.</li>
                <li>Pindai, gabungkan dengan surat pengantar jadi <span className="font-medium">satu berkas PDF</span>.</li>
                <li>Unggah di bawah ini, lalu tekan Ajukan.</li>
              </ol>
            </div>
          )}

          <RkbmdLampiran
            rkbmdId={header.id}
            paths={header.dokumen_paths || []}
            diunggahAt={header.dokumen_diunggah_at}
            canEdit
            onChanged={onChanged}
          />
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap items-center justify-end gap-2 sticky bottom-0 bg-white">
          <a href={`/cetak/rkbmd?id=${header.id}`} target="_blank" rel="noopener noreferrer"
            className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200">
            🖨 Cetak lembar usulan
          </a>
          <button className="btn-primary" onClick={onAjukan} disabled={busy || !!alasan} title={alasan}>
            Ajukan sekarang
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Satu kartu = satu Program/Kegiatan/Sub Kegiatan + itemnya ───────────────
function KartuPaket({ paket, header, items, canEdit, onMsg, reloadIsi }: {
  paket: RkbmdPaket; header: RkbmdHeader; items: RkbmdItem[]
  canEdit: boolean; onMsg: (m: string) => void; reloadIsi: () => void
}) {
  const supabase = createClient()
  const [program, setProgram] = useState(paket.program || '')
  const [kegiatan, setKegiatan] = useState(paket.kegiatan || '')
  const [subKeg, setSubKeg] = useState(paket.sub_kegiatan || '')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<RkbmdItem | null>(null)

  useEffect(() => {
    setProgram(paket.program || ''); setKegiatan(paket.kegiatan || ''); setSubKeg(paket.sub_kegiatan || '')
  }, [paket.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const total = items.reduce((s, it) => s + (it.total_anggaran || 0), 0)
  const formOpen = showForm || !!editItem

  // TERSIMPAN OTOMATIS tiap dipilih — tautan "Simpan" terpisah sudah terbukti
  // jadi jebakan (pilihan terlihat jadi tapi tak pernah sampai ke DB).
  async function simpanProgram(sel: { program: string; kegiatan: string; sub_kegiatan: string }) {
    setProgram(sel.program); setKegiatan(sel.kegiatan); setSubKeg(sel.sub_kegiatan)
    const { error } = await supabase.from('rkbmd_paket').update({
      program: sel.program || null, kegiatan: sel.kegiatan || null, sub_kegiatan: sel.sub_kegiatan || null,
    }).eq('id', paket.id)
    if (error) {
      // UNIQUE (rkbmd_id, sub_kegiatan): sub kegiatan yang sama sudah punya kartu.
      onMsg(error.code === '23505'
        ? `Error: Sub Kegiatan itu sudah punya kartu sendiri di dokumen ini — tambahkan barangnya ke kartu tersebut.`
        : `Error: ${error.message}`)
      reloadIsi()
    } else {
      reloadIsi()
    }
  }

  async function hapusKartu() {
    if (!confirm(items.length > 0
      ? `Hapus kartu ini beserta ${items.length} item barangnya?`
      : 'Hapus kartu ini?')) return
    const { error } = await supabase.from('rkbmd_paket').delete().eq('id', paket.id)
    if (error) onMsg(`Error: ${error.message}`); else reloadIsi()
  }

  async function hapusItem(it: RkbmdItem) {
    if (!confirm(`Hapus item ${it.kode || it.nama_barang || ''}?`)) return
    const { error } = await supabase.from('rkbmd_item').delete().eq('id', it.id)
    if (error) onMsg(`Error: ${error.message}`); else reloadIsi()
  }

  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-gray-100 bg-gray-50/60">
        <div className="flex items-start justify-between gap-4">
          <p className="text-[11px] font-semibold text-gray-500">
            KARTU {paket.no_urut ?? ''} — PROGRAM / KEGIATAN / SUB KEGIATAN
          </p>
          {canEdit && (
            <button onClick={hapusKartu} title="Hapus kartu ini"
              className="text-red-500 hover:text-red-700 text-xs font-medium flex-shrink-0">🗑 Hapus kartu</button>
          )}
        </div>

        {canEdit ? (
          <div className="mt-2 max-w-3xl">
            <ProgramPicker program={program} kegiatan={kegiatan} subKeg={subKeg} onChange={simpanProgram} />
            <p className="text-[11px] text-gray-400 mt-1">Tersimpan otomatis setiap kali dipilih.</p>
          </div>
        ) : (
          <div className="mt-2 space-y-1 text-xs">
            <p><span className="text-gray-400 inline-block w-24">Program</span>: <span className="text-gray-700">{paket.program || '—'}</span></p>
            <p><span className="text-gray-400 inline-block w-24">Kegiatan</span>: <span className="text-gray-700">{paket.kegiatan || '—'}</span></p>
            <p><span className="text-gray-400 inline-block w-24">Sub Kegiatan</span>: <span className="text-gray-700">{paket.sub_kegiatan || '—'}</span></p>
          </div>
        )}
      </div>

      {canEdit && formOpen && (
        <div className="p-4 border-b border-gray-100">
          <RkbmdPengadaanForm
            rkbmdId={header.id} paketId={paket.id} skpdId={header.skpd_id} tahun={header.tahun_anggaran}
            editItem={editItem}
            onSaved={() => { setShowForm(false); setEditItem(null); reloadIsi() }}
            onCancel={() => { setShowForm(false); setEditItem(null) }}
          />
        </div>
      )}

      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Item Barang ({items.length})</h3>
        {canEdit && !formOpen && (
          <button className="btn-primary text-xs py-1.5" onClick={() => { setEditItem(null); setShowForm(true) }}>
            + Tambah Item
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="p-6 text-center text-gray-400 text-sm">Belum ada item di kartu ini.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th w-10">No</th>
                <th className="table-th">Kode Barang</th>
                <th className="table-th">Spesifikasi Nama Barang</th>
                <th className="table-th">Kode Rekening</th>
                <th className="table-th text-right">Jumlah</th>
                <th className="table-th text-right">Harga Satuan</th>
                <th className="table-th text-right">Nilai Total</th>
                <th className="table-th">Keterangan</th>
                {canEdit && <th className="table-th w-28">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((it, i) => (
                <tr key={it.id}>
                  <td className="table-td text-xs">{it.no_urut ?? i + 1}</td>
                  <td className="table-td text-xs whitespace-nowrap">{it.kode || '—'}</td>
                  <td className="table-td text-xs text-gray-700">{it.nama_barang || '—'}</td>
                  <td className="table-td text-xs text-gray-500 whitespace-nowrap">{it.kode_rekening || '—'}</td>
                  <td className="table-td text-xs text-right whitespace-nowrap">{it.jumlah_kebutuhan ?? 0} {it.satuan || ''}</td>
                  <td className="table-td text-xs text-right whitespace-nowrap">{formatRupiah(it.harga_satuan)}</td>
                  <td className="table-td text-xs text-right whitespace-nowrap font-medium">{formatRupiah(it.total_anggaran)}</td>
                  <td className="table-td text-xs text-gray-500">{it.keterangan || '—'}</td>
                  {canEdit && (
                    <td className="table-td whitespace-nowrap">
                      <button onClick={() => { setEditItem(it); setShowForm(false) }} className="text-teal hover:underline text-xs font-medium mr-3">Edit</button>
                      <button onClick={() => hapusItem(it)} className="text-red-500 hover:text-red-700 text-xs font-medium">Hapus</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-100">
              <tr>
                <td className="table-td text-xs font-semibold" colSpan={6}>Subtotal kartu ini</td>
                <td className="table-td text-xs text-right font-bold whitespace-nowrap">{formatRupiah(total)}</td>
                <td className="table-td" colSpan={canEdit ? 2 : 1} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Daftar item datar (4 jenis RKBMD non-pengadaan) ─────────────────────────
function DaftarItemDatar({ header, items, canEdit, reloadIsi, onMsg }: {
  header: RkbmdHeader; items: RkbmdItem[]; canEdit: boolean
  reloadIsi: () => void; onMsg: (m: string) => void
}) {
  const supabase = createClient()
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<RkbmdItem | null>(null)
  useEffect(() => { setShowForm(false); setEditItem(null) }, [header.id])

  const formOpen = showForm || !!editItem

  async function hapusItem(it: RkbmdItem) {
    if (!confirm(`Hapus item ${it.kode || it.nama_barang || ''}?`)) return
    const { error } = await supabase.from('rkbmd_item').delete().eq('id', it.id)
    if (error) onMsg(`Error: ${error.message}`); else reloadIsi()
  }

  return (
    <>
      {canEdit && formOpen && (
        <RkbmdAsetForm
          jenis={header.jenis as Exclude<RkbmdJenis, 'pengadaan'>}
          rkbmdId={header.id} skpdId={header.skpd_id} editItem={editItem}
          onSaved={() => { setShowForm(false); setEditItem(null); reloadIsi() }}
          onCancel={() => { setShowForm(false); setEditItem(null) }}
        />
      )}

      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Daftar Item</h3>
          {canEdit
            ? (!formOpen && <button className="btn-primary text-xs py-1.5" onClick={() => { setEditItem(null); setShowForm(true) }}>+ Tambah Item</button>)
            : (header.status === 'disetujui' && <span className="text-xs text-gray-400">Terkunci — sudah disetujui</span>)}
        </div>
        {items.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Belum ada item.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-th">No</th>
                  <th className="table-th">Kode</th>
                  <th className="table-th">Nama Barang</th>
                  <th className="table-th text-right">Ringkasan</th>
                  <th className="table-th">Keterangan</th>
                  {canEdit && <th className="table-th">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((it, i) => (
                  <tr key={it.id}>
                    <td className="table-td text-xs">{it.no_urut ?? i + 1}</td>
                    <td className="table-td text-xs">{it.kode || it.nibar || '—'}</td>
                    <td className="table-td text-xs text-gray-700">{it.nama_barang || '—'}</td>
                    <td className="table-td text-xs text-right">{ringkasItem(header.jenis, it)}</td>
                    <td className="table-td text-xs text-gray-500">{it.keterangan || '—'}</td>
                    {canEdit && (
                      <td className="table-td whitespace-nowrap">
                        <button onClick={() => { setEditItem(it); setShowForm(false) }} className="text-teal hover:underline text-xs font-medium mr-3">Edit</button>
                        <button onClick={() => hapusItem(it)} className="text-red-500 hover:text-red-700 text-xs font-medium">Hapus</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

function ringkasItem(jenis: RkbmdJenis, it: RkbmdItem): string {
  switch (jenis) {
    case 'pengadaan':
      return `${it.jumlah_kebutuhan ?? 0} ${it.satuan || ''} · ${formatRupiah(it.total_anggaran)}`
    case 'pemeliharaan':
      return [it.kondisi, formatRupiah(it.total_anggaran)].filter(Boolean).join(' · ')
    case 'pemanfaatan':
      return [it.bentuk, it.jangka_waktu, it.estimasi_hasil != null ? formatRupiah(it.estimasi_hasil) : null]
        .filter(Boolean).join(' · ') || '—'
    case 'pemindahtanganan':
      return [it.bentuk, formatRupiah(it.nilai_perolehan)].filter(Boolean).join(' · ')
    case 'penghapusan':
      return formatRupiah(it.nilai_perolehan)
    default:
      return '—'
  }
}
