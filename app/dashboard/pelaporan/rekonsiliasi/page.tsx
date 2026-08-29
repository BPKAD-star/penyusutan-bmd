'use client'
// Rekonsiliasi BMD — Berita Acara Rekonsiliasi (laporan mutasi). Per SKPD, per
// SEMESTER (dipilih), per golongan; Saldo Awal + Penambahan − Pengurangan =
// Saldo Akhir, 4 ukuran (Perolehan/Beban/Akumulasi/Nilai Buku) × Intra/Ekstra.
// Angka PERIOD-CORRECT (lib/rekon.ts) — identik halaman Penyusutan → bisa tie-out.
// Lihat docs/rekonsiliasi-bmd-plan.md.
//
// FASE 2: baris Penambahan/Pengurangan terisi utk NILAI PEROLEHAN + baris
// "Selisih (belum terpetakan)" penyeimbang (menjamin rantai reconcile & memunculkan
// yg belum dipetakan, mis. reklas komptabel Intra/Ekstra).
// FASE 3 (ini): Beban & Akumulasi ikut diatribusikan ke baris mutasi lewat
// attribusiPenyusutan() (lib/rekon.ts) — DECISION-1 = Opsi A, beban aset yang
// dikapitalisasi tetap penuh di baris Saldo Awal. Nilai Buku SELALU diturunkan
// `perolehan − akumulasi`, tak pernah dijumlah vertikal (rencana §6).
//
// DRILL-DOWN (pola LRA): angka Nilai Perolehan baris mutasi bisa diklik → popup
// RekonDetailModal berisi transaksi pembentuknya, dikelompokkan per SKPD. Halaman
// menahan `lines` (fetchMutasiLines) lalu menjumlah SENDIRI lewat aggregateMutasi
// — jadi tabel & popup makan dari array yang sama, TAK ADA query kedua yang bisa
// bikin totalnya beda. Kalau nanti nambah baris/kategori, cukup daftarkan di
// keysOfRow(); baris yang tak punya transaksi pembentuk (saldo, selisih) sengaja
// dibiarkan tak bisa diklik — lihat komentar di fungsi itu.
// Popup-nya juga membawa Beban/Akumulasi/Nilai Buku per barang (permintaan
// akuntansi) — diambil dari penyusutan_semester SAAT DIKLIK. Itu posisi AKHIR
// PERIODE per ASET, beda jenis dari kolom Nilai yang per TRANSAKSI, jadi
// totalnya dihitung per aset unik. Lihat fetchPenyusutanAset di lib/rekon.ts.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import { GOLONGAN_REKAP } from '@/lib/bmd'
import SkpdCombobox, { type SkpdSelection as OrgSelection } from '@/components/SkpdCombobox'
import TahunTerkunciNote from '@/components/TahunTerkunciNote'
import RekonDetailModal from '@/components/pelaporan/RekonDetailModal'
import BeritaAcaraRekon from '@/components/pelaporan/BeritaAcaraRekon'
import BeritaAcaraRekonModal from '@/components/pelaporan/BeritaAcaraRekonModal'
import { namaBerkasBA, type KonfigBA } from '@/lib/beritaAcaraRekon'
import { cssCetakLembar } from '@/lib/cetakLembar'
import { tahunAwal } from '@/lib/tahunKerja'
import {
  fetchRekonRekap, fetchPosAset, fetchMutasiLines, attribusiLines,
  aggregateMutasi, measuresOf, mutasiCellOf, fetchPenyusutanAset, zeroUkuran, TAMBAH_KEYS, KURANG_KEYS,
  type Snapshot, type Mutasi, type MutasiCell, type MutasiKey, type MutasiLine, type Komptabel,
  type PenyusutanAset, type UkuranMutasi, type Measures,
} from '@/lib/rekon'

const angka = (v: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v || 0)
const KOMPS: Komptabel[] = ['intra', 'ekstra']

// ── Struktur baris laporan (image BA rekonsiliasi) ──────────────────────────
type RowKind = 'saldo-awal' | 'saldo-akhir' | 'header' | 'sub' | 'item' | 'jumlah-t' | 'jumlah-k' | 'selisih'
/** `grup` cuma menentukan WARNA angka (hijau untuk penambahan, merah untuk
 *  pengurangan) — tidak dipakai perhitungan apa pun. Diisi otomatis di bawah
 *  supaya tak ada baris yang kelupaan diwarnai saat daftar ini ditambah. */
type RowDef = { kind: RowKind; label: string; key?: MutasiKey; indent?: number; grup?: 'tambah' | 'kurang' }

