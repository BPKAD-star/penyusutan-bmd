// Menarik SELURUH hasil sebuah daftar halaman-demi-halaman pakai KURSOR
// (keyset), bukan OFFSET / `.range()`.
//
// ⚠️ KENAPA ADA BERKAS INI. Aturan "kolektor halaman-demi-halaman WAJIB keyset"
// sudah lama tertulis di CLAUDE.md, tapi ketiga tombol Export register masih
// memakai OFFSET dan akhirnya benar-benar memakan korban (2026-09-03): Export
// di Saldo Awal → Daftar Barang Awal mati dengan strip merah "canceling
// statement due to statement timeout" begitu hasilnya 132.694 baris.
//
// OFFSET bukan "loncat" — Postgres tetap MERAKIT tiap baris yang dilewati lalu
// membuangnya, jadi ongkos halaman ke-N tumbuh mengikuti N dan cepat atau
// lambat menembus statement_timeout 8 detik. Diukur di produksi (RLS aktif):
//
//     fn_daftar_barang, 1.3.2 se-kabupaten:  offset 0 = 1,1 dtk
//                                            offset 50.000 = 51,2 dtk  ✗
//     aset_awal_2026, Diknas 1.3.2 intra:    offset 0 = 0,13 dtk
//                                            offset 60.000 = 1,8 dtk
//
// Dengan kursor, tiap halaman berangkat dari posisi baris terakhir — ongkosnya
// RATA di halaman ke berapa pun (terukur 25–430 ms untuk halaman 1.000 baris).
//
// ⚠️ Yang dijaga berkas ini BUKAN cuma kecepatan, tapi KEUTUHAN: berkas Excel
// yang kekurangan baris tak punya satu pun tanda bahwa isinya kurang, dan
// berkas itulah yang dikirim ke inspektorat/BPK. Karena itu tiga penjaga di
// bawah semuanya GAGAL KERAS, tak ada yang "diam-diam berhenti lebih awal".

// ── Kursor untuk urutan baku register: kode ASC, nilai DESC, seri ASC ────────
// `nilai` sengaja STRING, bukan number. `nilai_perolehan` itu `numeric`,
// sedangkan angka JSON di peramban itu float64 — dan di produksi ADA baris yang
// tak selamat: Jalan JAMBEAN - PURWODADI bernilai 1427689804.3600001 berubah
// jadi 1427689804.36 begitu lewat JavaScript. Kursor yang sudah dibulatkan akan
// MELEWATKAN baris ber-nilai 1427689804.36 yang sah, tanpa satu pun error.
// Karena itu pemanggil WAJIB mengambilnya dari kolom yang di-cast ke teks di
// sisi PostgREST (`nilai_teks:nilai_perolehan::text`), bukan dari angkanya.
// `seri` = pemecah seri UNIK (nibar / id) — tanpa itu baris berkunci kembar
// bisa terlewat atau dobel saat pindah halaman.
export type KursorKode = { kode: string; nilai: string; seri: string }

export const tandaKursorKode = (k: KursorKode) => `${k.kode}|${k.nilai}|${k.seri}`

// Satu permintaan ke PostgREST. Dipisah DUA CABANG karena urutannya campur arah
// (kode naik, nilai turun): perbandingan baris `(kode,nilai,seri) > (…)` tak
// bisa dipakai, dan bentuk OR biasa tak pernah bisa turun jadi index condition
// di bawah RLS. Dua cabang, masing-masing satu seek yang tak bisa salah baca:
//   'sisa'   → kode = K AND nilai <= N   (prefix index golongan+kode+nilai)
//   'lanjut' → kode > K                  (prefix index yang sama)
// Semua sisa baris kode K pasti mendahului semua baris kode > K, jadi menyambung
// keduanya memberi halaman yang persis sama dengan versi offset.
//
// ⚠️ Seek `kode >= K` SAJA tidak cukup, dan ini bukan kehati-hatian berlebihan:
// satu kode barang di produksi dipegang 112.421 baris (1.3.5.01.01.01.003),
// jadi tanpa cabang 'sisa' tiap halaman di dalam kode itu menyusuri ulang
// puluhan ribu baris dari awal kodenya.
export type CabangKeyset =
  | { jenis: 'sisa'; kursor: KursorKode; batas: number }
  | { jenis: 'lanjut'; setelahKode: string | null; batas: number }

// Nilai yang ikut dirakit jadi string filter `or=(...)` PostgREST. Koma atau
// tanda kurung yang nyelinap ke situ memecah pohon logika di tengah jalan &
// PostgREST menolak seluruh filternya ("failed to parse logic tree") — pelajaran
// yang sama dengan kotak Cari di Daftar Barang Awal. Ditolak di sini supaya
// kegagalannya bersuara, bukan jadi filter yang artinya bergeser.
const AMAN = /^-?[0-9A-Za-z.-]+$/
export function pastikanAman(nilai: string, seri: string) {
  if (!AMAN.test(nilai) || !AMAN.test(seri)) {
    throw new Error(`kursor tidak layak dipakai (nilai="${nilai}", seri="${seri}") — pengambilan dihentikan supaya tidak ada baris yang terlewat diam-diam`)
  }
}

