'use client'
// ============================================================================
// PreviewKonstruksiModal — "lihat kelengkapan" satu kontrak Pekerjaan Fisik
// (Konstruksi) SEBELUM disetujui. Permintaan user 2026-08-27.
//
// BEDA MAKSUD dari PreviewDraftModal (Cara Perolehan). Di sana yang diperiksa
// KELENGKAPAN SPESIFIKASI per barang; di sini yang jadi pokok perkara BELANJA-
// nya: satu barang KDP dibayar bertermin (perencanaan → fisik → pengawasan →
// biaya umum), tiap termin punya No BAST, tanggal, dan kode rekeningnya
// sendiri, dan nilai asetnya = JUMLAH SELURUH TERMIN. Di kartu, termin itu
// tersebar di beberapa tabel terpisah per barang — jadi pertanyaan yang paling
// sering muncul sebelum menyetujui ("belanjanya sudah pas belum? rekeningnya
// sudah benar semua?") justru yang paling sulit dijawab dari layar kartu.
//
// Karena itu pop-up ini menyajikan TIGA sudut pandang atas angka yang sama:
//   1. Rekap per KOMPONEN  — perencanaan/fisik/biaya umum/pengawasan;
//   2. Rekap per REKENING  — yang dipakai mencocokkan dgn LRA/SP2D;
//   3. Rincian per BARANG  — identitas, kelengkapan spesifikasi, & terminnya.
// Ketiganya dijumlah dari sumber yang SAMA (`barang.pembayaran`), jadi kalau
// ketiga totalnya tak sama, itu bug — bukan beda definisi.
//
// ⚠️ MEMBACA SAJA. Tak ada satu pun tulisan ke DB di berkas ini; ia cuma
// menyusun ulang payload yang sudah ada di layar. Karena itu tombolnya SENGAJA
// di luar cabang `isAdmin` — yang paling butuh memeriksa justru operator SKPD
// yang mengisinya, dan dialah satu-satunya yang tak punya tombol apa pun di
// baris aksi kartu ("Menunggu tinjauan admin."). Pola & alasan yang sama dgn
// tombol 🔍 Pratinjau di kartu Pengadaan.
//
// ⚠️ DAFTAR FIELD SPESIFIKASI DIOPER PEMANGGIL (`fieldKeys`), sengaja BUKAN
// diturunkan sendiri dari `fieldsForKode(barang.kode)`. Kalau diturunkan
// sendiri, pratinjau ini akan memeriksa daftar yang BERBEDA dari yang
// ditawarkan formnya: KDP berkode golongan 1.3.6 (→ template Aset Lainnya),
// tetapi form Edit Spesifikasi-nya sengaja memakai `GOLONGAN_FIELDS['1.3.1']`
// (template Tanah) karena KDP konstruksi butuh lokasi & dokumen. Akibatnya
// pratinjaunya akan menuduh "belum diisi" untuk field yang tak pernah bisa
// diisi dari mana pun — persis kegagalan senyap yang fitur ini justru dibuat
// untuk mencegah. Pemanggil yang memegang kebenarannya, jadi pemanggil yang
// mengoper.
// ============================================================================
import { useMemo } from 'react'
import { backdropClose } from '@/components/backdropClose'
import { formatRupiah } from '@/lib/export'
import { FIELD_LABEL, type FieldKey } from '@/lib/asetFields'
import type { BarangKdp, PembayaranKdp } from '@/lib/kdp'

const KOMPONEN_URUT: PembayaranKdp['komponen'][] = ['perencanaan', 'fisik', 'pengawasan', 'biaya_umum']
const KOMPONEN_LABEL: Record<PembayaranKdp['komponen'], string> = {
  perencanaan: 'Perencanaan', fisik: 'Fisik', pengawasan: 'Pengawasan', biaya_umum: 'Biaya Umum',
}

const totalBarang = (b: BarangKdp) => (b.pembayaran || []).reduce((s, x) => s + Number(x.nominal || 0), 0)

