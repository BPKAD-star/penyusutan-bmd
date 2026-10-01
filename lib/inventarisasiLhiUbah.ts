// LHI III.B.8 — "Terjadi Perubahan Data": SETIAP kolom ditampilkan sebagai
// pasangan SEBELUM / SESUDAH, hijau bila berubah, hitam bila sama (permintaan
// user 2026-10-01). Berdiri sendiri (bukan di inventarisasiLaporan.ts) karena
// bentuknya beda mendasar dari format lain: satu barang = DUA baris visual.
//
// Baris datanya tetap satu `Record` per barang; tiap kolom `f` memakai tiga key:
//   `${f}_sb`   nilai sebelum (register, snapshot beku)
//   `${f}_st`   nilai sesudah (jawaban petugas; = sebelum bila "Sesuai")
//   `${f}_beda` '1' bila berubah, '' bila sama
//
// ⚠️ Tanda "berubah" DIHITUNG dari kedua nilai itu, bukan dari kotak
// "Tidak Sesuai" yang dicentang — petugas bisa mencentang lalu mengetik nilai
// yang sama, dan yang tercetak hijau harus yang benar-benar berbeda.
import type { InvBaris, SesuaiField } from '@/lib/inventarisasi'

export type Baris = Record<string, string | number>

/** Nilai SETELAH inventarisasi: "seharusnya" bila Tidak Sesuai ("(kosong)" bila lupa diisi). */
export function efektif(f: SesuaiField | undefined, semula: string | null | undefined): string {
  if (f && f.sesuai === false) return (f.seharusnya || '').trim() || '(kosong)'
  return semula || ''
}

/** Kolom yang tampil sbg pasangan sebelum/sesudah, URUT mengikuti contoh user. */
export const KOLOM_UBAH: { key: string; label: string }[] = [
  { key: 'nama', label: 'Nama Barang' },
  { key: 'merek_tipe', label: 'Merk/Tipe' },
  { key: 'spek_lain', label: 'Spesifikasi Lainnya' },
  { key: 'no_polisi', label: 'No Polisi' },
  { key: 'no_rangka', label: 'No Rangka' },
  { key: 'no_mesin', label: 'No Mesin' },
  { key: 'no_bpkb', label: 'No BPKB' },
  { key: 'luas', label: 'Luas' },
  { key: 'alamat', label: 'Alamat' },
  { key: 'koordinat', label: 'Titik Koordinat' },
  { key: 'satuan', label: 'Satuan' },
  { key: 'keterangan_barang', label: 'Keterangan' },
  { key: 'foto', label: 'Foto' },
]

const angka = (v: unknown): string => {
  if (v == null || v === '') return ''
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : String(v).trim()
}

const titik = (lat: unknown, lng: unknown): string => {
  const a = lat == null || lat === '' ? NaN : Number(lat)
  const b = lng == null || lng === '' ? NaN : Number(lng)
  return Number.isFinite(a) && Number.isFinite(b) ? `${a}, ${b}` : ''
}

/** Alamat = wilayah berjenjang (Provinsi→Desa) lalu alamat detail. */
const alamat = (wilayah: string, detail: string): string => [wilayah, detail].filter(Boolean).join(' · ')

/**
 * Alamat sebelum & sesudah: wilayah Provinsi→Desa lalu alamat detail. Wilayah &
 * detail dinilai sendiri-sendiri (bisa salah satunya saja yang dikoreksi). Kode
 * lama dari snapshot — isian sebelum 2026-09-25 tak punya kode → jatuh ke teks
 * `wilayah` yang dibekukan saat itu. Dipakai III.B.8 (keduanya) & III.B.6 (sesudah).
 */
export function alamatLhi(
  s: NonNullable<InvBaris['snapshot']>, j: InvBaris['jawaban'],
  wilayahLabel: (kode: string | null | undefined) => string,
): { sb: string; st: string } {
  const kodeSb = s.wilayah_kode || ''
  const wilSb = (kodeSb && wilayahLabel(kodeSb)) || s.wilayah || ''
  const wilBerubah = j.wilayah?.sesuai === false
  const kodeSt = wilBerubah ? (j.wilayah?.wilayah_kode || '') : kodeSb
  const wilSt = wilBerubah ? (kodeSt ? wilayahLabel(kodeSt) : '(kosong)') : wilSb
  const detSb = s.alamat || ''
  const detSt = j.alamat_detail?.sesuai === false ? (j.alamat_detail.seharusnya || '').trim() || '(kosong)' : detSb
  return { sb: alamat(wilSb, detSb), st: alamat(wilSt, detSt) }
}

