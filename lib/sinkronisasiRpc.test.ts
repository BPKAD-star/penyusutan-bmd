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

// ---------------------------------------------------------------------------
describe('§6 Laporan Perolehan — predikat idx_trx_perolehan_id ↔ prop `jenis` halamannya', () => {
  // Insiden 2026-08-20: kelima menu Laporan Perolehan timeout begitu dibuka &
  // baru muncul setelah SKPD dipilih. `jenis` (ENUM) tak bisa jadi index-cond
  // di bawah RLS, jadi yang tersisa buat planner cuma `ORDER BY id DESC LIMIT
  // 500` → menyusuri PRIMARY KEY MUNDUR. Karena baris perolehan jauh lebih
  // sedikit dari LIMIT-nya (hibah_masuk 45 dari 420rb), LIMIT tak pernah
  // terpenuhi & seluruh tabel dilewati: 15.386 ms vs pagu 8 dtk.
  //
  // Ditambal partial index `(id) WHERE jenis IN (…)` (20260820_03) → 21,5 ms.
  // BAHAYANYA: predikat itu KEMBAR dengan prop `jenis` di kelima halaman. Menu
  // Cara Perolehan BARU yang lupa didaftarkan di predikat index akan timeout
  // dengan gejala yang sama persis, dan TAK ADA APA PUN yang gagal — itulah
  // yang dijaga test ini.
  const DIR_HAL = path.join(AKAR, 'app', 'dashboard', 'pelaporan', 'perolehan')

  /** Prop `jenis="…"` dari tiap halaman yang memakai components/LaporanPerolehan. */
  function jenisHalaman(): string[] {
    const out: string[] = []
    for (const d of fs.readdirSync(DIR_HAL, { withFileTypes: true })) {
      if (!d.isDirectory()) continue
      const f = path.join(DIR_HAL, d.name, 'page.tsx')
      if (!fs.existsSync(f)) continue
      const isi = fs.readFileSync(f, 'utf8')
      if (!isi.includes('LaporanPerolehan')) continue
      const m = isi.match(/jenis="([a-z_]+)"/)
      expect(m, `halaman ${d.name} memakai LaporanPerolehan tapi prop jenis tak terbaca`).toBeTruthy()
      out.push(m![1])
    }
    // Pengaman anti-hampa: pemindai yang tak menemukan apa-apa akan "lulus".
    expect(out.length, `hanya ${out.length} halaman Laporan Perolehan terbaca dari ${DIR_HAL}`).toBeGreaterThanOrEqual(5)
    return out
  }

  /**
   * Badan pernyataan `CREATE INDEX … ;` saja.
   *
   * ⚠️ Sengaja TIDAK memakai `jenisIn()` atas seluruh berkas seperti §4:
   * migrasi ini menjelaskan predikatnya panjang lebar di komentar, dan kalimat
   * seperti "predikat `jenis IN (…)`" ikut tertangkap regex lalu menghasilkan
   * daftar KOSONG yang membuat assertion di bawah gagal (atau, kalau
   * assertion-nya dilonggarkan, LULUS TANPA MEMERIKSA APA PUN). Menyempitkan
   * ke pernyataannya lebih benar daripada mengarang komentar yang menghindari
   * pola regex.
   */
  function pernyataanIndex(isi: string): string {
    const mulai = isi.search(/CREATE\s+INDEX[^;]*idx_trx_perolehan_id/i)
    expect(mulai, 'pernyataan CREATE INDEX idx_trx_perolehan_id tak ditemukan').toBeGreaterThanOrEqual(0)
    const sisa = isi.slice(mulai)
    return sisa.slice(0, sisa.indexOf(';') + 1)
  }

  it('predikat index memuat SEMUA jenis yang dipakai halaman Laporan Perolehan', () => {
    const mig = bacaMigrasi().filter(m => m.isi.includes('idx_trx_perolehan_id'))
    expect(mig.length, 'migrasi idx_trx_perolehan_id tak ditemukan').toBeGreaterThan(0)
    const daftar = jenisIn(pernyataanIndex(mig[mig.length - 1].isi))
    expect(daftar.length, 'predikat `jenis IN (…)` tak ditemukan di CREATE INDEX-nya').toBe(1)
    expect(daftar[0].length, 'predikat index terbaca kosong — regexnya rusak').toBeGreaterThan(0)

    // Predikat WAJIB superset: `jenis = 'x'` cuma bisa dibuktikan menyiratkan
    // `jenis IN (…)` kalau x memang ada di dalamnya. Yang kurang = index
    // diabaikan diam-diam untuk menu itu.
    for (const j of jenisHalaman()) {
      expect(daftar[0], `jenis '${j}' dipakai halaman Laporan Perolehan tapi TIDAK ada di predikat idx_trx_perolehan_id`).toContain(j)
    }
  })

  it('index dibuat PLAIN, bukan CONCURRENTLY', () => {
    // Supabase SQL Editor membungkus skrip dalam transaksi, dan CONCURRENTLY di
    // dalam transaksi GAGAL SENYAP (pelajaran migrasi 20260718_06).
    const mig = bacaMigrasi().filter(m => m.isi.includes('idx_trx_perolehan_id'))
    expect(mig[mig.length - 1].isi).not.toMatch(/CREATE\s+INDEX\s+CONCURRENTLY/i)
  })
})

