// ============================================================================
// Test SINKRONISASI konstanta kembar — REFACTOR-PLAN.md Fase 0.4b.
//
// Berkas ini tidak menguji satu fungsi pun. Tugasnya menegakkan rules.md §5.5
// ("konstanta kembar wajib diubah berpasangan") dan daftar periksa §1.7
// ("menambah jenis batal_* baru"), yang selama ini hidup SEPENUHNYA sebagai
// prosa — dan karena itu berkali-kali dilanggar:
//
//   * `batal_pengalihan` (2026-07-29) kelewat TIGA RONDE. Ledgernya benar sejak
//     awal, jadi semuanya terlihat beres; yang terlupakan pembacanya.
//   * `tukar_menukar` (ditemukan 2026-08-05) hilang dari daftar baseline
//     perolehan di engine → barang hasil tukar menukar TIDAK PERNAH DISUSUTKAN.
//     Bertahan berbulan-bulan tanpa satu pun error.
//
// Pola kegagalannya selalu sama: satu daftar disalin ke beberapa tempat, salah
// satu salinan ketinggalan, dan TIDAK ADA APA PUN YANG GAGAL — yang muncul cuma
// angka yang beda antar laporan. Test di sini yang gagal.
//
// ⚠️ ATURAN MEMPERBAIKI TEST INI: kalau ia merah, jawabannya hampir selalu
// "lengkapi daftar yang ketinggalan", BUKAN "longgarkan assertion-nya". Satu-
// satunya alasan sah mengubah polanya adalah kalau konstanta/berkasnya memang
// dipindah atau diganti nama.
// ============================================================================
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { JENIS_PEROLEHAN, JENIS_TRANSAKSI_LABEL } from './bmd'
import { BATAL_TARGET_JENIS, VOID_JENIS } from './voidedAset'
import { JENIS_DITARIK } from './pengalihan'
import { JENIS_CARA } from './rekon'
import { JENIS_REKLAS_KODE } from './reklasKode'
import { Constants } from '@/shared/types/database.types'

const AKAR = process.cwd()

function bacaBerkas(rel: string): string {
  const p = path.join(AKAR, rel)
  if (!fs.existsSync(p)) {
    throw new Error(
      `berkas '${rel}' tidak ada. Kalau ia dipindah/diganti nama, PERBARUI jalur di ` +
      `lib/sinkronisasi.test.ts — jangan menghapus pengeceknya.`,
    )
  }
  return fs.readFileSync(p, 'utf8')
}

/** Semua berkas TS/TSX di lapisan aplikasi (app/, components/, lib/). */
function berkasSumber(): { nama: string; isi: string }[] {
  const out: { nama: string; isi: string }[] = []
  const jelajah = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) jelajah(p)
      else if (/\.tsx?$/.test(e.name)) out.push({ nama: path.relative(AKAR, p), isi: fs.readFileSync(p, 'utf8') })
    }
  }
  for (const d of ['app', 'components', 'lib']) jelajah(path.join(AKAR, d))
  if (out.length < 100) throw new Error(`hanya ${out.length} berkas sumber terbaca — penjelajahnya rusak`)
  return out
}

function bacaMigrasi(): { nama: string; isi: string }[] {
  const dir = path.join(AKAR, 'supabase', 'migrations')
  const berkas = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  // Pengaman anti-hampa. Test yang memindai berkas bisa "lulus" cuma karena
  // pemindaiannya tak menemukan apa-apa — itu lebih berbahaya daripada tak
  // punya test, karena ia memberi rasa aman palsu.
  if (berkas.length < 50) throw new Error(`hanya ${berkas.length} migrasi terbaca dari ${dir} — pemindaian rusak`)
  return berkas.map(nama => ({ nama, isi: fs.readFileSync(path.join(dir, nama), 'utf8') }))
}

