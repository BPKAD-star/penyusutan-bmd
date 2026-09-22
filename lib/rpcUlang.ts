// Coba-ulang SATU KALI untuk RPC yang gagal karena STATEMENT TIMEOUT.
//
// ⚠️ AKALAN SEMENTARA, bukan obatnya — dan itu penting supaya tak ada yang
// mengira masalahnya sudah selesai. Sebabnya mesin DB kekecilan: diukur ke
// produksi 2026-09-22, `shared_buffers` **224 MB** & `effective_cache_size`
// **384 MB** lawan ±3,2 GB data panas (`aset` 1.401 MB / 906.586 baris ·
// `transaksi_bmd` 619 MB · `aset_awal_2026` 610 MB · `penyusutan_semester`
// 544 MB / 1.458.820 baris). Jadi agregat berat di sini TERIKAT I/O, dan
// rencana query-nya sendiri sehat — `fn_dashboard_rekap` terukur **9.248 ms
// DINGIN** (lewat pagu `authenticated` 8.000 ms → 57014) lawan **721 ms
// HANGAT** dgn `shared hit=13.770`, yaitu seluruhnya dari cache.
//
// Justru itu yang membuat coba-ulang masuk akal di sini, dan hanya di sini:
// percobaan PERTAMA yang tumbang tetap MENARIK halamannya ke cache sebelum
// mati, jadi percobaan kedua berangkat dari keadaan hangat & nyaris selalu
// lolos. Ini bukan "ulangi saja siapa tahu berhasil".
//
// ⚠️ HANYA untuk timeout. Error lain (wewenang, guard, fungsi tak ada, sintaks)
// hasilnya akan sama persis kalau diulang — mengulangnya cuma menggandakan
// beban mesin yang justru sedang kewalahan.
//
// ⚠️ Percobaan kedua yang gagal DIKEMBALIKAN APA ADANYA, tidak ditelan: pemanggil
// tetap wajib menampilkan pesannya. Modul ini tak pernah boleh mengubah
// kegagalan jadi keberhasilan yang kelihatan sah.

/** Benar kalau pesan error PostgREST/Postgres itu statement timeout. */
export function pesanTimeout(msg: string): boolean {
  return /57014|statement timeout/i.test(msg)
}

/**
 * Jalankan sebuah panggilan RPC; kalau gagal karena timeout, ulangi TEPAT
 * sekali. Bentuk hasilnya dipertahankan apa adanya supaya pemanggil tak perlu
 * berubah sama sekali.
 */
// ⚠️ `PromiseLike`, bukan `Promise` — builder supabase-js itu THENABLE tapi tak
// punya `.catch`/`.finally`, jadi `Promise<R>` bikin inferensi gagal & `R`
// jatuh ke batasannya (hasilnya "Property 'data' does not exist").
export async function rpcUlangJikaTimeout<R extends { error: { message: string } | null }>(
  jalankan: () => PromiseLike<R>,
): Promise<R> {
  const pertama = await jalankan()
  if (!pertama.error || !pesanTimeout(pertama.error.message)) return pertama
  return jalankan()
}