// ---------------------------------------------------------------------------
describe('§7 Laporan Transaksi (Pengelolaan) — tiap jenisList tercakup index (id) parsial', () => {
  // Insiden 2026-08-26: dropdown "Periode" di Laporan Pengadaan kosong (pola
  // §6). Menyisir components/LaporanTransaksi.tsx (dipakai Reklasifikasi/
  // Koreksi/Kapitalisasi/Penghapusan/Pengalihan/Mutasi Internal) menemukan
  // dua korban LAIN yang lebih parah, keduanya TIMEOUT SEJAK MENUNYA ADA
  // (bukan cuma dropdown-nya): idx_trx_reklas_id ketinggalan 'reklas_komptabel'
  // (dibuat 20260811_01 untuk fn_dbar_kode_at, bukan untuk laporan ini), dan
  // 'kapitalisasi' tak pernah punya index parsial sama sekali. Diukur ke DB
  // RLS aktif: reklasifikasi 9.708 ms, kapitalisasi 13.950 ms — dua-duanya di
  // atas statement_timeout 8 dtk.
  //
  // Bedanya dari §6: di sana SATU index melayani lima halaman (jenis tunggal
  // per halaman, index-nya union kelimanya). Di sini SATU index bisa melayani
  // SATU KELOMPOK menu (jenisList jamak per halaman) — jadi yang diperiksa
  // bukan "satu index tunggal berisi semua", tapi "tiap jenisList tercakup
  // OLEH SALAH SATU index (id) WHERE jenis IN (…) yang ada".
  const DIR_HAL = path.join(AKAR, 'app', 'dashboard', 'pelaporan', 'pengelolaan')

  /** Prop `jenisList={[...]}` dari tiap halaman yang memakai components/LaporanTransaksi. */
  function jenisListHalaman(): { halaman: string; jenis: string[] }[] {
    const out: { halaman: string; jenis: string[] }[] = []
    for (const d of fs.readdirSync(DIR_HAL, { withFileTypes: true })) {
      if (!d.isDirectory()) continue
      const f = path.join(DIR_HAL, d.name, 'page.tsx')
      if (!fs.existsSync(f)) continue
      const isi = fs.readFileSync(f, 'utf8')
      // ⚠️ Yang dicari IMPORT-nya, bukan sekadar penyebutan namanya. Halaman
      // yang PINDAH dari komponen ini biasanya menjelaskan kenapa di komentar,
      // dan pemindai yang mencocokkan teks apa adanya lalu menuduhnya "memakai
      // LaporanTransaksi tapi jenisList tak terbaca" — merah palsu yang
      // menghukum justru dokumentasi yang benar (kejadian 2026-08-31 waktu
      // menu Penggunaan dipindah ke komponennya sendiri).
      if (!isi.includes("from '@/components/LaporanTransaksi'")) continue
      const m = isi.match(/jenisList=\{\[([^\]]*)\]\}/)
      expect(m, `halaman ${d.name} memakai LaporanTransaksi tapi prop jenisList tak terbaca`).toBeTruthy()
      out.push({ halaman: d.name, jenis: kutipan(m![1]) })
    }
    // Pengaman anti-hampa: pemindai yang tak menemukan apa-apa akan "lulus".
    expect(out.length, `hanya ${out.length} halaman Pengelolaan terbaca dari ${DIR_HAL}`).toBeGreaterThanOrEqual(5)
    return out
  }

  /**
   * Predikat TERAKHIR tiap index `(id) WHERE jenis IN (…)` atas transaksi_bmd,
   * disisir dari SELURUH migrasi berurutan nama file — index yang di-DROP lalu
   * dibuat ulang dgn predikat lebih lebar (pola idx_trx_reklas_id di sini,
   * idx_trx_pindah_id di 20260729_07) otomatis kepakai definisi terakhirnya,
   * karena Map di-overwrite tiap CREATE ditemukan lagi.
   */
  function predikatIndexId(): Map<string, string[]> {
    const peta = new Map<string, string[]>()
    const re = /CREATE\s+INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+(\w+)\s+ON\s+transaksi_bmd\s*\(id\)\s*WHERE\s+jenis\s+IN\s*\(([^)]*)\)/gi
    for (const { isi } of bacaMigrasi()) {
      for (const m of isi.matchAll(re)) peta.set(m[1], kutipan(m[2]))
    }
    return peta
  }

  it('setiap jenisList tercakup SEKURANG-KURANGNYA satu index (id) WHERE jenis IN (…)', () => {
    const peta = predikatIndexId()
    expect(peta.size, 'tak ada satu pun index (id) WHERE jenis IN (…) terbaca dari migrasi — parser rusak').toBeGreaterThan(0)
    for (const { halaman, jenis } of jenisListHalaman()) {
      const cocok = [...peta.entries()].filter(([, predikat]) => jenis.every(j => predikat.includes(j)))
      expect(cocok.length,
        `halaman '${halaman}' (jenisList: ${jenis.join(', ')}) tak tercakup index manapun — ` +
        `akan timeout begitu dibuka tanpa filter SKPD/periode (pola persis §6, kembar dgn insiden 2026-08-26)`,
      ).toBeGreaterThan(0)
    }
  })

  // ⚠️ Menu Pelaporan yang TIDAK memakai `LaporanTransaksi` tetap butuh penjaga
  // yang sama — dan justru merekalah yang gampang lolos, karena pemindai di
  // atas tak melihatnya sama sekali. Penggunaan (2026-08-31) yang pertama:
  // komponennya sendiri, tapi bentuk query-nya sama persis
  // (`.eq('jenis', …).order('id')`), jadi ia menanggung risiko timeout yang
  // sama kalau jenisnya tak tercakup index parsial.
  it('menu Penggunaan (komponen sendiri) tercakup index (id) WHERE jenis IN (…)', () => {
    const berkas = [
      'components/pelaporan/LaporanPenggunaan.tsx',
      'lib/laporanPenggunaan.ts',
    ]
    for (const b of berkas) {
      const f = path.join(AKAR, b)
      expect(fs.existsSync(f), `berkas ${b} tak ditemukan — pemindaian rusak`).toBe(true)
      const isi = fs.readFileSync(f, 'utf8')
      expect(isi, `${b} tak menyaring jenis pengalihan_status`)
        .toContain("eq('jenis', 'pengalihan_status')")
      // Urutan menentukan index mana yang sanggup melayani: `jenis` bertipe
      // ENUM tak bisa jadi index-cond di bawah RLS, jadi `order('periode')`
      // atau `('tanggal')` menyusuri index lain sambil membuang ratusan ribu
      // baris → timeout (CLAUDE.md "ronde 3").
      expect(isi, `${b} tak mengurutkan by id`).toContain("order('id'")
    }
    const peta = predikatIndexId()
    const cocok = [...peta.entries()].filter(([, predikat]) => predikat.includes('pengalihan_status'))
    expect(cocok.length,
      'pengalihan_status tak tercakup index (id) WHERE jenis IN (…) manapun').toBeGreaterThan(0)
  })

  it('idx_trx_kapitalisasi_id & idx_trx_koreksi_id dibuat PLAIN, bukan CONCURRENTLY', () => {
    for (const nama of ['idx_trx_kapitalisasi_id', 'idx_trx_koreksi_id']) {
      const mig = bacaMigrasi().filter(m => m.isi.includes(nama))
      expect(mig.length, `migrasi ${nama} tak ditemukan`).toBeGreaterThan(0)
      expect(mig[mig.length - 1].isi).not.toMatch(/CREATE\s+INDEX\s+CONCURRENTLY/i)
    }
  })
})