/** Seluruh nilai enum `jenis_transaksi_bmd` sebagaimana tertulis di migrasi. */
function nilaiEnumDariMigrasi(): Set<string> {
  const out = new Set<string>()
  for (const m of bacaMigrasi()) {
    // Komentar SQL DIBUANG DULU. Tanpa ini, deklarasi awal enum tidak pernah
    // terbaca utuh: badan `CREATE TYPE … AS ENUM ( … )` di 20260702_01 memuat
    // komentar `-- no.11b\5: transfer antar SKPD (pengguna barang)`, dan
    // kurung tutup di dalam komentar itu MENGAKHIRI tangkapan lebih awal.
    // Akibatnya (ketahuan 2026-08-06 lewat pembanding database.types.ts) cuma
    // 31 dari 46 nilai yang terdeteksi — dan ambang anti-hampa yang dulu `<30`
    // tetap lolos, jadi tak ada yang sadar selama itu.
    const isi = m.isi.replace(/--[^\n]*/g, '')
    // (a) `ALTER TYPE … ADD VALUE 'x'` — cara enum bertambah sesudah awal.
    for (const [, v] of isi.matchAll(/ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'([a-z0-9_]+)'/gi)) out.add(v)
    // (b) `CREATE TYPE … jenis_transaksi_bmd … AS ENUM ( … )` — deklarasi awal.
    for (const blok of isi.matchAll(/CREATE\s+TYPE\s+[^;()]*?jenis_transaksi_bmd[^;()]*?AS\s+ENUM\s*\(([^)]*)\)/gi))
      for (const [, v] of blok[1].matchAll(/'([a-z0-9_]+)'/g)) out.add(v)
  }
  // Ambangnya sengaja dinaikkan mendekati jumlah sebenarnya (46 per 2026-08-06).
  // Ambang yang jauh di bawah kenyataan bukan pengaman — ia justru tempat
  // pemindai yang rusak sebagian bersembunyi.
  if (out.size < 40) throw new Error(`hanya ${out.size} nilai enum terdeteksi — regex pemindainya usang, PERBAIKI`)
  return out
}