export default function PreviewKonstruksiModal({ judul, subjudul, barangs, fieldKeys, onClose }: {
  judul: string
  subjudul?: string
  barangs: BarangKdp[]
  /** Field spesifikasi yang BENAR-BENAR ditawarkan form KDP — lihat catatan
   *  kepala berkas; jangan diturunkan sendiri dari kode golongannya. */
  fieldKeys: FieldKey[]
  onClose: () => void
}) {
  const semuaTermin = useMemo(
    () => barangs.flatMap(b => (b.pembayaran || []).map(p => ({ ...p, namaBarang: b.nama }))),
    [barangs])

  const total = semuaTermin.reduce((s, t) => s + Number(t.nominal || 0), 0)

  const perKomponen = useMemo(() => {
    const m = new Map<string, { n: number; nilai: number }>()
    for (const t of semuaTermin) {
      const c = m.get(t.komponen) || { n: 0, nilai: 0 }
      c.n += 1; c.nilai += Number(t.nominal || 0)
      m.set(t.komponen, c)
    }
    return KOMPONEN_URUT.filter(k => m.has(k)).map(k => ({ komponen: k, ...m.get(k)! }))
  }, [semuaTermin])

  const perRekening = useMemo(() => {
    const m = new Map<string, { n: number; nilai: number }>()
    for (const t of semuaTermin) {
      // Rekening kosong sengaja DIKELOMPOKKAN sendiri & ditandai — itu justru
      // temuan yang paling berguna sebelum menyetujui.
      const k = (t.kode_rekening || '').trim() || '(belum diisi)'
      const c = m.get(k) || { n: 0, nilai: 0 }
      c.n += 1; c.nilai += Number(t.nominal || 0)
      m.set(k, c)
    }
    return [...m.entries()].map(([kode, v]) => ({ kode, ...v })).sort((a, b) => a.kode.localeCompare(b.kode))
  }, [semuaTermin])

  const tanpaRekening = semuaTermin.filter(t => !(t.kode_rekening || '').trim()).length
  const tanpaBast = semuaTermin.filter(t => !(t.no_bast || '').trim()).length
  const barangKosong = barangs.filter(b => (b.pembayaran || []).length === 0).length

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
      {...backdropClose(onClose)}>
      <div className="card w-full max-w-6xl my-8 bg-white" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-3 border-b border-gray-100 gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Pratinjau Belanja — {judul}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {subjudul ? `${subjudul} · ` : ''}{barangs.length} barang KDP · {semuaTermin.length} termin ·
              total <b>{formatRupiah(total)}</b>
            </p>
          </div>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0" onClick={onClose}>×</button>
        </div>

        {/* Peringatan kelengkapan — BUKAN larangan. Sebagian kontrak memang
            belum punya No BAST saat direncanakan; yang penting operator tahu
            sebelum menekan Setujui, bukan diblokir. */}
        {(tanpaRekening > 0 || tanpaBast > 0 || barangKosong > 0) && (
          <div className="mx-5 mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 space-y-0.5">
            {barangKosong > 0 && <p>⚠ {barangKosong} barang KDP belum punya satu pun termin — nilainya akan tercatat Rp0.</p>}
            {tanpaRekening > 0 && <p>⚠ {tanpaRekening} termin belum diisi kode rekening.</p>}
            {tanpaBast > 0 && <p>⚠ {tanpaBast} termin belum diisi No. BAST.</p>}
          </div>
        )}

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RekapBox judul="Rekap per Komponen" kosong="Belum ada termin.">
              {perKomponen.map(r => (
                <BarisRekap key={r.komponen} kiri={KOMPONEN_LABEL[r.komponen]} n={r.n} nilai={r.nilai} />
              ))}
            </RekapBox>
            <RekapBox judul="Rekap per Kode Rekening" kosong="Belum ada termin.">
              {perRekening.map(r => (
                <BarisRekap key={r.kode} kiri={r.kode} n={r.n} nilai={r.nilai}
                  tandai={r.kode === '(belum diisi)'} />
              ))}
            </RekapBox>
          </div>

          {barangs.map(b => <KartuBarang key={b.key} barang={b} fieldKeys={fieldKeys} />)}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
          <span className="text-sm text-gray-600">Total seluruh termin: <b>{formatRupiah(total)}</b></span>
          <button className="btn-secondary" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  )
}

