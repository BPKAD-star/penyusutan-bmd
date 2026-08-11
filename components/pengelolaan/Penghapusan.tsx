'use client'
// No.11: Penghapusan — alur jurnal ala e-SIMBADA, dengan header editable.
//   1. Pilih SKPD.
//   2. Tambah jurnal: No SK, tanggal, jenis + bentuk, keterangan (→ jurnal_header).
//   3. Centang barang → simpan sebagai baris ledger ber-header_id (append-only).
//   4. Kartu jurnal: ikon edit (ganti No SK/tanggal, WAJIB semester sama),
//      ikon + (tambah barang ke SK yang sama), ikon sampah per barang (batal).
// Header (No SK/tanggal) boleh diedit; ledger tetap beku. Pindah semester tak
// diizinkan lewat edit → dijaga trigger DB + validasi UI (lihat CLAUDE.md).
//
// Jenis ketiga: PENGALIHAN STATUS PENGGUNAAN (transfer keluar antar SKPD) —
// beda mekanika dari penghapusan biasa (migrasi 21 + 22):
//   - Butuh SKPD tujuan (level SKPD induk saja) + dokumen sumber (foto/PDF).
//   - Barang ditampung sbg DRAFT di payload.draft_items (approval_status
//     'pending') — ledger & aset TIDAK disentuh sampai SKPD tujuan menyetujui
//     lewat menu Penggunaan (RPC fn_terima_pengalihan).
//   - Selama pending: barang bebas ditambah/dihapus, header bebas diedit
//     (semester sama), jurnal bisa dihapus utuh (belum ada jejak ledger).
//   - SATU PINTU: setelah disetujui, kartu di sisi PENGIRIM jadi read-only.
//     Pengembalian barang HANYA lewat SKPD penerima (menu Penggunaan).
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { catatTransaksi } from '@/lib/transaksi'
import { periodeDariTanggal, GOLONGAN_DAFTAR_BARANG, kodeLevel3 } from '@/lib/bmd'
import { formatRupiah } from '@/lib/export'
import { fetchBatalTargets, BATAL_TARGET_JENIS } from '@/lib/voidedAset'
import FormShell from './FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import { useDateBounds } from '@/components/useTahunBuku'
import { backdropClose } from '@/components/backdropClose'

type JenisHapus = 'penghapusan_pemindahtanganan' | 'penghapusan_sebab_lain' | 'pengalihan_status'

const JENIS_OPT: { value: JenisHapus; label: string }[] = [
  { value: 'penghapusan_pemindahtanganan', label: 'Pemindahtanganan' },
  { value: 'penghapusan_sebab_lain', label: 'Sebab Lain (force majeure)' },
  { value: 'pengalihan_status', label: 'Pengalihan Status Penggunaan (Transfer Keluar)' },
]
const SUBJENIS_OPT = [
  { value: 'hibah', label: 'Hibah' },
  { value: 'penjualan', label: 'Penjualan' },
  { value: 'tukar_menukar', label: 'Tukar-Menukar' },
  { value: 'penyertaan_modal', label: 'Penyertaan Modal Pemerintah' },
]

const PENGHAPUSAN_JENIS = ['penghapusan_pemindahtanganan', 'penghapusan_sebab_lain']

// Label pendek khusus bilah filter — `JENIS_OPT.label` dipakai di formulir dan
// terlalu panjang untuk dijejer sebagai tombol.
const FILTER_LABEL: Record<'semua' | JenisHapus, string> = {
  semua: 'Semua',
  penghapusan_pemindahtanganan: 'Pemindahtanganan',
  penghapusan_sebab_lain: 'Sebab Lain',
  pengalihan_status: 'Pengalihan Status',
}

type Barang = {
  id: string
  nibar: string | null
  kode: string
  nama_barang: string | null
  merek_tipe: string | null
  jumlah: number
  satuan: string | null
  nilai_perolehan: number
  skpd_id: number | null
}

// Snapshot barang di draft pengalihan (payload.draft_items) — dipakai tampilan;
// nilai otoritatif dibaca ulang dari aset oleh RPC saat SKPD tujuan menerima.
type DraftItem = {
  aset_id: string; nibar: string | null; kode: string; nama_barang: string | null
  merek_tipe: string | null; jumlah: number; satuan: string | null; nilai: number
}
type HeaderPayload = { dokumen_paths?: string[]; draft_items?: DraftItem[] }

// Header jurnal (jurnal_header) + baris barang (dari transaksi_bmd ber-header_id
// utk kategori penghapusan / pengalihan disetujui; dari draft_items utk pending).
type Header = {
  id: string
  no_sk: string
  tanggal: string
  periode: string
  jenis: JenisHapus
  sub_jenis: string | null
  keterangan: string | null
  kategori: 'penghapusan' | 'pengalihan_status'
  approval_status: string | null
  skpd_tujuan: number | null
  rejected_reason: string | null
  payload: HeaderPayload | null
}
type JurnalLine = {
  trx_id: number
  aset_id: string
  nibar: string | null
  kode: string
  nama_barang: string | null
  merek_tipe: string | null
  jumlah: number
  satuan: string | null
  nilai: number
}
type Jurnal = Header & { lines: JurnalLine[]; total: number }

const HEADER_COLS = 'id,no_sk,tanggal,periode,jenis,sub_jenis,keterangan,kategori,approval_status,skpd_tujuan,rejected_reason,payload'

const namaFile = (path: string) => path.split('/').pop() || path

