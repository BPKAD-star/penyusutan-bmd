// Calon penanda tangan lembar per-SKPD (kepala kantor).
//
// Masalah yang diselesaikan (permintaan user 2026-08-16): pemilih penanda tangan
// dulu cuma menarik pegawai yang **SKPD pokoknya PERSIS** SKPD dokumen. Dua
// akibatnya, dua-duanya berakhir di blok tanda tangan bertitik-titik:
//
//   1. **Sub-unit tak punya Kepala sendiri.** Dari 816 SKPD hanya 57 yang punya
//      pegawai berjabatan "Kepala", sementara 756 di antaranya sub-SKPD. Jadi
//      lembar UPTD/Bidang/Sub-OPD nyaris selalu tak menemukan siapa pun.
//   2. **Kepala rangkap tak terbaca sama sekali.** `admin_pegawai_penugasan`
//      sudah lama merekam bahwa seorang kepala mengampu SKPD kedua (10 baris
//      aktif per 2026-08-16), tapi SATU-SATUNYA pembacanya adalah tampilan
//      Daftar Pegawai — tak ada satu pun lembar cetak yang melihatnya.
//
// Aturannya (keputusan user 2026-08-16): **definitif di SKPD pokok, Plt. di SKPD
// rangkap**, dan berlaku turun sampai sub-unit yang dia ampu di kedua-duanya.
//
// ⚠️ `pltDisarankan` itu SARAN, bukan keputusan. Status Definitif/Plt tidak ada
// di `admin_pegawai` maupun di mana pun (lihat catatan TtdModal), jadi yang
// menentukan tetap operator lewat radio di pop-up — modul ini cuma menaruh
// centang awal di tempat yang paling sering benar.
import type { SupabaseClient } from '@supabase/supabase-js'

export type SkpdNode = { id: number; nama: string; parent_id: number | null }

export type SumberTtd = 'sendiri' | 'rangkap' | 'induk'

export type CalonTtd = {
  id: string
  nama: string
  nip: string | null
  jabatan: string | null
  skpd_id: number | null
  sumber: SumberTtd
  /** Nama SKPD tempat ia definitif (SKPD pokoknya). null kalau tak diketahui. */
  asal: string | null
  pltDisarankan: boolean
}

/**
 * Rantai SKPD dari `skpdId` naik ke akar: `[diri, induk, kakek, …]`.
 * `seen` menjaga dari data melingkar — `parent_id` tak dijamin asiklik di DB,
 * dan satu baris yang salah tunjuk akan menggantung halaman cetaknya selamanya.
 */
export function rantaiKeAtas(skpdId: number, byId: Map<number, SkpdNode>): number[] {
  const out: number[] = []
  const seen = new Set<number>()
  let cur: SkpdNode | undefined = byId.get(skpdId)
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    out.push(cur.id)
    cur = cur.parent_id != null ? byId.get(cur.parent_id) : undefined
  }
  // SKPD yang tak ada di `byId` (mis. daftar belum termuat) tetap dikembalikan
  // sebagai dirinya sendiri — lebih baik daftar sempit daripada kosong.
  return out.length > 0 ? out : [skpdId]
}

type PegawaiRow = { id: string; nama: string; nip: string | null; jabatan: string | null; skpd_id: number | null }

const adalahKepala = (jabatan: string | null) => (jabatan || '').toLowerCase().includes('kepala')

/** Yang lebih dekat wewenangnya menang saat satu orang muncul dari dua jalur. */
const URUTAN: Record<SumberTtd, number> = { sendiri: 0, rangkap: 1, induk: 2 }

/**
 * Calon penanda tangan untuk lembar SKPD `skpdId`.
 *
 * Tiga jalur, sengaja tidak sama luasnya:
 *   · **sendiri** — SELURUH pegawai SKPD itu (perilaku lama, dipertahankan:
 *     operator kadang menunjuk pejabat yang jabatannya tak memuat kata "Kepala").
 *   · **rangkap** — pemegang penugasan AKTIF di SKPD itu atau induknya → Plt.
 *   · **induk** — pegawai SKPD induk yang jabatannya memuat "Kepala" → definitif.
 *
 * ⚠️ Jalur `induk` sengaja DISARING ke yang berjabatan "Kepala" saja. Tanpa
 * saringan itu, lembar satu UPTD akan menawarkan seluruh pegawai Dinas
 * Pendidikan berikut 694 unit di bawahnya — daftar yang tak mungkin dipakai.
 */
