'use client'
// Rincian (drill-down) sebuah sel Rekonsiliasi BMD — pola yang sama dgn
// LraDetailModal: klik angka → lihat transaksi pembentuknya, dikelompokkan per
// SKPD + subtotal. Sumbernya baris mutasi yang SUDAH ada di memori halaman
// (hasil fetchMutasiLines), jadi tak ada query baru DAN totalnya dijamin sama
// dengan angka yang diklik — dua-duanya dijumlah dari array yang sama.
import { useMemo, useState } from 'react'
import { exportToExcel } from '@/lib/export'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import { KATEGORI_LABEL, type MutasiLine, type PenyusutanAset } from '@/lib/rekon'

// Format polos bergaya id-ID tanpa "Rp" — mengikuti tabel Rekonsiliasi di
// belakangnya, biar enak dibandingkan angkanya saat tie-out.
const angka = (v: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v || 0)

export default function RekonDetailModal({ judul, periode, skpd, rows, skpdNama, penyusutan, onClose }: {
  judul: string
  /** Periode & SKPD ikut ke NAMA BERKAS — pop-up ini tak punya filternya sendiri. */
  periode: string
  skpd?: string
  rows: MutasiLine[]
  skpdNama: Record<number, string>
  penyusutan: Map<string, PenyusutanAset>
  onClose: () => void
}) {
  const [q, setQ] = useState('')

  // DUA hal berbeda yang gampang tertukar, makanya dipisah tegas:
  //
  // (1) KONTRIBUSI (r.beban / r.akumulasi) — bagian baris ini terhadap angka di
  //     tabel Rekonsiliasi. Dijumlah PER BARIS, dan totalnya WAJIB sama persis
  //     dgn sel yang diklik. Banyak yang nol: beban/akumulasi cuma menempel di
  //     baris yang menceritakan barang MASUK/KELUAR sel — barang yang cuma
  //     berubah nilai (kapitalisasi, koreksi, termin KDP kedua dst) bebannya ada
  //     di baris Saldo Awal, bukan di sini (lihat attribusiPenyusutan).
  // (2) POSISI akhir periode per ASET (dari hasil engine) — konteks tambahan,
  //     dijumlah per aset UNIK. Kalau ikut dijumlah per baris, aset yang punya
  //     dua baris mutasi (reklas keluar+masuk, kapitalisasi berkali-kali dalam
  //     satu semester) terhitung dobel.
  const totalKontribusi = (rs: MutasiLine[]) =>
    rs.reduce((s, r) => ({ beban: s.beban + r.beban, akumulasi: s.akumulasi + r.akumulasi }), { beban: 0, akumulasi: 0 })

  const totalPenyusutan = (rs: MutasiLine[]) => {
    const out = { beban: 0, akumulasi: 0, nilaiBuku: 0 }
    const sudah = new Set<string>()
    for (const r of rs) {
      if (sudah.has(r.aset_id)) continue
      sudah.add(r.aset_id)
      const p = penyusutan.get(r.aset_id)
      if (!p) continue
      out.beban += p.beban; out.akumulasi += p.akumulasi; out.nilaiBuku += p.nilaiBuku
    }
    return out
  }

  const term = q.trim().toLowerCase()
  const tampil = useMemo(() => rows.filter(r => !term ||
    (r.nama || '').toLowerCase().includes(term) ||
    (r.nibar || '').toLowerCase().includes(term) ||
    (r.no_dokumen || '').toLowerCase().includes(term) ||
    r.kode.toLowerCase().includes(term) ||
    KATEGORI_LABEL[r.kategori].toLowerCase().includes(term) ||
    ((r.skpd_id != null && skpdNama[r.skpd_id]) || '').toLowerCase().includes(term)
  ), [rows, term, skpdNama])

  // Kelompokkan per SKPD (urut nama), tiap grup urut tanggal.
  const grup = useMemo(() => {
    const m = new Map<number, MutasiLine[]>()
    for (const r of tampil) {
      const id = r.skpd_id ?? -1
      const arr = m.get(id) || []; arr.push(r); m.set(id, arr)
    }
    return [...m.entries()]
      .map(([id, rs]) => ({
        id, nama: (id >= 0 && skpdNama[id]) || 'SKPD tidak diketahui',
        rows: [...rs].sort((a, b) => a.tanggal.localeCompare(b.tanggal)),
        total: rs.reduce((s, r) => s + r.nilai, 0),
      }))
      .sort((a, b) => a.nama.localeCompare(b.nama))
  }, [tampil, skpdNama])

  const total = tampil.reduce((s, r) => s + r.nilai, 0)

  function handleExport() {
    exportToExcel(tampil.map(r => {
      const p = penyusutan.get(r.aset_id)
      return {
        SKPD: (r.skpd_id != null && skpdNama[r.skpd_id]) || '',
        Tanggal: r.tanggal,
        Kategori: KATEGORI_LABEL[r.kategori],
        'Jenis Ledger': r.jenis,
        'No Dokumen/SK': r.no_dokumen || '',
        'Kode Barang': r.kode,
        NIBAR: r.nibar || '',
        'Nama Barang': r.nama || '',
        Komptabel: r.komp === 'intra' ? 'Intra' : 'Ekstra',
        Nilai: r.nilai,
        'Beban di baris ini': r.beban,
        'Akum. dibawa masuk/keluar': r.akumulasi,
        'Beban / Smt': p ? p.beban : '',
        'Akumulasi barang': p ? p.akumulasi : '',
        'Nilai Buku': p ? p.nilaiBuku : '',
      }
    }), namaBerkasLaporan({
      laporan: 'Rincian Rekonsiliasi', periode, skpd, akhiran: [judul],
    }), 'Rincian')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="card w-full max-w-7xl my-8 bg-white">
        <div className="flex items-start justify-between px-5 py-3 border-b border-gray-100 gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Rincian — {judul}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {tampil.length} transaksi · {grup.length} SKPD · total <b>{angka(total)}</b>
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              <b>Beban di baris ini</b> &amp; <b>Akum. dibawa masuk/keluar</b> = yang BERPINDAH karena baris ini;
              totalnya sama persis dengan sel yang diklik. Banyak yang nol — keduanya cuma menempel di baris yang
              menceritakan barang masuk/keluar sel; barang yang hanya berubah nilai bebannya ada di baris Saldo Awal.
              Untuk barang masuk, akumulasinya sengaja hanya yang BAWAAN (tanpa beban periode ini) supaya tidak
              terhitung dua kali dengan kolom Beban.
              <br />
              <b>Beban / Smt</b>, <b>Akumulasi barang</b> &amp; <b>Nilai Buku</b> = posisi barangnya pada akhir periode
              (hasil engine penyusutan, sama dengan menu Penyusutan) — bukan angka transaksi, dan totalnya dihitung
              per barang unik, bukan per baris.
            </p>
          </div>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0" onClick={onClose}>×</button>
        </div>

        <div className="px-5 py-3 flex flex-wrap items-center gap-3 border-b border-gray-100">
          <input className="select-filter flex-1 min-w-[220px]" placeholder="Cari SKPD / nama barang / NIBAR / no. dokumen / kode..."
            value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn-secondary" onClick={handleExport} disabled={tampil.length === 0}>Export Excel</button>
        </div>

        <div className="max-h-[65vh] overflow-auto">
          {grup.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">Tidak ada transaksi.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                <tr>
                  <th className="table-th text-left">Tanggal</th>
                  <th className="table-th text-left">Kategori</th>
                  <th className="table-th text-left">No Dok/SK</th>
                  <th className="table-th text-left">Kode</th>
                  <th className="table-th text-left">Nama Barang</th>
                  <th className="table-th text-right">Nilai</th>
                  {/* Label diperjelas 2026-08-11: "(kontribusi)" ternyata terbaca
                      sebagai versi lain dari akumulasi barangnya, padahal ia
                      menjawab pertanyaan yang berbeda — berapa yang BERPINDAH
                      masuk/keluar sel ini. Angkanya tidak diubah sedikit pun. */}
                  <th className="table-th text-right border-l border-gray-100" title="Beban periode ini yang dibawa baris ini ke sel Rekonsiliasi. Nol untuk barang yang hanya berubah nilai — bebannya ada di baris Saldo Awal.">Beban di baris ini</th>
                  <th className="table-th text-right" title="Akumulasi yang berpindah masuk/keluar sel ini karena baris ini. Untuk barang masuk = akumulasi BAWAAN saja (tanpa beban periode ini, supaya tidak dihitung dua kali).">Akum. dibawa masuk/keluar</th>
                  <th className="table-th text-right border-l border-gray-100" title="Posisi barang pada akhir periode (hasil engine penyusutan)">Beban / Smt</th>
                  <th className="table-th text-right" title="Akumulasi penyusutan barang ini pada akhir periode — bukan angka transaksi">Akumulasi barang</th>
                  <th className="table-th text-right" title="Posisi barang pada akhir periode (hasil engine penyusutan)">Nilai Buku</th>
                </tr>
              </thead>
              {grup.map(g => {
                const tp = totalPenyusutan(g.rows), tk = totalKontribusi(g.rows)
                return (
                  <tbody key={g.id} className="divide-y divide-gray-50">
                    <tr className="bg-teal/5">
                      <td className="table-td font-semibold text-gray-800" colSpan={5}>{g.nama}</td>
                      <td className="table-td text-right font-semibold tabular-nums text-gray-800">{angka(g.total)}</td>
                      <td className="table-td text-right font-semibold tabular-nums text-gray-800 border-l border-gray-100">{angka(tk.beban)}</td>
                      <td className="table-td text-right font-semibold tabular-nums text-gray-800">{angka(tk.akumulasi)}</td>
                      <td className="table-td text-right font-semibold tabular-nums text-gray-800 border-l border-gray-100">{angka(tp.beban)}</td>
                      <td className="table-td text-right font-semibold tabular-nums text-gray-800">{angka(tp.akumulasi)}</td>
                      <td className="table-td text-right font-semibold tabular-nums text-gray-800">{angka(tp.nilaiBuku)}</td>
                    </tr>
                    {g.rows.map((r, i) => {
                      const p = penyusutan.get(r.aset_id)
                      // "—" (bukan 0) kalau engine belum punya baris utk aset ini
                      // di periode tsb — biar ketahuan belum dihitung, bukan nol.
                      const sel = (v: number | undefined) => v == null
                        ? <span className="text-gray-300" title="Engine penyusutan belum punya hasil untuk barang ini di periode tersebut">—</span>
                        : angka(v)
                      return (
                        <tr key={`${r.aset_id}-${r.jenis}-${r.kategori}-${i}`}>
                          <td className="table-td whitespace-nowrap">{r.tanggal}</td>
                          <td className="table-td max-w-[220px] truncate" title={`${KATEGORI_LABEL[r.kategori]} · ${r.jenis}`}>{KATEGORI_LABEL[r.kategori]}</td>
                          <td className="table-td max-w-[180px] truncate" title={r.no_dokumen || ''}>{r.no_dokumen || '-'}</td>
                          <td className="table-td whitespace-nowrap">{r.kode}</td>
                          <td className="table-td max-w-[280px]">
                            <p className="text-gray-800">{r.nama || '-'}</p>
                            <p className="text-gray-400 truncate" title={r.nibar || ''}>{r.nibar || '-'}</p>
                          </td>
                          <td className="table-td text-right tabular-nums whitespace-nowrap">{angka(r.nilai)}</td>
                          <td className="table-td text-right tabular-nums whitespace-nowrap border-l border-gray-100 text-gray-600">{angka(r.beban)}</td>
                          <td className="table-td text-right tabular-nums whitespace-nowrap text-gray-600">{angka(r.akumulasi)}</td>
                          <td className="table-td text-right tabular-nums whitespace-nowrap border-l border-gray-100">{sel(p?.beban)}</td>
                          <td className="table-td text-right tabular-nums whitespace-nowrap">{sel(p?.akumulasi)}</td>
                          <td className="table-td text-right tabular-nums whitespace-nowrap">{sel(p?.nilaiBuku)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                )
              })}
              <tfoot className="border-t-2 border-gray-200 bg-gray-50 sticky bottom-0">
                <tr>
                  <td className="table-td font-semibold text-gray-900" colSpan={5}>TOTAL</td>
                  <td className="table-td text-right font-semibold tabular-nums text-gray-900">{angka(total)}</td>
                  <td className="table-td text-right font-semibold tabular-nums text-gray-900 border-l border-gray-100">{angka(totalKontribusi(tampil).beban)}</td>
                  <td className="table-td text-right font-semibold tabular-nums text-gray-900">{angka(totalKontribusi(tampil).akumulasi)}</td>
                  <td className="table-td text-right font-semibold tabular-nums text-gray-900 border-l border-gray-100">{angka(totalPenyusutan(tampil).beban)}</td>
                  <td className="table-td text-right font-semibold tabular-nums text-gray-900">{angka(totalPenyusutan(tampil).akumulasi)}</td>
                  <td className="table-td text-right font-semibold tabular-nums text-gray-900">{angka(totalPenyusutan(tampil).nilaiBuku)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="flex justify-end px-5 py-3 border-t border-gray-100">
          <button className="btn-secondary" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  )
}
