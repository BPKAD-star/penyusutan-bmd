// ============================================================================
// GOLDEN TEST — Rekonsiliasi BMD (TESTING.md §6).
//
// Mode kegagalan nomor satu di aplikasi ini adalah **angka salah yang terlihat
// sah**. Unit test tiap bagian bisa hijau semua sementara KOMPOSISInya salah —
// itu celah yang cuma tertutup kalau satu dataset tetap dijalankan menembus
// seluruh pipeline lalu angkanya dikunci.
//
// Dua lapis penguncian, sengaja:
//   1. ASSERTION EKSPLISIT per skenario — bisa dibaca & diperiksa manusia.
//      Ini yang sebenarnya membuktikan; snapshot saja tidak membuktikan apa-apa
//      kalau tak seorang pun tahu angkanya seharusnya berapa.
//   2. `toMatchSnapshot()` sebagai jaring regresi untuk yang tak disebut satu
//      per satu.
//
// ⚠️ ATURAN EMAS (TESTING.md §6): snapshot berubah HANYA kalau ada yang sengaja
// mengubah perhitungan, dan perubahannya WAJIB dijelaskan di pesan commit.
// `--update-snapshots` tanpa penjelasan = review ditolak.
// ============================================================================
import { describe, it, expect } from 'vitest'
import {
  fetchMutasiLines, aggregateMutasi, attribusiPenyusutan,
  fetchSnapshotPositions, aggregatePositions, prepareSnapshotCtx,
  measuresOf, mutasiCellOf, KURANG_KEYS, TAMBAH_KEYS,
  type MutasiLine, type MutasiKey,
} from '@/lib/rekon'
import { fakeSupabase } from './fakeSupabase'
import { tabelFixture, EMBED, PERIODE, PERIODE_LALU, SKPD_A, SKPD_B } from './fixture'

const SCOPE = [SKPD_A, SKPD_B]
const db = () => fakeSupabase(tabelFixture(), EMBED)

/** Total satu kategori di sel (golongan × komptabel). */
function nilai(lines: MutasiLine[], gol: string, komp: string, kategori: MutasiKey): number {
  return lines
    .filter(l => l.golongan === gol && l.komp === komp && l.kategori === kategori)
    .reduce((s, l) => s + l.nilai, 0)
}

async function muatLines() {
  return fetchMutasiLines(db(), PERIODE, SCOPE)
}

