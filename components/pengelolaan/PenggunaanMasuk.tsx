'use client'
// Penggunaan — sisi TERIMA Pengalihan Status Penggunaan (transfer masuk antar
// SKPD). Pasangan dari jenis "Pengalihan Status" di menu Penghapusan (sisi
// keluar). Lihat migrasi 20260704_21_pengalihan_status.sql.
//
//   - Jurnal masuk berstatus 'pending' → SKPD tujuan me-review barang + dokumen
//     sumber, lalu TERIMA (RPC fn_terima_pengalihan: insert ledger
//     'pengalihan_status' + pindahkan aset.skpd_id, atomik) atau TOLAK
//     (fn_tolak_pengalihan: status 'ditolak' + alasan; draft utuh di SKPD asal).
//   - Riwayat disetujui ditampilkan dari ledger (baris reversal = barang yang
//     pengalihannya sudah dibatalkan, tidak ditampilkan sbg anggota).
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatRupiah } from '@/lib/export'
import { fetchBatalTargets, BATAL_TARGET_JENIS } from '@/lib/voidedAset'
import SkpdCombobox from '@/components/SkpdCombobox'
import { useKonfirmasi } from '@/shared/ui/konfirmasi'

type DraftItem = {
  aset_id: string; nibar: string | null; kode: string; nama_barang: string | null
  merek_tipe: string | null; jumlah: number; satuan: string | null; nilai: number
}
type Header = {
  id: string
  no_sk: string
  tanggal: string
  periode: string
  keterangan: string | null
  skpd_id: number
  skpd_tujuan: number
  approval_status: string
  rejected_reason: string | null
  payload: { dokumen_paths?: string[]; draft_items?: DraftItem[] } | null
}
// `dikembalikan` = baris ledger TERBARU aset ini di kartu tsb ber-`reversal`,
// artinya barangnya sudah dipulangkan ke SKPD asal. Barisnya TETAP ditampilkan
// sebagai riwayat (pola yang sama dgn Pemanfaatan "Selesai" & Pengamanan
// "Dikembalikan") — sebelumnya dibuang total dari daftar, akibatnya tombol
// Batal tak pernah bisa dijangkau untuk barang yang terlanjur dikembalikan,
// padahal justru itu kasus yang paling butuh dibatalkan (salah pencet lalu
// buru-buru dipulangkan di hari yang sama).
type Line = DraftItem & { dikembalikan?: boolean }
type Jurnal = Header & { lines: Line[]; total: number }

const namaFile = (path: string) => path.split('/').pop() || path

