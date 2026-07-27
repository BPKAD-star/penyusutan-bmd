'use client'
// Cetak Lembar Kerja Inventarisasi (LKI) — Format III.A.x.
// LKI adalah form PER-BARANG, jadi halaman ini mencetak SATU LEMBAR PER BARANG
// (page-break antar lembar). Standalone, A4 potrait. Query: ?inv=<id inventarisasi>
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatRupiah } from '@/lib/export'
import {
  konfigLki, normalKondisi,
  type InvBaris, type InvHeader, type LkiConfig, type SesuaiField,
} from '@/lib/inventarisasi'

const HDR_COLS = 'id,skpd_id,tahun,golongan,status,catatan_validator,petugas,keterangan,diajukan_at,divalidasi_at,created_at'
const tglID = () => new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

/** Tampilkan jawaban "Sesuai / Tidak Sesuai" beserta nilai seharusnya. */
function jawabSesuai(f: SesuaiField | undefined, semula: string | null | undefined) {
  if (!f) return <span className="text-gray-400">—</span>
  if (f.sesuai !== false) return <>☑ Sesuai <span className="text-gray-500">({semula || '—'})</span></>
  return <>☒ Tidak Sesuai — seharusnya: <b>{f.seharusnya || '(kosong)'}</b></>
}

function Baris({ kode, label, children }: { kode: string; label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td className="brd px-1.5 py-1 align-top w-6 text-center">{kode}</td>
      <td className="brd px-1.5 py-1 align-top w-56">{label}</td>
      <td className="brd px-1.5 py-1 align-top">{children}</td>
    </tr>
  )
}