const ROWS_TAMBAH: RowDef[] = [
  { kind: 'header', label: 'Penambahan' },
  { kind: 'sub', label: 'Cara Perolehan', indent: 1 },
  { kind: 'item', label: 'Pengadaan', key: 'pengadaan', indent: 2 },
  { kind: 'item', label: 'Hibah', key: 'hibah', indent: 2 },
  { kind: 'item', label: 'Tukar Menukar', key: 'tukar', indent: 2 },
  { kind: 'item', label: 'Hasil Inventarisasi', key: 'inventarisasi', indent: 2 },
  { kind: 'item', label: 'Perolehan Lainnya', key: 'lainnya', indent: 2 },
  // ⚠️ Baris "Konstruksi Dalam Pengerjaan (termin)" DICABUT 2026-08-27
  // (keputusan user). Termin kontrak konstruksi (`akumulasi_kdp`) kini mendarat
  // di baris **Pengadaan** di atas — lihat `computeMutasiLines` (lib/rekon.ts).
  // Ia memang belanja modal APBD, cuma atas barang yang masih dikerjakan; baris
  // tersendiri membuat pembacanya mengira ada cara perolehan kelima.
  { kind: 'item', label: 'Perolehan dari rekening Belanja Jasa', key: 'belanja_jasa', indent: 1 },
  { kind: 'item', label: 'Penggunaan (transfer masuk)', key: 'penggunaan_masuk', indent: 1 },
  // Mutasi antar sub-unit dalam satu SKPD induk. SENGAJA kosong kalau laporan
  // diambil di level SKPD induk — di situ barangnya tak keluar-masuk ke mana
  // pun; barisnya hanya berisi saat filternya sub-unit (lihat lib/rekon.ts).
  { kind: 'item', label: 'Penerimaan Internal (transfer masuk)', key: 'internal_masuk', indent: 1 },
  { kind: 'item', label: 'Kapitalisasi', key: 'kapitalisasi', indent: 1 },
  { kind: 'item', label: 'Koreksi Nilai', key: 'koreksi_tambah', indent: 1 },
  // Pemecahan Barang: pecahan MASUK ke sel ini. Bukan net-nol terhadap baris
  // induk di bawah — keduanya sering beda kolom komptabel (induk intra →
  // pecahan ekstra), jadi tiap sel melihatnya sebagai mutasi sungguhan.
  { kind: 'item', label: 'Pemecahan Barang (pecahan baru)', key: 'pemecahan_masuk', indent: 1 },
  // Penggabungan Barang: nilai (dan akumulasi) barang yang dilebur MASUK ke
  // induknya. Angkanya = Σ barang sumber saja — induk sendiri sudah duduk di
  // Saldo Awal, jadi kalau nilai penuh hasil gabungan yang dipakai, baris ini
  // kelebihan tepat sebesar nilai induk. Lihat JENIS_GABUNG di lib/rekon.ts.
  { kind: 'item', label: 'Penggabungan Barang (nilai masuk ke induk)', key: 'penggabungan_masuk', indent: 1 },
  { kind: 'sub', label: 'Reklasifikasi', indent: 1 },
  { kind: 'item', label: 'Intra', indent: 2 },        // reklas_komptabel → Selisih (Fase 2b)
  { kind: 'item', label: 'Ekstra', indent: 2 },       // reklas_komptabel → Selisih (Fase 2b)
  { kind: 'item', label: 'Perubahan Fungsi', key: 'reklas_fungsi_masuk', indent: 2 },
  { kind: 'item', label: 'Kesalahan Kodefikasi', key: 'reklas_kode_masuk', indent: 2 },
  { kind: 'jumlah-t', label: 'JUMLAH PENAMBAHAN' },
]

const ROWS_KURANG: RowDef[] = [
  { kind: 'header', label: 'Pengurangan' },
  { kind: 'sub', label: 'Penghapusan Pemindahtanganan', indent: 1 },
  { kind: 'item', label: 'Penjualan', key: 'hapus_penjualan', indent: 2 },
  { kind: 'item', label: 'Hibah', key: 'hapus_hibah', indent: 2 },
  { kind: 'item', label: 'Tukar Menukar', key: 'hapus_tukar', indent: 2 },
  { kind: 'item', label: 'Penyertaan Modal', key: 'hapus_penyertaan', indent: 2 },
  { kind: 'item', label: 'Penghapusan Sebab Lain', key: 'hapus_sebab_lain', indent: 1 },
  { kind: 'item', label: 'Penghapusan Pengalihan (transfer keluar)', key: 'pengalihan_keluar', indent: 1 },
  { kind: 'item', label: 'Pengeluaran Internal (transfer keluar)', key: 'internal_keluar', indent: 1 },
  { kind: 'item', label: 'Koreksi Kurang', key: 'koreksi_kurang', indent: 1 },
  // Barang yang DISERAP induk saat kapitalisasi. Total nilainya SAMA dengan
  // baris Kapitalisasi di blok Penambahan kalau induk & anak sekolom
  // komptabel — memang saling meniadakan: nilai berpindah dari anak ke induk,
  // kekayaan pemda tak bertambah. Sebelum 2026-08-27 baris ini tak ada sama
  // sekali, jadi selisihnya jatuh ke "Selisih (belum terpetakan)" sebesar DUA
  // KALI nilai rehab (induk naik + anak hilang).
  { kind: 'item', label: 'Kapitalisasi (barang diserap induk)', key: 'kapitalisasi_keluar', indent: 1 },
  { kind: 'item', label: 'Pemecahan Barang (induk dipecah)', key: 'pemecahan_keluar', indent: 1 },
  // Barang sumber yang dilebur ke induk. Total nilainya SAMA dengan baris
  // Penggabungan di blok Penambahan kalau induk & sumber sekolom komptabel —
  // memang saling meniadakan; penggabungan tidak menambah/mengurangi kekayaan,
  // ia cuma merapikan pencatatan yang terlanjur terpecah.
  { kind: 'item', label: 'Penggabungan Barang (barang dilebur)', key: 'penggabungan_keluar', indent: 1 },
  { kind: 'sub', label: 'Reklasifikasi', indent: 1 },
  { kind: 'item', label: 'Intra', indent: 2 },
  { kind: 'item', label: 'Ekstra', indent: 2 },
  { kind: 'item', label: 'Perubahan Fungsi', key: 'reklas_fungsi_keluar', indent: 2 },
  { kind: 'item', label: 'Kesalahan Kodefikasi', key: 'reklas_kode_keluar', indent: 2 },
  { kind: 'jumlah-k', label: 'JUMLAH PENGURANGAN' },
]

