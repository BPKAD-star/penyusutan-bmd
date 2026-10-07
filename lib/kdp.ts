// ============================================================================
// KDP / Pekerjaan Konstruksi — model KARTU = PAKET, SETUJUI PER TERMIN
// (keputusan user 2026-10-07, rancangan lengkap: docs/kdp-per-termin-plan.md).
//
// 1 kartu = 1 jurnal_header (kategori 'konstruksi') = SATU PAKET PEKERJAAN dalam
// SATU tahun anggaran. Di dalamnya:
//   · kontrak[]  — kontrak per komponen (perencanaan/fisik/pengawasan/biaya umum),
//                  masing-masing bernomor, bertanggal, berpenyedia;
//   · barang[]   — barang KDP (1.3.6), tiap barang = satu aset;
//   · barang[].pembayaran[] — termin; tiap termin menunjuk satu kontrak & punya
//                  status 'menunggu' / 'disetujui' SENDIRI.
//
// Termin disetujui SATU PER SATU (RPC fn_kdp_setujui_termin, admin pemda saja):
// termin pertama sebuah barang menerbitkan barangnya (NIBAR terbit SEKALI),
// termin berikutnya cuma menambah nilai barang yang sama. Salah catat → Batal
// termin itu saja (fn_kdp_batal_termin) — kartu tak pernah dibongkar seluruhnya.
//
// Ledger (append-only):
//   akumulasi_kdp       : termin disetujui → nilai barang KDP naik
//   batal_akumulasi_kdp : termin dibatalkan. Ber-`payload.target_trx_id` →
//                         membatalkan BARIS ITU SAJA. Tanpa target (warisan
//                         model "Buka Kunci kartu", 4 barang di produksi) →
//                         membatalkan seluruh termin barang itu yang lebih tua.
//                         Aturan bacanya: `terminKdpDibatalkan` (lib/voidedAset.ts).
//
// Penegak: trigger fn_kdp_kartu_guard (termin disetujui beku, status kartu tak
// bisa diubah lewat UPDATE biasa) + kedua RPC. File ini memuat aturan MURNI
// yang dipakai layar; RPC mengulang aturan yang sama sbg penegak terakhir.
// ============================================================================

export type KomponenKdp = 'perencanaan' | 'fisik' | 'biaya_umum' | 'pengawasan'
export type StatusTermin = 'menunggu' | 'disetujui'

export const KOMPONEN_KDP: { value: KomponenKdp; label: string; kontrakWajib: boolean }[] = [
  { value: 'perencanaan', label: 'Perencanaan', kontrakWajib: true },
  { value: 'fisik', label: 'Fisik', kontrakWajib: true },
  { value: 'pengawasan', label: 'Pengawasan', kontrakWajib: true },
  // Keputusan user 2026-10-07: biaya umum (honor, ATK, perizinan) umumnya tanpa
  // kontrak — boleh kosong, tapi isiannya tetap disediakan untuk yang berkontrak.
  { value: 'biaya_umum', label: 'Biaya Umum', kontrakWajib: false },
]
export const komponenLabelKdp = (v: string) => KOMPONEN_KDP.find(k => k.value === v)?.label || v
const kontrakWajib = (v: string) => KOMPONEN_KDP.find(k => k.value === v)?.kontrakWajib ?? true

/** Satu kontrak di dalam kartu paket. Dipakai banyak termin, boleh lintas barang. */
export type KontrakKdp = {
  id: string
  komponen: KomponenKdp
  bentuk?: string | null              // bentuk dokumen kontrak (SPK/Surat Perjanjian/…)
  no_kontrak: string
  tgl_kontrak: string
  penyedia?: string | null
  ppk?: string | null
  nilai_kontrak?: number | null
  keterangan?: string | null
}

