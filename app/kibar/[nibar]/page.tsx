// KIBAR (Kartu Identitas Barang) — halaman PUBLIK (tanpa login), diakses lewat
// scan QR label fisik atau link langsung. Dipakai buat audit di lapangan: tampil
// identitas + riwayat LENGKAP satu barang dari transaksi_bmd (ledger append-only),
// disusun mengikuti FORMULIR RESMI KIBAR bernomor I–XII.
//
// Bagian I–XII menarik dari `aset` + seluruh `transaksi_bmd` per aset (diturunkan
// per-jenis dari ledger, bukan kolom snapshot). Beberapa field SENGAJA dikosongkan
// dulu karena datanya belum ada di model (keputusan user 2026-07-21):
//   • I.4  Alamat SKPD            — kolom alamat SKPD belum ada
//   • III.7 Biaya Atribusi        — belum dipisah dari nilai_perolehan
//   • III.10 Pihak Menyerahkan    — belum disimpan di payload perolehan
//   • III.12 Dokumen Pendukung    — belum disimpan
//   • VII Pemanfaatan             — menunya belum dikembangkan
// Kalau nanti kolom/menunya ada, tinggal isi rownya (sudah disediakan slotnya).
//
// SENGAJA pakai createAdminClient() (service-role), BUKAN RLS + Supabase client
// anon di browser — supaya tidak perlu membuka RLS `aset`/`transaksi_bmd` ke
// `anon` (yang berisiko: siapa pun bisa dump SELURUH register lewat Supabase
// client langsung, bukan cuma barang yang di-scan). Service-role key di sini
// cuma jalan di server, tidak pernah terkirim ke browser.
import { headers } from 'next/headers'
import QRCode from 'qrcode'
import { createAdminClient } from '@/lib/supabase/server'
import { fieldsForKode, FIELD_LABEL, type FieldKey } from '@/lib/asetFields'
import { kodeLevel3, GOLONGAN_REKAP } from '@/lib/bmd'
import { KIBAR_JENIS_LABEL, kibarDetail } from '@/lib/kibarJenis'
import { JENIS_PEMANFAATAN_LABEL } from '@/lib/pemanfaatan'
import PrintLabelButton from '@/components/kibar/PrintLabelButton'
import PrintPageButton from '@/components/kibar/PrintPageButton'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'KIBAR — Kartu Identitas Barang',
  robots: { index: false, follow: false },
}

type Admin = ReturnType<typeof createAdminClient>

const formatRp = (v: number | null | undefined) =>
  v == null ? '-' : 'Rp ' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(v)
const fmtTgl = (s: string | null | undefined) => s
  ? new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
  : '-'
const dash = (v: unknown) => (v == null || v === '') ? '-' : String(v)

const golonganUraian = (kode: string) =>
  GOLONGAN_REKAP.find(g => g.kode === kodeLevel3(kode))?.uraian || '-'

// Jalan naik dari wilayah_kode (level 4, desa/kel) sampai akar (provinsi) lewat
// parent_kode → array [Provinsi, Kabupaten, Kecamatan, Desa].
async function resolveWilayah(admin: Admin, kode: string): Promise<string[]> {
  const parts: string[] = []
  let cur: string | null = kode
  for (let i = 0; i < 5 && cur; i++) {
    const { data } = await admin.from('admin_wilayah').select('nama,parent_kode').eq('kode', cur).maybeSingle()
    if (!data) break
    parts.unshift(data.nama)
    cur = data.parent_kode
  }
  return parts
}

type SkpdNode = { id: number; nama: string; level: number; parent_id: number | null; kode_lokasi: string | null }
// Rantai SKPD dari akar (level 1, Pengguna Barang) → daun (unit pemegang / Kuasa
// Pengguna Barang). Iteratif naik lewat parent_id — pohon SKPD cuma ~4 level.
async function resolveSkpdChain(admin: Admin, skpdId: number): Promise<SkpdNode[]> {
  const chain: SkpdNode[] = []
  let cur: number | null = skpdId
  for (let i = 0; i < 6 && cur; i++) {
    const { data } = await admin.from('admin_skpd')
      .select('id,nama,level,parent_id,kode_lokasi').eq('id', cur).maybeSingle()
    if (!data) break
    chain.unshift(data as SkpdNode)
    cur = (data as SkpdNode).parent_id
  }
  return chain
}

