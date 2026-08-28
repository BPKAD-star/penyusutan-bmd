// ============================================================================
// Engine Penyusutan — event-driven dari ledger transaksi (PLAN §1.2, §6, §7)
//
// Prinsip yang WAJIB (dikonfirmasi user, PLAN §6.3):
//   - sisa_semester = counter INTEGER, dikurangi 1 tiap periode.
//     TIDAK dihitung dari nilai_buku / beban (rawan desimal — sumber kekacauan e-bmd).
//   - Beban dibulatkan ke rupiah penuh; selisih pembulatan diserap di semester
//     terakhir (nilai buku dipaksa 0 saat umur habis).
//   - Masa manfaat di DB = TAHUN (canonical Perbup). Konversi ×2 hanya di sini.
//   - EKSTRAKOMPTABEL IKUT DISUSUTKAN (keputusan user 2026-07-13; dulu engine
//     skip total). Aturan hitungnya SAMA persis dgn intra — pemisahan "yang
//     masuk neraca cuma intra" terjadi di LAPORAN (filter Komptabel, default
//     'intra'), bukan di engine.
//   - Golongan 1.5.4 Aset Lain-Lain TIDAK akrual (beku sejak baseline 2025;
//     keputusan user 2026-07-13) — baik yg dari sononya 1.5.4 maupun yg
//     direklas masuk. Akumulasi lama tetap tampil, beban baru = 0.
// ============================================================================
import { perlakuanKode, periodeRange, comparePeriode, kodeLevel3 } from '@/lib/bmd'

export type TrxLedger = {
  id?: number
  jenis: string
  periode: string
  tanggal: string
  nilai: number
  payload: Record<string, unknown>
  created_at: string
}

export type AsetEngine = {
  id: string
  kode: string
  nilai_perolehan: number
  intra_ekstra: string | null
  tgl_perolehan: string | null
}

export type BandOverhaul = {
  kode_prefix: string
  band_no: number
  pct_min: number
  pct_max: number | null
  tambahan_tahun: number
}

export type HasilSemester = {
  aset_id: string
  periode: string
  metode: 'penyusutan' | 'amortisasi' | 'tidak'
  nilai_perolehan: number
  nilai_buku_awal: number
  beban: number
  akumulasi: number
  nilai_buku_akhir: number
  sisa_semester: number
  masa_manfaat_tahun: number | null
}

const PERIODE_BASELINE = '2025-S2' // cutoff saldo awal e-bmd

/** Lookup band: prefix terpanjang yang match kode aset. */
export function cariBand(bands: BandOverhaul[], kode: string, persenRehab: number): BandOverhaul | null {
  const prefixes = new Map<string, BandOverhaul[]>()
  for (const b of bands) {
    if (!kode.startsWith(b.kode_prefix)) continue
    const arr = prefixes.get(b.kode_prefix) || []
    arr.push(b)
    prefixes.set(b.kode_prefix, arr)
  }
  if (prefixes.size === 0) return null
  const bestPrefix = [...prefixes.keys()].sort((a, b) => b.length - a.length)[0]
  const kandidat = prefixes.get(bestPrefix)!.sort((a, b) => a.band_no - b.band_no)
  // Match by batas atas: band pertama yang pct_max >= persen; kalau lewat semua → band terakhir (open-ended).
  for (const b of kandidat) {
    if (persenRehab <= (b.pct_max ?? Infinity)) return b
  }
  return kandidat[kandidat.length - 1]
}

/**
 * Replay ledger satu aset → jadwal penyusutan per semester sampai targetPeriode.
 * Return [] kalau aset tidak disusutkan (tanah, ATL, KDP, ekstrakomptabel, dst).
 */