export type PembayaranKdp = {
  id?: string                         // id stabil termin (wajib utk kartu model baru)
  kontrak_id?: string | null          // kontrak dasar pembayaran (boleh kosong hanya utk biaya umum)
  komponen: KomponenKdp
  no_bast?: string | null; tgl_bast: string; kode_rekening?: string | null; nominal: number; keterangan?: string | null
  dokumen_paths?: string[]            // dokumen BAST termin ini — WAJIB (keputusan 2026-09-05)
  status?: StatusTermin               // tak ada = 'menunggu'
  trx_id?: number | null              // id baris akumulasi_kdp kalau disetujui
  dibuat_oleh?: string | null
  disetujui_oleh?: string | null
  disetujui_at?: string | null
}
// Info "menambah masa manfaat aset existing" — INFO saja (bukan auto-kapitalisasi).
export type KapInfo = { menambah: boolean; target_aset_id?: string | null; target_nama?: string | null }
export type BarangKdp = {
  key: string
  kode: string                       // kode kodefikasi KDP (golongan 1.3.6)
  nama: string                       // uraian kodefikasi (cadangan nama tampil)
  spec?: Record<string, string>
  foto?: string[]
  pembayaran: PembayaranKdp[]
  kap_info?: KapInfo | null
  aset_id?: string | null            // diisi saat barang disiapkan utk termin pertamanya
  // true sejak termin pertamanya pernah disetujui (diset RPC). Sesudah itu
  // spesifikasi barang hanya lewat menu Koreksi: barang sudah ada di register.
  pernah_terbit?: boolean
}
export type KontrakKonstruksiPayload = {
  nama_pekerjaan: string
  program?: string | null; kegiatan?: string | null; sub_kegiatan?: string | null
  keterangan?: string | null
  kontrak?: KontrakKdp[]             // MODEL PAKET (2026-10-07)
  barang?: BarangKdp[]
  // ── Kontrak tingkat kartu (model sebelum 2026-10-07) — dibaca utk kompat ──
  sumber?: string; ppk?: string | null; penyedia?: string | null; nilai_kontrak?: number | null
  // ── LEGACY single-KDP (payload versi 2026-07) ──
  kode_kdp?: string
  pembayaran?: PembayaranKdp[]
  spec?: Record<string, string>
  foto?: string[]
  aset_id?: string | null
  kap_info?: KapInfo
}

export const newIdKdp = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
  ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)

// Normalisasi payload (lama/baru) → array barang.
export function barangKdpList(p: KontrakKonstruksiPayload): BarangKdp[] {
  if (Array.isArray(p.barang)) return p.barang
  if (p.kode_kdp) return [{
    key: 'legacy', kode: p.kode_kdp, nama: p.nama_pekerjaan,
    spec: p.spec, foto: p.foto, pembayaran: p.pembayaran || [], kap_info: p.kap_info, aset_id: p.aset_id ?? null,
  }]
  return []
}

export const statusTermin = (t: Pick<PembayaranKdp, 'status'>): StatusTermin =>
  t.status === 'disetujui' ? 'disetujui' : 'menunggu'

/** Ringkasan satu barang dari termin-terminnya. */
export function ringkasBarangKdp(b: Pick<BarangKdp, 'pembayaran'>) {
  const ts = b.pembayaran || []
  const setuju = ts.filter(t => statusTermin(t) === 'disetujui')
  const tunggu = ts.filter(t => statusTermin(t) === 'menunggu')
  const jml = (xs: PembayaranKdp[]) => xs.reduce((s, x) => s + Number(x.nominal || 0), 0)
  return {
    nilaiDisetujui: jml(setuju),
    nilaiMenunggu: jml(tunggu),
    nDisetujui: setuju.length,
    nMenunggu: tunggu.length,
    // Tanggal perolehan KDP = BAST termin disetujui PALING AWAL (keputusan user
    // 2026-10-07, membalik "BAST terakhir" 2026-07-13). "Terakhir" terus bergeser
    // selama termin disetujui bertahap & membuat barang lenyap dari laporan
    // semester sebelumnya. Penyusutan sendiri baru mulai saat reklas ke GB/JIJ.
    tglPerolehan: setuju.map(t => t.tgl_bast).filter(Boolean).sort()[0] || null,
  }
}

/** Status kartu DITURUNKAN dari terminnya: 'disetujui' kalau minimal satu termin disetujui. */
export function statusKartuKdp(p: KontrakKonstruksiPayload): 'pending' | 'disetujui' {
  return barangKdpList(p).some(b => ringkasBarangKdp(b).nDisetujui > 0) ? 'disetujui' : 'pending'
}
export const adaTerminMenunggu = (p: KontrakKonstruksiPayload) => barangKdpList(p).some(b => ringkasBarangKdp(b).nMenunggu > 0)

