// ============================================================================
// Mengunci aturan & aritmetika Penggabungan Barang (lib/penggabunganNilai.ts).
//
// Yang dijaga di sini hal-hal yang pelanggarannya TIDAK menghasilkan error:
//   (1) syarat gabung ketiga-tiganya, bukan dua dari tiga
//   (2) Σ nilai dijumlah dalam SEN — sen yang terbuang jatuh ke Rekonsiliasi
//   (3) anggota tanpa baris engine WAJIB terdeteksi; akumulasi yang jatuh ke 0
//       diam-diam menghapus angka dari neraca
//   (4) perilaku `Math.round` di `kunciGabung` — dipatok supaya perubahannya
//       (memperketat MAUPUN memperlonggar) tak pernah lolos tanpa disadari
// ============================================================================
import { describe, it, expect } from 'vitest'
import {
  kunciGabung, syaratGabungOk, totalNilaiGabung, totalAkumulasiGabung, anggotaTanpaBasis,
  type AnggotaGabung,
} from './penggabunganNilai'

const a = (over: Partial<AnggotaGabung> = {}): AnggotaGabung =>
  ({ id: 'x1', kode: '1.3.2.05.02.06.121', nilai_perolehan: 721_500, tgl_perolehan: '2025-02-05', ...over })

describe('kunciGabung — ketiga syarat, bukan dua dari tiga', () => {
  it('sama semua → kunci sama', () => {
    expect(kunciGabung(a({ id: 'p' }))).toBe(kunciGabung(a({ id: 'q' })))
  })

  it('beda KODE → kunci beda', () => {
    expect(kunciGabung(a())).not.toBe(kunciGabung(a({ kode: '1.3.2.05.02.06.999' })))
  })

  it('beda NILAI → kunci beda', () => {
    expect(kunciGabung(a())).not.toBe(kunciGabung(a({ nilai_perolehan: 721_501 })))
  })

  it('beda TANGGAL → kunci beda', () => {
    expect(kunciGabung(a())).not.toBe(kunciGabung(a({ tgl_perolehan: '2025-02-06' })))
  })

  it('tgl null dibedakan dari tanggal sungguhan, bukan disamakan diam-diam', () => {
    expect(kunciGabung(a({ tgl_perolehan: null }))).toBe('1.3.2.05.02.06.121|721500|-')
    expect(kunciGabung(a({ tgl_perolehan: null }))).not.toBe(kunciGabung(a()))
  })

  it('dua tgl null SAMA — barang warisan tanpa tanggal tetap bisa digabung', () => {
    expect(kunciGabung(a({ id: 'p', tgl_perolehan: null }))).toBe(kunciGabung(a({ id: 'q', tgl_perolehan: null })))
  })

  // ⚠️ PATOKAN, bukan pembenaran. Lihat catatan panjang di lib/penggabunganNilai.ts:
  // aturannya "nilai SAMA PERSIS", tapi `Math.round` menyamakan yang beda SEN.
  // Hari ini tak tergigit (kedua pintu pengisinya menyaring `.eq` eksak). Kalau
  // test ini suatu saat merah, itu berarti seseorang mengubah kelonggarannya —
  // dan itu HARUS jadi keputusan sadar, bukan efek samping.
  it('beda sen yang MEMBULAT KE RUPIAH SAMA dianggap sama — kelonggaran yang dipatok', () => {
    expect(kunciGabung(a({ nilai_perolehan: 721_500.10 }))).toBe(kunciGabung(a({ nilai_perolehan: 721_500.40 })))
  })

  it('…tapi yang membulat ke rupiah BERBEDA tetap dibedakan — batasnya di sini', () => {
    // Bukti kelonggarannya cuma se-bucket pembulatan, bukan "sen diabaikan":
    // beda 2 sen saja sudah berbeda kunci begitu ia melewati titik tengah.
    expect(kunciGabung(a({ nilai_perolehan: 721_500.49 }))).not.toBe(kunciGabung(a({ nilai_perolehan: 721_500.51 })))
  })
})

