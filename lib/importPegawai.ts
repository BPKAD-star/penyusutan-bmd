// ============================================================================
// Pembacaan & validasi berkas Excel Daftar Pegawai — bagian MURNInya.
//
// Diangkat dari `AdminPegawaiPage` 2026-09-16 (REFACTOR-PLAN Fase 3). Sampai
// hari ini seluruhnya hidup di dalam `handleImportFile`, bercampur dengan
// `XLSX.read`, query Supabase, & `setState` — jadi tak satu pun aturannya
// bisa diuji.
//
// Master data murni (bukan ledger): commit-nya LANGSUNG upsert ke
// `admin_pegawai`, tanpa draft/approval seperti PerolehanImport (itu perlu
// karena menyentuh ledger; ini tidak). NIP yang sudah ada DI-UPDATE
// (keputusan user 2026-07-14) — pas untuk berkas "data terbaru dari BKD".
//
// ⚠️ Yang dijaga di sini bukan kerapian: berkas impor pegawai menentukan
// SIAPA yang jadi Pengurus Barang di tiap SKPD, dan itu menentukan siapa yang
// boleh menyetujui apa. Baris yang lolos dengan `role_bmd` salah tak
// menghasilkan satu pun error — ia cuma memberi orang wewenang yang bukan
// haknya.
// ============================================================================

export type BarisImportPegawai = {
  nip: string
  nama: string
  pangkat: string
  golongan: string
  jabatan: string
  jenis_kelamin: string
  role_bmd: string
  skpd_id: number | null
  valid: boolean
  masalah: string[]
}

export type PeranBmd = { value: string; label: string }