function Lembar({ b, hdr, config, no }: { b: InvBaris; hdr: InvHeader; config: LkiConfig; no: number }) {
  const s = b.snapshot || {}
  const j = b.jawaban || {}
  const belumTercatat = !b.aset_id
  const baru = j.baru || {}

  return (
    <div className="bg-white p-8 shadow print:shadow-none print:p-0 mb-6 print:mb-0 print:break-after-page text-[11px] text-gray-900">
      <p className="text-right font-serif text-sm mb-2">
        Format {belumTercatat ? 'III.A.7' : config.format}
      </p>
      <div className="text-center mb-3">
        <p className="font-bold uppercase">Lembar Kerja Inventarisasi (LKI)</p>
        <p className="font-bold uppercase">{belumTercatat ? 'BMD Belum Tercatat' : config.label}</p>
        <p>PROVINSI JAWA TIMUR, KABUPATEN KEDIRI</p>
      </div>

      <div className="mb-2 space-y-0.5">
        <p>Kuasa Pengguna Barang / Pengguna Barang : <b>{hdr.skpd?.nama || `SKPD #${hdr.skpd_id}`}</b></p>
        <p>Tahun Inventarisasi : <b>{hdr.tahun}</b> &nbsp;·&nbsp; Lembar ke-{no}</p>
        {!belumTercatat && <p>NIBAR : <b>{s.nibar || '—'}</b></p>}
      </div>

      <table className="border-collapse w-full">
        <style>{`.brd{border:1px solid #9ca3af}`}</style>
        <tbody>
          {belumTercatat ? (
            <>
              <Baris kode="1" label="Kode Barang">{baru.kode_barang || '—'}</Baris>
              <Baris kode="2" label="Nama Barang">{baru.nama_barang || '—'}</Baris>
              <Baris kode="3" label="Nama Spesifikasi Barang">{baru.spesifikasi || '—'}</Baris>
              <Baris kode="4" label="Kode Register">{baru.kode_register || '—'}</Baris>
              <Baris kode="5" label="Merek/Tipe">{baru.merek_tipe || '—'}</Baris>
              <Baris kode="6" label="Nomor Polisi / Rangka / Mesin">
                {[baru.no_polisi, baru.no_rangka, baru.no_mesin].filter(Boolean).join(' / ') || '—'}
              </Baris>
              <Baris kode="7" label="Jumlah / Satuan">{`${baru.jumlah ?? '—'} ${baru.satuan || ''}`}</Baris>
              <Baris kode="8" label="Harga Satuan / Nilai Perolehan">
                {formatRupiah(baru.harga_satuan || 0)} / {formatRupiah(baru.nilai_perolehan || 0)}
              </Baris>
              <Baris kode="9" label="Tanggal, Bulan, Tahun Perolehan">{baru.tgl_perolehan || '—'}</Baris>
              <Baris kode="10" label="Alamat">{baru.alamat || '—'}</Baris>
              <Baris kode="11" label="Dasar Pencatatan">{baru.dasar_pencatatan || '—'}</Baris>
              <Baris kode="12" label="Kondisi Barang">{baru.kondisi || '—'}</Baris>
            </>
          ) : (
            <>
              <Baris kode="A" label="NIBAR">{s.nibar || '—'}</Baris>
              <Baris kode="B–C" label="Kode Barang & Nama Barang">
                {j.kode_barang?.sesuai === false
                  ? <>☒ Tidak Sesuai — seharusnya: <b>{j.kode_barang.kode_baru || '(kosong)'}</b> · {j.kode_barang.uraian_baru || '—'}</>
                  : <>☑ Sesuai <span className="text-gray-500">({s.kode || '—'} · {s.uraian_barang || '—'})</span></>}
              </Baris>
              <Baris kode="D" label="Nama Spesifikasi Barang">{jawabSesuai(j.spesifikasi, s.nama_barang)}</Baris>
              <Baris kode="E" label="Jumlah Barang">{s.jumlah ?? '—'}</Baris>
              <Baris kode="F" label="Satuan Barang">{jawabSesuai(j.satuan, s.satuan)}</Baris>
              <Baris kode="G" label="Keberadaan Barang">
                {j.keberadaan === 'ada' ? '☑ Ada'
                  : j.keberadaan === 'hilang' ? '☒ Tidak ada — Hilang (kecurian)'
                  : j.keberadaan === 'tidak_ditemukan' ? '☒ Tidak ada — Tidak ditemukan'
                  : <span className="text-gray-400">—</span>}
              </Baris>
              <Baris kode="H" label="Nilai Perolehan Barang">
                {formatRupiah(s.nilai_perolehan ?? 0)}
              </Baris>
              <Baris kode="I" label="Biaya atribusi / menambah kapasitas manfaat">
                {j.atribusi === 'ya_induk_diketahui' ? (
                  <>☑ Ya — data awal/induk diketahui:
                    <div className="ml-3">NIBAR {j.induk?.nibar || '—'} · {j.induk?.nama_barang || '—'}</div>
                  </>
                ) : j.atribusi === 'ya_induk_tidak_diketahui' ? '☑ Ya — data awal/induk TIDAK diketahui'
                  : '☑ Bukan biaya atribusi'}
              </Baris>
              <Baris kode="J" label="Alamat">{jawabSesuai(j.alamat, s.alamat)}</Baris>
              <Baris kode="K" label="Kondisi Barang">
                {j.kondisi || '—'} <span className="text-gray-500">(sebelum: {normalKondisi(s.kondisi) || '—'})</span>
              </Baris>
              {config.merekTipe && <Baris kode="L" label="Merek / Tipe">{jawabSesuai(j.merek_tipe, s.merek_tipe)}</Baris>}
              {config.nomorKendaraan && (
                <>
                  <Baris kode="M" label="Nomor Polisi">{jawabSesuai(j.no_polisi, s.no_polisi)}</Baris>
                  <Baris kode="N" label="Nomor Rangka">{jawabSesuai(j.no_rangka, s.no_rangka)}</Baris>
                  <Baris kode="O" label="Nomor Mesin">{jawabSesuai(j.no_mesin, s.no_mesin)}</Baris>
                </>
              )}
              <Baris kode="L" label="Penggunaan Barang">
                {j.penggunaan ? (
                  <>
                    {j.penggunaan.pihak === 'pemda' ? 'Pemerintah Daerah'
                      : j.penggunaan.pihak === 'pempus' ? 'Pemerintah Pusat'
                      : j.penggunaan.pihak === 'pemda_lain' ? 'Pemerintah Daerah Lainnya' : 'Pihak Lain'}
                    {j.penggunaan.nama ? ` — ${j.penggunaan.nama}` : ''}
                    {j.penggunaan.nama_pemakai ? ` · Pemakai: ${j.penggunaan.nama_pemakai}` : ''}
                    {j.penggunaan.pihak === 'pemda'
                      ? ` · BAST: ${j.penggunaan.bast_pemakaian ? 'Ada' : 'Tidak ada'} · SIP: ${j.penggunaan.sip ? 'Ada' : 'Tidak ada'}`
                      : ` · Dasar penguasaan: ${j.penggunaan.dasar_ada ? `Ada (${j.penggunaan.nama_dokumen || '-'})` : 'Tidak ada'}`}
                  </>
                ) : 'Digunakan sendiri'}
              </Baris>
              <Baris kode="M" label="Data Barang Tercatat Ganda">
                {j.ganda
                  ? <>☑ Ya — NIBAR {j.ganda_data?.nibar || '—'} · {j.ganda_data?.nama_barang || '—'}
                      {j.ganda_data?.pemegang ? ` · ${j.ganda_data.pemegang}` : ''}</>
                  : '☑ Tidak'}
              </Baris>
              {config.tanahMilik && (
                <Baris kode="N" label="Berdiri di atas tanah milik">
                  {j.tanah_milik
                    ? `${j.tanah_milik === 'pemda' ? 'Pemerintah Daerah' : j.tanah_milik === 'pempus' ? 'Pemerintah Pusat' : j.tanah_milik === 'pemda_lain' ? 'Pemerintah Daerah Lainnya' : 'Pihak Lain'}${j.tanah_milik_nama ? ` — ${j.tanah_milik_nama}` : ''}`
                    : '—'}
                </Baris>
              )}
              {config.titikKoordinat && (
                <Baris kode="O" label="Titik Koordinat">
                  {j.latitude != null && j.longitude != null ? `${j.latitude}, ${j.longitude}` : '—'}
                </Baris>
              )}
            </>
          )}
          <Baris kode="P" label="Lainnya">{j.lainnya || '—'}</Baris>
          <Baris kode="Q" label="Keterangan">{j.keterangan || '—'}</Baris>
          <Baris kode="R" label="Foto / Denah">
            {b.foto_paths?.length ? `${b.foto_paths.length} berkas terlampir` : '—'}
          </Baris>
        </tbody>
      </table>

      <div className="mt-6 flex justify-between">
        <div>
          <p className="font-semibold mb-1">Pelaksana / Petugas Inventarisasi</p>
          {(hdr.petugas || []).length === 0 ? <p className="text-gray-400">—</p> : (
            <ol className="list-decimal ml-4 space-y-0.5">
              {(hdr.petugas || []).map(p => <li key={p.pegawai_id}>{p.nama}{p.nip ? ` — NIP. ${p.nip}` : ''}</li>)}
            </ol>
          )}
        </div>
        <div className="text-center">
          <p>Kediri, {tglID()}</p>
          <div className="h-14" />
          <p className="font-semibold underline">(………………………………)</p>
        </div>
      </div>
    </div>
  )
}

