// ============================================================================
// Test SINKRONISASI TS ↔ SQL untuk RPC Fase 4 — pelengkap lib/sinkronisasi.test.ts.
//
// Fase 4 memindahkan aturan bisnis ke dalam fungsi Postgres, dan itu melahirkan
// kelas utang baru: aturan yang sama kini ditulis DUA KALI dalam DUA BAHASA.
// Yang di TS dijaga unit test; yang di SQL, sampai berkas ini ada, tidak dijaga
// apa pun. Pola kegagalannya persis sama dengan yang sudah berkali-kali
// menggigit repo ini (rules.md §5.5): satu sisi disunting, sisi lain lupa, dan
// TIDAK ADA APA PUN YANG GAGAL — yang muncul cuma angka yang beda antar laporan.
//
// ⚠️ BATAS YANG DISENGAJA — baca sebelum menambah assertion di sini.
// Berkas ini membandingkan DAFTAR KONSTANTA yang tertulis di berkas migrasi
// dengan konstanta TS-nya. Ia TIDAK menjalankan SQL dan karena itu TIDAK
// membuktikan kedua sisi menghasilkan angka yang sama — untuk itu perlu test
// integrasi ber-DB (`authenticated`), yang di REFACTOR-PLAN §10 masih 0 dan
// memang dijadwalkan terpisah. Jangan menambah assertion yang PURA-PURA
// menutupi kesetaraan runtime; plan-nya secara eksplisit memperingatkan itu.
//
// Yang SUDAH diverifikasi ke DB secara manual (2026-08-18, dicatat di sini
// supaya tak diulang percuma & supaya jelas apa yang test ini TIDAK gantikan):
//   · fn_dbar_hidden vs CTE inline fn_rekap_bmd ... 227 = 227, selisih 0 dua arah
//   · fn_dbar_owner  vs CTE inline fn_rekap_bmd .... 57 =  57, selisih 0 dua arah
//   · Laporan BMD vs Rekonsiliasi ......... 8 golongan × 4 ukuran, selisih 0,00
//   · fn_rekon_rekap tie-out .............. 9 sel, 2 pasang periode
//
// ⚠️ ATURAN MEMPERBAIKI TEST INI: kalau merah, jawabannya hampir selalu
// "lengkapi/samakan daftar yang ketinggalan", BUKAN "longgarkan assertion-nya".
// ============================================================================
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { GOLONGAN_REKAP, perlakuanKode } from './bmd'
import { SEMBUNYI_PENYUSUTAN, SEMBUNYI_DAFTAR_BARANG, MUNCUL, LAHIR } from './visibilitas'
import { JENIS_REKLAS_KODE } from './reklasKode'

const AKAR = process.cwd()
const DIR_MIGRASI = path.join(AKAR, 'supabase', 'migrations')

function bacaMigrasi(): { nama: string; isi: string }[] {
  const berkas = fs.readdirSync(DIR_MIGRASI).filter(f => f.endsWith('.sql')).sort()
  // Pengaman anti-hampa (pola lib/sinkronisasi.test.ts): pemindai yang tak
  // menemukan apa-apa akan "lulus" — lebih berbahaya daripada tak punya test.
  if (berkas.length < 50) throw new Error(`hanya ${berkas.length} migrasi terbaca dari ${DIR_MIGRASI} — pemindaian rusak`)
  return berkas.map(nama => ({ nama, isi: fs.readFileSync(path.join(DIR_MIGRASI, nama), 'utf8') }))
}

/**
 * Badan fungsi plpgsql/sql sebagaimana tertulis di migrasi TERAKHIR yang
 * mendefinisikannya. "Terakhir" penting: sebuah fungsi bisa dibuat ulang
 * berkali-kali (fn_rekon_pos ada di 20260818_04 lalu diganti 20260818_05), dan
 * yang berlaku di DB adalah definisi terakhir yang dijalankan.
 */
