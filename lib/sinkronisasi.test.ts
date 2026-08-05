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
    // (a) `ALTER TYPE … ADD VALUE 'x'` — cara enum bertambah sesudah awal.
    for (const [, v] of m.isi.matchAll(/ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'([a-z0-9_]+)'/gi)) out.add(v)
    // (b) `CREATE TYPE … jenis_transaksi_bmd … AS ENUM ( … )` — deklarasi awal.
    for (const blok of m.isi.matchAll(/CREATE\s+TYPE\s+[^;]*?jenis_transaksi_bmd[\s\S]*?AS\s+ENUM\s*\(([\s\S]*?)\)/gi))
      for (const [, v] of blok[1].matchAll(/'([a-z0-9_]+)'/g)) out.add(v)
  }
  if (out.size < 30) throw new Error(`hanya ${out.size} nilai enum terdeteksi — regex pemindainya usang, PERBAIKI`)
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
