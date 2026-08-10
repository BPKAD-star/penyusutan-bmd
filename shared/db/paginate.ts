// ============================================================================
// paginate() — SATU-SATUNYA cara sah menarik >1.000 baris (rules.md §3).
//
// Menggantikan loop paginasi tulis-tangan yang per 2026-08-06 masih ada 63
// kemunculan di 47 berkas. Tiap satu adalah kesempatan mengulang tiga cacat
// yang selalu berpasangan di repo ini, dan ketiganya bikin ANGKA LAPORAN SALAH
// TANPA SUARA:
//
//   1. tanpa `ORDER BY`  → Postgres tak menjamin urutan antar-halaman; begitu
//      hasilnya >1.000 ada baris yang terlewat DIAM-DIAM;
//   2. `.range()`/OFFSET → makin dalam makin lambat, cepat atau lambat satu
//      halaman menembus statement timeout;
//   3. `error` ditelan   → `data` null → loop berhenti → hasil KOSONG, yang
//      artinya justru KEBALIKAN dari kenyataan.
//
// Insidennya: docs/insiden.md INS-06 (filter void mati diam-diam → barang yang
// sudah dibatalkan muncul lagi sebagai perolehan sah di tiga laporan).
// ============================================================================

/** Bentuk minimal balasan PostgREST — sengaja bukan tipe supabase-js, supaya
 *  bisa diuji tanpa jaringan & tanpa menyeret kliennya. */
export type HasilQuery<T> = { data: T[] | null; error: { message: string } | null }

export type OpsiPaginate = {
  /** Ukuran halaman. WAJIB sama dengan `.limit()` di builder-nya. */
  size?: number
  /** Batas jumlah halaman — jaring pengaman terakhir kalau kursornya tak maju. */
  maksHalaman?: number
}

/**
 * Ambil SELURUH baris lewat paginasi keyset.
 *
 * `build(kursor)` wajib mengembalikan query yang sudah `.order('id')` +
 * `.limit(size)`, dan menerapkan `.gt('id', kursor)` kalau kursornya bukan null.
 *
 * MELEMPAR saat error — array kosong tidak boleh bisa berarti "query gagal".
 */
export async function paginate<K extends string | number, T extends { id: K }>(
  label: string,
  build: (kursor: K | null) => PromiseLike<HasilQuery<T>>,
  opts: OpsiPaginate = {},
): Promise<T[]> {
  const size = opts.size ?? 1000
  const maksHalaman = opts.maksHalaman ?? 10_000
  const out: T[] = []
  let kursor: K | null = null

  for (let halaman = 1; ; halaman++) {
    if (halaman > maksHalaman) {
      throw new Error(`gagal membaca ${label}: melewati ${maksHalaman} halaman — kursornya tidak maju?`)
    }

    const { data, error } = await build(kursor)
    if (error) throw new Error(`gagal membaca ${label}: ${error.message}`)
    if (!data?.length) break

    // Builder mengabaikan `.limit(size)` → sisa logikanya (`data.length < size`
    // sebagai penanda halaman terakhir) ikut salah. Lebih baik berisik.
    if (data.length > size) {
      throw new Error(
        `gagal membaca ${label}: satu halaman berisi ${data.length} baris, ` +
        `lebih dari size=${size} — .limit() di builder tidak sesuai.`,
      )
    }

    // ── Penjaga ORDER BY ────────────────────────────────────────────────────
    // Inilah cacat yang paling mahal karena paling senyap: tanpa `ORDER BY`,
    // hasilnya tetap "masuk akal", cuma ada baris yang hilang. Primitif ini
    // tidak bisa memaksa pemanggil menulis `.order('id')`, tapi BISA menolak
    // hasil yang buktinya tidak terurut. Hanya untuk id numerik — untuk uuid,
    // urutan byte Postgres tak selalu sama dengan perbandingan string JS, jadi
    // memeriksanya justru bisa memerahkan query yang benar.
    const idNumerik = typeof data[0].id === 'number'
    if (idNumerik) {
      for (let i = 1; i < data.length; i++) {
        if (!((data[i].id as number) > (data[i - 1].id as number))) {
          throw new Error(
            `gagal membaca ${label}: baris tidak urut naik menurut id ` +
            `(${String(data[i - 1].id)} lalu ${String(data[i].id)}) — ` +
            `builder-nya belum memakai .order('id').`,
          )
        }
      }
    }

    out.push(...data)

    const terakhir = data[data.length - 1].id
    // Kursor tidak maju = jaminan loop tak berujung. Terjadi kalau builder lupa
    // menerapkan `.gt('id', kursor)`.
    if (kursor !== null && !(terakhir > kursor)) {
      throw new Error(
        `gagal membaca ${label}: kursor tidak maju (${String(kursor)} → ${String(terakhir)}) — ` +
        `builder-nya belum menerapkan .gt('id', kursor).`,
      )
    }
    kursor = terakhir

    if (data.length < size) break
  }

  return out
}

/**
 * Versi terscope: tanyakan hanya untuk daftar id yang memang ditanya, dipecah
 * per potongan supaya URL-nya tidak meledak.
 *
 * Ini pasangan wajib `paginate()`, bukan pemanis — rules.md §3.4: menyapu
 * seluruh ledger hanya untuk menanyakan status belasan aset itu yang bikin
 * timeout beruntun 2026-07-28, dan index cuma menggeser ambangnya.
 */
export async function perPotongan<T, V>(
  label: string,
  nilai: readonly V[],
  build: (potongan: V[]) => PromiseLike<HasilQuery<T>>,
  opts: { size?: number } = {},
): Promise<T[]> {
  const size = opts.size ?? 200
  const uniq = [...new Set(nilai)]
  const out: T[] = []
  for (let i = 0; i < uniq.length; i += size) {
    const { data, error } = await build(uniq.slice(i, i + size))
    if (error) throw new Error(`gagal membaca ${label}: ${error.message}`)
    if (data) out.push(...data)
  }
  return out
}