const PEROLEHAN = new Set(['saldo_awal', 'saldo_awal_checkpoint', 'pengadaan', 'hibah_masuk', 'tukar_menukar', 'hasil_inventarisasi', 'perolehan_lainnya'])
const REKLAS = new Set(['reklas_kode', 'reklas_komptabel', 'reklas_golongan'])
const PENGHAPUSAN = new Set(['penghapusan_pemindahtanganan', 'penghapusan_sebab_lain'])

const SUB_HAPUS = [
  { key: 'penjualan', label: 'Penjualan' },
  { key: 'hibah', label: 'Hibah' },
  { key: 'tukar_menukar', label: 'Tukar Menukar' },
  { key: 'penyertaan_modal', label: 'Penyertaan Modal' },
]

// ── Komponen tampilan (server, tanpa hook) ──────────────────────────────────
function Section({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-gray-200">
      <h2 className="bg-gray-100 px-4 py-2 text-sm font-bold text-gray-800">{num === '—' ? title : `${num}. ${title}`}</h2>
      <div className="px-4 py-3">{children}</div>
    </section>
  )
}
function Row({ label, value, sub, mono }: { label: string; value: React.ReactNode; sub?: boolean; mono?: boolean }) {
  return (
    <div className={`flex text-sm py-1 ${sub ? 'pl-5' : ''}`}>
      <span className="text-gray-500 w-56 flex-shrink-0">{label}</span>
      <span className="text-gray-400 pr-2">:</span>
      <span className={`text-gray-800 min-w-0 break-words ${mono ? 'text-xs' : ''}`}>{value}</span>
    </div>
  )
}
function Empty() {
  return <p className="text-sm text-gray-400 italic">Belum ada.</p>
}