function RekapBox({ judul, kosong, children }: { judul: string; kosong: string; children: React.ReactNode }) {
  const isi = Array.isArray(children) ? children : [children]
  return (
    <div className="rounded-lg border border-gray-100 overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-600">{judul}</p>
      </div>
      {isi.filter(Boolean).length === 0
        ? <p className="px-3 py-4 text-xs text-gray-400 text-center">{kosong}</p>
        : <div className="divide-y divide-gray-50">{children}</div>}
    </div>
  )
}

function BarisRekap({ kiri, n, nilai, tandai }: { kiri: string; n: number; nilai: number; tandai?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 text-xs">
      <span className={tandai ? 'text-amber-700 font-medium' : 'text-gray-700'}>{kiri}</span>
      <span className="flex items-center gap-3">
        <span className="text-gray-400">{n} termin</span>
        <span className="tabular-nums font-medium text-gray-800">{formatRupiah(nilai)}</span>
      </span>
    </div>
  )
}

function KartuBarang({ barang, fieldKeys }: { barang: BarangKdp; fieldKeys: FieldKey[] }) {
  const spec = barang.spec || {}
  const kosong = fieldKeys.filter(k => !((spec[k] ?? '').toString().trim()))
  const pembayaran = barang.pembayaran || []
  const total = totalBarang(barang)

  return (
    <div className="rounded-lg border border-gray-100 overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800">
            {barang.nama} <span className="text-[11px] text-gray-400 font-normal">· {barang.kode}</span>
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {pembayaran.length} termin
            {kosong.length > 0
              ? <span className="text-amber-700"> · {kosong.length} field spesifikasi kosong</span>
              : <span className="text-teal"> · spesifikasi lengkap</span>}
            {barang.kap_info?.menambah && <> · menambah manfaat {barang.kap_info.target_nama || '(aset dipilih)'}</>}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[11px] text-gray-400">Nilai (Σ termin)</p>
          <p className="font-semibold text-gray-800">{formatRupiah(total)}</p>
        </div>
      </div>

      {/* Field yang KOSONG ditampilkan paling menonjol — itulah yang dicari
          orang saat membuka pratinjau; yang sudah terisi cukup diringkas. */}
      {kosong.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-100 bg-amber-50/40">
          <p className="text-[11px] text-amber-800">
            Belum diisi: {kosong.map(k => FIELD_LABEL[k] || k).join(' · ')}
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-white border-b border-gray-100">
            <tr>
              <th className="table-th text-left whitespace-nowrap">Komponen</th>
              <th className="table-th text-left whitespace-nowrap">No. BAST</th>
              <th className="table-th text-left whitespace-nowrap">Tgl BAST</th>
              <th className="table-th text-left whitespace-nowrap">Kode Rekening</th>
              <th className="table-th text-left">Keterangan</th>
              <th className="table-th text-right whitespace-nowrap">Nominal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {pembayaran.length === 0 ? (
              <tr><td colSpan={6} className="table-td text-center py-4 text-gray-400">Belum ada termin.</td></tr>
            ) : pembayaran.map((p, i) => (
              <tr key={i}>
                <td className="table-td whitespace-nowrap">{KOMPONEN_LABEL[p.komponen] || p.komponen}</td>
                <td className="table-td whitespace-nowrap">
                  {p.no_bast || <span className="text-amber-600">belum diisi</span>}
                </td>
                <td className="table-td whitespace-nowrap">{p.tgl_bast}</td>
                <td className="table-td whitespace-nowrap">
                  {p.kode_rekening || <span className="text-amber-600">belum diisi</span>}
                </td>
                <td className="table-td text-gray-600">{p.keterangan || '-'}</td>
                <td className="table-td text-right tabular-nums whitespace-nowrap">{formatRupiah(p.nominal)}</td>
              </tr>
            ))}
          </tbody>
          {pembayaran.length > 0 && (
            <tfoot className="border-t border-gray-200 bg-gray-50">
              <tr>
                <td className="table-td font-semibold text-gray-800" colSpan={5}>Jumlah</td>
                <td className="table-td text-right font-semibold tabular-nums text-gray-800 whitespace-nowrap">{formatRupiah(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