export function barisUbah(
  b: InvBaris, no: number, wilayahLabel: (kode: string | null | undefined) => string,
): Baris {
  const s = b.snapshot || {}
  const j = b.jawaban || {}
  const r: Baris = { no, nibar: s.nibar || '' }

  const pasang = (key: string, sb: string, st: string, beda?: boolean) => {
    r[`${key}_sb`] = sb
    r[`${key}_st`] = st
    r[`${key}_beda`] = (beda ?? sb.trim() !== st.trim()) ? '1' : ''
  }
  const teks = (key: string, f: SesuaiField | undefined, semula: string | null | undefined) =>
    pasang(key, semula || '', efektif(f, semula))

  teks('nama', j.spesifikasi, s.nama_barang)
  teks('merek_tipe', j.merek_tipe, s.merek_tipe)
  teks('spek_lain', j.spesifikasi_lainnya, s.spesifikasi_lainnya)
  teks('no_polisi', j.no_polisi, s.no_polisi)
  teks('no_rangka', j.no_rangka, s.no_rangka)
  teks('no_mesin', j.no_mesin, s.no_mesin)
  teks('no_bpkb', j.no_bpkb, s.no_bpkb)
  teks('satuan', j.satuan, s.satuan)
  teks('keterangan_barang', j.keterangan_barang, s.keterangan)

  // Luas dibandingkan sebagai ANGKA ("100" = "100.00"), bukan teks.
  const luasSb = angka(s.luas)
  const luasSt = j.luas?.sesuai === false ? angka((j.luas.seharusnya || '').replace(',', '.')) || '(kosong)' : luasSb
  pasang('luas', luasSb, luasSt)

  const al = alamatLhi(s, j, wilayahLabel)
  pasang('alamat', al.sb, al.st)

  // Koordinat: j.latitude/longitude baru dipakai bila petugas menyatakan tidak sesuai.
  const koorSb = titik(s.latitude, s.longitude)
  const koorSt = j.koordinat?.sesuai === false
    ? titik(j.latitude, j.longitude) || '(kosong)' : koorSb
  pasang('koordinat', koorSb, koorSt)

  // Foto TIDAK ditempel di tabel — hanya "Ada"/"Tidak ada" (+ jumlah). Sesudah =
  // ada bila register punya ATAU petugas mengunggah (aturan LKI: cukup salah satu).
  // "Tidak Sesuai" berarti ada foto terbaru → selalu dianggap berubah.
  const nReg = (s.foto_paths || []).length
  const nUp = (b.foto_paths || []).length
  const fotoSb = nReg > 0 ? `Ada (${nReg})` : 'Tidak ada'
  const terbaru = j.foto_barang?.sesuai === false
  const fotoSt = terbaru
    ? (nUp > 0 ? `Ada (${nUp} terbaru)` : '(belum diunggah)')
    : nReg > 0 ? `Ada (${nReg})` : nUp > 0 ? `Ada (${nUp})` : 'Tidak ada'
  pasang('foto', fotoSb, fotoSt, terbaru || (nReg === 0 && nUp > 0))

  // Kolom daftar yang berubah — bahan kolom Excel "Kolom yang berubah".
  r.berubah = KOLOM_UBAH.filter(k => r[`${k.key}_beda`] === '1').map(k => k.label).join('; ')

  r.catatan = [
    j.keberadaan === 'tidak_ditemukan' && j.sebab_tidak_ada === 'beberapa_register'
      ? `Seharusnya ${(j.sebab_pecahan || []).length || 'beberapa'} register (${(j.sebab_pecahan || []).filter(Boolean).join('; ')}) — tindak lanjut Pemecahan Barang` : '',
    j.keterangan,
  ].filter(Boolean).join(' — ')
  return r
}

/** Excel: DUA baris per barang (Sebelum / Sesudah) + kolom "Kolom yang berubah". */
export function barisExcelUbah(rows: Baris[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const r of rows) {
    for (const keadaan of ['Sebelum', 'Sesudah'] as const) {
      const o: Record<string, unknown> = { No: r.no, NIBAR: r.nibar, Keadaan: keadaan }
      for (const k of KOLOM_UBAH) o[k.label] = r[`${k.key}_${keadaan === 'Sebelum' ? 'sb' : 'st'}`] ?? ''
      o['Kolom yang berubah'] = r.berubah ?? ''
      o['Catatan'] = keadaan === 'Sesudah' ? r.catatan ?? '' : ''
      out.push(o)
    }
  }
  return out
}