export function hitungJadwalAset(
  aset: AsetEngine,
  trxs: TrxLedger[],
  masaManfaatKode: Map<string, number>, // kode lengkap → masa manfaat TAHUN (dari kodefikasi_bmd)
  bands: BandOverhaul[],
  targetPeriode: string,
): HasilSemester[] {
  // Urutkan ledger: periode → tanggal → created_at (append order)
  const ledger = [...trxs].sort((a, b) =>
    comparePeriode(a.periode, b.periode) || a.tanggal.localeCompare(b.tanggal) || a.created_at.localeCompare(b.created_at))

  // Kapitalisasi yang dibatalkan (batal_kapitalisasi.payload.target_trx_id) diabaikan
  // saat replay → nilai & masa manfaat induk kembali seperti sebelum kapitalisasi.
  const kapDibatalkan = new Set<number>()
  for (const t of ledger) {
    if (t.jenis !== 'batal_kapitalisasi') continue
    const tid = Number((t.payload as Record<string, unknown>)?.target_trx_id)
    if (Number.isFinite(tid)) kapDibatalkan.add(tid)
  }

  // Reklas (kode/golongan) yang dibatalkan (batal_reklas.payload.target_trx_id).
  // Pola SAMA dgn kapDibatalkan: event reklas yg id-nya di sini DIABAIKAN saat
  // replay → aset kembali ke posisi SEBELUM reklas itu (jadwal penyusutan asli
  // pulih utuh). Ini yg bikin batal LINTAS-golongan benar: fresh-start di-skip,
  // BUKAN fresh-start dobel spt kalau "reklas balik". batal_reklas dicatat
  // tanggal HARI INI tapi efeknya retroaktif (event asli diabaikan di SEMUA
  // periode). Reklas_komptabel tak butuh skip di sini (nol efek perhitungan) —
  // pemulihan intra_ekstra terjadi di aset (bukan engine).
  const reklasDibatalkan = new Set<number>()
  for (const t of ledger) {
    if (t.jenis !== 'batal_reklas') continue
    const tid = Number((t.payload as Record<string, unknown>)?.target_trx_id)
    if (Number.isFinite(tid)) reklasDibatalkan.add(tid)
  }

  // Koreksi nilai yang dibatalkan (batal_koreksi_nilai.payload.target_trx_id).
  // Pola SAMA dgn reklasDibatalkan: event koreksi_nilai yg id-nya di sini
  // DIABAIKAN saat replay → nilai perolehan (dan beban) kembali ke sebelum
  // koreksi. UI hanya mengizinkan batal koreksi TERAKHIR per aset (delta
  // berantai), jadi skip ini selalu period-correct.
  const koreksiNilaiDibatalkan = new Set<number>()
  for (const t of ledger) {
    if (t.jenis !== 'batal_koreksi_nilai') continue
    const tid = Number((t.payload as Record<string, unknown>)?.target_trx_id)
    if (Number.isFinite(tid)) koreksiNilaiDibatalkan.add(tid)
  }

  // Penggabungan yang dibatalkan (batal_penggabungan_masuk.payload.target_trx_id).
  // Pola SAMA dgn kapDibatalkan: baris `penggabungan_masuk` yang id-nya di sini
  // DIABAIKAN saat replay → basis induk kembali ke sebelum penggabungan (nilai
  // & akumulasi lamanya). Ini yang bikin batal benar SECARA RETROAKTIF tanpa
  // menyentuh baris lama: `aset.nilai_perolehan` dipulihkan lewat payload
  // (lib/transaksi.ts), jadwalnya lewat skip ini.
  const penggabunganDibatalkan = new Set<number>()
  for (const t of ledger) {
    if (t.jenis !== 'batal_penggabungan_masuk') continue
    const tid = Number((t.payload as Record<string, unknown>)?.target_trx_id)
    if (Number.isFinite(tid)) penggabunganDibatalkan.add(tid)
  }

  // CATATAN (2026-07-13): dulu ada bail-out `if (ekstra) return []` di sini —
  // DIHAPUS. Ekstrakomptabel ikut disusutkan dgn aturan sama; neraca disaring
  // intra di laporan. Konsekuensi: reklas_komptabel (flip intra↔ekstra) kini
  // TANPA efek perhitungan sama sekali — murni pindah keranjang laporan.

  // ── State awal dari transaksi baseline/perolehan ──────────────────────────
  // Default: kode TERKINI aset (retroaktif — cocok utk reklas_kode/Kesalahan
  // Kodefikasi, lihat case 'reklas_kode' di bawah). TAPI kalau ada riwayat
  // 'reklas_golongan' (Perubahan Fungsi BMD, mis. KDP→Gedung), seed pakai
  // kode_lama dari event PALING AWAL — supaya masa_manfaat/perlakuan baseline
  // reflect kondisi ASLI (mis. KDP = tidak disusutkan) sebelum reklas terjadi,
  // bukan retroaktif ikut kode akhir. reklas_golongan = fresh-start dari
  // tanggal reklas, BUKAN recompute dari tanggal perolehan (beda sengaja dari
  // reklas_kode).
  let kode = aset.kode
  // Exclude reklas_golongan yg DIBATALKAN dari seeding — supaya kode awal balik
  // ke aset.kode (yg sudah dikembalikan ke kode lama saat batal), bukan seed
  // dari kode_lama event yg sudah tak berlaku.
  const reklasGolonganEvents = ledger.filter(t =>
    t.jenis === 'reklas_golongan' && !(t.id != null && reklasDibatalkan.has(t.id)))
  if (reklasGolonganEvents.length > 0) {
    kode = String((reklasGolonganEvents[0].payload as Record<string, unknown>)?.kode_lama || aset.kode)
  }
  let perlakuan = perlakuanKode(kode)
  let nilaiPerolehan = 0
  let nilaiBuku = 0
  let akumulasi = 0
  let sisaSmt = 0
  let beban = 0            // beban per semester berjalan (rupiah penuh)
  let masaTahun: number | null = null
  let mulaiSetelah: string | null = null // periode baseline; iterasi mulai periode berikutnya
  let berhenti = false     // penghapusan / reklas ke aset lain-lain

  // Titik mulai replay = checkpoint TERBARU (baseline asli 'saldo_awal' ATAU
  // hasil 'saldo_awal_checkpoint' dari aksi Tutup Tahun — migrasi 25, Opsi B).
  // Payload dua-duanya struktur SAMA, jadi cara baca di bawah tak berubah;
  // yang berubah cuma cara MEMILIH baris mana + mulaiSetelah dari periode
  // baris itu sendiri (bukan konstanta PERIODE_BASELINE lagi), supaya replay
  // tahun yang sudah dikunci tidak diulang dari 2025 tiap kali.
  const saldoAwalKandidat = ledger.filter(t => t.jenis === 'saldo_awal' || t.jenis === 'saldo_awal_checkpoint')
  const saldoAwal = saldoAwalKandidat.length > 0
    ? saldoAwalKandidat.reduce((terbaru, t) => (comparePeriode(t.periode, terbaru.periode) > 0 ? t : terbaru))
    : undefined
  // ⚠️ SATU-SATUNYA daftar jenis yang bisa jadi TITIK MULAI penyusutan. Jenis
  // perolehan yang tidak terdaftar di sini → `hitungJadwalAset` tak menemukan
  // baseline → `return []` → barangnya TIDAK PERNAH DISUSUTKAN, tanpa satu pun
  // error. Menambah cara perolehan baru = tambahkan di sini JUGA, bukan cuma di
  // enum + menunya. Dikunci `penyusutan.test.ts` (`it.each` daftar perolehan).
  //
  // 'tukar_menukar' sempat KELEWAT (ditemukan Fase 0.3, ditambal 2026-08-05):
  // jenisnya sah sejak migrasi 20260707_02 & benar-benar ditulis saat approve,
  // tapi absen di sini. Yang membuktikan itu kelalaian bukan kesengajaan: engine
  // justru menangani 'batal_tukar_menukar' sbg event penghenti (lihat case di
  // bawah) — event itu cuma masuk akal kalau barangnya memang mestinya
  // disusutkan lebih dulu. Ditambal saat produksi masih 0 baris tukar menukar,
  // jadi nol angka yang sudah dilaporkan berubah.
  //
  // 'kdp_selesai_masuk' = aset tetap hasil carve-out KDP saat BAPP → jadi baseline
  // perolehan aset BARU ini, penyusutan mulai dari periode BAPP (fresh, seperti
  // perolehan biasa). KDP-nya sendiri (1.3.6) tetap perlakuan 'tidak' → bail-out.
  const perolehan = ledger.find(t =>
    ['pengadaan', 'hibah_masuk', 'tukar_menukar', 'hasil_inventarisasi',
     'perolehan_lainnya', 'kdp_selesai_masuk'].includes(t.jenis))

  // Pecahan hasil Pemecahan Barang: baseline MID-LIFE. Payload bentuk checkpoint
  // (nilai buku/akumulasi/sisa masa manfaat/beban) hasil alokasi proporsional dari
  // induk. Beda dari saldo_awal_checkpoint: mulaiSetelah = periode SEBELUM event,
  // supaya pecahan mulai akrual TEPAT di periode pemecahan (nyambung dgn induk yg
  // berhenti di periode itu — tanpa gap/overlap). Kalah prioritas dari saldoAwal
  // (kalau pecahan sudah pernah lewat Tutup Tahun, checkpoint yg lebih baru menang).
  const pemecahanMasuk = ledger.find(t => t.jenis === 'pemecahan_masuk')

  if (saldoAwal) {
    const p = saldoAwal.payload as Record<string, number | null>
    nilaiPerolehan = Number(saldoAwal.nilai || 0)
    nilaiBuku = Number(p.nilai_buku_awal ?? 0)
    akumulasi = Number(p.akumulasi_2025 ?? 0)
    sisaSmt = Math.max(0, Math.trunc(Number(p.sisa_masa_manfaat_smt ?? 0)))
    beban = Math.round(Number(p.beban_per_smt ?? 0))
    masaTahun = p.masa_manfaat_smt ? Number(p.masa_manfaat_smt) / 2 : (masaManfaatKode.get(kode) ?? null)
    mulaiSetelah = saldoAwal.periode
  } else if (pemecahanMasuk) {
    const p = pemecahanMasuk.payload as Record<string, number | null>
    nilaiPerolehan = Number(pemecahanMasuk.nilai || 0)
    nilaiBuku = Number(p.nilai_buku_awal ?? 0)
    akumulasi = Number(p.akumulasi ?? 0)
    sisaSmt = Math.max(0, Math.trunc(Number(p.sisa_masa_manfaat_smt ?? 0)))
    beban = Math.round(Number(p.beban_per_smt ?? 0))
    masaTahun = p.masa_manfaat_smt ? Number(p.masa_manfaat_smt) / 2 : (masaManfaatKode.get(kode) ?? null)
    // Akrual mulai TEPAT di periode pemecahan → baseline = periode sebelumnya.
    mulaiSetelah = prevPeriodeOf(pemecahanMasuk.periode)
  } else if (perolehan) {
    // ── Barang BEKAS yang diterima pertengahan umur (2026-08-20) ────────────
    // Hibah/Tukar Menukar/Hasil Inventarisasi/Perolehan Lainnya bisa berupa
    // barang yang DIBANGUN pihak pemberi jauh sebelum BAST-nya. Keputusan user
    // 2026-08-20: pemkab mengakui tahun pembuatannya, jadi barang itu masuk
    // SUDAH membawa akumulasi penyusutan — bukan mulai umur baru dari BAST.
    //
    // Posisi umurnya dihitung SAAT APPROVE lalu dititipkan di payload baris
    // ledger, bentuknya sama persis dgn `pemecahan_masuk` — bukan diturunkan
    // di sini dari `aset.tgl_perolehan`. Alasannya sama dgn kenapa checkpoint
    // Tutup Tahun disimpan, bukan dihitung ulang: `tgl_perolehan` & masa manfaat
    // kodefikasi bisa berubah kemudian (koreksi spesifikasi, kodefikasi
    // diperbarui), dan angka yang sudah masuk neraca tak boleh ikut bergerak.
    //
    // Tanpa payload ini → perilaku LAMA persis, jadi seluruh baris perolehan
    // yang sudah ada tak tersentuh.
    const cp = (perolehan.payload || {}) as Record<string, unknown>
    const bekas = cp.sisa_masa_manfaat_smt != null && cp.akumulasi != null

    nilaiPerolehan = Number(perolehan.nilai || 0)
    if (bekas) {
      nilaiBuku = Number(cp.nilai_buku_awal ?? nilaiPerolehan)
      akumulasi = Number(cp.akumulasi ?? 0)
      sisaSmt = Math.max(0, Math.trunc(Number(cp.sisa_masa_manfaat_smt ?? 0)))
      beban = Math.round(Number(cp.beban_per_smt ?? 0))
      masaTahun = cp.masa_manfaat_smt ? Number(cp.masa_manfaat_smt) / 2 : (masaManfaatKode.get(kode) ?? null)
      // Akrual mulai TEPAT di periode BAST → baseline = periode sebelumnya.
      // ⚠️ SENGAJA tanpa pintasan PERIODE_BASELINE di bawah: checkpoint-nya
      // sudah memuat seluruh riwayat sampai semester sebelum BAST, jadi
      // memundurkan titik mulainya justru akan menghitung ulang periode yang
      // sudah terwakili di dalamnya.
      mulaiSetelah = prevPeriodeOf(perolehan.periode)
    } else {
      nilaiBuku = nilaiPerolehan
      akumulasi = 0
      masaTahun = masaManfaatKode.get(kode) ?? 0
      sisaSmt = Math.max(0, Math.round((masaTahun || 0) * 2)) // ×2 hanya di engine (§6 step 3)
      beban = sisaSmt > 0 ? Math.round(nilaiPerolehan / sisaSmt) : 0
      // Penyusutan mulai semester perolehan itu sendiri → baseline = periode sebelumnya
      const prev = comparePeriode(perolehan.periode, '2026-S1') <= 0 ? PERIODE_BASELINE : null
      mulaiSetelah = prev ?? prevPeriodeOf(perolehan.periode)
    }
  } else {
    return [] // tidak ada baseline — belum masuk ledger
  }

  // Bail-out pakai kode FINAL (aset.kode) — BUKAN `perlakuan` di atas, yang
  // sengaja bisa 'tidak' sementara (mis. KDP) kalau ada reklas_golongan
  // pending yang nanti mengubahnya jadi disusutkan. Aset yang kode TERKINI-nya
  // masih golongan tak-disusutkan (Tanah/ATL/KDP tanpa reklas/dst) tetap benar
  // bail-out di sini seperti sebelumnya.
  if (perlakuanKode(aset.kode) === 'tidak') return []

  // ── Replay maju per semester ──────────────────────────────────────────────
  const hasil: HasilSemester[] = []
  const semesters = periodeRange(mulaiSetelah, targetPeriode)

  for (const periode of semesters) {
    const nbAwal = nilaiBuku
    const events = ledger.filter(t => t.periode === periode && t.jenis !== 'saldo_awal')

    for (const ev of events) {
      switch (ev.jenis) {
        case 'kapitalisasi': {
          if (ev.id != null && kapDibatalkan.has(ev.id)) break // dibatalkan → abaikan
          // §6.2 — CONFIRMED rules, ikuti persis.
          const rehab = Number(ev.nilai || 0)
          if (rehab <= 0 || nilaiPerolehan <= 0) break
          // Step 1: penyebut = NILAI PEROLEHAN (bukan nilai buku)
          const persen = (rehab / nilaiPerolehan) * 100
          const band = cariBand(bands, kode, persen)
          const tambahan = band ? band.tambahan_tahun : 0
          // Step 2: cap ke masa manfaat max (TAHUN)
          const maxTahun = masaManfaatKode.get(kode) ?? masaTahun ?? 0
          const sisaTahun = sisaSmt / 2
          const masaBaruTahun = Math.min(sisaTahun + tambahan, maxTahun)
          // Step 3: ×2 di engine, counter integer
          sisaSmt = Math.max(1, Math.round(masaBaruTahun * 2))
          // Step 4-6
          nilaiPerolehan += rehab
          nilaiBuku += rehab
          // ⚠️ AKUMULASI ANAK IKUT PINDAH KE INDUK (keputusan user 2026-08-27).
          //
          // `rehab` = Σ nilai perolehan BRUTO anak, dan sampai hari ini akumulasi
          // induk tak disentuh sama sekali. Untuk anak yang belum pernah
          // disusutkan (KDP hasil reklas — akumulasinya memang 0) itu benar. Tapi
          // begitu anaknya aset yang SUDAH berdiri sendiri & sudah tersusut (mis.
          // Gedung 2023 digabung ke Gedung 2015), akumulasi anak LENYAP bersama
          // dia lewat `kapitalisasi_serap` di bawah — akumulasi kelompok turun &
          // nilai buku melonjak persis sebesar akumulasi anak.
          //
          // Kesalahan itu SENYAP: `NP − akum = NB` tetap konsisten secara
          // aritmetika, dan Rekonsiliasi pun tetap tie-out (baris "Kapitalisasi
          // (barang diserap induk)" membawa keluar akumulasi anak, jadi rantainya
          // menutup ke angka yang sudah salah). Yang keliru neracanya, bukan
          // rekonsiliasinya. Pola & peringatan yang sama sudah lama tertulis di
          // `penggabungan_masuk` di bawah.
          //
          // ⚠️ Sengaja DELTA (`akumulasi_diserap`), bukan absolut `akumulasi_baru`
          // seperti penggabungan. Alasannya `rehab` juga delta, dan snapshot di
          // payload dihitung UI pada posisi AKHIR periode sementara engine berada
          // di posisi AWAL periode saat event ini diproses — angka absolut dari
          // payload akan bertabrakan dengan state replay. Delta selalu benar.
          //
          // Baris LAMA tanpa kunci ini → perilaku persis seperti sebelumnya, jadi
          // seluruh kapitalisasi yang sudah tercatat tidak bergeser sepeser pun.
          const akumSerap = Number((ev.payload as Record<string, unknown>)?.akumulasi_diserap)
          if (Number.isFinite(akumSerap) && akumSerap > 0) {
            akumulasi += akumSerap
            nilaiBuku = Math.max(0, nilaiBuku - akumSerap)
          }
          beban = Math.round(nilaiBuku / sisaSmt)
          masaTahun = maxTahun
          break
        }
        case 'koreksi_nilai': {
          if (ev.id != null && koreksiNilaiDibatalkan.has(ev.id)) break // dibatalkan → abaikan
          // Delta ± pada nilai perolehan; beban disebar ulang ke sisa umur.
          const delta = Number(ev.nilai || 0)
          nilaiPerolehan += delta
          nilaiBuku += delta
          if (nilaiBuku < 0) nilaiBuku = 0
          if (sisaSmt > 0) beban = Math.round(nilaiBuku / sisaSmt)
          break
        }
        case 'reklas_kode': {
          if (ev.id != null && reklasDibatalkan.has(ev.id)) break // dibatalkan → abaikan
          const kodeBaru = String((ev.payload as Record<string, unknown>).kode_baru || '')
          if (!kodeBaru) break
          const perlakuanLama = perlakuan
          kode = kodeBaru
          perlakuan = perlakuanKode(kode)
          // §7: reklas aset tetap → aset lain-lain = penyusutan BERHENTI sejak periode ini
          if (perlakuan === 'lain_lain' && perlakuanLama !== 'lain_lain') berhenti = true
          if (perlakuan === 'tidak') berhenti = true
          break
        }
        case 'reklas_golongan': {
          // Perubahan Fungsi BMD (lintas golongan/rumpun) — FRESH START, beda
          // dari reklas_kode di atas (yang retroaktif). masa manfaat direset
          // penuh dari kodefikasi tujuan; nilaiBuku/akumulasi TIDAK direset
          // (utk KDP tetap = nilaiPerolehan krn memang belum pernah
          // disusutkan; utk golongan lain, nilai buku yg sudah terakru tetap
          // jadi basis — cuma jam masa manfaatnya yang di-restart).
          if (ev.id != null && reklasDibatalkan.has(ev.id)) break // dibatalkan → abaikan (fresh-start dibatalkan)
          const kodeBaru = String((ev.payload as Record<string, unknown>).kode_baru || '')
          if (!kodeBaru) break
          kode = kodeBaru
          perlakuan = perlakuanKode(kode)
          const masaBaru = masaManfaatKode.get(kode) ?? 0
          sisaSmt = Math.max(0, Math.round(masaBaru * 2))
          beban = sisaSmt > 0 ? Math.round(nilaiBuku / sisaSmt) : 0
          masaTahun = masaBaru
          if (perlakuan === 'lain_lain' || perlakuan === 'tidak') berhenti = true
          else berhenti = false
          break
        }
        case 'penghapusan_pemindahtanganan':
        case 'penghapusan_sebab_lain':
          berhenti = true // §5 no.11: penyusutan berhenti; barang hilang dari laporan, tetap di DB
          break
        case 'batal_pengadaan':
          berhenti = true // koreksi input pasca-approve: dianggap tidak pernah ada, hilang dari laporan
          break
        case 'batal_hibah_masuk':
        case 'batal_tukar_menukar':
        case 'batal_hasil_inventarisasi':
        case 'batal_perolehan_lainnya':
          berhenti = true // unapprove (Buka Kunci) — sama pola dgn batal_pengadaan
          break
        case 'koreksi_pencatatan_ganda':
          berhenti = true // gabung duplikat: barang ini digabung ke survivor, sendiri hilang dari laporan
          break
        case 'batal_koreksi_pencatatan_ganda':
          berhenti = false // batal gabung: barang duplikat muncul & disusutkan lagi (pola batal_penghapusan)
          break
        case 'pemecahan_keluar':
          berhenti = true // induk dipecah jadi N pecahan: penyusutan berhenti, induk hilang dari laporan
          break
        case 'batal_pemecahan_masuk':
          berhenti = true // pecahan dibatalkan: hilang dari laporan (ledger pemecahan_masuk tetap tersimpan)
          break
        case 'batal_pemecahan':
          berhenti = false // batal pemecahan: induk aktif lagi, penyusutan lanjut sejak periode ini
          break
        // pemecahan_masuk: BUKAN event di sini — dibaca sbg seed baseline di atas.
        case 'penggabungan_masuk': {
          // Penggabungan Barang (kebalikan pemecahan): N baris register yang
          // sebetulnya SATU barang dilebur ke salah satunya. Yang dipertahankan
          // (induk) BUKAN aset baru — makanya ini event RE-BASIS, bukan seed
          // baseline seperti `pemecahan_masuk` di atas.
          //
          // Yang berubah cuma nilai perolehan & akumulasi; **sisa masa manfaat
          // dan tanggal perolehan tetap milik induk** (keputusan user
          // 2026-08-11: "ikut barang yang dipilih sebagai induk"). Beban
          // disebar ulang ke sisa umur itu — persis pola `koreksi_nilai`.
          //
          // ⚠️ `akumulasi_baru` WAJIB dipakai. Kalau cuma nilai perolehannya
          // yang naik, akumulasi 34 baris pagar lenyap dan nilai bukunya
          // melonjak Rp24,5 juta tanpa satu pun pesan error.
          if (ev.id != null && penggabunganDibatalkan.has(ev.id)) break // dibatalkan → abaikan
          const p = ev.payload as Record<string, unknown>
          const npBaru = Number(p.nilai_perolehan_baru)
          if (!Number.isFinite(npBaru) || npBaru <= 0) break
          const akBaru = Number(p.akumulasi_baru)
          nilaiPerolehan = npBaru
          if (Number.isFinite(akBaru)) akumulasi = Math.max(0, akBaru)
          nilaiBuku = Math.max(0, npBaru - akumulasi)
          if (sisaSmt > 0) beban = Math.round(nilaiBuku / sisaSmt)
          break
        }
        case 'penggabungan_keluar':
          berhenti = true // barang sumber dilebur ke induk: penyusutannya berhenti & hilang dari laporan
          break
        case 'batal_penggabungan':
          berhenti = false // batal penggabungan: barang sumber aktif & disusutkan lagi
          break
        // batal_penggabungan_masuk: TANPA case — sengaja. Ia tidak menghentikan
        // apa pun (induk harus tetap hidup); efeknya cuma membuat re-basis di
        // atas diabaikan, lewat `penggabunganDibatalkan`.
        case 'batal_penghapusan':
          berhenti = false // kebalikan penghapusan: penyusutan lanjut sejak periode ini
          break
        case 'kapitalisasi_serap':
          berhenti = true // barang anak diserap ke induk: penyusutannya sendiri berhenti
          break
        case 'batal_kapitalisasi':
          berhenti = false // batal serap: barang anak disusutkan lagi (di induk = tanpa efek)
          break
        // mutasi_internal / pengalihan_status / koreksi_spesifikasi: tanpa efek finansial
        // pemanfaatan / pemanfaatan_selesai / batal_pemanfaatan: overlay atribut
        // (sewa/pinjam pakai/KSP/BGS-BSG/KSPI) — barang tetap disusutkan normal,
        // TIDAK menghentikan.
        // pengamanan / pengembalian_pengamanan / batal_pengamanan: overlay
        // kustodi fisik (penanggung jawab pegawai) — juga netral, tetap disusutkan.
        // reklas_komptabel: TIDAK butuh case di sini — sejak ekstra ikut
        // disusutkan (2026-07-13), flip intra↔ekstra murni pindah keranjang
        // laporan (filter Komptabel), nol efek ke perhitungan.
        // koreksi_kuantitas: masih DEFERRED (PLAN §12) — jangan implementasi
        default:
          break
      }
    }

    // ── Akrual semester ini ─────────────────────────────────────────────────
    // Guard `perlakuan !== 'tidak'` no-op utk semua alur lama (kalau perlakuan
    // awal 'tidak', function SUDAH bail-out duluan di atas) — cuma relevan
    // sekarang utk periode KDP SEBELUM reklas_golongan terjadi (lihat state
    // awal di atas), yang secara alami sudah sisaSmt=0/beban=0 (KDP nggak
    // punya masa_manfaat di kodefikasi) tapi ini jaga-jaga eksplisit.
    // Guard `perlakuan !== 'lain_lain'` (2026-07-13): 1.5.4 Aset Lain-Lain
    // BEKU — tidak pernah akrual, dari mana pun asalnya (bawaan baseline
    // maupun reklas masuk; termasuk kalau berhenti=false lagi gara-gara
    // batal_penghapusan/batal_kapitalisasi). Reklas KELUAR dari 1.5.4
    // (reklas_golongan) mengganti `perlakuan` → akrual hidup lagi normal.
    let bebanPeriode = 0
    if (!berhenti && perlakuan !== 'tidak' && perlakuan !== 'lain_lain' && sisaSmt > 0 && beban > 0 && nilaiBuku > 0) {
      if (sisaSmt === 1) {
        bebanPeriode = nilaiBuku // serap selisih pembulatan: paksa NB = 0 (§6.3)
      } else {
        bebanPeriode = Math.min(Math.round(beban), nilaiBuku)
      }
      nilaiBuku -= bebanPeriode
      akumulasi += bebanPeriode
      sisaSmt -= 1
    }

    hasil.push({
      aset_id: aset.id,
      periode,
      metode: perlakuan === 'amortisasi' ? 'amortisasi' : perlakuan === 'tidak' ? 'tidak' : 'penyusutan',
      nilai_perolehan: nilaiPerolehan,
      nilai_buku_awal: nbAwal,
      beban: bebanPeriode,
      akumulasi,
      nilai_buku_akhir: nilaiBuku,
      sisa_semester: sisaSmt,
      masa_manfaat_tahun: masaTahun,
    })

    // Kendali (§6.3) — cross-check doang, BUKAN sumber angka.
    if (bebanPeriode > 0 && sisaSmt > 0 && masaTahun) {
      if (sisaSmt > Math.round(masaTahun * 2)) {
        console.warn(`[kendali] ${aset.id} ${periode}: sisa_semester ${sisaSmt} > max ${masaTahun * 2}`)
      }
    }
  }

  return hasil
}

function prevPeriodeOf(p: string): string {
  const m = p.match(/^(\d{4})-S([12])$/)
  if (!m) return PERIODE_BASELINE
  const tahun = parseInt(m[1], 10), smt = parseInt(m[2], 10)
  return smt === 2 ? `${tahun}-S1` : `${tahun - 1}-S2`
}

/** Kategori kode buat exclusion cepat di caller (§8). */
export function kodeDisusutkan(kode: string): boolean {
  return perlakuanKode(kode) !== 'tidak'
}

export { kodeLevel3 }