// ════════════════════════════════════════════════════════════════════════════
// 1. Setiap jenis `batal_*` di enum WAJIB punya rumah yang disengaja.
// ════════════════════════════════════════════════════════════════════════════
describe('jenis batal_* terklasifikasi (rules.md §1.7)', () => {
  // Jenis batal yang SENGAJA tidak masuk VOID_JENIS maupun BATAL_TARGET_JENIS.
  // Kuncinya = alasannya. Menambah baris ke sini tanpa alasan yang benar sama
  // saja mematikan test ini — tulis kenapa, supaya peninjau berikutnya bisa
  // menilai apakah alasannya masih berlaku.
  const DILUAR_DAFTAR: Record<string, string> = {
    batal_penghapusan:
      'event MUNCUL — ditangani replay visibilitas (lib/visibilitas.ts), bukan penyaringan void',
    batal_pemecahan:
      'event MUNCUL — induk aktif kembali; visibilitasnya hasil replay',
    batal_pemecahan_masuk:
      'event SEMBUNYI — pecahan dibuang; visibilitasnya hasil replay',
    batal_akumulasi_kdp:
      'dikirim sebagai `extraVoidJenis` oleh lib/rekon.ts (fetchVoided), bukan lewat konstanta statis',
    batal_pemanfaatan:
      'NETRAL — hanya menentukan keanggotaan kartu Pemanfaatan; engine `default: break`',
    batal_pengamanan:
      'NETRAL — hanya menentukan keanggotaan kartu Pengamanan; engine `default: break`',
  }

  const semuaBatal = [...nilaiEnumDariMigrasi()].filter(v => v.startsWith('batal_')).sort()
  const levelTransaksi = Object.values(BATAL_TARGET_JENIS).flat() as string[]

  it('menemukan seluruh jenis batal_* dari migrasi (pemindaian tidak hampa)', () => {
    expect(semuaBatal.length).toBeGreaterThanOrEqual(15)
  })

  it('tidak ada jenis batal_* yang tak terklasifikasi', () => {
    // Inilah pengganti daftar periksa tujuh titik. Menambah `batal_*` baru ke
    // enum tanpa mendaftarkannya sebagai void (level aset), target (level
    // transaksi), atau pengecualian yang beralasan → MERAH di sini, bukan
    // ketahuan tiga ronde kemudian lewat laporan yang angkanya beda.
    const yatim = semuaBatal.filter(j =>
      !VOID_JENIS.includes(j) && !levelTransaksi.includes(j) && !(j in DILUAR_DAFTAR))

    expect(yatim, `jenis batal_* ini belum punya rumah: ${yatim.join(', ')}`).toEqual([])
  })

  it('tidak ada pengecualian yang basi (semua kunci DILUAR_DAFTAR masih ada di enum)', () => {
    // Arah sebaliknya: pengecualian untuk jenis yang sudah dihapus dari enum
    // cuma jadi sampah yang menyesatkan, dan bisa menyembunyikan jenis baru
    // bernama mirip.
    const hantu = Object.keys(DILUAR_DAFTAR).filter(j => !semuaBatal.includes(j))

    expect(hantu, `pengecualian untuk jenis yang tak ada lagi: ${hantu.join(', ')}`).toEqual([])
  })

  it('setiap jenis di BATAL_TARGET_JENIS punya label tampilan', () => {
    // Jenis ini dibaca modul pelaporan, jadi barisnya benar-benar sampai ke
    // layar riwayat transaksi & KIBAR. Tanpa label ia tampil tanpa nama.
    const tanpaLabel = levelTransaksi.filter(j => !JENIS_TRANSAKSI_LABEL[j])

    expect(tanpaLabel, `belum ada label untuk: ${tanpaLabel.join(', ')}`).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 2. Konstanta TS ↔ predikat PARTIAL INDEX di SQL.
// ════════════════════════════════════════════════════════════════════════════
describe('JENIS_DITARIK kembar dengan predikat idx_trx_pindah_id (rules.md §4.2)', () => {
  it('daftar jenis di kode sama persis dengan predikat index-nya', () => {
    // Kenapa ini penting DAN kenapa kegagalannya senyap: predikat partial index
    // harus sama persis dengan qual di kode, kalau tidak planner tak bisa
    // membuktikan implikasinya dan indexnya DIABAIKAN diam-diam — tak ada
    // error, query cuma balik menyusuri 418rb baris sampai statement timeout.
    // Persis yang bikin Rekonsiliasi BMD gagal Proses 2026-07-29.
    const pernyataan = bacaMigrasi()
      .flatMap(m => [...m.isi.matchAll(/CREATE\s+INDEX[\s\S]*?idx_trx_pindah_id[\s\S]*?;/gi)].map(x => x[0]))
      .filter(s => /\bjenis\b/i.test(s))
    const terakhir = pernyataan.at(-1) // migrasi terbaru yang menang
    if (!terakhir) throw new Error('tidak menemukan CREATE INDEX idx_trx_pindah_id ber-predikat jenis di migrasi mana pun')

    const where = terakhir.slice(terakhir.search(/\bWHERE\b/i))
    const dariIndex = [...where.matchAll(/'([a-z0-9_]+)'/g)].map(x => x[1]).sort()

    expect(dariIndex).toEqual([...JENIS_DITARIK].sort())
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 3. Daftar CARA PEROLEHAN — hidup di lima tempat (temuan 2026-08-05).
// ════════════════════════════════════════════════════════════════════════════
describe('daftar cara perolehan konsisten lintas modul', () => {
  // Yang bolong justru yang paling mahal (engine → barang tak pernah
  // disusutkan); empat lainnya kebetulan benar, dan tak satu pun mekanisme
  // menjamin mereka tetap begitu. Sekarang ada.
  const HARAPAN = ['hasil_inventarisasi', 'hibah_masuk', 'pengadaan', 'perolehan_lainnya', 'tukar_menukar']

  /** Ekstrak literal string dari sebuah array yang dideklarasikan di berkas TS/TSX. */
  function arrayLiteral(rel: string, pola: RegExp): string[] {
    const cocok = bacaBerkas(rel).match(pola)
    if (!cocok) {
      throw new Error(
        `pola ${pola} tidak ketemu di '${rel}'. Konstantanya diganti nama atau dipindah — ` +
        `perbarui polanya, JANGAN melonggarkan test ini.`,
      )
    }
    return [...cocok[1].matchAll(/'([a-z0-9_]+)'/g)].map(x => x[1]).sort()
  }

  it('JENIS_PEROLEHAN (lib/bmd.ts)', () => {
    expect([...JENIS_PEROLEHAN].sort()).toEqual(HARAPAN)
  })

  it('JENIS_CARA (lib/rekon.ts) — Rekonsiliasi BMD', () => {
    // `akumulasi_kdp` sengaja ikut di sana: termin kontrak konstruksi menaikkan
    // nilai aset KDP dan WAJIB terhitung sebagai penambahan, kalau tidak baris
    // KDP di Model 3 tidak foot. Ia bukan cara perolehan, jadi dikecualikan
    // dari perbandingan — bukan dihapus dari konstantanya.
    expect(JENIS_CARA.filter(j => j !== 'akumulasi_kdp').sort()).toEqual(HARAPAN)
  })

  it('JENIS_CARA_PEROLEHAN (Laporan BMD Model 3)', () => {
    expect(arrayLiteral(
      'app/dashboard/pelaporan/bmd/page.tsx',
      /const\s+JENIS_CARA_PEROLEHAN\s*=\s*\[([^\]]*)\]/,
    )).toEqual(HARAPAN)
  })

  it('CARA_LIST (kartu Dashboard)', () => {
    // Dibaca sebagai TEKS, bukan di-import: berkasnya komponen `'use client'`
    // yang menyeret React & next kalau di-import ke lingkungan node.
    const isi = bacaBerkas('components/dashboard/CaraPerolehanCards.tsx')
    const blok = isi.match(/const\s+CARA_LIST[^=]*=\s*\[([\s\S]*?)\n\]/)
    if (!blok) throw new Error('blok CARA_LIST tidak ketemu — perbarui polanya, jangan longgarkan test')
    const jenis = [...blok[1].matchAll(/jenisTransaksi:\s*'([a-z0-9_]+)'/g)].map(x => x[1]).sort()

    expect(jenis).toEqual(HARAPAN)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 4. shared/types/database.types.ts ↔ migrasi (REFACTOR-PLAN Fase 0.8).
//
// Berkas tipe itu DIGENERATE dari database, bukan ditulis tangan — jadi ia
// salinan, dan salinan di repo ini punya riwayat panjang menyimpang diam-diam.
// Bedanya dengan salinan lain: yang ini tak bisa dibandingkan ke DB dari CI
// (butuh kredensial). Yang BISA dibandingkan tanpa kredensial: nilai enum,
// karena sumbernya sama-sama ada di `supabase/migrations/*.sql`.
//
// Itu justru drift yang paling mahal. Menambah nilai enum lewat migrasi lalu
// lupa `npm run gen:types` membuat berkas tipe diam-diam KETINGGALAN, dan kode
// baru yang memakai `Enums<'jenis_transaksi_bmd'>` akan menolak nilai yang
// sebenarnya sah — atau lebih buruk, dianggap sah padahal belum ada.
// ════════════════════════════════════════════════════════════════════════════
describe('database.types.ts tidak ketinggalan dari migrasi (Fase 0.8)', () => {
  it('enum jenis_transaksi_bmd sama persis dengan yang ada di migrasi', () => {
    const dariTipe = [...Constants.public.Enums.jenis_transaksi_bmd].sort()
    // Anti-hampa: kalau generatornya berubah bentuk, jangan diam-diam lulus.
    if (dariTipe.length < 30) {
      throw new Error(
        `hanya ${dariTipe.length} nilai enum di database.types.ts — bentuk keluaran ` +
        `generatornya berubah. PERBAIKI pengeceknya, jangan hapus.`,
      )
    }

    expect(dariTipe).toEqual([...nilaiEnumDariMigrasi()].sort())
  })

  it('setiap .from(\'…\') menunjuk tabel yang BENAR-BENAR ADA (regresi INS-19)', () => {
    // 2026-07-08 commit "rename tabel referensi ke prefix admin_" mengganti
    // `dokumen_siklus` → `admin_dokumen` di DokumenSumber.tsx (tiga kali) tapi
    // MELEWATKAN `profiles` & `skpd` di berkas yang sama. Query ke tabel yang
    // tak ada gagal saat runtime, dan karena `error`-nya ditelan hasilnya
    // senyap: isAdmin selalu false, nama SKPD selalu "SKPD #12". Bertahan 29
    // hari. Ini pengecek yang seharusnya ada sejak berkas tipe di-commit.
    const tipe = bacaBerkas('shared/types/database.types.ts')
    const adaDiSkema = new Set(
      [...tipe.slice(tipe.indexOf('  public: {')).matchAll(/\n {6}([a-z_][a-z0-9_]*): \{\n {8}Row: \{/g)].map(m => m[1]),
    )
    if (adaDiSkema.size < 20) {
      throw new Error(`hanya ${adaDiSkema.size} tabel terbaca dari database.types.ts — pemindainya rusak, PERBAIKI`)
    }

    const asing: string[] = []
    let total = 0
    for (const f of berkasSumber()) {
      f.isi.split('\n').forEach((baris, i) => {
        for (const [, t] of baris.matchAll(/\.from\('([a-z_][a-z0-9_]*)'\)/g)) {
          total++
          if (!adaDiSkema.has(t)) asing.push(`${f.nama}:${i + 1} → .from('${t}')`)
        }
      })
    }
    // Anti-hampa: kalau penjelajah berkasnya rusak, jangan diam-diam lulus.
    if (total < 200) throw new Error(`hanya ${total} pemanggilan .from() terbaca — penjelajah berkasnya rusak`)

    expect(asing).toEqual([])
  })

  it('tabel jantung ada di tipe generated (bukan berkas kosong/terpotong)', () => {
    // Murah, tapi menutup kegagalan paling memalukan: `npm run gen:types` yang
    // putus separuh jalan lalu menimpa berkasnya dengan keluaran tak lengkap.
    // Dibaca sebagai TEKS — `Constants` yang diekspor generator hanya memuat
    // Enums, tidak ada daftar tabel yang bisa diperiksa saat runtime.
    const isi = bacaBerkas('shared/types/database.types.ts')
    for (const wajib of ['aset', 'transaksi_bmd', 'jurnal_header', 'aset_awal_2026']) {
      expect(isi).toMatch(new RegExp(`\\n\\s+${wajib}:\\s*\\{`))
    }
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 5. Reklasifikasi kode — KEMBAR TIGA (lib/reklasKode.ts).
//
// Aturan "kode pada periode" hidup di tiga tempat sekaligus, dan dua di
// antaranya tak bisa diuji dengan menjalankan kode:
//   1. `JENIS_REKLAS_KODE` (TypeScript)      — Laporan BMD & Rekonsiliasi
//   2. `v_reklas` di `fn_rekap_bmd`  (SQL)   — Saldo Awal/Akhir Laporan BMD
//   3. predikat index parsial `idx_trx_reklas_id`
//
// Kalau (1) dan (2) berbeda, TIDAK ADA yang gagal — Saldo Awal dan baris
// mutasinya cuma berhenti sepakat, dan laporannya tak foot tanpa penjelasan.
// Kalau (3) berbeda dari (1), juga tak ada yang gagal: planner diam-diam
// mengabaikan indeksnya dan kolektornya pelan lalu timeout.
// ════════════════════════════════════════════════════════════════════════════
describe('reklas kode: daftar jenis di TS, SQL, & index parsial sama persis', () => {
  const MIGRASI = 'supabase/migrations/20260811_01_fn_rekap_bmd_golongan_period_aware.sql'

  // Jenis di dalam sebuah literal array SQL, mis. ARRAY['a','b']::jenis_...[]
  function jenisDalam(sql: string, penanda: RegExp): string[] {
    const m = sql.match(penanda)
    if (!m) throw new Error(`pola ${penanda} tak ditemukan di ${MIGRASI} — PERBAIKI pengeceknya, jangan hapus`)
    return [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]).sort()
  }

  it('CTE v_reklas di fn_rekap_bmd = JENIS_REKLAS_KODE', () => {
    const sql = bacaBerkas(MIGRASI)
    expect(jenisDalam(sql, /v_reklas\s+jenis_transaksi_bmd\[\]\s*:=\s*ARRAY\[([^\]]+)\]/))
      .toEqual([...JENIS_REKLAS_KODE].sort())
  })

  it('predikat idx_trx_reklas_id = JENIS_REKLAS_KODE + batal_reklas', () => {
    // `batal_reklas` ikut di index karena kolektornya menarik baris pembatalan
    // dalam SAPUAN YANG SAMA — kalau ia tak masuk predikat, separuh query itu
    // kembali menyusuri seluruh ledger dan indexnya tak menolong apa-apa.
    const sql = bacaBerkas(MIGRASI)
    expect(jenisDalam(sql, /idx_trx_reklas_id[\s\S]*?WHERE jenis IN \(([^)]+)\)/))
      .toEqual([...JENIS_REKLAS_KODE, 'batal_reklas'].sort())
  })

  it('semua jenisnya memang ada di enum database.types.ts', () => {
    const enumJenis = new Set<string>(Constants.public.Enums.jenis_transaksi_bmd)
    for (const j of [...JENIS_REKLAS_KODE, 'batal_reklas']) expect(enumJenis).toContain(j)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 6. Setiap penulisan ledger menyebut `tanggal` SECARA EKSPLISIT.
//
// `catatTransaksi` men-default `tanggal` ke HARI INI kalau tak diisi. Itu
// default yang berbahaya: tanggal ledger menentukan PERIODE, dan periode
// menentukan di semester mana angkanya dilaporkan. Satu pemanggil yang lupa
// mengisinya akan mencatat dokumen bertanggal mundur di semester berjalan —
// tanpa error, tanpa peringatan, dan cuma ketahuan kalau ada yang kebetulan
// membandingkan kartu dengan ledgernya.
//
// Ditemukan 2026-08-11 di `koreksi_spesifikasi` (Koreksi.tsx): satu-satunya
// pemanggil yang tak menyebut `tanggal`, sementara `koreksi_nilai` &
// `pemecahan_*` di BERKAS YANG SAMA menyebutnya. Belum sempat salah karena
// keempat barisnya kebetulan diinput di hari yang sama dgn tanggal dokumennya.
//
// Aturannya: SEBUT `tanggal`, apa pun nilainya. Yang memang mau hari ini pun
// wajib menuliskannya (mis. `tanggal: today`) — supaya pilihan itu terbaca
// sebagai keputusan, bukan sebagai kelalaian.
// ════════════════════════════════════════════════════════════════════════════
describe('catatTransaksi: `tanggal` selalu disebut eksplisit', () => {
  // Ambil isi objek argumen kedua `catatTransaksi(supabase, { ... })` dengan
  // menghitung kurung kurawal — regex saja tak bisa menangani objek bersarang
  // (payload di dalamnya punya kurawal sendiri).
  function panggilanCatatTransaksi(isi: string): string[] {
    const out: string[] = []
    const penanda = /catatTransaksi\(\s*supabase\s*,\s*\{/g
    let m: RegExpExecArray | null
    while ((m = penanda.exec(isi)) !== null) {
      let dalam = 1
      let i = m.index + m[0].length
      for (; i < isi.length && dalam > 0; i++) {
        if (isi[i] === '{') dalam++
        else if (isi[i] === '}') dalam--
      }
      out.push(isi.slice(m.index + m[0].length, i - 1))
    }
    return out
  }

  it('tak ada pemanggil yang membiarkan tanggalnya jatuh ke default hari ini', () => {
    const lalai: string[] = []
    let total = 0
    for (const f of berkasSumber()) {
      // Berkas test dilewati — termasuk BERKAS INI, yang memuat pola
      // `catatTransaksi(supabase, {` di dalam regex pemindainya sendiri dan
      // karenanya menuduh dirinya lalai.
      if (/\.test\.tsx?$/.test(f.nama)) continue
      if (!f.isi.includes('catatTransaksi(')) continue
      for (const arg of panggilanCatatTransaksi(f.isi)) {
        total++
        // Kedalaman objeknya sudah dijaga penghitung kurawal; cukup pastikan
        // ada kunci `tanggal:` di level mana pun argumen itu.
        if (!/\btanggal\s*:/.test(arg)) {
          lalai.push(`${f.nama} → ${(arg.match(/jenis\s*:\s*[^,\n]+/) || ['(jenis tak terbaca)'])[0].trim()}`)
        }
      }
    }
    // Anti-hampa: kalau pemindainya rusak, jangan diam-diam lulus.
    if (total < 8) throw new Error(`hanya ${total} panggilan catatTransaksi terbaca — pemindainya rusak, PERBAIKI`)

    expect(lalai).toEqual([])
  })
})