export async function fetchCalonTtd(
  supabase: SupabaseClient, skpdId: number, byId: Map<number, SkpdNode>,
): Promise<CalonTtd[]> {
  const rantai = rantaiKeAtas(skpdId, byId)
  const namaSkpd = (id: number | null | undefined) => (id != null ? byId.get(id)?.nama ?? null : null)

  const [pgw, png] = await Promise.all([
    supabase.from('admin_pegawai').select('id,nama,nip,jabatan,skpd_id').in('skpd_id', rantai).order('nama'),
    supabase.from('admin_pegawai_penugasan')
      .select('skpd_id,pegawai:admin_pegawai(id,nama,nip,jabatan,skpd_id)')
      .in('skpd_id', rantai).eq('aktif', true),
  ])
  // Kegagalannya dilaporkan ke pemanggil, TIDAK ditelan: daftar yang diam-diam
  // kosong terbaca operator sebagai "SKPD ini memang tak punya pejabat", lalu
  // lembarnya dicetak bertitik-titik padahal orangnya ada.
  if (pgw.error) throw new Error(`gagal membaca daftar pegawai: ${pgw.error.message}`)
  if (png.error) throw new Error(`gagal membaca penugasan rangkap: ${png.error.message}`)

  const pilih = new Map<string, CalonTtd>()
  const tawar = (c: CalonTtd) => {
    const ada = pilih.get(c.id)
    if (!ada || URUTAN[c.sumber] < URUTAN[ada.sumber]) pilih.set(c.id, c)
  }

  for (const g of (pgw.data || []) as PegawaiRow[]) {
    const sendiri = g.skpd_id === skpdId
    if (!sendiri && !adalahKepala(g.jabatan)) continue
    tawar({
      ...g, sumber: sendiri ? 'sendiri' : 'induk',
      asal: sendiri ? null : namaSkpd(g.skpd_id), pltDisarankan: false,
    })
  }

  type PenugasanRow = { skpd_id: number; pegawai: PegawaiRow | null }
  for (const r of ((png.data || []) as unknown as PenugasanRow[])) {
    const g = r.pegawai
    if (!g) continue
    // Rangkap DI SKPD POKOKNYA SENDIRI bukan rangkap — jangan sarankan Plt.
    if (g.skpd_id === skpdId) continue
    tawar({ ...g, sumber: 'rangkap', asal: namaSkpd(g.skpd_id), pltDisarankan: true })
  }

  return [...pilih.values()].sort((a, b) =>
    URUTAN[a.sumber] - URUTAN[b.sumber] || a.nama.localeCompare(b.nama))
}

/** Keterangan asal wewenang, untuk label dropdown. Kosong utk pegawai sendiri. */
/**
 * Definitif → "Kepala <SKPD>"; Plt → "Plt. Kepala <SKPD>" (keputusan user
 * 2026-08-13).
 *
 * Ditulis SEKALI di sini karena dipakai blok tanda tangan SEKALIGUS pratinjau
 * di pop-up pemilihnya — dua tempat yang wajib berbunyi sama persis, kalau
 * tidak operator menyetujui satu kalimat lalu yang tercetak kalimat lain.
 * Sejak 2026-08-20 dipakai DUA lembar cetak (RKBMD per-SKPD & Laporan
 * Penerimaan BMD), jadi ia naik dari berkas halaman ke modul ini — salinan
 * kedua yang menyimpang akan membuat dua lembar resmi menyebut jabatan yang
 * berbeda untuk orang yang sama.
 */
export function sebutanKepala(plt: boolean, namaSkpd: string): string {
  return `${plt ? 'Plt. ' : ''}Kepala ${namaSkpd}`
}

export function labelAsalTtd(c: CalonTtd): string {
  if (c.sumber === 'sendiri') return ''
  if (c.sumber === 'rangkap') return ` · merangkap dari ${c.asal || 'SKPD lain'} (Plt.)`
  return ` · Kepala ${c.asal || 'SKPD induk'}`
}

/**
 * Pilihan AWAL pop-up. Urutan: kepala SKPD itu sendiri → pemegang rangkap →
 * kepala induk terdekat. Daftar sudah terurut `sumber`, jadi yang perlu
 * ditambahkan cuma "berjabatan Kepala" untuk jalur `sendiri` — di situ seluruh
 * pegawai ikut, termasuk staf.
 */
export function calonTtdAwal(daftar: CalonTtd[]): CalonTtd | null {
  return daftar.find(c => c.sumber === 'sendiri' && adalahKepala(c.jabatan))
    ?? daftar.find(c => c.sumber !== 'sendiri')
    ?? null
}
