'use client'
// Standar Harga → Usulan. Layar milik operator SKPD: menyusun daftar standar
// harga yang diusulkan, lalu mengajukannya ke Pengelola Barang.
//
// Yang pertama dipilih adalah JENIS usulannya — SSH · HSPK · ASB · SBU ·
// Standar Kebutuhan (keputusan user 2026-08-13). Bentuk isiannya menyesuaikan:
// SSH/HSPK bersandar kode barang + harga + TKDN, ASB/SBU cuma besaran tanpa
// kode barang, SBSK memakai kuantitas standar per satuan pengukur — bukan harga.
//
// ⚠️ Isinya BELUM masuk bak bersama (`rkbmd_standar`) sampai DISETUJUI di menu
// Validasi. Itu bukan detail teknis yang bisa disembunyikan dari operator:
// selama masih di sini, barangnya belum bisa dipakai menyusun RKBMD Pengadaan,
// dan layar ini harus mengatakannya.
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import KodefikasiPicker, { type KodefikasiHasil } from '@/components/KodefikasiPicker'
import RekeningPicker from '@/components/RekeningPicker'
import StandarImport from '@/components/rkbmd/StandarImport'
import { backdropClose } from '@/components/backdropClose'
import { formatRupiah } from '@/lib/export'
import { SLOT_REKENING, type StandarJenis } from '@/lib/rkbmdStandar'
import {
  USULAN_JENIS, USULAN_STATUS_META, LABEL_NAMA, LABEL_NILAI,
  pakaiKodeBarang, pakaiHarga, pakaiTkdn, pakaiRekening, pakaiMerk, validasiItemUsulan,
  fetchUsulanSkpd, fetchUsulanItems, buatUsulan, simpanItem, hapusItem, hapusUsulan,
  setStatusUsulan, type UsulanJenis, type UsulanHeader, type UsulanItem,
} from '@/lib/rkbmdStandarUsulan'

const TAHUN_DEFAULT = new Date().getFullYear() + 1