// Menyusun SATU halaman dari dua cabang di atas. Cabang 'lanjut' hanya diminta
// kalau cabang 'sisa' belum memenuhi halaman — jadi umumnya 1–2 permintaan per
// halaman, dan tepat 1 selama masih di dalam kode yang sama.
export function halamanDuaCabang<T>(
  jalankan: (c: CabangKeyset) => Promise<T[]>,
): (kursor: KursorKode | null, batas: number) => Promise<T[]> {
  return async (kursor, batas) => {
    if (!kursor) return jalankan({ jenis: 'lanjut', setelahKode: null, batas })
    // Diperiksa DI SINI, bukan di tiap pemanggil: cabang 'sisa' adalah satu-
    // satunya yang merakit string `or=(...)`, jadi di sinilah penjaganya tak
    // bisa kelupaan dipasang.
    pastikanAman(kursor.nilai, kursor.seri)
    const sisa = await jalankan({ jenis: 'sisa', kursor, batas })
    if (sisa.length >= batas) return sisa
    const lanjut = await jalankan({ jenis: 'lanjut', setelahKode: kursor.kode, batas: batas - sisa.length })
    return [...sisa, ...lanjut]
  }
}

export const adaTimeout = (e: unknown) =>
  /timeout|57014/i.test(e instanceof Error ? e.message : String(e))

export type OpsiKeyset<T, K> = {
  /** Ambil satu halaman mulai SESUDAH `kursor` (null = halaman pertama). */
  halaman: (kursor: K | null, batas: number) => Promise<T[]>
  /** Kursor dari satu baris — dipanggil atas baris TERAKHIR tiap halaman. */
  kursor: (baris: T) => K
  /** Bentuk kursor jadi string, hanya untuk mendeteksi kursor yang mandek. */
  tanda: (k: K) => string
  batas?: number
  batasMin?: number
  maksBaris?: number
  /** Dipanggil tiap halaman selesai, dgn jumlah baris terkumpul sejauh ini. */
  onKemajuan?: (n: number) => void
}

export async function ambilSemuaKeyset<T, K>(o: OpsiKeyset<T, K>): Promise<T[]> {
  const batasMin = o.batasMin ?? 125
  const maksBaris = o.maksBaris ?? 2_000_000
  let batas = Math.max(o.batas ?? 1000, batasMin)
  const semua: T[] = []
  let kursor: K | null = null
  let tandaSebelumnya: string | null = null

  for (;;) {
    let hal: T[]
    try {
      hal = await o.halaman(kursor, batas)
    } catch (e) {
      // Cache dingin bisa membuat SATU halaman melar sampai beberapa detik
      // (terukur 3,4 dtk untuk halaman pertama 1.3.5 se-kabupaten). Halaman
      // yang lebih kecil hampir selalu lolos, dan mengecil itu jauh lebih baik
      // daripada memaksa operator mengulang export sepuluh menit dari awal.
      // ⚠️ Hanya untuk timeout, dan hanya SELAMA masih bisa mengecil — sisanya
      // dilempar apa adanya supaya kegagalan sungguhan tetap terlihat.
      if (adaTimeout(e) && batas > batasMin) {
        batas = Math.max(batasMin, Math.floor(batas / 2))
        continue
      }
      throw e
    }

    if (hal.length === 0) break
    semua.push(...hal)
    o.onKemajuan?.(semua.length)

    // Jaring pengaman terakhir: kalau sesuatu di hulu berubah artinya, lebih
    // baik meledak daripada menggantung peramban sampai kehabisan memori.
    if (semua.length > maksBaris) {
      throw new Error(`pengambilan dihentikan setelah ${semua.length.toLocaleString('id-ID')} baris — melebihi batas wajar, kemungkinan kursornya tidak menyaring`)
    }

    const berikut = o.kursor(hal[hal.length - 1])
    const tanda = o.tanda(berikut)
    // Kursor yang tidak maju = halaman yang sama diambil terus-menerus. Tanpa
    // penjaga ini loop-nya abadi & diam.
    if (tanda === tandaSebelumnya) {
      throw new Error(`kursor tidak maju di baris "${tanda}" — pengambilan dihentikan supaya tidak berputar tanpa henti`)
    }
    tandaSebelumnya = tanda
    kursor = berikut

    // ⚠️ TIDAK berhenti hanya karena halaman ini pendek. Berhentinya cuma di
    // halaman yang benar-benar KOSONG (di atas). Ongkosnya satu permintaan
    // ekstra di akhir; imbalannya, ukuran halaman yang mengecil di tengah jalan
    // tak bisa disalahartikan sebagai "datanya sudah habis".
  }
  return semua
}