// ════════════════════════════════════════════════════════════════════════════
// 1. Kasus yang PERNAH MENGGIGIT — masing-masing dinyatakan eksplisit.
// ════════════════════════════════════════════════════════════════════════════
describe('golden — kasus yang pernah menggigit', () => {
  it('batal_pengadaan: barang yang dibatalkan TIDAK muncul sebagai perolehan sah (INS-06)', async () => {
    const lines = await muatLines()

    expect(lines.some(l => l.aset_id === 'A02')).toBe(false)
    // A01 (sah) tetap ada — kalau filternya kebablasan, ini yang menangkap.
    expect(nilai(lines, '1.3.2', 'intra', 'pengadaan')).toBe(100_000_000)
  })

  it('hapus → batal → hapus lagi di SATU periode: aksi TERAKHIR menang (jadi pengurangan)', async () => {
    const lines = await muatLines()

    const hapus = lines.filter(l => l.aset_id === 'A03')
    expect(hapus).toHaveLength(1)          // dedup per aset, bukan 2 baris penghapusan
    expect(hapus[0].kategori).toBe('hapus_sebab_lain')
    expect(hapus[0].arah).toBe('kurang')
  })

  it('hapus lalu DIBATALKAN: tidak jadi pengurangan sama sekali', async () => {
    const lines = await muatLines()

    expect(lines.some(l => l.aset_id === 'A04')).toBe(false)
  })

  it('hapus karena HIBAH: sub_jenis dibaca dari jurnal_header, bukan payload kosong (INS ditemukan 2026-09-05)', async () => {
    const lines = await muatLines()

    const hapus = lines.filter(l => l.aset_id === 'A22')
    expect(hapus).toHaveLength(1)
    // ⚠️ Sebelum ditambal, ini SELALU jatuh ke 'hapus_sebab_lain' — payload
    // baris ledgernya memang kosong, `sub_jenis` cuma ada di jurnal_header.
    expect(hapus[0].kategori).toBe('hapus_hibah')
    expect(hapus[0].arah).toBe('kurang')
    expect(hapus[0].nilai).toBe(45_000_000)
  })

  it('pengalihan SKPD: dari sisi scope yang MEMUAT keduanya, tak ada baris (mutasi internal scope)', async () => {
    const lines = await muatLines()

    // A05 pindah SKPD_A → SKPD_B, dua-duanya di dalam scope → bukan penambahan
    // maupun pengurangan bagi scope itu. Kalau muncul, angka kabupaten dobel.
    expect(lines.some(l => l.aset_id === 'A05')).toBe(false)
  })

  it('pengalihan SKPD: dari sisi SKPD ASAL saja, jadi pengurangan', async () => {
    const lines = await fetchMutasiLines(db(), PERIODE, [SKPD_A])

    const keluar = lines.filter(l => l.aset_id === 'A05')
    expect(keluar).toHaveLength(1)
    expect(keluar[0].kategori).toBe('pengalihan_keluar')
    expect(keluar[0].nilai).toBe(60_000_000)
  })

  it('pengalihan SKPD: dari sisi SKPD TUJUAN saja, jadi penambahan', async () => {
    const lines = await fetchMutasiLines(db(), PERIODE, [SKPD_B])

    const masuk = lines.filter(l => l.aset_id === 'A05')
    expect(masuk).toHaveLength(1)
    expect(masuk[0].kategori).toBe('penggunaan_masuk')
  })

  it('kapitalisasi yang DIBATALKAN tidak ikut, yang sah tetap ikut', async () => {
    const lines = await muatLines()

    // A07 (20jt) + A20 (18jt). A08 dianulir → tak boleh ikut sama sekali.
    expect(nilai(lines, '1.3.2', 'intra', 'kapitalisasi')).toBe(38_000_000)
    expect(lines.some(l => l.aset_id === 'A08')).toBe(false)
  })

  it('kapitalisasi SEIMBANG: yang diserap muncul sbg Pengurangan sebesar yang masuk ke induk', async () => {
    // ⚠️ INVARIAN, bukan sekadar angka. Kapitalisasi itu peristiwa DIAM secara
    // nilai total — nilainya berpindah dari anak ke induk, kekayaan pemda tak
    // bertambah. Sampai 2026-08-27 `kapitalisasi_serap` tak dipetakan sama
    // sekali: induk naik tanpa ada yang turun, dan selisihnya jatuh ke baris
    // "Selisih (belum terpetakan)" sebesar DUA KALI nilai rehab.
    const lines = await muatLines()

    expect(nilai(lines, '1.3.2', 'intra', 'kapitalisasi_keluar')).toBe(18_000_000)
    // Barisnya menempel pada ANAK (A21) & berarah KURANG.
    const serap = lines.filter(l => l.kategori === 'kapitalisasi_keluar')
    expect(serap.map(l => l.aset_id)).toEqual(['A21'])
    expect(serap[0].arah).toBe('kurang')
  })

  it('ekstrakomptabel mendarat di kolom EKSTRA, bukan intra', async () => {
    const lines = await muatLines()

    expect(nilai(lines, '1.3.2', 'ekstra', 'pengadaan')).toBe(1_000_000)
  })

  it('pemecahan: induk KELUAR dari kolom intra, dua pecahan MASUK ke kolom ekstra', async () => {
    const lines = await muatLines()

    expect(nilai(lines, '1.3.2', 'intra', 'pemecahan_keluar')).toBe(21_000_000)
    expect(nilai(lines, '1.3.2', 'ekstra', 'pemecahan_masuk')).toBe(21_000_000)
    // BUKAN net-nol per sel — itu sebabnya pemecahan butuh kategorinya sendiri.
    expect(nilai(lines, '1.3.2', 'intra', 'pemecahan_masuk')).toBe(0)
  })

  it('reklas kode menghasilkan DUA baris: keluar dari golongan lama, masuk ke yang baru', async () => {
    const lines = await muatLines()

    expect(nilai(lines, '1.3.2', 'intra', 'reklas_kode_keluar')).toBe(15_000_000)
    expect(nilai(lines, '1.3.5', 'intra', 'reklas_kode_masuk')).toBe(15_000_000)
  })

  it('koreksi nilai: positif jadi tambah, negatif jadi kurang (magnitudo positif)', async () => {
    const lines = await muatLines()

    expect(nilai(lines, '1.3.2', 'intra', 'koreksi_tambah')).toBe(2_000_000)
    expect(nilai(lines, '1.3.2', 'intra', 'koreksi_kurang')).toBe(1_500_000)
    expect(lines.find(l => l.aset_id === 'A17')!.arah).toBe('kurang')
  })

  it('barang DI LUAR scope tidak ikut terhitung sama sekali', async () => {
    const lines = await muatLines()

    expect(lines.some(l => l.aset_id === 'A18')).toBe(false)
  })

  it('golongan baris mutasi PERIOD-AWARE: termin KDP yang direklas SEPERIODE tetap di 1.3.6 (2026-08-27)', async () => {
    // A19: termin kontrak konstruksi (trx 200) lalu reklas KDP → Gedung (201),
    // dua-duanya di periode ini. `aset.kode` sudah 1.3.3.
    //
    // Sampai 2026-08-27 `computeMutasiLines` memakai `kodeLevel3(r.aset.kode)` —
    // kode TERKINI — untuk SEMUA kategori kecuali reklas. Akibatnya terminnya
    // dibukukan di 1.3.3, golongan yang barangnya baru sampai di sana SESUDAH
    // termin itu dibayar. Snapshot-nya sendiri sudah period-aware sejak
    // 2026-08-11, jadi yang patah cuma sisi mutasinya — dan patahnya tak
    // bersuara: Gedung seolah menerima pengadaan yang tak pernah ada, dan KDP
    // tak pernah kelihatan bertambah sama sekali.
    const lines = await muatLines()

    expect(nilai(lines, '1.3.6', 'intra', 'pengadaan')).toBe(30_000_000)
    expect(nilai(lines, '1.3.3', 'intra', 'pengadaan')).toBe(0)
    // Reklasnya sendiri tetap dibaca dari payload (kode_lama → kode_baru).
    expect(nilai(lines, '1.3.6', 'intra', 'reklas_fungsi_keluar')).toBe(30_000_000)
    expect(nilai(lines, '1.3.3', 'intra', 'reklas_fungsi_masuk')).toBe(30_000_000)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 2. Snapshot posisi (Saldo Awal & Saldo Akhir).
// ════════════════════════════════════════════════════════════════════════════
describe('golden — snapshot posisi', () => {
  it('golongan tak disusutkan (Tanah) & golongan BEKU (1.5.4) tak membawa beban', async () => {
    const ctx = await prepareSnapshotCtx(db(), SCOPE)
    const snap = aggregatePositions(await fetchSnapshotPositions(db(), PERIODE, SCOPE, ctx))

    const tanah = measuresOf(snap, '1.3.1', 'intra')
    expect(tanah.beban).toBe(0)
    expect(tanah.akumulasi).toBe(0)
    expect(tanah.nilaiBuku).toBe(tanah.perolehan)   // nilai buku = perolehan

    const lain = measuresOf(snap, '1.5.4', 'intra')
    expect(lain.beban).toBe(0)                       // beku: beban baru NOL
    expect(lain.akumulasi).toBe(5_000_000)           // akumulasi LAMA tetap
  })

  it('induk yang dipecah hilang dari Saldo AKHIR tapi masih ada di Saldo AWAL', async () => {
    const ctx = await prepareSnapshotCtx(db(), SCOPE)
    const awal = await fetchSnapshotPositions(db(), PERIODE_LALU, SCOPE, ctx)
    const akhir = await fetchSnapshotPositions(db(), PERIODE, SCOPE, ctx)

    expect(awal.has('A12')).toBe(true)
    expect(akhir.has('A12')).toBe(false)
    // Pecahannya kebalikan — belum ada di periode lalu (rules.md §1.9).
    expect(awal.has('A13')).toBe(false)
    expect(akhir.has('A13')).toBe(true)
  })

  it('barang yang net-dihapus keluar dari Saldo Akhir; yang batal-hapus tetap ada', async () => {
    const ctx = await prepareSnapshotCtx(db(), SCOPE)
    const akhir = await fetchSnapshotPositions(db(), PERIODE, SCOPE, ctx)

    expect(akhir.has('A03')).toBe(false)   // hapus → batal → hapus
    expect(akhir.has('A04')).toBe(true)    // hapus → batal
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 3. Invarian atribusi — tiap aset menyumbang PERSIS SEKALI.
// ════════════════════════════════════════════════════════════════════════════
describe('golden — invarian atribusi penyusutan', () => {
  it('tidak ada aset yang dapat atribusi beban dua kali di sel yang sama', async () => {
    const ctx = await prepareSnapshotCtx(db(), SCOPE)
    const [awal, akhir, lines] = await Promise.all([
      fetchSnapshotPositions(db(), PERIODE_LALU, SCOPE, ctx),
      fetchSnapshotPositions(db(), PERIODE, SCOPE, ctx),
      muatLines(),
    ])

    const { lines: attr } = attribusiPenyusutan(lines, awal, akhir)

    const terlihat = new Set<string>()
    for (const l of attr) {
      if (l.beban === 0 && l.akumulasi === 0) continue
      const k = `${l.golongan}|${l.komp}|${l.arah}|${l.aset_id}`
      expect(terlihat.has(k)).toBe(false)
      terlihat.add(k)
    }
  })

  it('beban & akumulasi hasil atribusi tidak pernah negatif (magnitudo, tanda dari `arah`)', async () => {
    const ctx = await prepareSnapshotCtx(db(), SCOPE)
    const [awal, akhir, lines] = await Promise.all([
      fetchSnapshotPositions(db(), PERIODE_LALU, SCOPE, ctx),
      fetchSnapshotPositions(db(), PERIODE, SCOPE, ctx),
      muatLines(),
    ])

    const { lines: attr } = attribusiPenyusutan(lines, awal, akhir)

    for (const l of attr) {
      expect(l.beban).toBeGreaterThanOrEqual(0)
      expect(l.akumulasi).toBeGreaterThanOrEqual(0)
    }
  })

  it('setiap kategori terklasifikasi tambah/kurang — tak ada yang tercecer', async () => {
    const lines = await muatLines()

    const semua = new Set<MutasiKey>([...TAMBAH_KEYS, ...KURANG_KEYS])
    for (const l of lines) {
      expect(semua.has(l.kategori)).toBe(true)
      expect(l.arah).toBe(KURANG_KEYS.includes(l.kategori) ? 'kurang' : 'tambah')
    }
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 3b. TIE-OUT — invarian yang jadi seluruh alasan laporan ini ada:
//     Saldo Awal + penambahan − pengurangan = Saldo Akhir, PER SEL.
// ════════════════════════════════════════════════════════════════════════════
async function selisihTieOut(): Promise<Record<string, number>> {
  const ctx = await prepareSnapshotCtx(db(), SCOPE)
  const awal = aggregatePositions(await fetchSnapshotPositions(db(), PERIODE_LALU, SCOPE, ctx))
  const akhir = aggregatePositions(await fetchSnapshotPositions(db(), PERIODE, SCOPE, ctx))
  const mut = aggregateMutasi(await muatLines())

  const sel = new Set([...Object.keys(awal), ...Object.keys(akhir), ...Object.keys(mut)])
  const selisih: Record<string, number> = {}
  for (const gol of sel) {
    for (const komp of ['intra', 'ekstra'] as const) {
      const cell = mutasiCellOf(mut, gol, komp)
      const tambah = TAMBAH_KEYS.reduce((s, k) => s + (cell[k]?.perolehan ?? 0), 0)
      const kurang = KURANG_KEYS.reduce((s, k) => s + (cell[k]?.perolehan ?? 0), 0)
      const d = measuresOf(awal, gol, komp).perolehan + tambah - kurang
        - measuresOf(akhir, gol, komp).perolehan
      if (d !== 0) selisih[`${gol}|${komp}`] = d
    }
  }
  return selisih
}

describe('golden — tie-out perolehan per sel', () => {
  it('SETIAP sel tie-out — tak ada satu pun yang tersisa', async () => {
    const selisih = await selisihTieOut()

    // Ini invarian yang jadi seluruh alasan laporan ini ada, dan sejak
    // 2026-08-11 ia berlaku TANPA PENGECUALIAN — membuktikan pipeline-nya benar
    // untuk pengadaan, kapitalisasi, penghapusan, pemecahan, koreksi,
    // pengalihan (termasuk pembatalannya), reklasifikasi, ekstrakomptabel,
    // golongan beku, dan golongan tak disusutkan sekaligus.
    //
    // ⚠️ JANGAN pernah melonggarkan tes ini jadi "kecuali sel X" lagi. Daftar
    // pengecualian itu dulu berisi dua sel reklas selama berbulan-bulan, dan
    // selama ia ada, tak ada yang bisa membedakan gap yang sudah diketahui dari
    // gap BARU yang menyelinap masuk. Kalau ada sel yang tak tie-out, itu bug —
    // perbaiki sebabnya, bukan tesnya.
    expect(selisih).toEqual({})
  })

  it('regresi 2026-08-06: pengalihan yang DIBATALKAN tidak lagi dihitung sebagai pengurangan', async () => {
    // Ditemukan invarian tie-out golden test. `computeMutasiLines` dulu
    // menyaring pembatalan untuk kapitalisasi, koreksi_nilai, dan reklas —
    // TAPI TIDAK untuk `pengalihan_status`, padahal rules.md §1.7 titik 2
    // mewajibkannya dan BATAL_TARGET_JENIS.pengalihan sudah lama ada.
    //
    // Di produksi: KEEMPAT baris pengalihan_status sudah dianulir 2 baris
    // batal_pengalihan (Rp215.155.360 & Rp3.794.734.725, 2026-S2), dan
    // semuanya tetap tampil sebagai pengurangan di tampilan per-SKPD.
    const lines = await muatLines()

    expect(lines.some(l => l.aset_id === 'A06')).toBe(false)
    // A05 (pengalihan SAH) harus TETAP ada — kalau filternya kebablasan
    // membuang yang sah juga, ini yang menangkap.
    const a05 = await fetchMutasiLines(db(), PERIODE, [SKPD_A])
    expect(a05.filter(l => l.aset_id === 'A05')).toHaveLength(1)
  })

  // ── Dulu "DUGAAN BUG", DITUTUP 2026-08-11 ────────────────────────────────
  it('regresi: golongan pada snapshot PERIOD-AWARE — aset yang direklas tetap di golongan lamanya', async () => {
    // Dulu `fetchSnapshotPositions` memakai `aset.kode` TERKINI, sementara
    // baris mutasi membukukan keluar-dari-kode-lama + masuk-ke-kode-baru. Jadi
    // untuk aset yang direklas di periode ini, Saldo AWAL sudah duduk di
    // golongan BARU — lalu masih ditambah lagi oleh baris "reklas masuk":
    // dobel di golongan tujuan (+15jt), kurang di golongan asal (−15jt).
    //
    // Yang membuatnya terasa "perlu keputusan desain" adalah anggapan bahwa
    // golongan tak punya riwayat seperti `aset_kode_register`. Itu keliru:
    // riwayatnya memang ada, tersimpan sebagai `payload.kode_lama`/`kode_baru`
    // di ledger reklas — tinggal direplay, persis cara `ownersAt` membaca
    // riwayat pindah unit. Sumbernya sekarang lib/reklasKode.ts.
    //
    // Di produksi ini menutup selisih Rp5.846.579.000 di Laporan BMD Model 3
    // (SIRKUIT DRAG RACE DI KAWASAN G. KELUD, 1.3.3 → 1.3.4 pada 2026-S2).
    const ctx = await prepareSnapshotCtx(db(), SCOPE)
    const awal = await fetchSnapshotPositions(db(), PERIODE_LALU, SCOPE, ctx)
    const akhir = await fetchSnapshotPositions(db(), PERIODE, SCOPE, ctx)

    // A15 direklas 1.3.2 (Peralatan & Mesin) → 1.3.5 (ATL) DI PERIODE INI.
    // Diperiksa per-aset, bukan lewat agregat golongan: 1.3.2 juga kena
    // pengadaan/kapitalisasi/pemecahan di periode yang sama, jadi selisih
    // agregatnya tak membuktikan apa pun tentang A15.
    expect(awal.get('A15')?.gol).toBe('1.3.2')   // golongan SAAT ITU
    expect(akhir.get('A15')?.gol).toBe('1.3.5')  // sesudah reklas
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 4. Snapshot agregat — jaring regresi untuk yang tak disebut satu per satu.
// ════════════════════════════════════════════════════════════════════════════
describe('golden — snapshot agregat', () => {
  it('tabel mutasi Rekonsiliasi 2026-S1 (scope Dinas A+B)', async () => {
    const mut = aggregateMutasi(await muatLines())

    expect(mut).toMatchSnapshot()
  })

  it('sel 1.3.2 intra — dirinci supaya perubahan angkanya terbaca di diff', async () => {
    const mut = aggregateMutasi(await muatLines())

    expect(mutasiCellOf(mut, '1.3.2', 'intra')).toMatchSnapshot()
  })

  it('posisi Saldo Awal & Saldo Akhir per golongan', async () => {
    const ctx = await prepareSnapshotCtx(db(), SCOPE)
    const awal = aggregatePositions(await fetchSnapshotPositions(db(), PERIODE_LALU, SCOPE, ctx))
    const akhir = aggregatePositions(await fetchSnapshotPositions(db(), PERIODE, SCOPE, ctx))

    expect({ awal, akhir }).toMatchSnapshot()
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 5. Fail-closed — modul pelaporan MENOLAK menghasilkan angka saat query gagal.
// ════════════════════════════════════════════════════════════════════════════
describe('golden — fail-closed (rules.md §2)', () => {
  it('query ledger gagal → MELEMPAR, bukan mengembalikan angka kurang-sebagian', async () => {
    const rusak = fakeSupabase(tabelFixture(), EMBED,
      (tabel) => (tabel === 'transaksi_bmd' ? 'canceling statement due to statement timeout' : null))

    await expect(fetchMutasiLines(rusak, PERIODE, SCOPE)).rejects.toThrow(/statement timeout/)
  })

  it('query aset gagal → MELEMPAR juga', async () => {
    const rusak = fakeSupabase(tabelFixture(), EMBED,
      (tabel) => (tabel === 'aset' ? 'statement timeout' : null))

    await expect(prepareSnapshotCtx(rusak, SCOPE)).rejects.toThrow(/gagal membaca daftar aset/)
  })
})