export default function Penghapusan() {
  const supabase = createClient()

  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
  const [golonganLabels, setGolonganLabels] = useState<Record<string, string>>({})
  const [skpd, setSkpd] = useState('')

  const [jurnals, setJurnals] = useState<Jurnal[]>([])
  const [loadingJurnal, setLoadingJurnal] = useState(false)

  const [mode, setMode] = useState<'list' | 'tambah'>('list')
  const [addTo, setAddTo] = useState<Header | null>(null)   // "+" tambah barang ke jurnal ini
  const [editing, setEditing] = useState<Header | null>(null) // edit header
  const [msg, setMsg] = useState('')
  // Filter jenis kartu — 'semua' | JenisHapus. Menu ini menampung tiga alur
  // yang berbeda sifatnya (dua penghapusan + satu transfer), dan sesudah satu
  // SK memecah diri jadi 16 kartu tujuan, daftarnya jadi tak bisa ditelusuri
  // tanpa penyaring.
  const [filterJenis, setFilterJenis] = useState<'semua' | JenisHapus>('semua')
  // header_id → jumlah baris ledger. Sejak migrasi 20260811_02, `pending` TIDAK
  // lagi berarti "belum ada ledger" — pembatalan mengembalikan kartu ke pending
  // padahal jejaknya sudah ada. Ini yang membedakan hapus vs arsipkan.
  const [jurnalBerledger, setJurnalBerledger] = useState<Record<string, number>>({})
  const [errLoad, setErrLoad] = useState('')

  // ── Referensi awal ──
  useEffect(() => {
    ;(async () => {
      const rows: { id: number; nama: string }[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        rows.push(...data)
        if (data.length < 1000) break
      }
      setSkpdList(rows)
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

  // ── Muat jurnal penghapusan + pengalihan milik SKPD terpilih ──
  // ⚠️ Seluruh badan fungsi di dalam try, `setLoadingJurnal(false)` di FINALLY.
  // `fetchBatalTargets` MELEMPAR kalau querynya gagal (fail-closed, lib/
  // voidedAset.ts). Tanpa penangkap, promise-nya ditolak, loading tak pernah
  // dimatikan, dan halaman membeku di "Memuat jurnal..." tanpa sepatah pun
  // keterangan — cacat yang sudah pernah memakan Daftar Barang & sudah
  // tertulis di CLAUDE.md, jangan diulang di sini.
  const loadJurnals = useCallback(async (skpdId: string) => {
    if (!skpdId) { setJurnals([]); setErrLoad(''); return }
    setLoadingJurnal(true); setErrLoad('')
    try {
    const { data: headers } = await supabase.from('jurnal_header')
      .select(HEADER_COLS)
      .in('kategori', ['penghapusan', 'pengalihan_status'])
      .eq('skpd_id', Number(skpdId))
      .order('tanggal', { ascending: false })
    const hs = (headers || []) as unknown as Header[]

    const jmap = new Map<string, Jurnal>()
    for (const h of hs) jmap.set(h.id, { ...h, lines: [], total: 0 })

    // Pengalihan pending/ditolak: barang = draft (belum ada ledger).
    for (const j of jmap.values()) {
      if (j.kategori === 'pengalihan_status' && j.approval_status !== 'disetujui') {
        for (const d of j.payload?.draft_items || []) {
          j.lines.push({ ...d, trx_id: 0 }) // draft pengalihan pending: tak ada ledger; trx_id placeholder (tak dipakai batal_penghapusan)
          j.total += d.nilai
        }
      }
    }

    // Baris ledger: penghapusan (semua) + pengalihan yang sudah disetujui.
    const ledgerIds = hs.filter(h => h.kategori === 'penghapusan' || h.approval_status === 'disetujui').map(h => h.id)
    if (ledgerIds.length > 0) {
      const { data } = await supabase.from('transaksi_bmd')
        .select('id,header_id,nilai,payload,aset:aset_id(id,nibar,nama_barang,kode,merek_tipe,jumlah,satuan,status)')
        .in('jenis', [...PENGHAPUSAN_JENIS, 'pengalihan_status'] as never)
        .in('header_id', ledgerIds)
        .order('id', { ascending: false })

      const rows = (data || []) as unknown as {
        id: number; header_id: string; nilai: number; payload: { reversal?: boolean } | null
        aset: (Barang & { status: string }) | null
      }[]
      // Dedup per aset: baris TERBARU (id desc) menentukan keanggotaan.
      // Penghapusan: dedup global by aset (barang cuma bisa 'dihapus' di satu
      // jurnal). Pengalihan: dedup per header+aset (barang sah pindah berkali-
      // kali lewat jurnal berbeda); baris terbaru reversal = keluar dari kartu.
      // Pengalihan yang DIBATALKAN (migrasi 20260729_06/07) — dianggap tak
      // pernah terjadi, jadi barangnya keluar dari kartu di SISI PENGIRIM juga,
      // bukan cuma di Penggunaan Masuk. Kalau semua barangnya dibatalkan,
      // kartunya ikut hilang lewat filter `lines.length > 0` di bawah.
      //
      // ⚠️ Per ID BARIS (`payload.target_trx_ids`), BUKAN per (kartu, barang).
      // Kunci lama `header|aset` menyapu SELURUH baris barang itu di kartu tsb,
      // termasuk penerimaan BARU yang sah sesudah pembatalan — cacat yang baru
      // muncul sejak kartu bisa diterima ulang (migrasi 20260811_02), dan
      // akibatnya barang pindah tapi kartunya lenyap dari kedua sisi.
      // Kembar dengan PenggunaanMasuk.tsx; ubah satu, samakan yang lain.
      const dibatalkan = await fetchBatalTargets(
        supabase, BATAL_TARGET_JENIS.pengalihan,
        rows.map(r => r.aset?.id).filter((x): x is string => !!x),
      )

      const seenHapus = new Set<string>()
      const seenAlih = new Set<string>()
      for (const r of rows) {
        if (!r.aset) continue
        const j = jmap.get(r.header_id)
        if (!j) continue
        if (j.kategori === 'penghapusan') {
          if (seenHapus.has(r.aset.id)) continue
          seenHapus.add(r.aset.id)
          if (r.aset.status !== 'dihapus') continue
        } else {
          const key = `${r.header_id}|${r.aset.id}`
          if (seenAlih.has(key)) continue
          seenAlih.add(key)
          if (dibatalkan.has(r.id)) continue
          if (r.payload?.reversal) continue
        }
        j.lines.push({
          trx_id: r.id, aset_id: r.aset.id, nibar: r.aset.nibar, kode: r.aset.kode, nama_barang: r.aset.nama_barang,
          merek_tipe: r.aset.merek_tipe, jumlah: r.aset.jumlah, satuan: r.aset.satuan, nilai: r.nilai,
        })
        j.total += r.nilai
      }
    }
    // Kartu mana yang PUNYA jejak ledger — menentukan apakah 🗑 menghapus
    // beneran atau mengarsipkan. Dihitung dari header_id apa adanya, TERMASUK
    // kartu yang kini 'pending' lagi karena pembatalan (migrasi 20260811_02):
    // di situlah persoalannya, sebab status 'pending' saja tak lagi berarti
    // "belum ada ledger" sejak migrasi itu.
    const berledger: Record<string, number> = {}
    if (hs.length > 0) {
      const { data: ledgerCount } = await supabase.from('transaksi_bmd')
        .select('header_id').in('header_id', hs.map(h => h.id))
      for (const r of (ledgerCount || []) as { header_id: string }[]) {
        berledger[r.header_id] = (berledger[r.header_id] || 0) + 1
      }
    }
    setJurnalBerledger(berledger)

    // Sembunyikan jurnal tanpa barang (auto-ilang): entah karena semua barang
    // sudah dibatalkan, atau header orphan sisa entry yang gagal. Header tetap di
    // DB (baris ledger yg pernah ada memblok DELETE via FK), cukup tak ditampilkan.
    setJurnals([...jmap.values()].filter(j => j.lines.length > 0))
    } catch (e) {
      setJurnals([])
      setErrLoad(`Gagal memuat jurnal: ${e instanceof Error ? e.message : String(e)}. Daftar tidak ditampilkan supaya tak terbaca sebagai "belum ada jurnal".`)
    } finally {
      setLoadingJurnal(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadJurnals(skpd); setMode('list'); setAddTo(null); setEditing(null) }, [skpd, loadJurnals])

  async function hapusBarang(l: JurnalLine, j: Jurnal) {
    if (j.kategori === 'pengalihan_status') {
      // SATU PINTU: pengirim hanya boleh mengutak-atik selama masih pending
      // (draft, belum ada ledger). Setelah disetujui SKPD tujuan, pengirim tak
      // bisa apa-apa lagi — pengembalian dilakukan SKPD penerima (menu Penggunaan).
      if (j.approval_status !== 'pending') return
      const sisa = (j.payload?.draft_items || []).filter(d => d.aset_id !== l.aset_id)
      if (sisa.length === 0) {
        // Barang terakhir → kartunya ikut hilang. Lewat hapusJurnal supaya
        // aturan hapus-vs-arsipkan cuma hidup di SATU tempat; salinan kedua di
        // sini persis yang membuat jalur ini luput saat 20260811_02 mengubah
        // arti status 'pending'.
        await hapusJurnal(j)
        return
      } else {
        if (!confirm('Keluarkan barang ini dari draft pengalihan?')) return
        const { error } = await supabase.from('jurnal_header')
          .update({ payload: { ...(j.payload || {}), draft_items: sisa } }).eq('id', j.id)
        if (error) { setMsg(`Error: ${error.message}`); return }
        setMsg('Barang dikeluarkan dari draft pengalihan.')
      }
      loadJurnals(skpd)
      return
    }
    if (!confirm('Batalkan penghapusan barang ini? Barang akan kembali aktif dan penyusutan dilanjutkan.')) return
    // Guard rantai: barang tak boleh punya transaksi LEBIH BARU setelah penghapusan
    // ini — batalkan yang lebih baru dulu, kalau tidak replay engine rusak.
    {
      const { count } = await supabase.from('transaksi_bmd')
        .select('id', { count: 'exact', head: true }).eq('aset_id', l.aset_id).gt('id', l.trx_id)
      if ((count || 0) > 0) {
        setMsg(`Error: "${l.nama_barang || l.nibar}" punya transaksi LEBIH BARU setelah penghapusan ini — batalkan yang lebih baru dulu.`)
        return
      }
    }
    // Reversal dicatat di PERIODE penghapusan asli (header.tanggal), bukan hari ini —
    // supaya di view periode itu barang langsung kembali muncul (konsisten Daftar Barang).
    const { error } = await catatTransaksi(supabase, {
      asetId: l.aset_id, jenis: 'batal_penghapusan', tanggal: j.tanggal,
      keterangan: `Pembatalan dari jurnal ${j.no_sk}`,
    })
    if (error) { setMsg(`Error: ${error}`); return }
    setMsg('Barang dikeluarkan dari jurnal — kembali aktif, penyusutan dilanjutkan.')
    loadJurnals(skpd)
  }

  // Hapus jurnal pengalihan utuh.
  //
  // DUA PERILAKU, persis pola `hapusKontrak` di Pengadaan — dan ini bukan
  // kehati-hatian belaka, ini menutup regresi 2026-08-11:
  //   * Draft murni (belum pernah diterima, TAK ADA baris ledger) → DELETE
  //     beneran. Aman: tak ada yang menggantung.
  //   * Kartu yang PERNAH diterima lalu dibatalkan (`punyaLedger`) → DIARSIPKAN
  //     (`approval_status='ditolak'`), bukan dihapus. Ledgernya wajib tetap
  //     utuh (append-only), dan FK `transaksi_bmd.header_id` + trigger
  //     `trg_jurnal_header_hapus_guard` memang menolak DELETE-nya.
  //
  // Kenapa perlu: sejak migrasi 20260811_02 pembatalan mengembalikan kartu ke
  // 'pending', jadi tombol 🗑 muncul lagi untuk kartu yang justru TAK MUNGKIN
  // dihapus. Membiarkannya begitu berarti memasang tombol yang selalu gagal.
  // Dan membiarkan kartunya tetap 'pending' juga tak aman: ia nangkring di
  // antrean "Menunggu Persetujuan" SKPD tujuan, yang bisa saja mengklik Terima
  // dan memindahkan barang yang salah untuk kedua kalinya.
  async function hapusJurnal(j: Jurnal) {
    const punyaLedger = (jurnalBerledger[j.id] || 0) > 0
    const pesan = punyaLedger
      ? `Kartu pengalihan "${j.no_sk}" sudah pernah diterima lalu dibatalkan, jadi jejak ledgernya WAJIB disimpan dan kartunya tidak bisa dihapus.\n\n` +
        `Kartu ini akan DIARSIPKAN: hilang dari daftar Anda dan dari antrean persetujuan ${namaSkpdById(j.skpd_tujuan)}, ` +
        `sehingga tak bisa lagi diterima tanpa sengaja. Barang tetap utuh di SKPD ini.\n\nLanjutkan?`
      : `Hapus jurnal pengalihan "${j.no_sk}" seluruhnya (${j.lines.length} barang)? Barang tetap utuh di SKPD ini.`
    if (!confirm(pesan)) return

    if (punyaLedger) {
      const { error } = await supabase.from('jurnal_header')
        .update({ approval_status: 'ditolak', rejected_reason: 'Ditarik kembali oleh SKPD asal (kartu sudah pernah diterima lalu dibatalkan).' })
        .eq('id', j.id)
      if (error) { setMsg(`Error: ${error.message}`); return }
      setMsg(`Kartu ${j.no_sk} diarsipkan — tak lagi muncul di antrean persetujuan SKPD tujuan.`)
    } else {
      const { error } = await supabase.from('jurnal_header').delete().eq('id', j.id)
      if (error) { setMsg(`Error: ${error.message}`); return }
      setMsg('Jurnal pengalihan dihapus.')
    }
    loadJurnals(skpd)
  }

  async function bukaDokumen(path: string) {
    const { data } = await supabase.storage.from('dokumen-sumber').createSignedUrl(path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const skpdNama = skpdList.find(s => String(s.id) === skpd)?.nama
  const namaSkpdById = (id: number | null) => skpdList.find(s => s.id === id)?.nama || '-'

  // ── Filter + total ────────────────────────────────────────────────────────
  // Diturunkan dari `jurnals` saat render, TIDAK disimpan di state: angka yang
  // disimpan terpisah dari daftarnya cepat atau lambat berselisih dengannya
  // (pola yang sudah menggigit di cache `aset.pemanfaatan`).
  // ⚠️ Kartu `ditolak` TIDAK ikut total maupun cacahan. Ia perpindahan yang tak
  // pernah jadi — entah ditolak SKPD tujuan, entah ditarik kembali pengirim
  // sesudah dibatalkan. Barangnya sudah pulang ke SKPD asal, jadi menghitungnya
  // berarti mengklaim perpindahan yang tak ada.
  //
  // Perlu ditulis eksplisit karena barisnya datang dari `payload.draft_items`,
  // dan draft itu TIDAK pernah dikosongkan saat kartu diarsipkan — jadi kartu
  // mati tetap membawa isinya. Terukur 2026-08-11: total Pengalihan Status
  // tampil 9.573.169.260,03 padahal yang sah 9.210.214.924,03; selisih
  // 362.954.336 itu satu kartu ke Kecamatan Plemahan yang sudah dibatalkan.
  const arsip = (j: Jurnal) => j.approval_status === 'ditolak'

  // DUA MACAM `ditolak`, dan cuma satu yang boleh disembunyikan (permintaan
  // user 2026-08-11 "bikin ilang aja kartu arsipnya"):
  //   * DIARSIPKAN pengirim = sudah pernah diterima lalu dibatalkan → PUNYA
  //     jejak ledger. Urusannya selesai, tak ada yang perlu ditindaklanjuti →
  //     disembunyikan.
  //   * DITOLAK SKPD tujuan = belum pernah diterima → TANPA ledger. Ini status
  //     AKTIF di kategori pengalihan (CLAUDE.md) dan pengirim WAJIB melihatnya
  //     berikut alasan penolakannya — kalau ikut disembunyikan, penolakan jadi
  //     tak pernah sampai ke pengirim dan barangnya menggantung tanpa kabar.
  // Pembedanya keadaan nyata (ada/tidaknya ledger), bukan menebak dari teks
  // alasan — teks bisa ditulis siapa saja, jejak ledger tidak.
  const disembunyikan = (j: Jurnal) => arsip(j) && (jurnalBerledger[j.id] || 0) > 0
  const jumlahDisembunyikan = jurnals.filter(disembunyikan).length

  const jurnalTampil = (filterJenis === 'semua' ? jurnals : jurnals.filter(j => j.jenis === filterJenis))
    .filter(j => !disembunyikan(j))
  const jurnalAktif = jurnalTampil.filter(j => !arsip(j))
  const jurnalArsip = jurnalTampil.filter(arsip)
  const totalTampil = jurnalAktif.reduce((s, j) => s + j.total, 0)
  const jumlahBarangTampil = jurnalAktif.reduce((s, j) => s + j.lines.length, 0)
  const cacah = (f: (j: Jurnal) => boolean) => jurnals.filter(j => !arsip(j) && !disembunyikan(j) && f(j)).length
  const hitungJenis: Record<'semua' | JenisHapus, number> = {
    semua: cacah(() => true),
    penghapusan_pemindahtanganan: cacah(j => j.jenis === 'penghapusan_pemindahtanganan'),
    penghapusan_sebab_lain: cacah(j => j.jenis === 'penghapusan_sebab_lain'),
    pengalihan_status: cacah(j => j.jenis === 'pengalihan_status'),
  }

  return (
    <FormShell judul="Penghapusan" msg={msg}
      deskripsi="Pilih SKPD, buat jurnal (No SK/tanggal), lalu centang barang. Penghapusan = soft-delete; Pengalihan Status = transfer ke SKPD lain, menunggu persetujuan SKPD tujuan.">
      {/* Pilih SKPD */}
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">Lokasi / SKPD :</label>
          <SkpdCombobox lockToOperator value={skpd} onChange={id => { setSkpd(id); setMsg('') }}
            placeholder="Ketik nama SKPD / Sub OPD / Lokasi..." />
        </div>
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Pilih SKPD di atas untuk melihat & membuat jurnal penghapusan / pengalihan status.
        </div>
      ) : mode === 'tambah' ? (
        <BarangForm
          skpdId={Number(skpd)} skpdNama={skpdNama || ''} golonganLabels={golonganLabels} header={null}
          onCancel={() => setMode('list')}
          onSaved={(n, pengalihan) => {
            setMode('list')
            setMsg(pengalihan
              ? `Jurnal pengalihan tersimpan — ${n} barang menunggu persetujuan SKPD tujuan.`
              : `Jurnal tersimpan — ${n} barang dihapus dari laporan (penyusutan berhenti).`)
            loadJurnals(skpd)
          }}
        />
      ) : addTo ? (
        <BarangForm
          skpdId={Number(skpd)} skpdNama={skpdNama || ''} golonganLabels={golonganLabels} header={addTo}
          onCancel={() => setAddTo(null)}
          onSaved={(n) => { setAddTo(null); setMsg(`${n} barang ditambahkan ke jurnal ${addTo.no_sk}.`); loadJurnals(skpd) }}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{skpdNama} — {jurnals.length} jurnal</span>
            <button className="btn-primary" onClick={() => { setMsg(''); setMode('tambah') }}>+ Tambah Jurnal</button>
          </div>

          {/* Filter jenis + total. Totalnya SELALU mengikuti filter yang sedang
              aktif — angka ringkas yang tak sepakat dengan daftar di bawahnya
              lebih berbahaya daripada tidak ada angka sama sekali. */}
          <div className="card px-5 py-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-600 mr-1">Jenis :</span>
                {([['semua', 'Semua'], ...JENIS_OPT.map(o => [o.value, FILTER_LABEL[o.value]] as const)] as const).map(([v, l]) => {
                  const aktif = filterJenis === v
                  return (
                    <button key={v} onClick={() => setFilterJenis(v as 'semua' | JenisHapus)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        aktif ? 'bg-teal text-white border-teal' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}>
                      {l} <span className={aktif ? 'opacity-80' : 'text-gray-400'}>({hitungJenis[v as 'semua' | JenisHapus]})</span>
                    </button>
                  )
                })}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-gray-400">
                  Total Nilai{filterJenis !== 'semua' ? ` — ${FILTER_LABEL[filterJenis]}` : ''}
                </p>
                <p className="text-xl font-bold text-gray-800">{formatRupiah(totalTampil)}</p>
                <p className="text-xs text-gray-400">{jurnalAktif.length} jurnal · {jumlahBarangTampil} barang</p>
                {/* Kartu yang disembunyikan tetap DISEBUT jumlahnya. Daftar yang
                    diam-diam membuang baris adalah cara paling halus membuat
                    orang salah hitung — di repo ini sudah beberapa kali begitu. */}
                {jumlahDisembunyikan > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">{jumlahDisembunyikan} kartu diarsipkan, disembunyikan</p>
                )}
                {jurnalArsip.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    + {jurnalArsip.length} kartu ditolak SKPD tujuan, <span className="font-medium">tidak dihitung</span>
                  </p>
                )}
              </div>
            </div>
            {filterJenis === 'semua' && (
              <p className="text-xs text-gray-500 mt-3">
                ⚠️ Total &quot;Semua&quot; mencampur <span className="font-medium">penghapusan</span> (barang keluar dari
                register) dengan <span className="font-medium">pengalihan</span> (barang pindah SKPD, tetap milik pemda) —
                jadi angkanya bukan satu makna. Pilih jenisnya untuk angka yang bisa dibaca.
              </p>
            )}
          </div>

          {errLoad ? (
            <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{errLoad}</div>
          ) : loadingJurnal ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Memuat jurnal...</div>
          ) : jurnals.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Belum ada penghapusan / pengalihan untuk SKPD ini.</div>
          ) : jurnalTampil.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 text-sm">
              Tak ada jurnal berjenis &quot;{FILTER_LABEL[filterJenis as JenisHapus]}&quot; untuk SKPD ini.
            </div>
          ) : [...jurnalAktif, ...jurnalArsip].map((j, idx) => {
            // Kartu arsip dikumpulkan di BAWAH, di belakang pemisah — supaya
            // tak tercampur dengan yang sah & jelas kenapa ia tak ikut total.
            const mulaiArsip = jurnalArsip.length > 0 && idx === jurnalAktif.length
            const isAlih = j.kategori === 'pengalihan_status'
            const pending = isAlih && j.approval_status === 'pending'
            const ditolak = isAlih && j.approval_status === 'ditolak'
            const disetujui = isAlih && j.approval_status === 'disetujui'
            // Satu pintu: baris pengalihan hanya bisa diutak-atik saat pending.
            // Disetujui → read-only di sisi pengirim (pengembalian ada di penerima).
            const bolehHapusLine = !isAlih || pending
            return (
            <div key={j.id} className={mulaiArsip ? 'space-y-4 pt-2' : ''}>
            {mulaiArsip && (
              <div className="flex items-center gap-3 pt-2">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs text-gray-400 font-medium">
                  Ditolak SKPD tujuan — barang tetap di SKPD ini, tidak dihitung dalam total
                </span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
            )}
            <div className={`card overflow-hidden ${arsip(j) ? 'opacity-60' : ''}`}>
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
                <div className="flex items-start justify-between gap-4">
                  <div className="text-sm space-y-0.5">
                    <p className="font-semibold text-gray-800">
                      No. {isAlih ? 'Dokumen' : 'SK'}: {j.no_sk}
                      {isAlih && (
                        <span className={`ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          pending ? 'bg-amber-100 text-amber-700'
                          : ditolak ? 'bg-red-100 text-red-700'
                          : 'bg-green-100 text-green-700'
                        }`}>
                          {pending ? 'Menunggu Persetujuan' : ditolak ? 'Ditolak' : 'Disetujui'}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      {JENIS_OPT.find(o => o.value === j.jenis)?.label}
                      {isAlih && ` → ${namaSkpdById(j.skpd_tujuan)}`}
                      {j.sub_jenis && ` · ${SUBJENIS_OPT.find(o => o.value === j.sub_jenis)?.label || j.sub_jenis}`}
                      {' · '}Tgl. {j.tanggal} · {j.periode}
                    </p>
                    {j.keterangan && <p className="text-xs text-gray-500">Keterangan: {j.keterangan}</p>}
                    {ditolak && j.rejected_reason && (
                      <p className="text-xs text-red-600">Alasan penolakan: {j.rejected_reason}</p>
                    )}
                    {isAlih && (j.payload?.dokumen_paths?.length || 0) > 0 && (
                      <p className="text-xs text-gray-500">
                        Dokumen:{' '}
                        {j.payload!.dokumen_paths!.map(p => (
                          <button key={p} onClick={() => bukaDokumen(p)}
                            className="underline text-teal hover:opacity-80 mr-2">{namaFile(p)}</button>
                        ))}
                      </p>
                    )}
                    {disetujui && (
                      <p className="text-xs text-gray-400 italic">Sudah diterima SKPD tujuan — read-only. Pengembalian dilakukan SKPD tujuan lewat menu Penggunaan.</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">{isAlih ? 'Total Nilai' : 'Total Penghapusan'}</p>
                      <p className="font-semibold text-gray-800">{formatRupiah(j.total)}</p>
                    </div>
                    {(!isAlih || pending) && (
                      <button title="Edit No dokumen / tanggal (dalam semester yang sama)"
                        onClick={() => { setMsg(''); setEditing(j) }}
                        className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">✎</button>
                    )}
                    {(!isAlih || pending) && (
                      <button title="Tambah barang ke jurnal ini"
                        onClick={() => { setMsg(''); setAddTo(j) }}
                        className="inline-flex items-center justify-center w-8 h-8 rounded bg-teal hover:opacity-90 text-white">+</button>
                    )}
                    {/* `ditolak` TANPA ledger masih boleh dihapus (pengirim
                        membereskan kartu yang ditolak penerima). `ditolak`
                        DENGAN ledger sudah keluar dari antrean & tak bisa
                        dihapus — tombolnya cuma akan jadi jalan buntu. */}
                    {(pending || (ditolak && (jurnalBerledger[j.id] || 0) === 0)) && (
                      <button
                        title={(jurnalBerledger[j.id] || 0) > 0
                          ? 'Arsipkan kartu ini — sudah pernah diterima lalu dibatalkan, jadi jejak ledgernya wajib disimpan & kartunya tak bisa dihapus'
                          : 'Hapus jurnal pengalihan ini seluruhnya (belum ada jejak ledger)'}
                        onClick={() => hapusJurnal(j)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded bg-red-500 hover:bg-red-600 text-white">
                        {(jurnalBerledger[j.id] || 0) > 0 ? '📥' : '🗑'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="table-th w-10 text-center">Aksi</th>
                      <th className="table-th">Kode Register / Nama Barang</th>
                      <th className="table-th">Merek / Tipe</th>
                      <th className="table-th text-center">Jumlah</th>
                      <th className="table-th text-right">Nilai</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {j.lines.length === 0 ? (
                      <tr><td colSpan={5} className="table-td text-center py-6 text-gray-400 text-xs">Belum ada barang — klik + untuk menambah.</td></tr>
                    ) : j.lines.map(l => (
                      <tr key={l.aset_id}>
                        <td className="table-td text-center">
                          {bolehHapusLine ? (
                            <button
                              onClick={() => hapusBarang(l, j)}
                              title={isAlih ? 'Keluarkan barang dari draft pengalihan' : 'Batalkan penghapusan barang ini'}
                              className="inline-flex items-center justify-center w-7 h-7 rounded bg-red-500 hover:bg-red-600 text-white"
                            >🗑</button>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="table-td">
                          <p className="font-medium text-gray-800 text-xs">{l.nama_barang || '-'}</p>
                          <p className="text-gray-400 text-xs mt-0.5">{l.nibar || '-'} · {l.kode}</p>
                        </td>
                        <td className="table-td text-xs text-gray-600">{l.merek_tipe || '-'}</td>
                        <td className="table-td text-center text-xs">{l.jumlah} {l.satuan || ''}</td>
                        <td className="table-td text-right text-xs">{formatRupiah(l.nilai)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            </div>
          )})}
        </div>
      )}

      {editing && (
        <EditHeaderModal header={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setMsg('Header jurnal diperbarui.'); loadJurnals(skpd) }}
        />
      )}
    </FormShell>
  )
}

// ── Modal edit header: No SK + tanggal (kunci semester sama) + keterangan ────
function EditHeaderModal({ header, onClose, onSaved }: {
  header: Header; onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const dateBounds = useDateBounds()
  const [noSk, setNoSk] = useState(header.no_sk)
  const [tgl, setTgl] = useState(header.tanggal)
  const [ket, setKet] = useState(header.keterangan || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const isAlih = header.kategori === 'pengalihan_status'
  const tglPeriode = periodeDariTanggal(tgl)
  const pindahSemester = tglPeriode !== header.periode

  async function simpan() {
    if (!noSk.trim()) { setErr(`No. ${isAlih ? 'dokumen' : 'SK'} wajib diisi.`); return }
    if (pindahSemester) {
      setErr(`Tanggal masuk ${tglPeriode}, sedangkan jurnal ini di ${header.periode}. Pindah semester tidak diizinkan — ${isAlih ? 'hapus jurnal & entry ulang' : 'batalkan & buat jurnal baru'}.`)
      return
    }
    setErr(''); setSaving(true)
    const { error } = await supabase.from('jurnal_header')
      .update({ no_sk: noSk.trim(), tanggal: tgl, keterangan: ket.trim() || null })
      .eq('id', header.id)
    if (error) { setErr(`Gagal menyimpan: ${error.message}`); setSaving(false); return }
    setSaving(false); onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onClose)}>
      <div className="card w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Edit Header Jurnal</h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{isAlih ? 'No. Dokumen Sumber' : 'No. SK / BA Penghapusan'}</label>
            <input className="select-filter w-full" value={noSk} onChange={e => setNoSk(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tanggal <span className="text-gray-400">(harus tetap di {header.periode})</span></label>
            <input type="date" className="select-filter w-full" max={dateBounds.max} value={tgl} onChange={e => setTgl(e.target.value)} />
            {pindahSemester && (
              <p className="text-xs text-red-600 mt-1">
                Tanggal ini masuk {tglPeriode} — di luar semester jurnal. Ganti tanggal, atau {isAlih ? 'hapus jurnal ini seluruhnya lalu entry ulang' : 'batalkan & entry ulang'}.
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Keterangan</label>
            <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={simpan} disabled={saving || pindahSemester}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-view: (opsional header baru) + pemilihan barang (centang) ───────────
// header=null → buat jurnal baru (bikin jurnal_header dulu). header=… → tambah
// barang ke jurnal yang sudah ada: penghapusan = insert baris ledger ber-
// header_id sama; pengalihan pending = merge ke payload.draft_items.
function BarangForm({ skpdId, skpdNama, golonganLabels, header, onCancel, onSaved }: {
  skpdId: number; skpdNama: string; golonganLabels: Record<string, string>
  header: Header | null; onCancel: () => void; onSaved: (n: number, pengalihan: boolean) => void
}) {
  const supabase = createClient()
  const dateBounds = useDateBounds()

  const [jenis, setJenis] = useState<JenisHapus>('penghapusan_pemindahtanganan')
  const [subJenis, setSubJenis] = useState('hibah')
  const [noSk, setNoSk] = useState('')
  const [tgl, setTgl] = useState(new Date().toISOString().slice(0, 10))
  const [ket, setKet] = useState('')
  const [tujuan, setTujuan] = useState('')          // SKPD tujuan (pengalihan)
  const [dokPaths, setDokPaths] = useState<string[]>([]) // dokumen sumber (pengalihan)
  const [dokUploading, setDokUploading] = useState(false)

  const [fGolongan, setFGolongan] = useState('')
  const [fKomptabel, setFKomptabel] = useState('')
  const [fSearch, setFSearch] = useState('')

  const [rows, setRows] = useState<Barang[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState<Record<string, Barang>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const isAlih = header ? header.kategori === 'pengalihan_status' : jenis === 'pengalihan_status'

  async function tampilkan() {
    setLoading(true)
    let q = supabase.from('aset')
      .select('id,nibar,kode,nama_barang,merek_tipe,jumlah,satuan,nilai_perolehan,skpd_id')
      .eq('status', 'aktif').eq('skpd_id', skpdId)
    if (fGolongan) q = q.like('kode', `${fGolongan}.%`)
    if (fKomptabel) q = q.eq('intra_ekstra', fKomptabel)
    if (fSearch) q = q.or(`nama_barang.ilike.%${fSearch}%,nibar.ilike.%${fSearch}%,kode.ilike.${fSearch}%`)
    const { data } = await q.order('nilai_perolehan', { ascending: false }).limit(500)
    setRows((data as unknown as Barang[]) || [])
    setLoaded(true)
    setLoading(false)
  }

  async function uploadDokumen(files: FileList | null) {
    if (!files || files.length === 0) return
    setDokUploading(true)
    for (const file of Array.from(files)) {
      const path = `pengalihan/${crypto.randomUUID()}/${file.name}`
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

  function toggle(b: Barang) {
    setSel(prev => {
      const next = { ...prev }
      if (next[b.id]) delete next[b.id]; else next[b.id] = b
      return next
    })
  }
  function toggleAll() {
    setSel(prev => {
      const allSelected = rows.length > 0 && rows.every(r => prev[r.id])
      if (allSelected) return {}
      const next = { ...prev }
      for (const r of rows) next[r.id] = r
      return next
    })
  }

  const selList = Object.values(sel)
  const selTotal = selList.reduce((s, b) => s + b.nilai_perolehan, 0)

  const draftDari = (b: Barang): DraftItem => ({
    aset_id: b.id, nibar: b.nibar, kode: b.kode, nama_barang: b.nama_barang,
    merek_tipe: b.merek_tipe, jumlah: b.jumlah, satuan: b.satuan, nilai: b.nilai_perolehan,
  })

  // Insert baris penghapusan untuk header tertentu.
  async function insertLines(h: Header): Promise<string | null> {
    const trxRows = selList.map(b => ({
      aset_id: b.id, jenis: h.jenis, periode: h.periode, tanggal: h.tanggal, nilai: b.nilai_perolehan,
      skpd_asal: b.skpd_id, header_id: h.id, payload: {},
    }))
    const { error } = await supabase.from('transaksi_bmd').insert(trxRows)
    if (error) return `Gagal mencatat transaksi: ${error.message}`
    const { error: e2 } = await supabase.from('aset').update({ status: 'dihapus' }).in('id', selList.map(b => b.id))
    if (e2) return `Transaksi tercatat, tapi update status aset gagal: ${e2.message}`
    return null
  }

  async function simpan() {
    if (selList.length === 0) { setErr('Centang minimal satu barang.'); return }
    setErr(''); setSaving(true)

    // ── PENGALIHAN: draft-only, ledger & aset TIDAK disentuh sampai disetujui ──
    if (isAlih) {
      if (header) {
        // Tambah barang ke draft pengalihan pending (merge, dedup by aset_id).
        const lama = header.payload?.draft_items || []
        const ada = new Set(lama.map(d => d.aset_id))
        const gabung = [...lama, ...selList.filter(b => !ada.has(b.id)).map(draftDari)]
        const { error } = await supabase.from('jurnal_header')
          .update({ payload: { ...(header.payload || {}), draft_items: gabung } }).eq('id', header.id)
        if (error) { setErr(`Gagal menambah barang: ${error.message}`); setSaving(false); return }
        setSaving(false); onSaved(selList.length, true); return
      }
      if (!noSk.trim()) { setErr('No. dokumen sumber wajib diisi.'); setSaving(false); return }
      if (!tujuan) { setErr('SKPD tujuan wajib dipilih.'); setSaving(false); return }
      if (Number(tujuan) === skpdId) { setErr('SKPD tujuan tidak boleh sama dengan SKPD asal.'); setSaving(false); return }
      const { error } = await supabase.from('jurnal_header').insert({
        skpd_id: skpdId, kategori: 'pengalihan_status', jenis: 'pengalihan_status', sub_jenis: null,
        no_sk: noSk.trim(), tanggal: tgl, keterangan: ket.trim() || null,
        skpd_tujuan: Number(tujuan), approval_status: 'pending',
        payload: { dokumen_paths: dokPaths, draft_items: selList.map(draftDari) },
      })
      if (error) { setErr(`Gagal membuat jurnal pengalihan: ${error.message}`); setSaving(false); return }
      setSaving(false); onSaved(selList.length, true); return
    }

    // ── PENGHAPUSAN: alur lama (ledger + soft-delete langsung) ──
    let h = header
    const headerBaru = !header
    if (!h) {
      // Buat header baru dulu.
      if (!noSk.trim()) { setErr('No. SK / dasar penghapusan wajib diisi.'); setSaving(false); return }
      const { data, error } = await supabase.from('jurnal_header').insert({
        skpd_id: skpdId, kategori: 'penghapusan', jenis,
        sub_jenis: jenis === 'penghapusan_pemindahtanganan' ? subJenis : null,
        no_sk: noSk.trim(), tanggal: tgl, keterangan: ket.trim() || null,
      }).select(HEADER_COLS).single()
      if (error || !data) { setErr(`Gagal membuat header jurnal: ${error?.message}`); setSaving(false); return }
      h = data as unknown as Header
    }

    const e = await insertLines(h)
    if (e) {
      // Header baru + gagal isi barang → hapus header supaya tak jadi orphan
      // (kartu jurnal kosong). Header lama (tambah barang) dibiarkan utuh.
      if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id)
      setErr(e); setSaving(false); return
    }
    setSaving(false)
    onSaved(selList.length, false)
  }

  const allSelected = rows.length > 0 && rows.every(r => sel[r.id])

  return (
    <div className="space-y-4">
      {/* Header jurnal — form (baru) atau ringkasan read-only (tambah barang) */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">
            {header ? `Tambah Barang — ${header.no_sk}` : `Jurnal Baru — ${skpdNama}`}
          </h2>
          <button className="btn-secondary text-xs" onClick={onCancel}>← Kembali</button>
        </div>

        {header ? (
          <p className="text-sm text-gray-500">
            {JENIS_OPT.find(o => o.value === header.jenis)?.label}
            {header.sub_jenis && ` · ${SUBJENIS_OPT.find(o => o.value === header.sub_jenis)?.label || header.sub_jenis}`}
            {' · '}Tgl. {header.tanggal} · {header.periode}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Jenis</label>
              <select className="select-filter w-full" value={jenis} onChange={e => setJenis(e.target.value as JenisHapus)}>
                {JENIS_OPT.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {jenis === 'penghapusan_pemindahtanganan' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Bentuk Pemindahtanganan</label>
                <select className="select-filter w-full" value={subJenis} onChange={e => setSubJenis(e.target.value)}>
                  {SUBJENIS_OPT.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
            {jenis === 'pengalihan_status' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">SKPD Tujuan <span className="text-gray-400">(level SKPD induk)</span></label>
                <SkpdCombobox value={tujuan} onChange={setTujuan} rootOnly placeholder="Ketik nama SKPD tujuan..." />
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-1">{isAlih ? 'No. Dokumen Sumber' : 'No. SK / BA Penghapusan'}</label>
              <input className="select-filter w-full" value={noSk} onChange={e => setNoSk(e.target.value)} placeholder="mis. 100.3.3.2/74/418.08/2024" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{isAlih ? 'Tanggal Dokumen Sumber' : 'Tanggal'}</label>
              <input type="date" className="select-filter w-full" min={dateBounds.min} max={dateBounds.max}
                value={tgl} onChange={e => setTgl(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Periode: {periodeDariTanggal(tgl)}</p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Keterangan</label>
              <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)}
                placeholder={isAlih ? 'mis. Pengalihan kendaraan dinas ke Dinas Kesehatan' : 'mis. Penghapusan Lelang'} />
            </div>
            {jenis === 'pengalihan_status' && (
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Dokumen Sumber (foto / PDF, bisa lebih dari satu)</label>
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
            )}
          </div>
        )}
      </div>

      {/* Filter & pilih barang */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Pilih Barang</h2>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Kode Jenis</label>
            <select className="select-filter" value={fGolongan} onChange={e => setFGolongan(e.target.value)}>
              <option value="">Semua Jenis Aset</option>
              {GOLONGAN_DAFTAR_BARANG.map(g => <option key={g} value={g}>{g} — {golonganLabels[g] || '...'}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Komptabel</label>
            <select className="select-filter" value={fKomptabel} onChange={e => setFKomptabel(e.target.value)}>
              <option value="">Semua</option>
              <option value="intra">Intrakomptabel</option>
              <option value="ekstra">Ekstrakomptabel</option>
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-gray-500 mb-1">Cari</label>
            <input className="select-filter w-full" placeholder="Nama barang / NIBAR / kode..."
              value={fSearch} onChange={e => setFSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') tampilkan() }} />
          </div>
          <button className="btn-primary" onClick={tampilkan} disabled={loading}>{loading ? 'Memuat...' : 'Tampilkan'}</button>
        </div>

        {!loaded ? (
          <div className="py-10 text-center text-gray-400 text-sm">Atur filter lalu klik Tampilkan untuk memilih barang.</div>
        ) : (
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                  <tr>
                    <th className="table-th w-10 text-center">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                    </th>
                    <th className="table-th">Barang</th>
                    <th className="table-th">Merek / Tipe</th>
                    <th className="table-th text-center">Jumlah</th>
                    <th className="table-th text-right">Nilai Perolehan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.length === 0 ? (
                    <tr><td colSpan={5} className="table-td text-center py-10 text-gray-400">Tidak ada barang aktif untuk filter ini.</td></tr>
                  ) : rows.map(b => (
                    <tr key={b.id} className={sel[b.id] ? 'bg-teal/5' : ''}>
                      <td className="table-td text-center">
                        <input type="checkbox" checked={!!sel[b.id]} onChange={() => toggle(b)} />
                      </td>
                      <td className="table-td">
                        <p className="font-medium text-gray-800 text-xs">{b.nama_barang || '-'}</p>
                        <p className="text-gray-400 text-xs mt-0.5">{b.nibar || '-'} · {b.kode} · {golonganLabels[kodeLevel3(b.kode)] || kodeLevel3(b.kode)}</p>
                      </td>
                      <td className="table-td text-xs text-gray-600">{b.merek_tipe || '-'}</td>
                      <td className="table-td text-center text-xs">{b.jumlah} {b.satuan || ''}</td>
                      <td className="table-td text-right text-xs">{formatRupiah(b.nilai_perolehan)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <span className="text-sm text-gray-600">
            {selList.length} barang dipilih · <span className="font-medium">{formatRupiah(selTotal)}</span>
          </span>
          <button className="btn-primary" onClick={simpan} disabled={saving || selList.length === 0}>
            {saving ? 'Menyimpan...' : header ? 'Tambah ke Jurnal' : isAlih ? 'Simpan Pengalihan (Menunggu Persetujuan)' : 'Simpan Penghapusan'}
          </button>
        </div>
      </div>
    </div>
  )
}