/** Satu kartu = satu tahun anggaran (keputusan user 2026-10-07) — tahunnya dari tanggal kartu. */
export const tahunKartuKdp = (tanggalKartu: string) => (tanggalKartu || '').slice(0, 4)

/** Kontrak dipakai termin mana saja di kartu ini. */
export function pemakaianKontrak(p: KontrakKonstruksiPayload, kontrakId: string) {
  let menunggu = 0, disetujui = 0
  const tgl: string[] = []
  for (const b of barangKdpList(p)) for (const t of b.pembayaran || []) {
    if (t.kontrak_id !== kontrakId) continue
    if (statusTermin(t) === 'disetujui') disetujui++; else menunggu++
    if (t.tgl_bast) tgl.push(t.tgl_bast)
  }
  return { menunggu, disetujui, bastTerawal: tgl.sort()[0] || null }
}

/**
 * Aturan tanggal & kontrak sebuah termin. Mengembalikan pesan penolakan atau null.
 * · komponen selain biaya umum WAJIB menunjuk kontrak berkomponen sama;
 * · BAST tak boleh lebih tua dari tanggal kontraknya sendiri;
 * · BAST wajib di tahun kartu — lintas tahun = kartu baru + Kapitalisasi + Reklas.
 * ⚠️ KEMBAR dgn pemeriksaan di fn_kdp_setujui_termin (penegak terakhir).
 */
export function cekTanggalTermin(
  t: Pick<PembayaranKdp, 'komponen' | 'tgl_bast' | 'kontrak_id'>,
  kontraks: KontrakKdp[], tahunKartu: string,
): string | null {
  const k = t.kontrak_id ? kontraks.find(x => x.id === t.kontrak_id) : undefined
  if (t.kontrak_id && !k) return 'Kontrak termin ini sudah tidak ada di kartu — pilih kontrak lagi.'
  if (!k && kontrakWajib(t.komponen)) return `Termin ${komponenLabelKdp(t.komponen)} wajib menunjuk kontraknya — tambahkan kontrak ${komponenLabelKdp(t.komponen)} di kartu ini dulu.`
  if (k && k.komponen !== t.komponen) return `Kontrak "${k.no_kontrak}" adalah kontrak ${komponenLabelKdp(k.komponen)}, bukan ${komponenLabelKdp(t.komponen)}.`
  if (!t.tgl_bast) return 'Tanggal BAST wajib diisi.'
  if (tahunKartu && t.tgl_bast.slice(0, 4) !== tahunKartu) {
    return `BAST bertanggal ${t.tgl_bast} di luar tahun kartu ini (${tahunKartu}). Satu kartu = satu tahun anggaran — `
      + 'buat kartu baru untuk tahun itu, lalu satukan barangnya lewat Kapitalisasi & Reklasifikasi.'
  }
  if (k && t.tgl_bast < k.tgl_kontrak) return `Tgl BAST (${t.tgl_bast}) tidak boleh lebih tua dari tgl kontraknya (${k.tgl_kontrak}, No. ${k.no_kontrak}).`
  return null
}

/** Seluruh kekurangan termin sebelum bisa disimpan/disetujui (semuanya sekaligus). */
export function kekuranganTermin(
  t: Pick<PembayaranKdp, 'komponen' | 'tgl_bast' | 'kontrak_id' | 'nominal' | 'dokumen_paths'>,
  kontraks: KontrakKdp[], tahunKartu: string,
): string[] {
  const out: string[] = []
  if (!(Number(t.nominal) > 0)) out.push('Nominal wajib lebih dari 0.')
  if (!t.dokumen_paths || t.dokumen_paths.length === 0) out.push(`Dokumen BAST termin ${komponenLabelKdp(t.komponen)} wajib diunggah.`)
  const tgl = cekTanggalTermin(t, kontraks, tahunKartu)
  if (tgl) out.push(tgl)
  return out
}