/** Header Excel dinormalkan: huruf kecil, tanpa spasi/tanda baca. */
export function normHeader(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Kolom Role BMD boleh berisi slug ('pengurus_barang') ATAU label tampilan
 * ('Pengurus Barang').
 * @returns slug yang sah, atau `null` kalau tak dikenali.
 *   ⚠️ KOSONG bukan kesalahan — ia jatuh ke `pengurus_barang`, bawaan yang
 *   sama dengan form & kolom DB-nya. Membuat kosong jadi `null` akan menolak
 *   berkas BKD yang memang tak punya kolom itu sama sekali.
 */
export function mapRoleBmd(raw: string, peran: readonly PeranBmd[]): string | null {
  const s = raw.trim()
  if (!s) return 'pengurus_barang'
  const byValue = peran.find(r => r.value === s)
  if (byValue) return byValue.value
  const byLabel = peran.find(r => r.label.toLowerCase() === s.toLowerCase())
  return byLabel ? byLabel.value : null
}

/** Indeks kolom pertama yang judulnya MEMUAT salah satu nama; -1 kalau tak ada. */
export function cariKolom(header: readonly string[], ...nama: string[]): number {
  for (const n of nama) {
    const i = header.findIndex(h => h.includes(n))
    if (i >= 0) return i
  }
  return -1
}

/**
 * Susun baris mentah dari grid Excel.
 *
 * ⚠️ Baris header dicari lewat kolom **NIP**, bukan diasumsikan baris
 * pertama: berkas BKD lazim berkop beberapa baris di atas tabelnya.
 * ⚠️ Baris tanpa NIP DILEWATI diam-diam — itu baris kosong / subtotal /
 * sisa kop, bukan pegawai yang gagal dibaca.
 */
export function bacaGridPegawai(
  grid: readonly unknown[][],
  alat: {
    normalisasiGolongan: (g: string) => string
    pangkatDariGolongan: (g: string) => string
  },
): BarisImportPegawai[] {
  const headerIdx = grid.findIndex(r => r.some(c => normHeader(c).includes('nip')))
  if (headerIdx < 0) throw new Error("Header 'NIP' tidak ditemukan di file.")
  const header = grid[headerIdx].map(normHeader)

  const cNip = cariKolom(header, 'nip')
  const cNama = cariKolom(header, 'nama', 'namalengkap')
  const cGolongan = cariKolom(header, 'golongan')
  const cJabatan = cariKolom(header, 'jabatan')
  const cGender = cariKolom(header, 'jeniskelamin', 'gender')
  const cRole = cariKolom(header, 'rolebmd', 'role')
  const cSkpd = cariKolom(header, 'skpdid', 'idskpd', 'skpd')
  const str = (r: readonly unknown[], i: number) => (i >= 0 ? String(r[i] ?? '').trim() : '')

  const parsed: BarisImportPegawai[] = []
  for (const r of grid.slice(headerIdx + 1)) {
    const nip = str(r, cNip)
    if (!nip) continue
    const golonganRaw = str(r, cGolongan)
    const golongan = golonganRaw ? alat.normalisasiGolongan(golonganRaw) : ''
    const skpdRaw = str(r, cSkpd)
    const skpdNum = skpdRaw ? Number(skpdRaw) : NaN
    parsed.push({
      nip,
      nama: str(r, cNama),
      pangkat: alat.pangkatDariGolongan(golongan) || '',
      golongan,
      jabatan: str(r, cJabatan),
      jenis_kelamin: str(r, cGender).toUpperCase(),
      role_bmd: str(r, cRole),
      // ⚠️ `NaN` → null, bukan `NaN` yang lolos: kolom SKPD berisi teks
      // ("Dinas Pendidikan") akan jadi `skpd_id: NaN`, dan `NaN` menembus
      // pemeriksaan `!= null` lalu mendarat di DB sebagai galat mentah.
      skpd_id: skpdRaw && !isNaN(skpdNum) ? skpdNum : null,
      valid: true,
      masalah: [],
    })
  }
  if (parsed.length === 0) throw new Error('Tidak ada baris data terbaca.')
  return parsed
}

/** SKPD yang dirujuk baris-baris ini — untuk diperiksa ke `admin_skpd`. */
export function skpdDirujuk(baris: readonly BarisImportPegawai[]): number[] {
  return [...new Set(baris.map(p => p.skpd_id).filter((x): x is number => x != null))]
}

/**
 * Tandai baris yang bermasalah. MENYUNTING di tempat (`masalah`, `valid`,
 * dan `role_bmd` yang dinormalkan) — bentuk aslinya dipertahankan.
 *
 * ⚠️ NIP dobel yang diperiksa hanya DI DALAM berkas ini. NIP yang sudah ada
 * di DB sengaja TIDAK jadi masalah — ia justru di-upsert/update, dan itu
 * seluruh gunanya berkas "data terbaru dari BKD" (keputusan user 2026-07-14).
 */
export function validasiImportPegawai(
  baris: BarisImportPegawai[],
  skpdValid: ReadonlySet<number>,
  peran: readonly PeranBmd[],
): BarisImportPegawai[] {
  const nipCount = new Map<string, number>()
  for (const p of baris) nipCount.set(p.nip, (nipCount.get(p.nip) || 0) + 1)

  for (const p of baris) {
    if ((nipCount.get(p.nip) || 0) > 1) p.masalah.push('NIP dobel dalam file ini')
    if (!p.nama) p.masalah.push('nama kosong')
    const roleResolved = mapRoleBmd(p.role_bmd, peran)
    if (roleResolved === null) p.masalah.push(`role_bmd tidak dikenali: "${p.role_bmd}"`)
    else p.role_bmd = roleResolved
    if (p.jenis_kelamin && !['L', 'P'].includes(p.jenis_kelamin)) {
      p.masalah.push(`jenis kelamin harus L/P: "${p.jenis_kelamin}"`)
    }
    if (p.skpd_id != null && !skpdValid.has(p.skpd_id)) {
      p.masalah.push(`SKPD id ${p.skpd_id} tidak ditemukan`)
    }
    p.valid = p.masalah.length === 0
  }
  return baris
}