const ROWS: RowDef[] = [
  { kind: 'saldo-awal', label: 'SALDO AWAL' },
  ...ROWS_TAMBAH.map(r => ({ ...r, grup: 'tambah' as const })),
  ...ROWS_KURANG.map(r => ({ ...r, grup: 'kurang' as const })),
  { kind: 'selisih', label: 'Selisih (belum terpetakan)' },
  { kind: 'saldo-akhir', label: 'SALDO AKHIR' },
]

function sumKeys(cell: MutasiCell, keys: MutasiKey[]): UkuranMutasi {
  const t = zeroUkuran()
  for (const k of keys) {
    const u = cell[k]; if (!u) continue
    t.perolehan += u.perolehan; t.beban += u.beban; t.akumulasi += u.akumulasi
  }
  return t
}

// Kategori mutasi pembentuk sebuah baris — dipakai drill-down (klik angka →
// popup rincian). null = baris yang TIDAK punya transaksi pembentuk:
//   · saldo awal/akhir → posisi hasil replay engine per aset, bukan transaksi
//     periode ini (rinciannya ada di menu Penyusutan);
//   · selisih → penyeimbang, justru bagian yang BELUM terpetakan ke kategori —
//     kalau bisa dirinci, dia bukan selisih lagi;
//   · header/sub & baris Reklas Intra/Ekstra (Fase 2b) → memang tanpa angka.
function keysOfRow(row: RowDef): MutasiKey[] | null {
  if (row.kind === 'item') return row.key ? [row.key] : null
  if (row.kind === 'jumlah-t') return TAMBAH_KEYS
  if (row.kind === 'jumlah-k') return KURANG_KEYS
  return null
}

// Keempat ukuran sebuah baris utk (golongan, komptabel). null = sel kosong
// (baris header/sub) — dibedakan dari 0 supaya yang tak punya angka tak terbaca
// sebagai nol.
type Nilai4 = { perolehan: number; beban: number; akumulasi: number; nilaiBuku: number } | null

// Nilai Buku SELALU diturunkan `perolehan − akumulasi`, TAK PERNAH dijumlah
// vertikal antar baris — beban menurunkan NB tapi bukan baris Penambahan/
// Pengurangan, jadi penjumlahan vertikalnya meleset (contoh angka & buktinya di
// docs/rekonsiliasi-bmd-plan.md §6: 470 vs 430).
const nb4 = (perolehan: number, beban: number, akumulasi: number): Nilai4 =>
  ({ perolehan, beban, akumulasi, nilaiBuku: perolehan - akumulasi })

// bebanAwal = Beban baris SALDO AWAL (populasi lanjut) — hasil Fase 3, BUKAN
// `aw.beban`. `aw.beban` itu beban periode P−1 (flow periode lalu); yang
// dibutuhkan di sini beban periode BERJALAN atas populasi awal, supaya kolom
// Beban menjumlah tepat ke beban penyusutan periode ini.
function nilaiBaris(row: RowDef, cell: MutasiCell, aw: Measures, ak: Measures, bebanAwal: number): Nilai4 {
  const t = sumKeys(cell, TAMBAH_KEYS), k = sumKeys(cell, KURANG_KEYS)
  switch (row.kind) {
    case 'saldo-awal': return nb4(aw.perolehan, bebanAwal, aw.akumulasi)
    // Beban di baris ini MEMO: total beban periode berjalan atas populasi akhir.
    // Ia bukan hasil roll-forward — beban itu flow, tak punya "saldo".
    case 'saldo-akhir': return nb4(ak.perolehan, ak.beban, ak.akumulasi)
    case 'jumlah-t': return nb4(t.perolehan, t.beban, t.akumulasi)
    case 'jumlah-k': return nb4(k.perolehan, k.beban, k.akumulasi)
    case 'item': {
      const u = (row.key && cell[row.key]) || zeroUkuran()
      return nb4(u.perolehan, u.beban, u.akumulasi)
    }
    case 'selisih': return nb4(
      (ak.perolehan - aw.perolehan) - (t.perolehan - k.perolehan),
      // Kolom Beban HARUS berjumlah persis ke beban periode berjalan (ak.beban).
      // Sisanya = beban aset yang masuk sel ini tanpa baris mutasi yang
      // memetakannya (mis. reklas komptabel Intra↔Ekstra, Fase 2b).
      ak.beban - (bebanAwal + t.beban + k.beban),
      // Rantai akumulasi (rencana §5.3) memuat ΣBeban periode berjalan sbg suku
      // TERSENDIRI — akumulasi memang bertambah karena beban, dan beban itu ada
      // di kolom sebelahnya, bukan di baris Penambahan. Jadi kolom Akumulasi
      // sengaja TIDAK menjumlah vertikal seperti kolom Perolehan.
      (ak.akumulasi - aw.akumulasi) - (ak.beban + t.akumulasi - k.akumulasi),
    )
    default: return null // header/sub → tanpa angka
  }
}

