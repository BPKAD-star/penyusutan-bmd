// KIBAR (Kartu Inventaris Barang) — halaman PUBLIK (tanpa login), diakses lewat
// scan QR label fisik atau link langsung. Dipakai buat audit di lapangan: tampil
// identitas + riwayat LENGKAP satu barang dari transaksi_bmd (ledger append-only),
// dari cara perolehan awal sampai transaksi terakhir.
//
// SENGAJA pakai createAdminClient() (service-role), BUKAN RLS + Supabase client
// anon di browser — supaya tidak perlu membuka RLS `aset`/`transaksi_bmd` ke
// `anon` (yang berisiko: siapa pun bisa dump SELURUH register lewat Supabase
// client langsung, bukan cuma barang yang di-scan). Service-role key di sini
// cuma jalan di server, tidak pernah terkirim ke browser.
import { headers } from 'next/headers'
import QRCode from 'qrcode'
import { createAdminClient } from '@/lib/supabase/server'
import { fieldsForKode, FIELD_LABEL } from '@/lib/asetFields'
import { KIBAR_JENIS_LABEL, kibarDetail } from '@/lib/kibarJenis'
import PrintLabelButton from '@/components/kibar/PrintLabelButton'
import PrintPageButton from '@/components/kibar/PrintPageButton'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'KIBAR — Kartu Inventaris Barang',
  robots: { index: false, follow: false },
}

type Admin = ReturnType<typeof createAdminClient>

const formatRp = (v: number | null | undefined) =>
  v == null ? '-' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v)
const fmtTgl = (s: string | null | undefined) => s
  ? new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
  : '-'

// Jalan naik dari wilayah_kode (level 4, desa/kel) sampai akar (provinsi) lewat
// parent_kode — tabel `wilayah` cuma 4 level, jadi cukup aman di-loop langsung.
async function resolveWilayah(admin: Admin, kode: string): Promise<string | null> {
  const parts: string[] = []
  let cur: string | null = kode
  for (let i = 0; i < 5 && cur; i++) {
    const { data } = await admin.from('wilayah').select('nama,parent_kode').eq('kode', cur).maybeSingle()
    if (!data) break
    parts.unshift(data.nama)
    cur = data.parent_kode
  }
  return parts.length ? parts.join(' / ') : null
}