function badanFungsi(nama: string): string {
  const pembuka = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+${nama}\\s*\\(`, 'i')
  const kandidat = bacaMigrasi().filter(m => pembuka.test(m.isi))
  if (kandidat.length === 0) {
    throw new Error(
      `tak ada migrasi yang mendefinisikan '${nama}'. Kalau fungsinya dihapus/diganti nama, ` +
      `PERBARUI berkas test ini — jangan menghapus pengeceknya.`,
    )
  }
  const m = kandidat[kandidat.length - 1]
  const mulai = m.isi.search(pembuka)
  const sisa = m.isi.slice(mulai)
  // Badan fungsi di repo ini selalu dibatasi $function$ … $function$.
  const b1 = sisa.indexOf('$function$')
  const b2 = sisa.indexOf('$function$', b1 + 10)
  if (b1 < 0 || b2 < 0) throw new Error(`badan '${nama}' di ${m.nama} tak dibatasi $function$ — parser test perlu disesuaikan`)
  return sisa.slice(b1 + 10, b2)
}

/** Semua identifier ber-kutip-tunggal di sebuah potongan teks, urut & unik. */
const kutipan = (s: string): string[] =>
  [...new Set([...s.matchAll(/'([a-z0-9_.]+)'/g)].map(x => x[1]))].sort()

/** Isi tiap `ARRAY[ … ]` yang ditugaskan ke sebuah variabel plpgsql. */
function arrayVariabel(badan: string, nama: string): string[] {
  const re = new RegExp(`${nama}\\s+jenis_transaksi_bmd\\[\\]\\s*:=\\s*ARRAY\\[([^\\]]*)\\]`, 'i')
  const m = badan.match(re)
  if (!m) throw new Error(`variabel '${nama}' tak ditemukan di badan fungsi — parser test perlu disesuaikan`)
  return kutipan(m[1])
}

/** Tiap kemunculan `jenis IN ( … )`, masing-masing sbg daftar terurut. */
function jenisIn(teks: string): string[][] {
  return [...teks.matchAll(/jenis\s+IN\s*\(([^)]*)\)/gi)].map(m => kutipan(m[1]))
}

const urut = (a: readonly string[]) => [...a].sort()

// ---------------------------------------------------------------------------
describe('§1 golongan yang disusutkan — SQL ↔ perlakuanKode()', () => {
  // Aturan "tak disusutkan → nilai buku = nilai perolehan" WAJIB per baris.
  // Melanggarnya mengulang cacat yang bikin Uji Konsistensi menuduh Tanah & ATL
  // "TIDAK COCOK" sebesar seluruh nilai perolehannya (2026-08-16).
  const DIHARAPKAN = urut(GOLONGAN_REKAP.map(g => g.kode).filter(k => perlakuanKode(k) !== 'tidak'))

  it('lib/bmd.ts memang menghasilkan lima golongan yang diharapkan', () => {
    // Anti-hampa: kalau `perlakuanKode` berubah, §1 di bawah jadi tak berarti
    // karena ia membandingkan SQL dengan daftar yang ikut bergeser.
    expect(DIHARAPKAN).toEqual(['1.3.2', '1.3.3', '1.3.4', '1.5.3', '1.5.4'])
  })

  for (const fn of ['fn_penyusutan_rekap', 'fn_rekon_pos']) {
    it(`${fn} memakai daftar golongan yang sama`, () => {
      const badan = badanFungsi(fn)
      const daftar = [...badan.matchAll(/IN\s*\(\s*((?:'\d+\.\d+\.\d+'\s*,\s*)+'\d+\.\d+\.\d+')\s*\)/g)]
        .map(m => kutipan(m[1]))
      expect(daftar.length, `tak ada satu pun daftar golongan di ${fn} — parser test perlu disesuaikan`).toBeGreaterThan(0)
      for (const d of daftar) expect(d, `daftar golongan di ${fn} menyimpang dari perlakuanKode()`).toEqual(DIHARAPKAN)
    })
  }
})

// ---------------------------------------------------------------------------
describe('§2 visibilitas — fn_dbar_hidden ↔ lib/visibilitas.ts', () => {
  const badan = badanFungsi('fn_dbar_hidden')

  it('SEMBUNYI varian penyusutan sama', () => {
    expect(arrayVariabel(badan, 'v_sembunyi')).toEqual(urut(SEMBUNYI_PENYUSUTAN))
  })

  it('MUNCUL sama', () => {
    expect(arrayVariabel(badan, 'v_muncul')).toEqual(urut(MUNCUL))
  })

  it('LAHIR sama', () => {
    expect(arrayVariabel(badan, 'v_lahir')).toEqual(urut(LAHIR))
  })

  it('varian daftar_barang = penyusutan + kdp_selesai_keluar', () => {
    // Perbedaan SATU jenis ini disengaja & sudah ada sejak sebelum
    // lib/visibilitas.ts lahir. Menyamakan keduanya akan MENYEMBUNYIKAN aset
    // KDP yang seharusnya tampil di Penyusutan, tanpa satu pun error.
    const tambahan = urut(SEMBUNYI_DAFTAR_BARANG).filter(j => !SEMBUNYI_PENYUSUTAN.includes(j as never))
    expect(tambahan).toEqual(['kdp_selesai_keluar'])
    // Dan SQL-nya memang menambahkan jenis itu hanya untuk varian tsb.
    expect(badan).toMatch(/p_varian\s*=\s*'daftar_barang'/)
    expect(badan).toMatch(/kdp_selesai_keluar/)
  })

  it('varian ngawur DITOLAK, bukan diam-diam jatuh ke default', () => {
    // Salah ketik yang jatuh ke default persis kegagalan senyap yang parameter
    // varian ini justru dibuat untuk mencegah.
    expect(badan).toMatch(/RAISE\s+EXCEPTION/i)
  })
})

// ---------------------------------------------------------------------------
describe('§3 reklas kode — fn_dbar_kode_at ↔ lib/reklasKode.ts', () => {
  it('jenis yang menggeser kode sama', () => {
    const badan = badanFungsi('fn_dbar_kode_at')
    const arr = badan.match(/ARRAY\[([^\]]*)\]::jenis_transaksi_bmd\[\]/)
    expect(arr, 'daftar jenis reklas tak ditemukan — parser test perlu disesuaikan').toBeTruthy()
    expect(kutipan(arr![1])).toEqual(urut(JENIS_REKLAS_KODE))
  })

  it('memakai target_trx_id TUNGGAL, bukan target_trx_ids jamak', () => {
    // `batal_reklas` membawa `target_trx_id`; `batal_pengalihan` yang jamak.
    // Tertukar = pembatalan reklas tak pernah terbaca, dan barangnya tetap
    // dilaporkan di golongan yang sudah dibatalkan.
    const badan = badanFungsi('fn_dbar_kode_at')
    expect(badan).toMatch(/'target_trx_id'/)
    expect(badan).not.toMatch(/'target_trx_ids'/)
  })
})

// ---------------------------------------------------------------------------
describe('§4 baseline saldo awal — index ↔ SQL ↔ TS', () => {
  // ⚠️ Predikat index parsial WAJIB sama persis dengan qual di kode. Beda
  // sedikit → planner tak bisa membuktikan implikasinya & indexnya diabaikan
  // DIAM-DIAM (CLAUDE.md; sudah menggigit di GIS Tanah, Kendaraan, dan
  // fetchOwnerOverrides). Di sini taruhannya konkret: tanpa index itu,
  // pembacaan baseline 19.100 ms — 2,4× di atas statement timeout.
  const DIHARAPKAN = ['saldo_awal', 'saldo_awal_checkpoint']

  it('predikat idx_trx_saldo_awal_pos', () => {
    const mig = bacaMigrasi().filter(m => m.isi.includes('idx_trx_saldo_awal_pos'))
    expect(mig.length, 'migrasi idx_trx_saldo_awal_pos tak ditemukan').toBeGreaterThan(0)
    const daftar = jenisIn(mig[mig.length - 1].isi)
    expect(daftar.length, 'predikat `jenis IN (…)` tak ditemukan di migrasinya').toBeGreaterThan(0)
    for (const d of daftar) expect(d).toEqual(DIHARAPKAN)
  })

  it('qual di fn_rekon_pos sama dengan predikat indexnya', () => {
    const daftar = jenisIn(badanFungsi('fn_rekon_pos'))
    expect(daftar.length, 'qual `jenis IN (…)` tak ditemukan di fn_rekon_pos').toBeGreaterThan(0)
    for (const d of daftar) expect(d).toEqual(DIHARAPKAN)
  })

  it('kolektor TS (lib/rekon.ts) memakai daftar yang sama', () => {
    // `fetchBaselinePos` dipertahankan sebagai jalur pembanding golden test;
    // kalau daftarnya menyimpang dari SQL, pembandingnya berhenti membandingkan
    // hal yang sama.
    const isi = fs.readFileSync(path.join(AKAR, 'lib', 'rekon.ts'), 'utf8')
    const daftar = [...isi.matchAll(/\.in\('jenis',\s*\[([^\]]*)\]/g)].map(m => kutipan(m[1]))
    const baseline = daftar.filter(d => d.includes('saldo_awal'))
    expect(baseline.length, 'panggilan baseline `.in(\'jenis\', […])` tak ditemukan di lib/rekon.ts').toBeGreaterThan(0)
    for (const d of baseline) expect(d).toEqual(DIHARAPKAN)
  })
})