/** Tanggal kontrak baru tak boleh melewati BAST termin yang memakainya. */
export function cekUbahTglKontrak(p: KontrakKonstruksiPayload, kontrakId: string, tglBaru: string, tahunKartu: string): string | null {
  if (!tglBaru) return 'Tanggal kontrak wajib diisi.'
  if (tahunKartu && tglBaru.slice(0, 4) > tahunKartu) return `Tgl kontrak (${tglBaru}) melewati tahun kartu (${tahunKartu}).`
  const { bastTerawal } = pemakaianKontrak(p, kontrakId)
  if (bastTerawal && tglBaru > bastTerawal) return `Tgl kontrak (${tglBaru}) lebih baru dari BAST termin yang memakainya (${bastTerawal}).`
  return null
}

/**
 * Normalisasi kartu sebelum model paket (2026-10-07): termin tanpa `id` diberi id,
 * kontrak tingkat kartu (no_sk/tanggal/penyedia/ppk) dijadikan SATU kontrak
 * FISIK & termin fisik menunjuknya. Termin komponen lain sengaja tak dipasangkan
 * — operator menambah kontraknya sendiri. `berubah=false` → tak perlu disimpan.
 */
export function normalisasiKartuKdp(
  p: KontrakKonstruksiPayload, header: { no_sk: string; tanggal: string },
): { payload: KontrakKonstruksiPayload; berubah: boolean } {
  let berubah = false
  let kontrak = p.kontrak
  if (!Array.isArray(kontrak)) {
    berubah = true
    kontrak = (p.sumber || p.penyedia || p.ppk || p.nilai_kontrak) ? [{
      id: newIdKdp(), komponen: 'fisik', bentuk: p.sumber ?? null, no_kontrak: header.no_sk, tgl_kontrak: header.tanggal,
      penyedia: p.penyedia ?? null, ppk: p.ppk ?? null, nilai_kontrak: p.nilai_kontrak ?? null,
    }] : []
  }
  const kontrakFisikLama = !Array.isArray(p.kontrak) ? kontrak[0]?.id : undefined
  const barang = barangKdpList(p).map(b => ({
    ...b,
    pembayaran: (b.pembayaran || []).map(t => {
      if (t.id && (t.kontrak_id !== undefined || !kontrakFisikLama)) return t
      berubah = true
      return {
        ...t, id: t.id || newIdKdp(),
        kontrak_id: t.kontrak_id ?? (kontrakFisikLama && t.komponen === 'fisik' ? kontrakFisikLama : null),
      }
    }),
  }))
  if (!Array.isArray(p.barang)) berubah = berubah || barang.length > 0
  const { kode_kdp: _k, pembayaran: _p, spec: _s, foto: _f, aset_id: _a, kap_info: _ki, ...rest } = p
  return { payload: { ...rest, kontrak, barang }, berubah }
}

/** Nama yang ditampilkan untuk satu barang KDP: Spesifikasi Nama Barang kalau sudah diisi,
 *  kalau belum jatuh ke `nama` (sejak 2026-10-04 diisi uraian kodefikasi saat barang ditambah). */
export const namaBarangKdp = (b: Pick<BarangKdp, 'nama' | 'kode' | 'spec'>): string =>
  b.spec?.nama_barang?.trim() || b.nama || b.kode

const normNama = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * Aturan nama barang KDP (keputusan user 2026-10-04): "Spesifikasi Nama Barang" WAJIB diisi
 * dan TIDAK BOLEH kembar di dalam satu kartu — tiap barang KDP = satu aset, jadi dua kartu
 * bernama sama tak bisa dibedakan di register. Pembanding tak peduli huruf besar/kecil & spasi
 * ganda. Mengembalikan pesan kekurangan, atau null kalau lolos.
 */
export function kekuranganNamaKdp(barangs: Pick<BarangKdp, 'nama' | 'kode' | 'spec'>[]): string | null {
  const lihat = new Map<string, string>()
  for (const b of barangs) {
    const nama = b.spec?.nama_barang?.trim()
    const label = b.nama || b.kode
    if (!nama) return `Barang "${label}" belum punya Spesifikasi Nama Barang — isi dulu lewat Edit Spesifikasi.`
    const k = normNama(nama)
    if (lihat.has(k)) return `Spesifikasi Nama Barang "${nama}" kembar di kartu ini (${lihat.get(k)} & ${label}) — tiap barang KDP harus punya nama yang berbeda.`
    lihat.set(k, label)
  }
  return null
}