export default async function KibarPage({ params }: { params: { nibar: string } }) {
  const admin = createAdminClient()
  const { data: aset } = await admin.from('aset').select('*').eq('nibar', params.nibar).maybeSingle()

  if (!aset) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="card p-8 text-center max-w-md">
          <p className="text-lg font-semibold text-gray-800">Barang tidak ditemukan</p>
          <p className="text-sm text-gray-500 mt-2">NIBAR <span>{params.nibar}</span> tidak terdaftar di register BMD.</p>
        </div>
      </div>
    )
  }

  const [{ data: trxRaw }, wilayahParts, skpdChain, { data: kodefikasi }] = await Promise.all([
    admin.from('transaksi_bmd')
      .select('id,jenis,periode,tanggal,nilai,skpd_asal,skpd_tujuan,payload,keterangan,header_id,jurnal_header(no_sk,tanggal,kategori,payload)')
      .eq('aset_id', aset.id).order('id', { ascending: true }),
    aset.wilayah_kode ? resolveWilayah(admin, aset.wilayah_kode) : Promise.resolve([] as string[]),
    aset.skpd_id ? resolveSkpdChain(admin, aset.skpd_id) : Promise.resolve([] as SkpdNode[]),
    admin.from('admin_kodefikasi_bmd').select('uraian').eq('kode', aset.kode).maybeSingle(),
  ])
  // Uraian Barang (II.4) diambil dari kodefikasi — pola sama Daftar Barang &
  // Penyusutan, supaya selalu ikut kodefikasi terkini. Kolom tersimpan
  // `aset.uraian_barang` jadi CADANGAN saja (kode tak terdaftar / query gagal):
  // barang hasil PEMECAHAN yg dibuat sebelum perbaikan ini kolomnya null, jadi
  // kartu yang dicetak keluar "-" padahal kodenya jelas punya uraian.
  const uraianBarang = (kodefikasi as { uraian: string | null } | null)?.uraian || aset.uraian_barang
  const trx = (trxRaw || []) as unknown as {
    id: number; jenis: string; periode: string; tanggal: string; nilai: number
    skpd_asal: number | null; skpd_tujuan: number | null
    payload: Record<string, unknown> | null; keterangan: string | null; header_id: string | null
    jurnal_header: { no_sk: string; tanggal: string; kategori: string; payload: Record<string, unknown> | null } | null
  }[]

  // Nama SKPD utk kolom skpd_asal/tujuan di ledger (di luar rantai pemegang).
  const skpdIds = new Set<number>()
  for (const t of trx) { if (t.skpd_asal) skpdIds.add(t.skpd_asal); if (t.skpd_tujuan) skpdIds.add(t.skpd_tujuan) }
  for (const s of skpdChain) skpdIds.delete(s.id)
  const { data: skpdRows } = skpdIds.size
    ? await admin.from('admin_skpd').select('id,nama').in('id', [...skpdIds])
    : { data: [] as { id: number; nama: string }[] }
  const skpdNama: Record<number, string> = Object.fromEntries((skpdRows || []).map(s => [s.id, s.nama]))
  for (const s of skpdChain) skpdNama[s.id] = s.nama

  let fotoUrls: string[] = []
  if (aset.foto_paths?.length) {
    const { data } = await admin.storage.from('aset-foto').createSignedUrls(aset.foto_paths, 3600)
    fotoUrls = (data || []).map(d => d.signedUrl).filter((u): u is string => !!u)
  }

  const h = headers()
  const host = h.get('host') || ''
  const proto = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'
  const kibarUrl = `${proto}://${host}/kibar/${aset.nibar}`
  const qrSvg = await QRCode.toString(kibarUrl, { type: 'svg', margin: 1, width: 140 })

  // ── Turunan per-bagian dari ledger ────────────────────────────────────────
  const firstOf = (pred: (j: string) => boolean) => trx.find(t => pred(t.jenis)) || null
  const lastOf = (pred: (j: string) => boolean) => {
    for (let i = trx.length - 1; i >= 0; i--) if (pred(trx[i].jenis)) return trx[i]
    return null
  }
  const asal = firstOf(j => PEROLEHAN.has(j))
  const trxTerakhir = trx.length ? trx[trx.length - 1] : null
  // Pengalihan yang DIBATALKAN (`batal_pengalihan` menganulir lewat
  // `payload.target_trx_ids`, bisa beberapa baris sekaligus) tak boleh mengisi
  // bagian Penggunaan — ini kartu barang yang DICETAK, jadi jangan sampai
  // memuat perpindahan yang dianggap tak pernah terjadi. Diturunkan dari `trx`
  // yang memang sudah memuat seluruh baris ledger aset ini, tanpa query baru.
  const pengalihanDibatalkan = new Set<number>()
  for (const t of trx) {
    if (t.jenis !== 'batal_pengalihan') continue
    for (const v of (t.payload?.target_trx_ids as unknown[] | undefined) || []) {
      const n = Number(v)
      if (Number.isFinite(n)) pengalihanDibatalkan.add(n)
    }
  }
  const pengalihanSah = trx.filter(t => t.jenis === 'pengalihan_status' && !pengalihanDibatalkan.has(t.id))
  const penggunaan = pengalihanSah.length ? pengalihanSah[pengalihanSah.length - 1] : null
  const mutasi = lastOf(j => j === 'mutasi_internal')
  const reklas = firstOf(j => REKLAS.has(j))
  const koreksiNilai = lastOf(j => j === 'koreksi_nilai')
  const kapitalisasi = lastOf(j => j === 'kapitalisasi')
  const penghapusan = lastOf(j => PENGHAPUSAN.has(j))

  // Pemanfaatan (per header): 'pemanfaatan' = perjanjian; 'pemanfaatan_selesai'
  // = berakhir sah (tetap tampil); 'batal_pemanfaatan' = salah catat → header
  // itu diabaikan total. "Terakhir" = header hidup dgn baris pemanfaatan ber-id
  // tertinggi (kalau yg terbaru dibatalkan, jatuh ke perjanjian sah sebelumnya).
  const pemMap = new Map<string, { row: (typeof trx)[number]; selesai: boolean; alive: boolean }>()
  for (const t of trx) {
    if (!t.header_id) continue
    if (t.jenis === 'pemanfaatan') pemMap.set(t.header_id, { row: t, selesai: false, alive: true })
    else if (t.jenis === 'pemanfaatan_selesai') { const e = pemMap.get(t.header_id); if (e) e.selesai = true }
    else if (t.jenis === 'batal_pemanfaatan') { const e = pemMap.get(t.header_id); if (e) e.alive = false }
  }
  let lastPem: (typeof trx)[number] | null = null
  let pemEnded = false
  for (const e of pemMap.values()) {
    if (!e.alive) continue
    if (!lastPem || e.row.id > lastPem.id) { lastPem = e.row; pemEnded = e.selesai }
  }
  const todayISO = new Date().toISOString().slice(0, 10)

  const penggunaBarang = skpdChain[0]?.nama || '-'                        // root (level 1)
  const pemegang = skpdChain[skpdChain.length - 1]?.nama || penggunaBarang // daun (unit pemegang)
  const kuasaPengguna = skpdChain.length > 1 ? pemegang : '-'
  const kodeLokasi = skpdChain[skpdChain.length - 1]?.kode_lokasi || null

  // Spesifikasi lainnya = field golongan yang belum tampil di row eksplisit II.
  const shownFields = new Set<FieldKey>(['nama_barang', 'keterangan', 'wilayah_kode', 'alamat_detail', 'latitude', 'longitude',
    'luas', 'jenis_hak', 'nomor_dokumen_kepemilikan', 'tanggal_dokumen_kepemilikan', 'nama_dokumen_kepemilikan', 'spesifikasi_lainnya'])
  const specRow = aset as unknown as Record<string, string | number | null>
  const specFields = fieldsForKode(aset.kode).filter(f => !shownFields.has(f) && specRow[f] != null && specRow[f] !== '')

  const hapusSub = penghapusan?.jenis === 'penghapusan_pemindahtanganan'
    ? String(penghapusan.payload?.sub_jenis || '')
    : ''

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #kibar-print-area, #kibar-print-area * { visibility: visible; }
          #kibar-print-area { position: absolute; top: 0; left: 0; width: 100%; }
          .kibar-no-print { display: none !important; }
        }
      `}</style>
      <div className="max-w-3xl mx-auto mb-3 flex justify-end kibar-no-print">
        <PrintPageButton />
      </div>

      <div id="kibar-print-area" className="max-w-3xl mx-auto bg-white border border-gray-300 rounded-lg overflow-hidden">

        {/* Kepala formulir */}
        <div className="px-4 py-4 flex flex-col sm:flex-row gap-4 justify-between items-start border-b-2 border-gray-800">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-gray-900 tracking-wide">KARTU IDENTITAS BARANG (KIBAR)</h1>
            <p className="text-sm font-semibold text-gray-700 mt-0.5">{golonganUraian(aset.kode)}</p>
            <p className="text-sm text-gray-600">PEMERINTAH KABUPATEN KEDIRI</p>
            <p className="text-xs text-gray-500 mt-2 break-all">NIBAR: {aset.nibar}</p>
          </div>
          <div className="flex flex-col items-center gap-2 flex-shrink-0">
            <div className="w-[140px] h-[140px]" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <div className="kibar-no-print">
              <PrintLabelButton item={{
                nibar: aset.nibar || '-',
                namaBarang: aset.nama_barang || uraianBarang || '-',
                merekTipe: aset.merek_tipe,
                skpdNama: pemegang,
                tglPerolehan: aset.tgl_perolehan,
              }} />
            </div>
          </div>
        </div>

        {/* I. Unit Pemakai */}
        <Section num="I" title="Unit Pemakai">
          <Row label="1. Kuasa Pengguna Barang" value={kuasaPengguna} />
          <Row label="2. Pengguna Barang" value={penggunaBarang} />
          <Row label="3. Pengelola Barang" value="Badan Pengelola Keuangan dan Aset Daerah (BPKAD)" />
          <Row label="4. Alamat" value="-" />
        </Section>

        {/* II. Data Barang */}
        <Section num="II" title="Data Barang">
          <Row label="1. Kode Barang" value={dash(aset.kode)} mono />
          <Row label="2. Kode Lokasi" value={dash(kodeLokasi)} mono />
          <Row label="3. Kode Register Barang" value={dash(aset.nibar)} mono />
          <Row label="4. Uraian Barang" value={dash(uraianBarang)} />
          <Row label="5. Nama Barang" value={dash(aset.nama_barang)} />
          <Row label="6. Luas" value={aset.luas != null ? String(aset.luas) : '-'} />
          <Row label="7. Satuan Barang" value={dash(aset.satuan)} />
          <Row label="8. Harga Satuan Perolehan" value={formatRp(aset.harga_satuan)} />
          <Row label="9. Nilai Perolehan" value={formatRp(aset.nilai_perolehan)} />
          <Row label="10. Kondisi Barang" value={dash(aset.kondisi_barang)} />
          <div className="text-sm py-1 text-gray-700 font-medium">11. Lokasi</div>
          <Row label="a. Provinsi" value={dash(wilayahParts[0])} sub />
          <Row label="b. Kabupaten/Kota" value={dash(wilayahParts[1])} sub />
          <Row label="c. Kecamatan" value={dash(wilayahParts[2])} sub />
          <Row label="d. Kelurahan/Desa" value={dash(wilayahParts[3])} sub />
          <Row label="e. Alamat Detail" value={dash(aset.alamat_detail)} sub />
          <Row label="f. Latitude" value={aset.latitude != null ? String(aset.latitude) : '-'} sub />
          <Row label="g. Longitude" value={aset.longitude != null ? String(aset.longitude) : '-'} sub />
          <div className="text-sm py-1 text-gray-700 font-medium">12. Spesifikasi Lainnya</div>
          {specFields.map(f => (
            <Row key={f} label={FIELD_LABEL[f]} value={dash(specRow[f])} sub />
          ))}
          <Row label="Keterangan Spesifikasi" value={dash(aset.spesifikasi_lainnya)} sub />
          <div className="text-sm py-1 text-gray-700 font-medium">13. Dokumen Kepemilikan</div>
          <Row label="a. Nomor Dokumen" value={dash(aset.nomor_dokumen_kepemilikan)} sub />
          <Row label="b. Tanggal Dokumen" value={aset.tanggal_dokumen_kepemilikan ? fmtTgl(aset.tanggal_dokumen_kepemilikan) : '-'} sub />
          <Row label="c. Nama" value={dash(aset.nama_dokumen_kepemilikan)} sub />
          <Row label="d. Alas Hak" value={dash(aset.jenis_hak)} sub />
          <div className="pt-1">
            <Row label="14. Transaksi Terakhir" value={trxTerakhir
              ? `${KIBAR_JENIS_LABEL[trxTerakhir.jenis]?.label || trxTerakhir.jenis} — ${fmtTgl(trxTerakhir.tanggal)}`
              : '-'} />
          </div>
        </Section>

        {/* III. Informasi Penerimaan Awal Barang */}
        <Section num="III" title="Informasi Penerimaan Awal Barang">
          <Row label="1. Cara Perolehan" value={KIBAR_JENIS_LABEL[aset.cara_perolehan]?.label || dash(aset.cara_perolehan)} />
          <Row label="2. Tanggal Perolehan" value={fmtTgl(aset.tgl_perolehan)} />
          <Row label="3. Luas" value={aset.luas != null ? String(aset.luas) : '-'} />
          <Row label="4. Satuan Barang" value={dash(aset.satuan)} />
          <Row label="5. Harga Satuan Perolehan" value={formatRp(aset.harga_satuan)} />
          <Row label="6. Nilai Total Barang" value={formatRp(aset.nilai_perolehan)} />
          <Row label="7. Biaya Atribusi" value="-" />
          <Row label="8. Nilai Perolehan" value={formatRp(aset.nilai_perolehan)} />
          <Row label="9. Pihak Yang Menyerahkan" value="-" />
          <div className="text-sm py-1 text-gray-700 font-medium">10. Dokumen Sumber Perolehan</div>
          <Row label="a. Nama Dokumen" value={dash(asal?.jurnal_header?.kategori)} sub />
          <Row label="b. Nomor Dokumen" value={dash(asal?.jurnal_header?.no_sk)} sub />
          <Row label="c. Tanggal Dokumen" value={asal?.jurnal_header?.tanggal ? fmtTgl(asal.jurnal_header.tanggal) : '-'} sub />
          <div className="text-sm py-1 text-gray-700 font-medium">11. Dokumen Pendukung Lainnya</div>
          <Row label="a. Nama Dokumen" value="-" sub />
          <Row label="b. Nomor Dokumen" value="-" sub />
          <Row label="c. Tanggal Dokumen" value="-" sub />
        </Section>

        {/* IV. Informasi Penggunaan */}
        <Section num="IV" title="Informasi Penggunaan">
          {penggunaan ? (
            <>
              <Row label="1. Penggunaan Terakhir" value={KIBAR_JENIS_LABEL[penggunaan.jenis]?.label || penggunaan.jenis} />
              <Row label="Tanggal" value={fmtTgl(penggunaan.tanggal)} />
              <Row label="Dari → Ke SKPD" value={`${penggunaan.skpd_asal ? skpdNama[penggunaan.skpd_asal] : '-'} → ${penggunaan.skpd_tujuan ? skpdNama[penggunaan.skpd_tujuan] : '-'}`} />
              <Row label="No. Dokumen" value={dash(penggunaan.jurnal_header?.no_sk)} />
            </>
          ) : <Empty />}
        </Section>

        {/* V. Penerimaan Internal */}
        <Section num="V" title="Informasi Penerimaan Internal Pengguna Barang">
          {mutasi ? (
            <>
              <Row label="1. Penerimaan Internal Terakhir" value={fmtTgl(mutasi.tanggal)} />
              <Row label="Diterima Oleh" value={dash(mutasi.skpd_tujuan ? skpdNama[mutasi.skpd_tujuan] : null)} />
              <Row label="Dari Sub-Unit" value={dash(mutasi.skpd_asal ? skpdNama[mutasi.skpd_asal] : null)} />
            </>
          ) : <Empty />}
        </Section>

        {/* VI. Pengeluaran Internal */}
        <Section num="VI" title="Informasi Pengeluaran Internal Pengguna Barang">
          {mutasi ? (
            <>
              <Row label="1. Pengeluaran Internal Terakhir" value={fmtTgl(mutasi.tanggal)} />
              <Row label="Dikeluarkan Dari" value={dash(mutasi.skpd_asal ? skpdNama[mutasi.skpd_asal] : null)} />
              <Row label="Ke Sub-Unit" value={dash(mutasi.skpd_tujuan ? skpdNama[mutasi.skpd_tujuan] : null)} />
            </>
          ) : <Empty />}
        </Section>

        {/* VII. Pemanfaatan */}
        <Section num="VII" title="Informasi Pemanfaatan">
          {lastPem ? (() => {
            const hp = (lastPem.jurnal_header?.payload || {}) as Record<string, unknown>
            const lp = (lastPem.payload || {}) as { lingkup?: string; bagian?: string | null }
            const berakhir = typeof hp.berakhir === 'string' ? hp.berakhir : ''
            const status = pemEnded ? 'Selesai / Diakhiri' : (berakhir && todayISO > berakhir ? 'Berakhir' : 'Aktif')
            return (
              <>
                <Row label="1. Jenis Pemanfaatan" value={JENIS_PEMANFAATAN_LABEL[String(hp.jenis_pemanfaatan || '')] || '-'} />
                <Row label="2. Mitra Pemanfaatan" value={dash(hp.mitra)} />
                <Row label="3. Alamat Mitra" value={dash(hp.alamat_mitra)} />
                <Row label="4. Mulai Pemanfaatan" value={hp.mulai ? fmtTgl(String(hp.mulai)) : '-'} />
                <Row label="5. Masa Pemanfaatan" value={hp.masa_tahun ? `${hp.masa_tahun} tahun` : '-'} />
                <Row label="6. Berakhirnya Pemanfaatan" value={berakhir ? fmtTgl(berakhir) : '-'} />
                <Row label="7. Lingkup" value={lp.lingkup === 'sebagian' ? `Sebagian${lp.bagian ? ` — ${lp.bagian}` : ''}` : 'Seluruhnya'} />
                <Row label="8. Peruntukan Pemanfaatan" value={dash(hp.peruntukan)} />
                <Row label="9. Jenis Dokumen" value={dash(hp.jenis_dokumen)} />
                <Row label="10. Nomor Dokumen" value={dash(lastPem.jurnal_header?.no_sk)} />
                <Row label="11. Tanggal Dokumen" value={lastPem.jurnal_header?.tanggal ? fmtTgl(lastPem.jurnal_header.tanggal) : '-'} />
                <Row label="Status" value={status} />
              </>
            )
          })() : <Empty />}
        </Section>

        {/* VIII. Reklasifikasi */}
        <Section num="VIII" title="Informasi Reklasifikasi">
          {reklas ? (
            <>
              <Row label="1. Kode Barang Semula" value={dash(reklas.payload?.kode_lama)} mono />
              <Row label="2. Kode Barang Terakhir" value={dash(aset.kode)} mono />
            </>
          ) : <Empty />}
        </Section>

        {/* IX. Koreksi */}
        <Section num="IX" title="Informasi Koreksi">
          {koreksiNilai ? (
            <>
              <div className="text-sm py-1 text-gray-700 font-medium">1. Koreksi Nilai</div>
              <Row label="a. Tanggal Dokumen" value={fmtTgl(koreksiNilai.jurnal_header?.tanggal || koreksiNilai.tanggal)} sub />
              <Row label="b. Nilai Awal" value={formatRp(Number(koreksiNilai.payload?.nilai_lama ?? 0))} sub />
              <Row label="c. Nilai Terakhir" value={formatRp(Number(koreksiNilai.payload?.nilai_perolehan_baru ?? 0))} sub />
            </>
          ) : <Empty />}
        </Section>

        {/* X. Kapitalisasi */}
        <Section num="X" title="Informasi Kapitalisasi / Penambahan Masa Manfaat">
          {kapitalisasi ? (
            <>
              <Row label="1. NIBAR Kapitalisasi" value={dash(aset.nibar)} mono />
              <Row label="2. Tanggal Perolehan Barang" value={fmtTgl(kapitalisasi.tanggal)} />
              <Row label="3. Nilai Perolehan Barang" value={formatRp(Number(kapitalisasi.payload?.nilai_perolehan_baru ?? aset.nilai_perolehan ?? 0))} />
            </>
          ) : <Empty />}
        </Section>

        {/* XI. Penghapusan */}
        <Section num="XI" title="Informasi Penghapusan">
          {penghapusan ? (
            <>
              <Row label="Tanggal Penghapusan" value={fmtTgl(penghapusan.tanggal)} />
              <Row label="No. Dokumen" value={dash(penghapusan.jurnal_header?.no_sk)} />
              <div className="text-sm py-1 text-gray-700 font-medium">1. Penghapusan Pemindahtanganan</div>
              {SUB_HAPUS.map(s => (
                <Row key={s.key} label={s.label} value={hapusSub === s.key ? '✓' : '-'} sub />
              ))}
              <Row label="2. Sebab Lain" value={penghapusan.jenis === 'penghapusan_sebab_lain' ? '✓' : '-'} />
            </>
          ) : <Empty />}
        </Section>

        {/* XII. Keterangan */}
        <Section num="XII" title="Keterangan">
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{dash(aset.keterangan)}</p>
        </Section>

        {/* Foto */}
        {fotoUrls.length > 0 && (
          <Section num="—" title="Foto Barang">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {fotoUrls.map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={u} alt={`Foto ${i + 1}`} className="w-full h-28 object-cover rounded-md border border-gray-200" />
              ))}
            </div>
          </Section>
        )}

        {/* Riwayat lengkap (lampiran audit) */}
        <Section num="—" title={`Riwayat Transaksi Lengkap (${trx.length})`}>
          {trx.length === 0 ? (
            <p className="text-sm text-gray-400">Belum ada transaksi tercatat.</p>
          ) : (
            <ol className="space-y-3">
              {trx.map(t => {
                const meta = KIBAR_JENIS_LABEL[t.jenis] || { label: t.jenis, tone: 'netral' as const }
                const dotColor = meta.tone === 'masuk' ? 'bg-teal' : meta.tone === 'keluar' ? 'bg-rose-500' : 'bg-amber-400'
                const detail = kibarDetail(t.jenis, t.payload, t.skpd_asal ? skpdNama[t.skpd_asal] : null, t.skpd_tujuan ? skpdNama[t.skpd_tujuan] : null)
                return (
                  <li key={t.id} className="flex gap-3">
                    <div className="flex flex-col items-center flex-shrink-0 pt-1">
                      <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                    </div>
                    <div className="min-w-0 flex-1 border-b border-gray-100 pb-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p className="text-sm font-medium text-gray-800">{meta.label}</p>
                        <p className="text-xs text-gray-400">{fmtTgl(t.tanggal)} · {t.periode}</p>
                      </div>
                      {detail && <p className="text-xs text-gray-600 mt-0.5">{detail}</p>}
                      {t.jurnal_header?.no_sk && <p className="text-[11px] text-gray-400 mt-0.5">No. Dokumen: {t.jurnal_header.no_sk}</p>}
                      {t.keterangan && <p className="text-xs text-gray-500 mt-0.5">{t.keterangan}</p>}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </Section>

      </div>
    </div>
  )
}