export default function PenggunaanMasuk() {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
  const [skpd, setSkpd] = useState('')
  const [jurnals, setJurnals] = useState<Jurnal[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [errLoad, setErrLoad] = useState('')

  useEffect(() => {
    (async () => {
      const rows: { id: number; nama: string }[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        rows.push(...data)
        if (data.length < 1000) break
      }
      setSkpdList(rows)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ⚠️ Badan fungsi di dalam try, `setLoading(false)` di FINALLY —
  // `fetchBatalTargets` MELEMPAR (fail-closed). Tanpa ini halaman membeku di
  // "Memuat..." tanpa keterangan; lihat aturan kolektor fail-closed di CLAUDE.md.
  const load = useCallback(async (skpdId: string) => {
    if (!skpdId) { setJurnals([]); setErrLoad(''); return }
    setLoading(true); setErrLoad('')
    try {
    const { data: headers } = await supabase.from('jurnal_header')
      .select('id,no_sk,tanggal,periode,keterangan,skpd_id,skpd_tujuan,approval_status,rejected_reason,payload')
      .eq('kategori', 'pengalihan_status')
      .eq('skpd_tujuan', Number(skpdId))
      .order('tanggal', { ascending: false })
    const hs = (headers || []) as unknown as Header[]

    const jmap = new Map<string, Jurnal>()
    for (const h of hs) jmap.set(h.id, { ...h, lines: [], total: 0 })

    // Pending/ditolak: barang dari draft. Disetujui: dari ledger (skip reversal).
    for (const j of jmap.values()) {
      if (j.approval_status !== 'disetujui') {
        for (const d of j.payload?.draft_items || []) { j.lines.push(d); j.total += d.nilai }
      }
    }
    const approvedIds = hs.filter(h => h.approval_status === 'disetujui').map(h => h.id)
    if (approvedIds.length > 0) {
      const { data } = await supabase.from('transaksi_bmd')
        .select('id,header_id,nilai,payload,aset:aset_id(id,nibar,nama_barang,kode,merek_tipe,jumlah,satuan)')
        .eq('jenis', 'pengalihan_status')
        .in('header_id', approvedIds)
        .order('id', { ascending: false })
      const rows = (data || []) as unknown as {
        id: number; header_id: string; nilai: number; payload: { reversal?: boolean } | null
        aset: { id: string; nibar: string | null; nama_barang: string | null; kode: string; merek_tipe: string | null; jumlah: number; satuan: string | null } | null
      }[]
      // Baris ledger yang DIBATALKAN — per ID BARIS, bukan per (kartu, barang).
      // Beda perlakuan dari "Dikembalikan": dikembalikan = peristiwa nyata,
      // tetap tampil sebagai riwayat; DIBATALKAN = dianggap tak pernah terjadi,
      // jadi barisnya keluar TOTAL dari kartu.
      //
      // ⚠️ DULU di-kunci `header|aset` dan itu SALAH sejak kartu bisa diterima
      // ULANG (migrasi 20260811_02): satu `batal_pengalihan` lama membuat
      // SELURUH baris barang itu di kartu tsb ikut tersapu — termasuk
      // penerimaan BARU yang sah. Akibatnya barang benar-benar pindah tapi
      // kartunya lenyap dari kedua sisi, pengirim maupun penerima. Yang
      // otoritatif adalah `payload.target_trx_ids`, dan itu yang dibaca
      // fetchBatalTargets — sumber yang sama dipakai Rekonsiliasi & Laporan BMD.
      const dibatalkan = await fetchBatalTargets(
        supabase, BATAL_TARGET_JENIS.pengalihan,
        rows.map(r => r.aset?.id).filter((x): x is string => !!x),
      )

      const seen = new Set<string>()
      for (const r of rows) {
        if (!r.aset) continue
        const key = `${r.header_id}|${r.aset.id}`
        if (seen.has(key)) continue
        seen.add(key)
        if (dibatalkan.has(r.id)) continue
        // Baris terbaru ber-reversal = sudah dipulangkan. DITAMPILKAN sebagai
        // riwayat, bukan dibuang — lihat catatan di type Line.
        const dikembalikan = !!r.payload?.reversal
        const j = jmap.get(r.header_id)
        if (!j) continue
        j.lines.push({
          aset_id: r.aset.id, nibar: r.aset.nibar, kode: r.aset.kode, nama_barang: r.aset.nama_barang,
          merek_tipe: r.aset.merek_tipe, jumlah: r.aset.jumlah, satuan: r.aset.satuan, nilai: r.nilai,
          dikembalikan,
        })
        // Barang yang sudah pulang TIDAK ikut total kartu — totalnya menyatakan
        // nilai yang saat ini dikuasai SKPD penerima.
        if (!dikembalikan) j.total += r.nilai
      }
    }
    setJurnals([...jmap.values()].filter(j => j.lines.length > 0))
    } catch (e) {
      setJurnals([])
      setErrLoad(`Gagal memuat pengalihan masuk: ${e instanceof Error ? e.message : String(e)}. Daftar tidak ditampilkan supaya tak terbaca sebagai "belum ada pengalihan masuk".`)
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(skpd) }, [skpd, load])

  // Tanggal perpindahan = TANGGAL DOKUMEN (j.tanggal), bukan hari ini —
  // migrasi 20260811_02. Disebut eksplisit di konfirmasi karena itulah yang
  // menentukan periode laporannya, dan dulu bedanya baru ketahuan setelah
  // angkanya muncul di semester yang salah.
  async function terima(j: Jurnal) {
    await konfirmasi({
      nada: 'teal', ikon: '📥', judul: 'Terima barang pengalihan ini?',
      subjudul: `No. ${j.no_sk} · dari ${namaSkpd(j.skpd_id)}`,
      rincian: [
        { label: 'Barang diterima', nilai: `${j.lines.length} barang` },
        // Inilah satu-satunya angka di layar ini yang salahnya langsung
        // mendarat di semester laporan yang keliru — jadi ia baris tersendiri,
        // bukan diselipkan di kalimat (migrasi 20260811_02).
        { label: 'Dicatat pada tanggal', nilai: `${j.tanggal} (${j.periode})` },
      ],
      isi: <>Barangnya <b>resmi berpindah</b> ke SKPD ini dan mulai tampil di Daftar Barang,
        Penyusutan, &amp; laporan BMD sejak periode itu.</>,
      peringatan: <>Tanggalnya <b>tanggal dokumen, bukan hari ini</b>. Kalau keliru, minta SKPD asal
        membetulkannya dulu — jangan diterima sekarang.</>,
      labelYa: 'Ya, terima',
      kerjakan: async () => {
        setBusy(true)
        const { data, error } = await supabase.rpc('fn_terima_pengalihan', { p_header_id: j.id })
        setBusy(false)
        if (error) { setMsg(`Error: ${error.message}`); return }
        setMsg(`${data} barang diterima — resmi tercatat di SKPD ini.`)
        load(skpd)
      },
    })
  }

  async function tolak(j: Jurnal) {
    await konfirmasi({
      nada: 'merah', ikon: '↩', judul: 'Tolak pengalihan ini?',
      subjudul: `No. ${j.no_sk} · dari ${namaSkpd(j.skpd_id)}`,
      rincian: [{ label: 'Barang di kartu', nilai: `${j.lines.length} barang` }],
      isi: <>Tak ada barang yang berpindah. SKPD asal bisa merevisi kartunya lalu mengajukan lagi,
        atau menghapusnya.</>,
      catatan: {
        label: 'Alasan penolakan',
        placeholder: 'Mis. barangnya tidak sesuai BAST; tanggal dokumen keliru (tertulis 2026-03-31, seharusnya 2026-04-02).',
        petunjuk: <>Dikirim balik ke SKPD asal. Boleh dikosongkan, tapi mereka tak akan tahu apa yang
          harus diperbaiki.</>,
      },
      labelYa: 'Ya, tolak',
      kerjakan: async (alasan) => {
        setBusy(true)
        const { error } = await supabase.rpc('fn_tolak_pengalihan', { p_header_id: j.id, p_alasan: alasan })
        setBusy(false)
        if (error) { setMsg(`Error: ${error.message}`); return }
        setMsg('Pengalihan ditolak — SKPD asal bisa merevisi atau menghapus jurnalnya.')
        load(skpd)
      },
    })
  }

  // ⚠️ AKSI "Kembalikan" SUDAH DICABUT (keputusan user 2026-08-12, migrasi
  // 20260812_05) — menyusul mutasi internal. Pengembalian yang SUNGGUHAN punya
  // dokumennya sendiri, jadi bentuk yang benar adalah kartu Pengalihan Status
  // BARU ke arah sebaliknya; baris reversal yang digantungkan pada kartu lama
  // justru menempelkan peristiwa periode BERJALAN pada dokumen bertanggal
  // periode lampau.
  //
  // Yang MEMBACA `payload.reversal` di bawah SENGAJA DIPERTAHANKAN dan tidak
  // boleh dicabut: 2 baris reversal sudah terlanjur ada di ledger (Juli 2026),
  // dan ledger itu append-only — riwayatnya wajib tetap terbaca benar
  // selamanya. Yang dicabut cuma pembuatnya.
  //
  // BATAL ≠ KEMBALIKAN — dua-duanya memulangkan barang, tapi artinya beda dan
  // jejaknya beda. Kembalikan: barang memang sempat dipakai di sini lalu
  // dipulangkan; dua peristiwa nyata, keduanya tetap terbaca laporan. Batal:
  // KOREKSI salah pilih barang — pengalihannya dianggap TAK PERNAH TERJADI,
  // barisnya diabaikan pembaca, dan kode register barang dipulihkan seperti
  // semula (tanda ⚠ di Daftar Barang ikut padam).
  // Pembedaan yang sama sudah lama ada di Pemanfaatan (⏹ Akhiri vs 🗑 Batal) &
  // Pengamanan; Pengalihan yang terakhir menyusul.
  async function batalPengalihan(j: Jurnal, l: Line) {
    await konfirmasi({
      nada: 'amber', ikon: '↩', judul: 'Batalkan pengalihan barang ini?',
      subjudul: l.nama_barang || l.nibar || 'barang ini',
      rincian: [{ label: 'Barang kembali ke', nilai: namaSkpd(j.skpd_id) }],
      isi: <>Pengalihannya dianggap <b>tidak pernah terjadi</b>: barang balik ke SKPD asal, barisnya
        diabaikan seluruh laporan, dan kode registernya dipulihkan seperti semula.</>,
      // ⚠️ Teks lama di sini masih menyuruh memakai "Kembalikan" — tombol yang
      // DICABUT 2026-08-12 (migrasi 20260812_05). Petunjuk ke tombol yang sudah
      // tidak ada bukan cuma tak menolong; ia membuat operator mencari-cari lalu
      // menekan Batal juga, tapi dengan mengira artinya sama.
      peringatan: <>Ini untuk <b>salah pilih barang</b>. Pengembalian yang sungguhan — barang memang
        sempat dipakai di sini lalu dipulangkan — dicatat sebagai <b>kartu Pengalihan Status baru ke
        arah sebaliknya</b>, bukan dari sini.</>,
      labelYa: 'Ya, batalkan',
      kerjakan: async () => {
        setBusy(true)
        const { error } = await supabase.rpc('fn_batal_pengalihan_barang', { p_header_id: j.id, p_aset_id: l.aset_id })
        setBusy(false)
        if (error) { setMsg(`Error: ${error.message}`); return }
        setMsg(`Pengalihan dibatalkan — barang dianggap tidak pernah pindah dari ${namaSkpd(j.skpd_id)}.`)
        load(skpd)
      },
    })
  }

  // Batal SELURUH kartu. Bukan sekadar pintasan dari mengklik Batal satu per
  // satu: kartu yang seluruh barangnya dibatalkan KEMBALI ke "Menunggu
  // Persetujuan" (migrasi 20260811_02), jadi bisa diterima ulang tanpa SKPD
  // pengirim membuat kartu baru. Itu jalan resmi untuk membetulkan penerimaan
  // yang tanggalnya keliru. Kalau berhenti di tengah, seluruhnya batal — satu
  // transaksi di server.
  async function batalSeluruh(j: Jurnal) {
    await konfirmasi({
      nada: 'amber', ikon: '↩', judul: 'Batalkan SELURUH pengalihan ini?',
      subjudul: `No. ${j.no_sk} · dari ${namaSkpd(j.skpd_id)}`,
      rincian: [
        { label: 'Barang dibatalkan', nilai: `${j.lines.length} barang` },
        { label: 'Kembali ke', nilai: namaSkpd(j.skpd_id) },
      ],
      isi: <>Kartunya balik ke <b>&ldquo;Menunggu Persetujuan&rdquo;</b> sehingga bisa Anda terima
        ULANG — SKPD pengirim tak perlu entry ulang. Inilah jalan resmi membetulkan penerimaan yang
        tanggalnya keliru.</>,
      peringatan: <>Berlaku satu paket: kalau berhenti di tengah, seluruhnya batal. Pengembalian yang
        sungguhan dicatat sebagai <b>kartu baru ke arah sebaliknya</b>, bukan dari sini.</>,
      labelYa: 'Ya, batalkan seluruhnya',
      kerjakan: async () => {
        setBusy(true)
        const { data, error } = await supabase.rpc('fn_batal_seluruh_pengalihan', { p_header_id: j.id })
        setBusy(false)
        if (error) { setMsg(`Error: ${error.message}`); return }
        setMsg(`${data} barang dibatalkan — kartu ${j.no_sk} kembali menunggu persetujuan & siap diterima ulang.`)
        load(skpd)
      },
    })
  }

  async function bukaDokumen(path: string) {
    const { data } = await supabase.storage.from('dokumen-sumber').createSignedUrl(path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const namaSkpd = (id: number | null) => skpdList.find(s => s.id === id)?.nama || '-'

  const pendings = jurnals.filter(j => j.approval_status === 'pending')
  const riwayat = jurnals.filter(j => j.approval_status !== 'pending')

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Penggunaan</h1>
        <p className="text-gray-500 text-sm mt-1">
          BMD masuk dari SKPD lain (Pengalihan Status Penggunaan). Jurnal pending menunggu persetujuan SKPD ini — periksa barang & dokumen sumber, lalu Terima atau Tolak. Kalau ada barang yang salah masuk, pakai Batal — pengalihannya dianggap tak pernah terjadi dan barang balik ke SKPD asal. Untuk memulangkan barang yang memang sempat dipakai di sini, buat kartu Pengalihan Status baru ke arah sebaliknya.
        </p>
      </div>

      {msg && <div className="mb-4 px-4 py-3 rounded-lg bg-teal/10 text-teal text-sm">{msg}</div>}

      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">SKPD Penerima :</label>
          <SkpdCombobox lockToOperator value={skpd} onChange={id => { setSkpd(id); setMsg('') }} rootOnly
            placeholder="Ketik nama SKPD..." />
        </div>
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Pilih SKPD untuk melihat pengalihan masuk.</div>
      ) : errLoad ? (
        <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{errLoad}</div>
      ) : loading ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Memuat...</div>
      ) : jurnals.length === 0 ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Belum ada pengalihan masuk untuk SKPD ini.</div>
      ) : (
        <div className="space-y-4">
          {[...pendings, ...riwayat].map(j => {
            const pending = j.approval_status === 'pending'
            const ditolak = j.approval_status === 'ditolak'
            const disetujui = j.approval_status === 'disetujui'
            return (
              <div key={j.id} className={`card overflow-hidden ${pending ? 'border-amber-300' : ''}`}>
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
                  <div className="flex items-start justify-between gap-4">
                    <div className="text-sm space-y-0.5">
                      <p className="font-semibold text-gray-800">
                        No. Dokumen: {j.no_sk}
                        <span className={`ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          pending ? 'bg-amber-100 text-amber-700'
                          : ditolak ? 'bg-red-100 text-red-700'
                          : 'bg-green-100 text-green-700'
                        }`}>
                          {pending ? 'Menunggu Persetujuan' : ditolak ? 'Ditolak' : 'Diterima'}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500">
                        Dari: <span className="font-medium">{namaSkpd(j.skpd_id)}</span>
                        {' · '}Tgl. {j.tanggal} · {j.periode}
                      </p>
                      {j.keterangan && <p className="text-xs text-gray-500">Keterangan: {j.keterangan}</p>}
                      {ditolak && j.rejected_reason && (
                        <p className="text-xs text-red-600">Alasan penolakan: {j.rejected_reason}</p>
                      )}
                      {(j.payload?.dokumen_paths?.length || 0) > 0 && (
                        <p className="text-xs text-gray-500">
                          Dokumen:{' '}
                          {j.payload!.dokumen_paths!.map(p => (
                            <button key={p} onClick={() => bukaDokumen(p)}
                              className="underline text-teal hover:opacity-80 mr-2">{namaFile(p)}</button>
                          ))}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-xs text-gray-400">Total Nilai</p>
                        <p className="font-semibold text-gray-800">{formatRupiah(j.total)}</p>
                      </div>
                      {pending && (
                        <>
                          <button className="btn-primary" disabled={busy} onClick={() => terima(j)}>
                            {busy ? '...' : 'Terima'}
                          </button>
                          <button disabled={busy} onClick={() => tolak(j)}
                            className="px-4 py-2 rounded-lg text-sm bg-red-500 hover:bg-red-600 text-white disabled:opacity-50">
                            Tolak
                          </button>
                        </>
                      )}
                      {disetujui && (
                        <button disabled={busy} onClick={() => batalSeluruh(j)}
                          title="Batalkan SEMUA barang di kartu ini sekaligus, lalu kartunya bisa diterima ulang"
                          className="px-3 py-2 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-40">
                          {busy ? '...' : 'Batal Seluruh Pengalihan'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="table-th">Kode Register / Nama Barang</th>
                        <th className="table-th">Merek / Tipe</th>
                        <th className="table-th text-center">Jumlah</th>
                        <th className="table-th text-right">Nilai</th>
                        {disetujui && <th className="table-th text-center w-28">Aksi</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {j.lines.map(l => (
                        <tr key={l.aset_id}>
                          <td className="table-td">
                            <p className="font-medium text-gray-800 text-xs">{l.nama_barang || '-'}</p>
                            <p className="text-gray-400 text-xs mt-0.5">{l.nibar || '-'} · {l.kode}</p>
                            {l.dikembalikan && (
                              <span className="inline-block mt-1 px-2 py-0.5 rounded text-[11px] bg-gray-100 text-gray-500">
                                Dikembalikan
                              </span>
                            )}
                          </td>
                          <td className="table-td text-xs text-gray-600">{l.merek_tipe || '-'}</td>
                          <td className="table-td text-center text-xs">{l.jumlah} {l.satuan || ''}</td>
                          <td className="table-td text-right text-xs">{formatRupiah(l.nilai)}</td>
                          {disetujui && (
                            <td className="table-td text-center">
                              {/* Barang yang terlanjur dipulangkan lewat aksi lama tetap
                                  boleh DIBATALKAN — justru itu yang biasanya salah pencet. */}
                              <button disabled={busy} onClick={() => batalPengalihan(j, l)}
                                title="Batalkan — pengalihannya dianggap tak pernah terjadi & barang balik ke SKPD asal"
                                className="px-3 py-1 rounded text-xs bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50">
                                🗑 Batal
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
