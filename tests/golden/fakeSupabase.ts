// ============================================================================
// Klien Supabase PALSU untuk golden test (TESTING.md §6).
//
// Kenapa bukan Postgres sungguhan: golden test di sini menguji **komposisi** —
// belasan kolektor + agregasi yang bersama-sama menghasilkan angka laporan.
// Yang mau dikunci adalah "dataset X menghasilkan angka Y", dan itu tidak
// butuh mesin SQL. Invarian yang MEMANG cuma ada di DB (RLS, trigger, guard)
// tetap butuh Postgres — itu lapisan terpisah (TESTING.md §5), bukan ini.
//
// ⚠️ ATURAN UTAMA BERKAS INI: **gagal keras untuk apa pun yang belum
// didukung.** Klien palsu yang diam-diam mengembalikan array kosong akan
// membuat seluruh golden test "hijau" tanpa menguji apa pun — persis rasa aman
// palsu yang jadi pola kegagalan paling mahal di repo ini (docs/insiden.md
// INS-06). Kalau kolektor memakai operator baru, test-nya HARUS meledak di
// sini, bukan menghasilkan snapshot yang salah.
// ============================================================================

export type Baris = Record<string, unknown>
export type Tabel = Record<string, Baris[]>

/** Relasi yang boleh disematkan lewat `alias:kolom_fk(kolom, …)` di `.select()`. */
export type Embed = Record<string, Record<string, { fk: string; tabel: string }>>

type Filter =
  | { op: 'eq' | 'neq' | 'gt'; kolom: string; nilai: unknown }
  | { op: 'in'; kolom: string; nilai: unknown[] }

const bandingkan = (a: unknown, b: unknown): number => {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

class Builder implements PromiseLike<{ data: Baris[] | null; error: { message: string } | null }> {
  private filters: Filter[] = []
  private urut: { kolom: string; naik: boolean } | null = null
  private batas: number | null = null

  constructor(
    private readonly db: FakeDb,
    private readonly tabel: string,
    private readonly select: string,
  ) {}

  eq(kolom: string, nilai: unknown) { this.filters.push({ op: 'eq', kolom, nilai }); return this }
  neq(kolom: string, nilai: unknown) { this.filters.push({ op: 'neq', kolom, nilai }); return this }
  gt(kolom: string, nilai: unknown) { this.filters.push({ op: 'gt', kolom, nilai }); return this }
  in(kolom: string, nilai: unknown[]) { this.filters.push({ op: 'in', kolom, nilai }); return this }

  order(kolom: string, opts: { ascending?: boolean } = {}) {
    this.urut = { kolom, naik: opts.ascending !== false }
    return this
  }

  limit(n: number) { this.batas = n; return this }

  // Operator yang SENGAJA tidak didukung: kalau kolektor mulai memakainya,
  // lebih baik test meledak daripada diam-diam menghasilkan angka yang salah.
  range(): never { throw new Error(`fakeSupabase: .range() belum didukung (tabel ${this.tabel}) — kolektor wajib keyset (rules.md §3.1)`) }
  or(): never { throw new Error(`fakeSupabase: .or() belum didukung (tabel ${this.tabel})`) }
  is(): never { throw new Error(`fakeSupabase: .is() belum didukung (tabel ${this.tabel})`) }
  single(): never { throw new Error(`fakeSupabase: .single() belum didukung (tabel ${this.tabel})`) }
  maybeSingle(): never { throw new Error(`fakeSupabase: .maybeSingle() belum didukung (tabel ${this.tabel})`) }

  private jalankan(): Baris[] {
    const sumber = this.db.tabel[this.tabel]
    if (!sumber) {
      throw new Error(
        `fakeSupabase: tabel '${this.tabel}' tidak ada di fixture. ` +
        `Tambahkan datanya — JANGAN mengembalikan kosong, itu bikin golden test lulus tanpa menguji apa pun.`,
      )
    }

    let rows = sumber.filter(r => this.filters.every(f => {
      const v = r[f.kolom]
      switch (f.op) {
        case 'eq': return v === f.nilai
        case 'neq': return v !== f.nilai
        case 'gt': return bandingkan(v, f.nilai) > 0
        case 'in': return f.nilai.includes(v)
      }
    }))

    if (this.urut) {
      const { kolom, naik } = this.urut
      rows = [...rows].sort((a, b) => (naik ? 1 : -1) * bandingkan(a[kolom], b[kolom]))
    }
    if (this.batas != null) rows = rows.slice(0, this.batas)

    return rows.map(r => this.proyeksikan(r))
  }

  /** Terapkan embed `alias:fk(kolom,…)` dari string select. Kolom biasa dibiarkan
   *  apa adanya — projeksi kolom tidak ditiru, dan itu disengaja: keberadaan
   *  kolom sudah dijaga tipe generated + lib/sinkronisasi.test.ts. */
  private proyeksikan(r: Baris): Baris {
    const out: Baris = { ...r }
    for (const [, alias, fk] of this.select.matchAll(/(?:^|,)\s*(\w+)\s*:\s*(\w+)\s*\(/g)) {
      const rel = this.db.embed[this.tabel]?.[alias]
      if (!rel) {
        throw new Error(
          `fakeSupabase: embed '${alias}:${fk}(…)' pada tabel '${this.tabel}' belum didaftarkan. ` +
          `Daftarkan di config embed — kalau tidak, kolektor membaca undefined dan angkanya diam-diam salah.`,
        )
      }
      const induk = this.db.tabel[rel.tabel] ?? []
      const nilaiFk = r[rel.fk]
      out[alias] = nilaiFk == null ? null : (induk.find(x => x.id === nilaiFk) ?? null)
    }
    return out
  }

  then<A, B>(
    ok?: ((v: { data: Baris[] | null; error: { message: string } | null }) => A | PromiseLike<A>) | null,
    gagal?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    const paksaGagal = this.db.gagalPada?.(this.tabel, this.select)
    const hasil = paksaGagal
      ? { data: null, error: { message: paksaGagal } }
      : { data: this.jalankan(), error: null }
    return Promise.resolve(hasil).then(ok, gagal)
  }
}

export class FakeDb {
  constructor(
    public readonly tabel: Tabel,
    public readonly embed: Embed = {},
    /** Kembalikan pesan error untuk memaksa query gagal — untuk menguji fail-closed. */
    public gagalPada?: (tabel: string, select: string) => string | null,
  ) {}

  from(tabel: string, select?: string) {
    return { select: (s: string) => new Builder(this, tabel, s), _select: select }
  }
}

/** Bentuk yang bisa dioper ke kolektor yang menuntut `SupabaseClient`. */
export function fakeSupabase(
  tabel: Tabel,
  embed: Embed = {},
  gagalPada?: (tabel: string, select: string) => string | null,
) {
  const db = new FakeDb(tabel, embed, gagalPada)
  return {
    from: (t: string) => ({ select: (s: string) => new Builder(db, t, s) }),
    rpc: (nama: string) => {
      throw new Error(`fakeSupabase: .rpc('${nama}') belum didukung`)
    },
  } as never
}