export default async function KibarPage({ params }: { params: { nibar: string } }) {
  const admin = createAdminClient()
  const { data: aset } = await admin.from('aset').select('*').eq('nibar', params.nibar).maybeSingle()

  if (!aset) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="card p-8 text-center max-w-md">
          <p className="text-lg font-semibold text-gray-800">Barang tidak ditemukan</p>
          <p className="text-sm text-gray-500 mt-2">NIBAR <span className="font-mono">{params.nibar}</span> tidak terdaftar di register BMD.</p>
        </div>
      </div>
    )
  }

  const [{ data: trxRaw }, wilayahPath] = await Promise.all([
    admin.from('transaksi_bmd')
      .select('id,jenis,periode,tanggal,nilai,skpd_asal,skpd_tujuan,payload,keterangan,jurnal_header(no_sk,tanggal,kategori)')
      .eq('aset_id', aset.id).order('id', { ascending: true }),
    aset.wilayah_kode ? resolveWilayah(admin, aset.wilayah_kode) : Promise.resolve(null),
  ])
  const trx = (trxRaw || []) as unknown as {
    id: number; jenis: string; periode: string; tanggal: string; nilai: number
    skpd_asal: number | null; skpd_tujuan: number | null
    payload: Record<string, unknown> | null; keterangan: string | null
    jurnal_header: { no_sk: string; tanggal: string; kategori: string } | null
  }[]

  const skpdIds = new Set<number>()
  if (aset.skpd_id) skpdIds.add(aset.skpd_id)
  for (const t of trx) { if (t.skpd_asal) skpdIds.add(t.skpd_asal); if (t.skpd_tujuan) skpdIds.add(t.skpd_tujuan) }
  const { data: skpdRows } = skpdIds.size
    ? await admin.from('skpd').select('id,nama').in('id', [...skpdIds])
    : { data: [] as { id: number; nama: string }[] }
  const skpdNama: Record<number, string> = Object.fromEntries((skpdRows || []).map(s => [s.id, s.nama]))

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

  const fields = fieldsForKode(aset.kode).filter(f => f !== 'longitude') // longitude digabung ke latitude
  const specRow = aset as unknown as Record<string, string | number | null>

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
      <div id="kibar-print-area" className="max-w-3xl mx-auto space-y-4">

        {/* Identitas */}
        <div className="card p-5">
          <div className="flex flex-col sm:flex-row gap-5 justify-between">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-gray-400">Kartu Inventaris Barang</p>
              <h1 className="text-lg font-bold text-gray-900 mt-0.5">{aset.nama_barang || aset.uraian_barang || '-'}</h1>
              <p className="text-xs text-gray-500 mt-1">{aset.uraian_barang} · {aset.kode}</p>
              <p className="font-mono text-xs text-gray-600 mt-2 break-all">{aset.nibar}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-gray-600">
                <span><span className="text-gray-400">SKPD:</span> {skpdNama[aset.skpd_id] || '-'}</span>
                <span><span className="text-gray-400">Status:</span> {aset.status === 'aktif' ? 'Aktif' : 'Dihapus'}</span>
                <span><span className="text-gray-400">Cara Perolehan:</span> {KIBAR_JENIS_LABEL[aset.cara_perolehan]?.label || aset.cara_perolehan}</span>
                <span><span className="text-gray-400">Tgl Perolehan:</span> {fmtTgl(aset.tgl_perolehan)}</span>
                <span><span className="text-gray-400">Nilai Perolehan:</span> {formatRp(aset.nilai_perolehan)}</span>
                <span><span className="text-gray-400">Jumlah:</span> {aset.jumlah} {aset.satuan || ''}</span>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2 flex-shrink-0">
              <div className="w-[140px] h-[140px]" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              <div className="kibar-no-print">
                <PrintLabelButton item={{
                  nibar: aset.nibar || '-',
                  namaBarang: aset.nama_barang || aset.uraian_barang || '-',
                  skpdNama: skpdNama[aset.skpd_id] || '-',
                  tglPerolehan: aset.tgl_perolehan,
                }} />
              </div>
            </div>
          </div>
        </div>

        {/* Spesifikasi */}
        <div className="card p-5">
          <p className="text-sm font-semibold text-gray-800 mb-3">Spesifikasi</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {fields.map(f => {
              if (f === 'nama_barang' || f === 'keterangan') return null // sudah tampil di atas / bawah
              if (f === 'wilayah_kode') {
                return wilayahPath ? (
                  <div key={f}><p className="text-xs text-gray-400">{FIELD_LABEL[f]}</p><p className="text-gray-700">{wilayahPath}</p></div>
                ) : null
              }
              if (f === 'latitude') {
                return aset.latitude != null ? (
                  <div key={f}><p className="text-xs text-gray-400">Koordinat</p><p className="text-gray-700">{aset.latitude}, {aset.longitude}</p></div>
                ) : null
              }
              const val = specRow[f]
              if (val == null || val === '') return null
              return (
                <div key={f}>
                  <p className="text-xs text-gray-400">{FIELD_LABEL[f]}</p>
                  <p className="text-gray-700">{f === 'tanggal_dokumen_kepemilikan' ? fmtTgl(String(val)) : String(val)}</p>
                </div>
              )
            })}
          </div>
          {aset.keterangan && <p className="text-sm text-gray-600 mt-3"><span className="text-xs text-gray-400 block">Keterangan</span>{aset.keterangan}</p>}
        </div>

        {/* Foto */}
        {fotoUrls.length > 0 && (
          <div className="card p-5">
            <p className="text-sm font-semibold text-gray-800 mb-3">Foto</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {fotoUrls.map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={u} alt={`Foto ${i + 1}`} className="w-full h-28 object-cover rounded-md border border-gray-200" />
              ))}
            </div>
          </div>
        )}

        {/* Riwayat */}
        <div className="card p-5">
          <p className="text-sm font-semibold text-gray-800 mb-3">Riwayat Transaksi ({trx.length})</p>
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
        </div>

      </div>
    </div>
  )
}
