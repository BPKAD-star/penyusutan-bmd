'use client'
// Aktivitas pengguna di Admin → Daftar User (permintaan user 2026-10-11):
// grafik user aktif per hari, kolom ringkas per user, & pop-up rinciannya.
// Aturan: lib/aktivitasPengguna.ts; data: lib/aktivitasPenggunaData.ts.
import { useMemo } from 'react'
import { petaLabelMenu } from '@/components/Sidebar'
import { labelHalaman, userAktifPerHari, waktuRelatif, type AktivitasUser } from '@/lib/aktivitasPengguna'
import type { DataAktivitas } from '@/lib/aktivitasPenggunaData'

export const PILIHAN_RENTANG = [7, 14, 30] as const

const tglPendek = (t: string) => {
  const [, m, d] = t.split('-').map(Number)
  return `${d}/${m}`
}
const NAMA_HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const hariDari = (t: string) => NAMA_HARI[new Date(`${t}T00:00:00Z`).getUTCDay()]

const aktifPada = (h: { sesi: number; kunjungan: number }) => h.sesi > 0 || h.kunjungan > 0

/** Kartu ringkasan + grafik batang user aktif per hari. */
export function PanelAktivitas({ data, loading, error, n, onN, jumlahUser }: {
  data: DataAktivitas | null
  loading: boolean
  error: string
  n: number
  onN: (n: number) => void
  jumlahUser: number
}) {
  const perHari = useMemo(() => (data ? userAktifPerHari(data.tanggal, data.peta) : []), [data])
  const aktifRentang = data ? [...data.peta.values()].filter(a => a.hariAktif > 0).length : 0
  const belumPernah = data ? jumlahUser - [...data.peta.values()].filter(a => a.terakhir).length : 0
  const maks = Math.max(1, ...perHari)
  const rataRata = perHari.length ? perHari.reduce((s, x) => s + x, 0) / perHari.length : 0

  return (
    <div className="card p-5 mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Aktivitas Pengguna</h2>
          <p className="text-xs text-gray-400 mt-0.5">Banyaknya user yang membuka aplikasi per hari (WIB).</p>
        </div>
        <div className="flex gap-1">
          {PILIHAN_RENTANG.map(r => (
            <button key={r} onClick={() => onN(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                r === n ? 'bg-teal text-white border-teal' : 'bg-white text-gray-600 border-gray-200 hover:border-teal'
              }`}>{r} hari</button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="text-xs text-red-600" role="alert">Gagal memuat aktivitas: {error}</p>
      ) : !data ? (
        <p className="text-xs text-gray-400">{loading ? 'Memuat aktivitas...' : '—'}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <Angka label={`Aktif dalam ${n} hari`} nilai={`${aktifRentang}`} sub={`dari ${jumlahUser} user`} />
            <Angka label="Rata-rata per hari" nilai={rataRata.toLocaleString('id-ID', { maximumFractionDigits: 1 })} sub="user aktif" />
            <Angka label="Belum pernah login" nilai={`${Math.max(0, belumPernah)}`} sub="user" />
          </div>

          <div className="flex items-end gap-[2px] h-36" role="img"
            aria-label={`User aktif per hari: ${data.tanggal.map((t, i) => `${tglPendek(t)} ${perHari[i]}`).join(', ')}`}>
            {data.tanggal.map((t, i) => (
              <div key={t} className="flex-1 h-full flex flex-col justify-end items-center group min-w-0"
                title={`${hariDari(t)} ${tglPendek(t)}: ${perHari[i]} user aktif`}>
                {(n <= 14 || perHari[i] === maks) && (
                  <span className="text-[10px] text-gray-500 mb-0.5 tabular-nums">{perHari[i] || ''}</span>
                )}
                <div className="w-full max-w-[28px] rounded-t bg-teal/80 group-hover:bg-teal transition-colors"
                  style={{ height: `${(perHari[i] / maks) * 100}%`, minHeight: perHari[i] ? 3 : 0 }} />
              </div>
            ))}
          </div>
          <div className="flex gap-[2px] border-t border-gray-200 pt-1">
            {data.tanggal.map((t, i) => (
              <span key={t} className="flex-1 text-center text-[10px] text-gray-400 min-w-0 truncate">
                {n <= 14 || i % 5 === 0 || i === data.tanggal.length - 1 ? tglPendek(t) : ''}
              </span>
            ))}
          </div>

          <p className="text-[11px] text-gray-400 mt-3">
            ⓘ Sumbernya dua: <b>sesi login</b> (ada riwayat ke belakang, tapi Supabase membuang catatan lama — anggap
            angka minimal) dan <b>catatan halaman yang dibuka</b> (akurat per menu, mulai terisi sejak 11 Oktober 2026).
            Satu hari dihitung aktif kalau salah satunya mencatat.
          </p>
        </>
      )}
    </div>
  )
}

function Angka({ label, nilai, sub }: { label: string; nilai: string; sub: string }) {
  return (
    <div className="border border-gray-100 rounded-lg px-3 py-2">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className="text-xl font-bold text-gray-800 tabular-nums">{nilai}</p>
      <p className="text-[11px] text-gray-400">{sub}</p>
    </div>
  )
}

/** Sel ringkas di tabel user: titik per hari + "n/N hari" + terakhir aktif. Bisa diklik. */
export function SelAktivitas({ a, n, onBuka }: { a: AktivitasUser | undefined; n: number; onBuka: () => void }) {
  const kini = new Date()
  return (
    <button onClick={onBuka} className="text-left group" title="Lihat rincian aktivitas">
      {n <= 14 && (
        <div className="flex gap-[3px] mb-1">
          {(a?.hari ?? Array.from({ length: n }, () => ({ sesi: 0, kunjungan: 0, tanggal: '' }))).map((h, i) => (
            <span key={i} className={`w-2 h-2 rounded-sm ${aktifPada(h) ? 'bg-teal' : 'bg-gray-200'}`} />
          ))}
        </div>
      )}
      <p className="text-xs text-gray-700 group-hover:text-teal">
        <b className="tabular-nums">{a?.hariAktif ?? 0}</b>/{n} hari
      </p>
      <p className="text-[11px] text-gray-400">{waktuRelatif(a?.terakhir ?? null, kini)}</p>
    </button>
  )
}

/** Pop-up rincian per user: per hari & menu yang dibuka. */
export function DetailAktivitas({ nama, a, n, onTutup }: {
  nama: string; a: AktivitasUser | undefined; n: number; onTutup: () => void
}) {
  const peta = useMemo(() => petaLabelMenu(), [])
  const maksHalaman = Math.max(1, ...(a?.halaman.map(h => h.jumlah) ?? [0]))
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onTutup}>
      <div className="card p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">{nama}</h2>
            <p className="text-xs text-gray-400">
              Aktif {a?.hariAktif ?? 0} dari {n} hari · terakhir {waktuRelatif(a?.terakhir ?? null, new Date())}
            </p>
          </div>
          <button onClick={onTutup} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-semibold text-gray-700 mb-2">Per hari</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 text-left">
                  <th className="font-normal pb-1">Tanggal</th>
                  <th className="font-normal pb-1 text-right">Sesi</th>
                  <th className="font-normal pb-1 text-right">Halaman dibuka</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...(a?.hari ?? [])].reverse().map(h => (
                  <tr key={h.tanggal} className={aktifPada(h) ? 'text-gray-700' : 'text-gray-300'}>
                    <td className="py-1">{hariDari(h.tanggal)}, {tglPendek(h.tanggal)}</td>
                    <td className="py-1 text-right tabular-nums">{h.sesi || '–'}</td>
                    <td className="py-1 text-right tabular-nums">{h.kunjungan || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-gray-400 mt-2">
              Sesi ≈ jam tab aplikasi terbuka (angka minimal). Halaman dibuka = menu yang dikunjungi.
            </p>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-700 mb-2">Menu yang dibuka</h3>
            {!a || a.halaman.length === 0 ? (
              <p className="text-xs text-gray-400">Belum ada catatan halaman dalam rentang ini.</p>
            ) : (
              <ul className="space-y-1.5">
                {a.halaman.map(h => (
                  <li key={h.halaman} className="text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-700 truncate" title={h.halaman}>{labelHalaman(h.halaman, peta)}</span>
                      <span className="text-gray-500 tabular-nums flex-shrink-0">{h.jumlah}×</span>
                    </div>
                    <div className="h-1 bg-gray-100 rounded mt-0.5">
                      <div className="h-1 bg-teal/70 rounded" style={{ width: `${(h.jumlah / maksHalaman) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