export default function RekonsiliasiPage() {
  const supabase = createClient()
  const [org, setOrg] = useState<OrgSelection>({ skpdId: null, descendantIds: null })
  const [tahun, setTahun] = useState(() => tahunAwal('2026'))
  const [smt, setSmt] = useState('1')
  // ⚠️ `skpdId`/`descendantIds` ikut DIBEKUKAN di sini (2026-08-26). Sempat
  // dicabut bersama kop "Berita Acara" 2026-08-11 dan CLAUDE.md sudah mencatat
  // "kalau nanti diminta kembali, `applied` perlu ikut membekukan `skpdId`
  // lagi" — inilah saatnya: lembar BA Rekon memuat nama SKPD di kop suratnya,
  // dan itu WAJIB SKPD yang angkanya sedang tampil. Kalau dibaca dari `org`
  // (nilai HIDUP), operator yang mengganti pilihan SKPD tanpa menekan Proses
  // akan mencetak angka SKPD lama di bawah kop SKPD baru — tanpa satu pun
  // tanda, dan lembar itu ditandatangani.
  const [applied, setApplied] = useState<
    { tahun: string; smt: string; skpdId: number | null; descendantIds: number[] | null } | null
  >(null)
  const [snapAwal, setSnapAwal] = useState<Snapshot>({})
  const [snapAkhir, setSnapAkhir] = useState<Snapshot>({})
  const [mutasi, setMutasi] = useState<Mutasi>({})
  // Fase 3 — Beban baris SALDO AWAL per golongan × komptabel (populasi lanjut).
  const [bebanAwal, setBebanAwal] = useState<Record<string, { intra: number; ekstra: number }>>({})
  // Baris rinci pembentuk angka mutasi — ditahan di memori untuk drill-down.
  // Agregatnya dijumlah dari array yang SAMA (aggregateMutasi), jadi total di
  // popup tak mungkin beda dari angka yang diklik.
  const [lines, setLines] = useState<MutasiLine[]>([])
  const [skpdNama, setSkpdNama] = useState<Record<number, string>>({})
  const [detail, setDetail] = useState<{ judul: string; rows: MutasiLine[]; peny: Map<string, PenyusutanAset> } | null>(null)
  const [detailBusy, setDetailBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  // ── Berita Acara Rekonsiliasi (Format V.2 Permendagri 47/2021) ────────────
  // `ba` = konfigurasi lembar yang sudah disusun operator; dibiarkan MENETAP
  // sesudah dicetak supaya cetak ulang tak perlu mengisi ulang pop-upnya.
  const [ba, setBa] = useState<KonfigBA | null>(null)
  const [modalBA, setModalBA] = useState(false)
  const [modeCetak, setModeCetak] = useState<'tabel' | 'ba'>('tabel')
  // Pemicu cetak sengaja COUNTER, bukan boolean yang di-reset: `window.print()`
  // harus dijalankan SESUDAH React sempat merender blok yang mau dicetak, dan
  // boolean yang di-reset sendiri gampang jadi "klik kedua tak melakukan apa-apa"
  // kalau `afterprint` tak pernah menyala (beda-beda antar peramban).
  const [pemicuCetak, setPemicuCetak] = useState(0)

  useEffect(() => {
    if (pemicuCetak === 0) return
    // `document.title` = nama bawaan berkas saat "Save as PDF" — satu-satunya
    // cara menyetelnya dari halaman. Dipulihkan sesudah cetak supaya judul tab
    // dashboard tidak ikut berubah permanen.
    const judulAsli = document.title
    if (modeCetak === 'ba' && applied) {
      document.title = namaBerkasBA(
        applied.skpdId != null ? (skpdNama[applied.skpdId] || '') : '',
        `${applied.tahun}-S${applied.smt}`,
      )
    }
    const pulih = () => { document.title = judulAsli }
    window.addEventListener('afterprint', pulih)
    const t = window.setTimeout(() => window.print(), 80)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('afterprint', pulih)
      pulih()
    }
  }, [pemicuCetak]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      const map: Record<number, string> = {}
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        for (const s of data as { id: number; nama: string }[]) map[s.id] = s.nama
        if (data.length < 1000) break
      }
      setSkpdNama(map)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function proses() {
    setLoading(true)
    setDetail(null); setErr('')
    const desc = org.descendantIds ?? null
    const periode = `${tahun}-S${smt}`
    const awalPeriode = smt === '1' ? `${Number(tahun) - 1}-S2` : `${tahun}-S1`
    try {
      // ── FASE 4 (migrasi 20260818_03/04) ───────────────────────────────────
      // Agregat kedua snapshot + beban populasi lanjut datang dari SATU RPC.
      // Dulu halaman ini menarik posisi 295.141 aset DUA KALI ke browser lewat
      // ±8.400 permintaan lalu menjumlahnya di sini; sekarang yang menyeberang
      // cuma 9 baris sel. Terukur sbg pengurus Dinas Pendidikan: 30,4 dtk,
      // turun dari belasan menit.
      const [rekap, mutLines] = await Promise.all([
        fetchRekonRekap(supabase, awalPeriode, periode, desc),
        fetchMutasiLines(supabase, periode, desc),
      ])
      // Atribusi Fase 3 harus tahu apakah SATU aset masuk/keluar/tetap di selnya
      // antara P−1 dan P — itu tetap butuh posisi per-aset, tapi HANYA untuk aset
      // yang punya baris mutasi (≤132 se-kabupaten per periode; terukur 2026-S1
      // = 75 aset, 2026-S2 = 132). Menarik seluruh populasi demi itu adalah
      // 99,96% pekerjaan sia-sia.
      const asetMutasi = mutLines.map(l => l.aset_id)
      const [posAwal, posAkhir] = await Promise.all([
        fetchPosAset(supabase, awalPeriode, desc, asetMutasi),
        fetchPosAset(supabase, periode, desc, asetMutasi),
      ])
      // ⚠️ `attribusiLines`, BUKAN `attribusiPenyusutan`. Yang terakhir juga
      // menghitung `bebanSaldoAwal` dari peta yang diberikan — dan peta di sini
      // sengaja cuma berisi aset bermutasi, jadi hasilnya akan nyaris nol TANPA
      // satu pun error. `bebanSaldoAwal` yang benar datang dari RPC di atas,
      // dihitung di server atas seluruh populasi.
      const atrLines = attribusiLines(mutLines, posAwal, posAkhir)
      setSnapAwal(rekap.awal); setSnapAkhir(rekap.akhir)
      setBebanAwal(rekap.bebanSaldoAwal)
      setLines(atrLines); setMutasi(aggregateMutasi(atrLines))
      setApplied({ tahun, smt, skpdId: org.skpdId, descendantIds: desc })
    } catch (e) {
      // Laporan yang datanya tak lengkap TIDAK BOLEH tampil — angka rekonsiliasi
      // yang kurang sebagian jauh lebih berbahaya daripada halaman yang kosong,
      // karena kelihatan sah dan bakal ikut dilaporkan ke inspektorat/BPK.
      setErr(`${(e as Error).message} — angka tidak ditampilkan supaya tidak ada yang terbaca sebagai sah padahal datanya tak lengkap. Coba Proses lagi; kalau berulang, kabari admin.`)
      setApplied(null)
    }
    setLoading(false)
  }

  // Klik angka → kumpulkan baris pembentuk sel (golongan × komptabel × kategori),
  // lalu ambil posisi penyusutan barang-barangnya (akuntansi butuh beban,
  // akumulasi & nilai buku, bukan cuma nilai transaksi). Diambil SAAT DIKLIK,
  // bukan diprefetch saat Proses: yang dibutuhkan cuma barang di satu sel, jadi
  // querynya kecil & halaman utama tak ikut melambat.
  async function bukaDetail(golKode: string, golUraian: string, komp: Komptabel, row: RowDef) {
    const keys = keysOfRow(row)
    if (!keys) return
    const set = new Set(keys)
    const rows = lines.filter(l => l.golongan === golKode && l.komp === komp && set.has(l.kategori))
    if (rows.length === 0) return
    const judul = `${golKode} ${golUraian} · ${komp === 'intra' ? 'Intrakomptabel' : 'Ekstrakomptabel'} · ${row.label}`
    setDetailBusy(true)
    try {
      const peny = await fetchPenyusutanAset(supabase, rows, `${applied!.tahun}-S${applied!.smt}`)
      setDetail({ judul, rows, peny })
    } catch (e) {
      // Gagal ambil penyusutan TIDAK boleh membatalkan drill-down — rincian
      // transaksinya tetap berguna. Kolom penyusutannya saja yang jadi "—".
      setDetail({ judul, rows, peny: new Map() })
      setErr(`Rincian ditampilkan, tapi kolom penyusutannya gagal dimuat: ${(e as Error).message}`)
    }
    setDetailBusy(false)
  }

  const periodeLabel = applied ? `${applied.tahun}-S${applied.smt}` : ''
  const bebanAwalOf = (gol: string, k: Komptabel) => bebanAwal[gol]?.[k] ?? 0

  function handleExport() {
    if (!applied) return
    const rows: Record<string, string | number>[] = []
    for (const g of GOLONGAN_REKAP) {
      for (const row of ROWS) {
        if (row.kind === 'header' || row.kind === 'sub') continue
        const rec: Record<string, string | number> = { 'Jenis Aset': `${g.kode} — ${g.uraian}`, 'Baris': row.label }
        for (const k of KOMPS) {
          const v = nilaiBaris(row, mutasiCellOf(mutasi, g.kode, k),
            measuresOf(snapAwal, g.kode, k), measuresOf(snapAkhir, g.kode, k), bebanAwalOf(g.kode, k))
          const pref = k === 'intra' ? 'Intra' : 'Ekstra'
          rec[`${pref} — Nilai Perolehan`] = v?.perolehan ?? ''
          rec[`${pref} — Beban`] = v?.beban ?? ''
          rec[`${pref} — Akumulasi`] = v?.akumulasi ?? ''
          rec[`${pref} — Nilai Buku`] = v?.nilaiBuku ?? ''
        }
        rows.push(rec)
      }
    }
    exportToExcel(rows, `Rekonsiliasi_BMD_${periodeLabel}`, 'Rekonsiliasi BMD')
  }

  // Export PDF = CETAK HALAMAN INI apa adanya (permintaan user: "sebagaimana
  // formatnya yang ada di page itu"), bukan halaman /cetak terpisah yang
  // menghitung ulang. Alasannya bukan kemalasan: seluruh angka di sini lahir
  // dari prepareSnapshotCtx → fetchSnapshotPositions → attribusiPenyusutan yang
  // mahal dan bergantung pada `descendantIds` hasil pilihan SkpdCombobox —
  // subtree Dinas Pendidikan saja 694 id, tak mungkin dititipkan lewat URL.
  // Menghitungnya dua kali juga membuka celah berkas PDF berbeda dari layar.
  function handlePrint() {
    if (!applied) return
    setModeCetak('tabel')
    setPemicuCetak(n => n + 1)
  }

  // Lembar Berita Acara memakai angka yang SAMA (state halaman ini), cuma
  // disusun ulang ke bentuk Format V.2 — lihat components/pelaporan/
  // BeritaAcaraRekon.tsx untuk alasan ia tidak jadi rute /cetak terpisah.
  function handleCetakBA(konfig: KonfigBA) {
    setBa(konfig)
    setModalBA(false)
    setModeCetak('ba')
    setPemicuCetak(n => n + 1)
  }

  const namaSkpdApplied = applied?.skpdId != null ? (skpdNama[applied.skpdId] || '') : ''

  return (
    <div className="p-6">
      {/* Saat mencetak: sembunyikan SELURUH halaman lalu tampilkan hanya
          #cetak-rekon. Teknik visibility ini sengaja dipilih supaya tidak perlu
          tahu susunan layout dashboard (sidebar, top bar) — kalau layoutnya
          berubah, cetakannya tetap bersih. `print-color-adjust` menjaga warna
          hijau/merah tetap tercetak; tanpa itu banyak browser membuangnya.
          SATU JENIS ASET = SATU LEMBAR (`break-after: page` per kartu; kartu
          terakhir dikecualikan supaya tak menyisakan halaman kosong).
          Tabelnya dipadatkan habis-habisan — 9 kolom × ~45 baris memang cuma
          muat kalau font & padding ditekan. `table-layout: fixed` + lebar kolom
          pertama 20% mencegah kolom label melar dan mendorong angka keluar
          halaman; label panjang dibiarkan MEMBUNGKUS, angka tidak. */}
      {/* ⚠️ DUA lembar cetak berbeda hidup di halaman yang sama — tabel
          Rekonsiliasi (A4 landscape) dan Berita Acara Format V.2 (A4 potret).
          Aturannya SATU: hanya `modeCetak` yang menentukan mana yang tampil,
          dan yang tidak tampil di-`display:none` — BUKAN cuma `visibility`.
          Trik visibility saja tak cukup di sini: elemen yang tak terlihat tetap
          MENGISI tata letak, jadi #cetak-rekon yang tingginya ~8 halaman akan
          menghasilkan berkas BA berisi 8 lembar kosong di belakangnya. */}
      {/* Mekanik isolasinya dipegang `cssCetakLembar` (satu sumber sejak
          2026-08-29) — termasuk `sembunyikan`, yang menegakkan aturan
          "saudaranya WAJIB display:none" di atas. Kalau salah satu lembar lupa
          menyembunyikan yang lain, `cssCetakLembar` tak bisa menolongnya —
          tapi kalau ia keliru menyembunyikan DIRINYA SENDIRI, fungsinya
          melempar (dikunci lib/cetakLembar.test.ts). */}
      {modeCetak === 'ba' ? (
        <style>{cssCetakLembar({
          id: 'cetak-ba', kertas: 'A4 potret', margin: '1.4cm 1.5cm',
          sembunyikan: ['cetak-rekon'],
          tambahan: `
            /* Satu lembar = satu halaman; lembar terakhir tak menyisakan
               halaman kosong (pola yang sama dgn kartu tabel di bawah). */
            #cetak-ba .lembar { break-after: page; break-inside: auto; }
            #cetak-ba .lembar:last-child { break-after: auto; }
            /* ⚠️ Padatkan HANYA tabel lampiran (.tabel-ba), bukan semua <table>:
               blok isian Nama/NIP/Pangkat/Jabatan di lembar depan juga <table>
               dan tak boleh ikut mengecil. Tanpa pemadatan ini lembar transaksi
               (25 baris + JUMLAH + catatan) mendorong blok tanda tangan ke
               halaman berikutnya sendirian — user 2026-08-26. */
            #cetak-ba .tabel-ba { font-size: 8.5px; }
            #cetak-ba .tabel-ba th, #cetak-ba .tabel-ba td {
              padding: 1px 3px !important; line-height: 1.15;
            }`,
        })}</style>
      ) : (
        <style>{cssCetakLembar({
          id: 'cetak-rekon', kertas: 'A4 lanskap', margin: '0.7cm',
          sembunyikan: ['cetak-ba'],
          tambahan: `
            #cetak-rekon .space-y-3 > * { margin-top: 0 !important; }
            #cetak-rekon .card {
              break-inside: avoid; break-after: page;
              box-shadow: none; border: 0; border-radius: 0; margin: 0;
            }
            #cetak-rekon .card:last-child { break-after: auto; }
            #cetak-rekon .judul-gol { padding: 0 0 2px 0 !important; background: none !important; border: 0 !important; }
            #cetak-rekon .judul-gol p { font-size: 10px !important; }
            #cetak-rekon table { font-size: 6.5px; table-layout: fixed; width: 100%; border-collapse: collapse; }
            #cetak-rekon th, #cetak-rekon td { padding: 0.5px 2px !important; line-height: 1.2; }
            #cetak-rekon th:first-child, #cetak-rekon td:first-child {
              width: 20%; overflow-wrap: anywhere;
            }
            #cetak-rekon td:not(:first-child), #cetak-rekon th:not(:first-child) { white-space: nowrap; }
            #cetak-rekon .overflow-x-auto { overflow: visible !important; }`,
        })}</style>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Rekonsiliasi BMD</h1>
        <p className="text-gray-500 text-sm mt-1">
          Berita Acara Rekonsiliasi — mutasi per jenis aset & semester. Angka period-correct (setara halaman Penyusutan).
        </p>
      </div>

      <div className="card p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Filter data</h2>
        <div className="space-y-3 max-w-3xl">
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">SKPD / Lokasi :</label>
            <SkpdCombobox lockToOperator onChangeSelection={setOrg} allowClear placeholder="Semua — atau ketik SKPD / Sub OPD / Lokasi..." />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Semester :</label>
            <select className="select-filter w-28" value={tahun} onChange={e => setTahun(e.target.value)}>
              {['2025', '2026', '2027'].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <div className="flex gap-4">
              {[['1', 'Semester I'], ['2', 'Semester II']].map(([v, l]) => (
                <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="smt" checked={smt === v} onChange={() => setSmt(v)} />{l}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-40 flex-shrink-0" />
            <button className="btn-primary" onClick={proses} disabled={loading}>{loading ? 'Memproses...' : 'Proses'}</button>
            {applied && <button className="btn-secondary" onClick={handleExport}>Export Excel</button>}
            {applied && <button className="btn-secondary" onClick={handlePrint}>Export PDF / Cetak</button>}
            {applied && (
              <button className="btn-primary" onClick={() => setModalBA(true)}>
                Cetak BA Rekon (Permendagri 47)
              </button>
            )}
          </div>
        </div>
      </div>

      <TahunTerkunciNote tahun={Number(tahun)} />

      {err && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-3">{err}</div>
      )}

      {applied === null ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Atur filter lalu klik <span className="font-medium text-gray-600">Proses</span>.
        </div>
      ) : loading ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Memproses...</div>
      ) : (
        <div id="cetak-rekon" className="space-y-3">
          {/* Kop "Berita Acara" DIBUANG atas permintaan user 2026-08-11 — sejak
              tiap jenis aset dicetak di lembarnya sendiri, kop tiga baris itu
              terulang di setiap halaman dan memakan ruang yang justru dibutuhkan
              tabelnya. Konsekuensi yang DITERIMA: berkas cetak tidak lagi
              menyebut SKPD & periode; identitas lembar cuma judul jenis aset. */}
          <div className="no-print rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-xs text-amber-800">
            <span className="font-medium">Periode {periodeLabel}</span> — keempat ukuran sudah terisi. Baris <b>Selisih</b> memuat
            yang belum terpetakan ke kategori mana pun (a.l. reklas komptabel Intra↔Ekstra): kalau isinya nol, rantai
            Saldo Awal + Penambahan − Pengurangan = Saldo Akhir cocok sempurna untuk sel itu.
          </div>
          <div className="no-print rounded-lg bg-gray-50 border border-gray-200 px-4 py-2 text-xs text-gray-600 space-y-1">
            <p>
              Angka <b>Nilai Perolehan</b> yang bergaris putus-putus bisa <b>diklik</b> untuk melihat rincian transaksi pembentuknya
              (per SKPD, lengkap dengan NIBAR &amp; no. dokumen). Saldo Awal/Akhir tidak — itu posisi hasil replay engine
              per aset, bukan transaksi periode ini; rinciannya di menu Penyusutan. Baris <b>Selisih</b> juga tidak,
              karena isinya justru yang belum terpetakan ke kategori mana pun.
            </p>
            <p>
              <b>Beban</b> itu arus periode berjalan, bukan saldo: kolomnya menjumlah tepat ke beban penyusutan periode ini
              (baris Saldo Akhir = memo totalnya). Beban barang yang sudah ada sejak awal semester — termasuk yang
              dikapitalisasi atau dikoreksi di semester ini — seluruhnya di baris <b>Saldo Awal</b>; baris Kapitalisasi &amp;
              Koreksi hanya membawa perubahan nilai perolehannya.
            </p>
            <p>
              <b>Akumulasi</b> bertambah karena beban, dan beban ada di kolom sebelahnya — jadi kolom ini sengaja tidak
              menjumlah vertikal seperti Nilai Perolehan. Rantainya: Saldo Awal + <b>Beban periode</b> + akumulasi bawaan
              barang masuk − akumulasi barang keluar = Saldo Akhir. <b>Nilai Buku</b> selalu diturunkan
              (Nilai Perolehan − Akumulasi), tak pernah dijumlah antar baris.
            </p>
          </div>
          {GOLONGAN_REKAP.map(g => (
            <div key={g.kode} className="card overflow-hidden">
              <div className="judul-gol px-4 py-1.5 border-b border-gray-100 bg-gray-50/60">
                <p className="text-sm font-semibold text-gray-800">{g.kode} — {g.uraian}</p>
              </div>
              <div className="overflow-x-auto">
                {/* ⚠️ Dipadatkan lewat varian ber-SCOPE (`[&_.table-td]:…`),
                    sengaja BUKAN dgn mengubah `.table-td`/`.table-th` di
                    globals.css — dua kelas itu dipakai hampir seluruh tabel
                    aplikasi, jadi menyunting yang di sana akan mengecilkan
                    Daftar Barang, Penyusutan, & belasan menu lain sekaligus.
                    Bawaan `py-3` (12px) × ~46 baris membuat satu jenis aset
                    mustahil muat sepandangan; `py-0.5` memangkasnya ±500px
                    sehingga blok Penambahan & Pengurangan terlihat bersamaan
                    (permintaan user 2026-08-27). */}
                <table className="w-full text-[11px] [&_.table-td]:px-2 [&_.table-td]:py-0.5 [&_.table-th]:px-2 [&_.table-th]:py-1 [&_.table-th]:normal-case [&_.table-th]:tracking-normal">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="table-th text-left" rowSpan={2}>Uraian</th>
                      {KOMPS.map(k => <th key={k} className="table-th text-center border-l border-gray-100" colSpan={4}>{k === 'intra' ? 'Intrakomptabel' : 'Ekstrakomptabel'}</th>)}
                    </tr>
                    <tr>
                      {KOMPS.map(k => ['Nilai Perolehan', 'Beban', 'Akumulasi', 'Nilai Buku'].map((lbl, i) => (
                        <th key={`${k}-${lbl}`} className={`table-th text-right ${i === 0 ? 'border-l border-gray-100' : ''}`}>{lbl}</th>
                      )))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {ROWS.map((row, ri) => {
                      const isSaldo = row.kind === 'saldo-awal' || row.kind === 'saldo-akhir'
                      const isJumlah = row.kind === 'jumlah-t' || row.kind === 'jumlah-k'
                      const isHead = row.kind === 'header'
                      // Blok Penambahan/Pengurangan ikut diberi latar & warna
                      // judul supaya dua blok itu terbaca sekali lihat — di
                      // lembar sepanjang ini keduanya mudah tertukar.
                      const cls = isSaldo ? 'bg-teal/5 font-semibold text-gray-900'
                        : isJumlah ? (row.grup === 'tambah'
                            ? 'bg-emerald-50 font-semibold text-emerald-800'
                            : 'bg-red-50 font-semibold text-red-800')
                        : isHead ? (row.grup === 'tambah'
                            ? 'bg-emerald-50/60 font-medium text-emerald-800'
                            : 'bg-red-50/60 font-medium text-red-800')
                        : row.kind === 'selisih' ? 'text-gray-500 italic' : ''
                      return (
                        <tr key={ri} className={cls}>
                          {/* `text-xs` DICABUT dari sel — ia menimpa ukuran
                              tabel (`text-[11px]`) & membuat pemadatannya
                              tak berefek. Indentasi ikut dirapatkan (1rem →
                              0.65rem per tingkat): hierarki tetap terbaca,
                              tapi kolom Uraian tak lagi memakan lebar yang
                              dibutuhkan delapan kolom angka. */}
                          <td className="table-td whitespace-nowrap" style={{ paddingLeft: `${0.5 + (row.indent || 0) * 0.65}rem` }}>{row.label}</td>
                          {KOMPS.map(k => {
                            const v = nilaiBaris(row, mutasiCellOf(mutasi, g.kode, k),
                              measuresOf(snapAwal, g.kode, k), measuresOf(snapAkhir, g.kode, k), bebanAwalOf(g.kode, k))
                            const p = v?.perolehan ?? null
                            const beban = v?.beban ?? null
                            const akum = v?.akumulasi ?? null
                            const nb = v?.nilaiBuku ?? null
                            // Nilai Perolehan baris mutasi bisa diklik → popup rincian
                            // transaksinya. Kolom lain (Beban/Akumulasi/Nilai Buku) &
                            // baris saldo/selisih tidak — lihat keysOfRow().
                            const adaRincian = keysOfRow(row) !== null && p != null && p !== 0
                            // Nol ditampilkan sebagai "–" (permintaan user
                            // 2026-08-11): di lembar seluas ini deretan angka 0
                            // justru menenggelamkan sel yang benar-benar berisi.
                            // Tetap ABU-ABU & tak berwarna — mewarnai tanda pisah
                            // cuma menambah bising, dan nol bukan mutasi.
                            const warna = row.grup === 'tambah' ? 'text-emerald-700'
                              : row.grup === 'kurang' ? 'text-red-600' : ''
                            const td = (id: string, v: number | null, border = false, onClick?: () => void) => (
                              <td key={id} className={`table-td text-right tabular-nums whitespace-nowrap ${border ? 'border-l border-gray-100' : ''}`}>
                                {v == null ? <span className="text-gray-300">{isHead || row.kind === 'sub' ? '' : '–'}</span>
                                  : v === 0 ? <span className="text-gray-300">–</span>
                                  : onClick ? (
                                    // Setelah angka diwarnai per grup, warna tak
                                    // lagi bisa jadi penanda "bisa diklik" —
                                    // dipindah ke garis putus-putus. Di kertas
                                    // garis ini ikut hilang (.no-print tak
                                    // berlaku di sini, tapi tooltip & klik memang
                                    // tak berarti apa-apa di PDF).
                                    <button type="button" onClick={onClick}
                                      className={`tabular-nums underline decoration-dotted decoration-gray-400 underline-offset-4 hover:decoration-solid ${warna || 'text-teal'}`}
                                      title="Klik untuk melihat rincian transaksi pembentuk angka ini">
                                      {angka(v)}
                                    </button>
                                  ) : <span className={warna}>{angka(v)}</span>}
                              </td>
                            )
                            return [
                              td(`${k}-p`, p, true, adaRincian ? () => bukaDetail(g.kode, g.uraian, k, row) : undefined),
                              td(`${k}-b`, beban), td(`${k}-a`, akum), td(`${k}-n`, nb),
                            ]
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lembar Berita Acara — TERSEMBUNYI di layar (`hidden`), disalakan hanya
          oleh print CSS di atas. Ia memakai state yang SAMA dgn tabel di layar,
          jadi berkas yang ditandatangani mustahil berbeda dari yang barusan
          diproses. Dibiarkan menetap sesudah dicetak supaya cetak ulang tak
          perlu mengisi pop-upnya lagi. */}
      {applied && ba && (
        <BeritaAcaraRekon
          konfig={ba}
          periode={periodeLabel}
          namaSkpd={namaSkpdApplied}
          snapAwal={snapAwal}
          snapAkhir={snapAkhir}
          mutasi={mutasi}
        />
      )}

      {modalBA && applied && (
        <BeritaAcaraRekonModal
          skpdId={applied.skpdId}
          namaSkpd={namaSkpdApplied}
          descendantIds={applied.descendantIds}
          periode={periodeLabel}
          onClose={() => setModalBA(false)}
          onCetak={handleCetakBA}
        />
      )}

      {detailBusy && !detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="card px-6 py-4 bg-white text-sm text-gray-600">Memuat rincian...</div>
        </div>
      )}
      {detail && (
        <RekonDetailModal judul={detail.judul} rows={detail.rows} skpdNama={skpdNama}
          penyusutan={detail.peny} onClose={() => setDetail(null)} />
      )}
    </div>
  )
}