export default function CetakLkiPage() {
  const supabase = createClient()
  const [hdr, setHdr] = useState<InvHeader | null>(null)
  const [baris, setBaris] = useState<InvBaris[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const id = new URLSearchParams(window.location.search).get('inv')
      if (!id) { setLoading(false); return }
      const { data: h } = await supabase.from('inventarisasi')
        .select(`${HDR_COLS},skpd:admin_skpd(nama)`).eq('id', id).maybeSingle()
      setHdr((h as never as InvHeader) || null)

      const rows: InvBaris[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('inventarisasi_baris')
          .select('id,inventarisasi_id,aset_id,snapshot,jawaban,foto_paths')
          .eq('inventarisasi_id', id).order('created_at').range(from, from + 999)
        if (!data || data.length === 0) break
        rows.push(...(data as never as InvBaris[]))
        if (data.length < 1000) break
      }
      setBaris(rows)
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const config = konfigLki(hdr?.golongan || '')

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      <style>{`@media print { .no-print { display: none !important; } @page { size: A4 portrait; margin: 1.2cm; } body { background: white; } }`}</style>

      <div className="max-w-4xl mx-auto mb-3 flex justify-end no-print px-4">
        <button onClick={() => window.print()} className="btn-primary text-sm">🖨 Cetak / Simpan PDF</button>
      </div>

      <div className="max-w-4xl mx-auto">
        {loading ? (
          <div className="bg-white p-8 text-sm text-gray-400">Memuat…</div>
        ) : !hdr ? (
          <div className="bg-white p-8 text-sm text-gray-500">Inventarisasi tidak ditemukan.</div>
        ) : baris.length === 0 ? (
          <div className="bg-white p-8 text-sm text-gray-500">Belum ada barang pada inventarisasi ini.</div>
        ) : (
          baris.map((b, i) => <Lembar key={b.id} b={b} hdr={hdr} config={config} no={i + 1} />)
        )}
      </div>
    </div>
  )
}