describe('syaratGabungOk', () => {
  it('dua anggota sekunci → boleh', () => {
    expect(syaratGabungOk([a({ id: 'p' }), a({ id: 'q' })])).toBe(true)
  })

  it('SATU anggota → tidak boleh, berapa pun cocoknya', () => {
    expect(syaratGabungOk([a()])).toBe(false)
  })

  it('kosong → tidak boleh', () => {
    expect(syaratGabungOk([])).toBe(false)
  })

  it('satu anggota menyimpang di TENGAH daftar tetap tertangkap', () => {
    const list = [a({ id: 'p' }), a({ id: 'q', nilai_perolehan: 999 }), a({ id: 'r' })]
    expect(syaratGabungOk(list)).toBe(false)
  })

  it('35 baris kasus Pagar Besi → boleh', () => {
    const pagar = Array.from({ length: 35 }, (_, i) => a({ id: `p${i}` }))
    expect(syaratGabungOk(pagar)).toBe(true)
  })
})

describe('totalNilaiGabung — dijumlah dalam SEN', () => {
  it('35 × 721.500 = 25.252.500 (kasus Pagar Besi, angka nyata)', () => {
    const pagar = Array.from({ length: 35 }, (_, i) => a({ id: `p${i}` }))
    expect(totalNilaiGabung(pagar)).toBe(25_252_500)
  })

  it('sen TIDAK terbuang — bukti jumlahnya bukan hasil pembulatan per anggota', () => {
    const list = [a({ id: 'p', nilai_perolehan: 0.33 }), a({ id: 'q', nilai_perolehan: 0.33 }), a({ id: 'r', nilai_perolehan: 0.34 })]
    expect(totalNilaiGabung(list)).toBe(1)
    // Kalau tiap anggota dibulatkan ke rupiah dulu, hasilnya 0 — bukan 1.
    expect(list.reduce((s, k) => s + Math.round(k.nilai_perolehan), 0)).toBe(0)
  })

  it('nilai berdesimal warisan e-BMD dijumlah eksak', () => {
    const list = [a({ id: 'p', nilai_perolehan: 104_893_870_444.53 }), a({ id: 'q', nilai_perolehan: 0.47 })]
    expect(totalNilaiGabung(list)).toBe(104_893_870_445)
  })

  it('daftar kosong → 0', () => {
    expect(totalNilaiGabung([])).toBe(0)
  })
})

describe('totalAkumulasiGabung', () => {
  const list = [a({ id: 'p' }), a({ id: 'q' })]

  it('menjumlah akumulasi tiap anggota', () => {
    expect(totalAkumulasiGabung(list, { p: 100_000, q: 250_000 })).toBe(350_000)
  })

  it('basis belum termuat (null) → 0, bukan NaN', () => {
    expect(totalAkumulasiGabung(list, null)).toBe(0)
  })

  it('anggota di luar peta dihitung 0 — TIDAK meledak jadi NaN', () => {
    expect(totalAkumulasiGabung(list, { p: 100_000 })).toBe(100_000)
  })

  it('hanya anggota terdaftar yang dijumlah; barang lain di peta diabaikan', () => {
    expect(totalAkumulasiGabung(list, { p: 1, q: 2, z: 9_999_999 })).toBe(3)
  })
})

describe('anggotaTanpaBasis — "tak ada" vs "ada, bernilai 0"', () => {
  it('yang tak ada di peta dilaporkan', () => {
    expect(anggotaTanpaBasis(['p', 'q', 'r'], { p: 5 })).toEqual(['q', 'r'])
  })

  it('akumulasi NOL yang SAH tidak ikut dilaporkan — ini inti fungsinya', () => {
    // `!map[id]` akan salah menuduh keduanya; `=== undefined` yang benar.
    expect(anggotaTanpaBasis(['p', 'q'], { p: 0, q: 0 })).toEqual([])
  })

  it('semua lengkap → daftar kosong', () => {
    expect(anggotaTanpaBasis(['p', 'q'], { p: 1, q: 2 })).toEqual([])
  })

  it('peta kosong → semuanya dilaporkan', () => {
    expect(anggotaTanpaBasis(['p', 'q'], {})).toEqual(['p', 'q'])
  })
})