// ---------------------------------------------------------------------------
describe('§5 RPC agregat berat wajib punya work_mem', () => {
  // Temuan 2026-08-18: `work_mem` selama ini dipasang AD-HOC — hanya saat
  // sebuah halaman kebetulan bermasalah. Akibatnya `fn_rekap_bmd` TIMEOUT untuk
  // SKPD terbesar (9.144 ms vs pagu 8 dtk) dan Laporan BMD tak bisa dibuka sama
  // sekali, berbulan-bulan, tanpa ada yang tahu. Test ini membuat fungsi
  // agregat baru yang lupa menyetelnya gagal di CI, bukan di tangan operator.
  //
  // ⚠️ Daftarnya SENGAJA hanya memuat fungsi yang sudah TERUKUR membutuhkannya.
  // `fn_daftar_barang_rekap` sengaja TIDAK di sini — terukur 350 ms tanpa
  // work_mem, dan menambahkan setelan ke fungsi yang tak membutuhkannya cuma
  // menambah hal yang harus dirawat.
  const WAJIB = ['fn_rekap_bmd', 'fn_rekon_pos', 'fn_penyusutan_rekap']

  for (const fn of WAJIB) {
    it(`${fn} menyetel work_mem`, () => {
      const pembuka = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+${fn}\\s*\\(`, 'i')
      const kandidat = bacaMigrasi().filter(m => pembuka.test(m.isi))
      const m = kandidat[kandidat.length - 1]
      const mulai = m.isi.search(pembuka)
      // Kepala fungsi = dari CREATE sampai pembuka badan.
      const kepala = m.isi.slice(mulai, mulai + m.isi.slice(mulai).indexOf('$function$'))
      expect(kepala, `${fn} (${m.nama}) tak menyetel work_mem`).toMatch(/SET\s+work_mem/i)
    })
  }

  it('fn_dashboard_rekap & fn_rekap_saldo_awal disetel lewat ALTER FUNCTION', () => {
    // Keduanya badannya tak diubah — setelannya ditempel terpisah supaya tak
    // perlu menyalin ulang fungsi yang menghitung angka Lapis 1.
    const semua = bacaMigrasi().map(m => m.isi).join('\n')
    for (const fn of ['fn_dashboard_rekap', 'fn_rekap_saldo_awal']) {
      expect(semua, `${fn} tak punya ALTER FUNCTION … SET work_mem`).toMatch(
        new RegExp(`ALTER\\s+FUNCTION\\s+${fn}\\s*\\([^)]*\\)\\s*SET\\s+work_mem`, 'i'),
      )
    }
  })
})