export default function StandarUsulan() {
  const supabase = createClient()
  const [tahun, setTahun] = useState(TAHUN_DEFAULT)
  const [skpd, setSkpd] = useState('')
  const [jenis, setJenis] = useState<UsulanJenis>('ssh')

  const [headers, setHeaders] = useState<UsulanHeader[]>([])
  const [items, setItems] = useState<UsulanItem[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [modal, setModal] = useState<{ item: UsulanItem | null } | null>(null)
  const [impor, setImpor] = useState(false)

  // Usulan yang masih BERJALAN untuk jenis ini — itulah yang disunting.
  // Riwayat yang sudah selesai ditampilkan terpisah supaya operator bisa
  // melihat apa yang dulu ditetapkan tanpa mengira masih bisa diubah.
  const berjalan = headers.find(h => h.jenis === jenis && (h.status === 'draft' || h.status === 'ditolak' || h.status === 'diajukan')) || null
  const riwayat = headers.filter(h => h.jenis === jenis && h !== berjalan)
  const bisaSunting = !!berjalan && (berjalan.status === 'draft' || berjalan.status === 'ditolak')

  const loadHeaders = useCallback(async () => {
    if (!skpd) { setHeaders([]); setItems([]); return }
    setLoading(true); setErr('')
    try {
      setHeaders(await fetchUsulanSkpd(supabase, Number(skpd), tahun))
    } catch (e) {
      setHeaders([]); setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [skpd, tahun]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadHeaders() }, [loadHeaders])

  const loadItems = useCallback(async (id: string | undefined) => {
    if (!id) { setItems([]); return }
    try {
      setItems(await fetchUsulanItems(supabase, id))
    } catch (e) {
      setItems([]); setErr((e as Error).message)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadItems(berjalan?.id) }, [berjalan?.id, loadItems])

  async function jalankan(fn: () => Promise<void>, sukses: string) {
    setBusy(true); setErr(''); setMsg('')
    try {
      await fn()
      setMsg(sukses)
      await loadHeaders()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const cfgJenis = USULAN_JENIS.find(j => j.key === jenis)!

  // Baris yang belum lengkap. Diperiksa di layar DAFTAR, bukan cuma di pop-up:
  // baris bisa masuk lewat Import Excel, dan baris lama bisa saja tersimpan
  // sebelum aturan ini berlaku — dua-duanya tak pernah melewati pop-up.
  const barisCacat = items
    .map(it => ({ it, masalah: validasiItemUsulan(jenis, it) }))
    .filter(x => x.masalah.length > 0)

  return (
    <FormShell
      judul="Usulan Standar Harga"
      deskripsi="Susun usulan standar harga SKPD Anda, lalu ajukan ke Pengelola Barang. Isinya baru menjadi acuan bersama setelah divalidasi."
      msg={msg}
    >
      {err && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{err}</div>}

      <div className="card p-5 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tahun Anggaran</label>
            <input type="number" className="select-filter w-28" value={tahun}
              onChange={e => setTahun(Number(e.target.value) || TAHUN_DEFAULT)} />
          </div>
          <div className="min-w-[280px]">
            <label className="block text-xs text-gray-500 mb-1">SKPD / Lokasi</label>
            <SkpdCombobox lockToOperator value={skpd} onChange={id => { setSkpd(id); setMsg(''); setErr('') }}
              placeholder="Ketik nama SKPD..." />
          </div>
        </div>
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Pilih SKPD untuk mulai menyusun usulan.</div>
      ) : (
        <>
          {/* Jenis usulan dipilih PALING DULU — bentuk isiannya berbeda-beda. */}
          <div className="flex flex-wrap gap-1 mb-4 border-b border-gray-100">
            {USULAN_JENIS.map(j => (
              <button key={j.key} onClick={() => setJenis(j.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  jenis === j.key ? 'border-teal text-teal' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                {j.label}
                {headers.some(h => h.jenis === j.key && (h.status === 'draft' || h.status === 'ditolak')) && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 align-middle">draft</span>
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Memuat...</div>
          ) : !berjalan ? (
            <div className="card p-8 text-center">
              <p className="text-sm text-gray-500 mb-1">{cfgJenis.deskripsi}</p>
              <p className="text-xs text-gray-400 mb-4">
                Belum ada usulan {cfgJenis.label} yang sedang berjalan untuk SKPD ini, TA {tahun}.
              </p>
              <button className="btn-primary" disabled={busy}
                onClick={() => jalankan(async () => { await buatUsulan(supabase, Number(skpd), tahun, jenis) },
                  'Usulan dibuat (draft).')}>
                Buat Usulan {cfgJenis.label}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${USULAN_STATUS_META[berjalan.status].cls}`}>
                    {USULAN_STATUS_META[berjalan.status].label}
                  </span>
                  <span className="text-xs text-gray-400">{items.length} baris diusulkan</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Import Excel = jalan CEPAT mengisi usulan ini, bukan jalan
                      pintas ke acuan bersama (migrasi 20260814_01). SBSK belum
                      punya format importnya — bentuknya beda sendiri. */}
                  {bisaSunting && jenis !== 'sbsk' && (
                    <button className="btn-secondary text-sm" onClick={() => { setErr(''); setImpor(true) }}
                      disabled={busy}
                      title="Unduh format Excel, isi, lalu unggah — untuk memasukkan banyak baris sekaligus">
                      ⬆ Import Excel
                    </button>
                  )}
                  {bisaSunting && (
                    <button className="btn-primary text-sm" onClick={() => setModal({ item: null })} disabled={busy}>
                      + Tambah Baris
                    </button>
                  )}
                </div>
              </div>

              {berjalan.status === 'ditolak' && berjalan.catatan_telaah && (
                <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">
                  <span className="font-medium">Catatan telaah:</span> {berjalan.catatan_telaah}
                  <span className="block text-xs mt-1 text-red-600/80">Perbaiki lalu ajukan ulang.</span>
                </div>
              )}

              {berjalan.status === 'diajukan' && (
                <div className="p-3 rounded-lg bg-amber-50 text-amber-800 text-sm">
                  Usulan sedang ditelaah Pengelola Barang — barisnya terkunci sampai ada keputusan.
                </div>
              )}

              {barisCacat.length > 0 && bisaSunting && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                  <span className="font-medium">{barisCacat.length} baris belum lengkap</span> — ditandai ⚠ di
                  tabel. Semua kolom wajib diisi (kode rekening cukup yang paling atas) sebelum usulan bisa diajukan.
                </div>
              )}

              <TabelItem jenis={jenis} items={items} bisaSunting={bisaSunting} busy={busy}
                onEdit={it => setModal({ item: it })}
                onHapus={it => {
                  // `confirm` diperiksa DI LUAR `jalankan`: kalau dibatalkan dari
                  // dalam, satu-satunya cara keluar adalah melempar — dan
                  // lemparannya bakal tampil sebagai pesan error, padahal
                  // operator cuma menekan Batal.
                  if (!confirm(`Hapus baris "${it.nama}"?`)) return
                  jalankan(async () => {
                    await hapusItem(supabase, it.id)
                    await loadItems(berjalan.id)
                  }, 'Baris dihapus.')
                }} />

              {/* Bilah penutup: yang MENGAKHIRI usulan, sejajar pola menu RKBMD. */}
              <div className="card p-4 flex flex-wrap items-center justify-end gap-2">
                {bisaSunting && (
                  <>
                    {/* Tombolnya TIDAK dimatikan saat ada baris cacat — yang
                        dimatikan cuma kasus "belum ada baris sama sekali", di
                        mana keadaannya sudah jelas dari layar. Untuk baris yang
                        belum lengkap, penolakan berikut ALASANNYA jauh lebih
                        berguna daripada tombol mati yang tak berkata apa-apa. */}
                    <button className="btn-primary" disabled={busy || items.length === 0}
                      title={items.length === 0 ? 'Tambahkan minimal satu baris dulu' : undefined}
                      onClick={() => {
                        if (barisCacat.length > 0) {
                          setMsg('')
                          setErr(`Belum bisa diajukan — ${barisCacat.length} baris masih kurang lengkap: `
                            + barisCacat.slice(0, 3).map(x => `"${x.it.nama}" (${x.masalah.join(', ')})`).join('; ')
                            + (barisCacat.length > 3 ? `; dan ${barisCacat.length - 3} baris lainnya.` : '.'))
                          return
                        }
                        jalankan(async () => {
                          await setStatusUsulan(supabase, berjalan.id, 'diajukan')
                        }, 'Usulan diajukan ke Pengelola Barang.')
                      }}>
                      {berjalan.status === 'ditolak' ? 'Ajukan ulang' : 'Ajukan'}
                    </button>
                    <button className="text-sm text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-200"
                      disabled={busy}
                      onClick={() => {
                        if (!confirm(`Hapus usulan ${cfgJenis.label} ini beserta ${items.length} barisnya?`)) return
                        jalankan(async () => { await hapusUsulan(supabase, berjalan.id) }, 'Usulan dihapus.')
                      }}>
                      Hapus usulan
                    </button>
                  </>
                )}
                {berjalan.status === 'diajukan' && (
                  <button className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200"
                    disabled={busy}
                    onClick={() => jalankan(async () => { await setStatusUsulan(supabase, berjalan.id, 'draft') },
                      'Pengajuan ditarik kembali ke draft.')}>
                    Tarik kembali
                  </button>
                )}
              </div>
            </div>
          )}

          {riwayat.length > 0 && (
            <div className="card p-4 mt-4">
              <p className="text-xs font-semibold text-gray-500 mb-2">RIWAYAT USULAN {cfgJenis.label.toUpperCase()} TA {tahun}</p>
              <div className="space-y-1">
                {riwayat.map(h => (
                  <p key={h.id} className="text-xs text-gray-500">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full mr-2 ${USULAN_STATUS_META[h.status].cls}`}>
                      {USULAN_STATUS_META[h.status].label}
                    </span>
                    diajukan {h.diajukan_at?.slice(0, 10) || '—'}
                    {h.approved_at && ` · ditetapkan ${h.approved_at.slice(0, 10)}`}
                  </p>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {impor && berjalan && jenis !== 'sbsk' && (
        <StandarImport
          jenis={jenis as StandarJenis} tahun={tahun} usulanId={berjalan.id}
          nomorBerikut={Math.max(0, ...items.map(i => i.no_urut || 0)) + 1}
          onClose={() => setImpor(false)}
          // Tetap terbuka sesudah impor: ringkasannya (berapa masuk, berapa
          // dilewati) ada di pesan itu, dan menutup pop-up sendiri akan
          // membuangnya sebelum sempat dibaca.
          onSelesai={async (m) => { setMsg(m); await loadItems(berjalan.id) }}
        />
      )}

      {modal && berjalan && (
        <ItemModal
          jenis={jenis} tahun={tahun} usulanId={berjalan.id} item={modal.item}
          nomorBerikut={Math.max(0, ...items.map(i => i.no_urut || 0)) + 1}
          onTutup={() => setModal(null)}
          onTersimpan={async (pesan) => {
            setModal(null); setMsg(pesan); setErr('')
            await loadItems(berjalan.id)
          }}
        />
      )}
    </FormShell>
  )
}

// ── Tabel baris usulan ──────────────────────────────────────────────────────
function TabelItem({ jenis, items, bisaSunting, busy, onEdit, onHapus }: {
  jenis: UsulanJenis; items: UsulanItem[]; bisaSunting: boolean; busy: boolean
  onEdit: (it: UsulanItem) => void; onHapus: (it: UsulanItem) => void
}) {
  const adaKode = pakaiKodeBarang(jenis)
  const adaRek = pakaiRekening(jenis)
  const sbsk = jenis === 'sbsk'
  const kolom = 3 + (adaKode ? 1 : 0) + (adaRek ? 1 : 0) + (sbsk ? 1 : 0) + (bisaSunting ? 1 : 0)

  return (
    <div className="card overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            <th className="table-th w-10">No</th>
            {adaKode && <th className="table-th">Kode Barang</th>}
            <th className="table-th">{LABEL_NAMA[jenis]}</th>
            <th className="table-th">Satuan</th>
            {sbsk && <th className="table-th">Satuan Pengukur</th>}
            <th className="table-th text-right">{LABEL_NILAI[jenis]}</th>
            {adaRek && <th className="table-th">Kode Rekening</th>}
            {bisaSunting && <th className="table-th w-24">Aksi</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {items.length === 0 ? (
            <tr><td colSpan={kolom + 1} className="table-td text-center py-8 text-gray-400">
              Belum ada baris. Tekan <span className="font-medium">+ Tambah Baris</span> untuk mengisi.
            </td></tr>
          ) : items.map((it, i) => {
            const masalah = validasiItemUsulan(jenis, it)
            return (
            <tr key={it.id} className={masalah.length > 0 ? 'bg-amber-50/60' : ''}>
              <td className="table-td text-xs text-gray-400">{it.no_urut ?? i + 1}</td>
              {adaKode && <td className="table-td text-xs whitespace-nowrap">{it.kode || '—'}</td>}
              <td className="table-td text-xs text-gray-800">
                {masalah.length > 0 && (
                  <span className="text-amber-600 mr-1" title={masalah.join(' · ')}>⚠</span>
                )}
                {it.nama}
                {it.merk_tipe && <span className="block text-[11px] text-gray-400">{it.merk_tipe}</span>}
                {masalah.length > 0 && (
                  <span className="block text-[11px] text-amber-600">{masalah.join(' · ')}</span>
                )}
              </td>
              <td className="table-td text-xs text-gray-500">{it.satuan || '—'}</td>
              {sbsk && <td className="table-td text-xs text-gray-500">{it.satuan_pengukur || '—'}</td>}
              <td className="table-td text-xs text-right whitespace-nowrap">
                {sbsk ? (it.kuantitas_standar ?? '—') : formatRupiah(it.harga)}
                {pakaiTkdn(jenis) && it.tkdn != null && (
                  <span className="block text-[10px] text-gray-400">TKDN {it.tkdn}%</span>
                )}
              </td>
              {adaRek && (
                <td className="table-td text-[11px] text-gray-500">
                  {it.rekening.length === 0 ? '—' : it.rekening.map(k => <div key={k}>{k}</div>)}
                </td>
              )}
              {bisaSunting && (
                <td className="table-td whitespace-nowrap">
                  <button onClick={() => onEdit(it)} disabled={busy}
                    className="text-gray-500 hover:text-gray-700 text-xs mr-3">✎ Ubah</button>
                  <button onClick={() => onHapus(it)} disabled={busy}
                    className="text-red-500 hover:text-red-700 text-xs">🗑</button>
                </td>
              )}
            </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Penanda kolom wajib. Semua kolom yang TAMPIL memang wajib (keputusan user
 *  2026-08-16), tapi tetap ditandai satu per satu — kalimat pengantar di atas
 *  form gampang terlewat, tanda di sebelah labelnya tidak. */
const Wajib = () => <span className="text-red-500" title="wajib diisi">*</span>

// ── Pop-up satu baris usulan ────────────────────────────────────────────────
// Bentuk isian menyesuaikan jenis. Aturannya KEMBAR dengan
// `fn_standar_usulan_item_guard` (migrasi 20260813_03) — penegak sesungguhnya
// trigger itu; yang di sini cuma supaya operator dapat pesan sebelum menyimpan.
function ItemModal({ jenis, tahun, usulanId, item, nomorBerikut, onTutup, onTersimpan }: {
  jenis: UsulanJenis; tahun: number; usulanId: string; item: UsulanItem | null
  nomorBerikut: number
  onTutup: () => void
  onTersimpan: (pesan: string) => void
}) {
  const supabase = createClient()
  const editing = !!item
  const adaKode = pakaiKodeBarang(jenis)
  const adaHarga = pakaiHarga(jenis)
  const adaTkdn = pakaiTkdn(jenis)
  const adaRek = pakaiRekening(jenis)
  const adaMerk = pakaiMerk(jenis)
  const sbsk = jenis === 'sbsk'

  const [picked, setPicked] = useState<KodefikasiHasil | null>(
    item?.kode ? ({ kode: item.kode, uraian: item.nama } as KodefikasiHasil) : null)
  const [nama, setNama] = useState(item?.nama || '')
  const [merk, setMerk] = useState(item?.merk_tipe || '')
  const [satuan, setSatuan] = useState(item?.satuan || '')
  const [harga, setHarga] = useState(item?.harga != null ? String(item.harga) : '')
  const [tkdn, setTkdn] = useState(item?.tkdn != null ? String(item.tkdn) : '')
  const [kuantitas, setKuantitas] = useState(item?.kuantitas_standar != null ? String(item.kuantitas_standar) : '')
  const [satuanPengukur, setSatuanPengukur] = useState(item?.satuan_pengukur || '')
  const [keterangan, setKeterangan] = useState(item?.keterangan || '')
  const [rekening, setRekening] = useState<string[]>(() => {
    const awal = item?.rekening ?? []
    return Array.from({ length: Math.max(SLOT_REKENING, awal.length) }, (_, i) => awal[i] || '')
  })
  const [satuanList, setSatuanList] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.from('admin_satuan_bmd').select('nama').order('nama')
      .then(({ data }) => setSatuanList(((data || []) as { nama: string }[]).map(s => s.nama)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Nilai yang akan disimpan — dirakit sekali & dipakai bersama oleh pemeriksa
  // dan penyimpan, supaya yang divalidasi PERSIS yang masuk DB.
  const isian = {
    kode: adaKode ? (picked?.kode ?? null) : null,
    nama: nama.trim(),
    merk_tipe: adaMerk ? (merk.trim() || null) : null,
    satuan: satuan || null,
    harga: adaHarga && harga.trim() !== '' ? Number(harga) : null,
    tkdn: adaTkdn && tkdn.trim() !== '' ? Number(tkdn) : null,
    kuantitas_standar: sbsk && kuantitas.trim() !== '' ? Number(kuantitas) : null,
    satuan_pengukur: sbsk ? (satuanPengukur.trim() || null) : null,
    keterangan: keterangan.trim() || null,
    // Dedup di dalam form: dua slot berisi rekening yang sama akan ditolak
    // UNIQUE (item_id, kode_rekening) dengan pesan mentah.
    rekening: adaRek ? [...new Set(rekening.map(r => r.trim()).filter(Boolean))] : [],
  }
  // Ditampilkan HIDUP di bawah tombol, bukan cuma saat Simpan ditekan: operator
  // melihat apa yang masih kurang sambil mengisi, bukan sesudah mengira selesai.
  const masalah = validasiItemUsulan(jenis, isian)

  async function simpan() {
    if (masalah.length > 0) { setErr(masalah.join(' · ') + '.'); return }

    setSaving(true); setErr('')
    try {
      await simpanItem(supabase, usulanId, {
        id: item?.id,
        no_urut: item?.no_urut ?? nomorBerikut,
        ...isian,
      })
      onTersimpan(editing ? 'Baris diperbarui.' : 'Baris ditambahkan ke usulan.')
    } catch (e) {
      setErr((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onTutup)}>
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h3 className="font-semibold text-gray-800">
            {editing ? 'Ubah' : 'Tambah'} baris — usulan {USULAN_JENIS.find(j => j.key === jenis)!.label} TA {tahun}
          </h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onTutup}>×</button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-400">
            Semua kolom wajib diisi. Kode Rekening Belanja cukup <span className="font-medium">kolom
            paling atas</span> — slot berikutnya hanya bila barangnya dibebankan ke lebih dari satu rekening.
          </p>

          {adaKode && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Jenis Aset &amp; Kode Barang <Wajib /></label>
              <KodefikasiPicker picked={picked} onPick={r => {
                setPicked(r)
                if (r) setNama(prev => prev || r.uraian || '')
              }} />
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">{LABEL_NAMA[jenis]} <Wajib /></label>
            <input className="select-filter w-full" value={nama} onChange={e => setNama(e.target.value)} />
          </div>

          {/* Merk/Tipe tepat DI BAWAH Spesifikasi Nama Barang (permintaan user
              2026-08-13) — itu urutan orang membacanya: barang apa, lalu merk apa.
              ⚠️ Hanya untuk jenis ber-BARANG NYATA (`pakaiMerk`): ASB itu
              komponen belanja kegiatan & SBU honorarium/perjalanan dinas, yang
              tak punya merk sama sekali — mewajibkannya di sana cuma memaksa
              operator mengarang isian. Sama dgn kolom format import.
              ⚠️ Merk TIDAK ikut menentukan identitas dedup: dua SKPD yang
              mengusulkan barang identik dengan merk berbeda tetap jadi SATU baris
              di acuan bersama, dan merk pengusul pertama yang tercatat. */}
          {adaMerk && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Merk / Tipe <Wajib /></label>
              <input className="select-filter w-full" value={merk} onChange={e => setMerk(e.target.value)}
                placeholder="mis. Asus ExpertBook B1, Honda Vario 160" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Satuan <Wajib /></label>
              <select className="select-filter w-full" value={satuan} onChange={e => setSatuan(e.target.value)}>
                <option value="">— pilih satuan —</option>
                {satuanList.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {adaHarga ? (
              <div>
                <label className="block text-xs text-gray-500 mb-1">{LABEL_NILAI[jenis]} (Rp) <Wajib /></label>
                <input type="number" min={0} step="any" className="select-filter w-full"
                  value={harga} onChange={e => setHarga(e.target.value)} />
              </div>
            ) : (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Kuantitas Standar <Wajib /></label>
                <input type="number" min={0} step="any" className="select-filter w-full"
                  value={kuantitas} onChange={e => setKuantitas(e.target.value)} />
              </div>
            )}
          </div>

          {sbsk && (
            <div className="max-w-sm">
              <label className="block text-xs text-gray-500 mb-1">Satuan Pengukur <Wajib /></label>
              <input className="select-filter w-full" value={satuanPengukur}
                onChange={e => setSatuanPengukur(e.target.value)}
                placeholder="mis. per pegawai, per ruang kerja, per unit kendaraan" />
              <p className="text-[11px] text-gray-400 mt-1">
                Standar Kebutuhan menyatakan BERAPA BANYAK per apa — bukan berapa harganya.
              </p>
            </div>
          )}

          {adaRek && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Kode Rekening Belanja <Wajib />
                <span className="text-gray-400"> — minimal yang paling atas, boleh lebih dari satu</span>
              </label>
              <div className="space-y-2">
                {rekening.map((k, i) => (
                  <RekeningPicker key={i} value={k}
                    onChange={v => setRekening(prev => prev.map((x, j) => (j === i ? v : x)))} />
                ))}
              </div>
            </div>
          )}

          {adaTkdn && (
            <div className="max-w-xs">
              <label className="block text-xs text-gray-500 mb-1">TKDN (%) <Wajib /></label>
              <input type="number" min={0} max={100} step="any" className="select-filter w-full"
                value={tkdn} onChange={e => setTkdn(e.target.value)}
                placeholder="0 – 100" />
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">Keterangan <Wajib /></label>
            <input className="select-filter w-full" value={keterangan} onChange={e => setKeterangan(e.target.value)} />
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
          {/* Daftar kekurangan ditampilkan SEBELUM tombol ditekan. Tombolnya
              sendiri sengaja TIDAK dimatikan: tombol mati tanpa keterangan
              adalah bentuk kegagalan senyap — operator menekan, tak terjadi
              apa-apa, dan ia tak punya cara tahu kenapa. */}
          {masalah.length > 0 && (
            <ul className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-0.5">
              {masalah.map(t => <li key={t}>• {t}</li>)}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={onTutup} disabled={saving}>Batal</button>
            <button className="btn-primary" onClick={simpan} disabled={saving}>
              {saving ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Tambah'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
