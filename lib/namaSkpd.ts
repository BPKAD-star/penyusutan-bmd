// ============================================================================
// Daftar & peta nama SKPD — SATU sumber.
//
// Diangkat 2026-09-16 (REFACTOR-PLAN Fase 1, adopsi `paginate`). Loop yang
// sama persis — `range(from, from + 999)` sampai habis, `error` ditelan —
// ditulis ulang di **22 berkas**. Tiap salinan mengulang tiga cacat yang di
// repo ini selalu berpasangan (rules.md §3):
//
//   1. **OFFSET, bukan keyset** — makin dalam makin mahal, dan tanpa
//      `ORDER BY` Postgres tak menjamin urutan antar-halaman, jadi begitu
//      hasilnya >1.000 ada baris yang terlewat DIAM-DIAM;
//   2. **`const { data } = await` telanjang** — query gagal → `data` null →
//      loop berhenti → peta KOSONG. Akibatnya kolom SKPD tiap baris tampil
//      "-", yang terbaca operator sebagai "barang ini memang tak bertuan";
//   3. tak ada penjaga apa pun kalau kursornya tak maju.
//
// Ketiganya sudah dijaga `paginate()` (shared/db/paginate.ts), yang dipakai di
// sini — jadi ini bukan sekadar deduplikasi, tapi 22 tempat yang berpindah
// dari loop tulis-tangan ke primitif bertest.
//
// ⚠️ MELEMPAR saat gagal. Yang MENAMPILKAN nama boleh menurunkannya jadi
// PERINGATAN (lihat `useNamaSkpdMap`) — nama SKPD label di atas angka yang
// sudah benar, dan menjatuhkan seluruh halaman gara-gara itu justru merugikan.
// Yang MENGHITUNG wajib membiarkannya melempar.
//
// ⚠️ Ini menarik SELURUH tabel (816 baris per 2026-08-16). Kalau yang
// dibutuhkan cuma nama SKPD yang SEDANG DIPILIH, pakai `useNamaSkpd`
// (components/useNamaSkpd.ts); kalau cuma nama SKPD yang muncul di hasil,
// pakai `.in('id', …)` seperti LaporanKir/LaporanPemanfaatan — keduanya lebih
// murah dan tetap benar.
// ============================================================================
import { paginate } from '@/shared/db/paginate'

export type SkpdRingkas = { id: number; nama: string }

/** Bentuk minimal klien Supabase yang dibutuhkan — sengaja bukan tipe
 *  supabase-js, supaya bisa diuji tanpa jaringan & tanpa menyeret kliennya. */
type KlienMinimal = {
  from: (tabel: string) => {
    select: (kolom: string) => {
      gt: (kolom: string, nilai: number) => {
        order: (kolom: string, opts: { ascending: boolean }) => {
          limit: (n: number) => PromiseLike<{ data: SkpdRingkas[] | null; error: { message: string } | null }>
        }
      }
    }
  }
}

/**
 * SELURUH SKPD, urut `id`. MELEMPAR kalau query gagal.
 *
 * ⚠️ Kursornya `.gt('id', …)`, bukan `.range()`. Selain lebih murah, itu yang
 * membuat penjaga urutan di `paginate()` bisa bekerja — ia MENOLAK hasil yang
 * terbukti tak urut naik, yaitu cacat paling senyap dari ketiganya.
 */
export async function fetchDaftarSkpd(supabase: unknown): Promise<SkpdRingkas[]> {
  const db = supabase as KlienMinimal
  return paginate<number, SkpdRingkas>('daftar SKPD', kursor =>
    db.from('admin_skpd').select('id,nama')
      .gt('id', kursor ?? 0)
      .order('id', { ascending: true })
      .limit(1000))
}

/** `id → nama`. Bentuk yang dipakai mayoritas pemanggil. */
export function petaNamaSkpd(rows: readonly SkpdRingkas[]): Record<number, string> {
  const peta: Record<number, string> = {}
  for (const s of rows) peta[s.id] = s.nama
  return peta
}

/** `id → nama` sebagai `Map` — beberapa pemanggil memakai bentuk ini. */
export function mapNamaSkpd(rows: readonly SkpdRingkas[]): Map<number, string> {
  return new Map(rows.map(s => [s.id, s.nama]))
}

/** Pintasan: tarik + jadikan `Record`. MELEMPAR kalau query gagal. */
export async function fetchPetaNamaSkpd(supabase: unknown): Promise<Record<number, string>> {
  return petaNamaSkpd(await fetchDaftarSkpd(supabase))
}
