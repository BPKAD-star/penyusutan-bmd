// Uji registry & mesin subtotal format Permendagri 47/2021 (cabang IV.A).
//
// Kenapa diuji: lembar ini DITANDATANGANI lalu dikirim ke inspektorat/BPK, dan
// dua kelas kesalahannya sama-sama SENYAP — (1) penomoran kolom yang "dirapikan"
// membuat lembar tak cocok saat dicocokkan pemeriksa kolom per kolom;
// (2) subtotal yang tak sama dengan rekapnya membuat dua lembar dalam SATU
// berkas saling bertentangan tanpa satu pun error.
import { describe, it, expect } from 'vitest'
import {
  FORMAT_PEROLEHAN, TANGGA_REKAP, SEG_SUBTOTAL, lebarKodeBlok,
  prefixSeg, segmenKode, susunRinci, susunRekap, totalPer, totalSemua, SEG_MIN_REKAP,
  sebutanPejabat, levelSkpd, petaNamaTingkat, NAMA_KELOMPOK,
  type ItemLaporan,
} from '@/lib/formatPermendagri'

const semua = Object.values(FORMAT_PEROLEHAN)

const item = (kode: string, jumlah: number, nilai: number): ItemLaporan<string> =>
  ({ kode, jumlah, nilai, data: kode })

describe('registry — bentuk lembar', () => {
  it('keempat cara perolehan terdaftar dengan kode format yang benar', () => {
    expect(FORMAT_PEROLEHAN.hibah_masuk.kode).toBe('IV.A.2.2')
    expect(FORMAT_PEROLEHAN.hasil_inventarisasi.kode).toBe('IV.A.7.2')
    expect(FORMAT_PEROLEHAN.tukar_menukar.kode).toBe('IV.A.8.2')
    expect(FORMAT_PEROLEHAN.perolehan_lainnya.kode).toBe('IV.A.10.2')
  })

  it('kunci registry = jenis ledger yang disaring (tak boleh menyimpang)', () => {
    for (const [kunci, f] of Object.entries(FORMAT_PEROLEHAN)) expect(f.jenis).toBe(kunci)
  })

  it('kode lembar rinci selalu <awalan>.2', () => {
    for (const f of semua) expect(f.kode).toBe(`${f.awalan}.2`)
  })

  it('kolom (9)–(18) IDENTIK di keempat format — itu dasar satu generator', () => {
    const awal = (f: typeof semua[number]) => f.kolom.slice(0, 9).map(k => k.key)
    const acuan = awal(FORMAT_PEROLEHAN.hibah_masuk)
    for (const f of semua) expect(awal(f)).toEqual(acuan)
    expect(acuan).toEqual([
      'nama', 'spek_nama', 'nibar', 'spek_lain', 'jumlah', 'satuan',
      'harga_satuan', 'total_nilai', 'kondisi',
    ])
  })

  it('tiap format diakhiri kolom Keterangan', () => {
    for (const f of semua) expect(f.kolom[f.kolom.length - 1].key).toBe('keterangan')
  })
})

describe('penomoran kolom — salah ketik lembar asli SENGAJA dipertahankan', () => {
  // Ini uji yang paling gampang "diperbaiki" orang yang tak tahu ceritanya.
  it('HIBAH menomori (14) dua kali: Jumlah Barang DAN Satuan Barang', () => {
    const k = FORMAT_PEROLEHAN.hibah_masuk.kolom
    expect(k.find(x => x.key === 'jumlah')!.nomor).toBe(14)
    expect(k.find(x => x.key === 'satuan')!.nomor).toBe(14)
    // …lalu lompat ke 16, bukan 15.
    expect(k.find(x => x.key === 'harga_satuan')!.nomor).toBe(16)
  })

  it('TIGA format lain menomori (14)(15) dengan benar', () => {
    for (const j of ['hasil_inventarisasi', 'tukar_menukar', 'perolehan_lainnya']) {
      const k = FORMAT_PEROLEHAN[j].kolom
      expect(k.find(x => x.key === 'jumlah')!.nomor).toBe(14)
      expect(k.find(x => x.key === 'satuan')!.nomor).toBe(15)
    }
  })

  it('nomor kolom selalu MENAIK (kecuali kembar 14 di Hibah)', () => {
    for (const f of semua) {
      const n = f.kolom.map(k => k.nomor)
      for (let i = 1; i < n.length; i++) expect(n[i]).toBeGreaterThanOrEqual(n[i - 1])
    }
  })

  it('nomor kolom pertama selalu (10) — (9) milik blok Kode Barang', () => {
    for (const f of semua) expect(f.kolom[0].nomor).toBe(10)
  })

  it('penanda subtotal & kaki menyambung tepat setelah kolom terakhir', () => {
    // Bergeser antar format karena jumlah kolomnya beda. Kalau sambungannya
    // putus, berarti ada kolom yang ditambah/dibuang tanpa menggeser sisanya.
    for (const f of semua) {
      const terakhir = f.kolom[f.kolom.length - 1].nomor
      expect(f.subtotal[0]).toBe(terakhir + 1)
      expect([...f.subtotal]).toEqual([0, 1, 2, 3].map(i => f.subtotal[0] + i))
      expect(f.kaki.tanggal).toBe(f.subtotal[3] + 1)
      expect(f.kaki.jabatan).toBe(f.kaki.tanggal + 1)
      expect(f.kaki.nama).toBe(f.kaki.jabatan + 1)
    }
  })

  it('penanda subtotal sesuai lembar aslinya', () => {
    expect([...FORMAT_PEROLEHAN.hibah_masuk.subtotal]).toEqual([25, 26, 27, 28])
    expect([...FORMAT_PEROLEHAN.perolehan_lainnya.subtotal]).toEqual([25, 26, 27, 28])
    expect([...FORMAT_PEROLEHAN.hasil_inventarisasi.subtotal]).toEqual([26, 27, 28, 29])
    expect([...FORMAT_PEROLEHAN.tukar_menukar.subtotal]).toEqual([26, 27, 28, 29])
  })
})

describe('lebar kolom — syarat "fit to window"', () => {
  it('kolom + blok kode = PERSIS 100% di tiap format', () => {
    for (const f of semua) {
      const total = f.kolom.reduce((a, k) => a + k.lebar, 0) + lebarKodeBlok(f)
      expect(Math.round(total * 100) / 100).toBe(100)
    }
  })

  it('blok kode tetap lega — 7 sel segmen butuh ruang', () => {
    for (const f of semua) expect(lebarKodeBlok(f)).toBeGreaterThanOrEqual(10)
  })

  it('NIBAR tak boleh dipersempit — 45 digit dipenggal DUA baris, bukan tiga', () => {
    for (const f of semua) {
      expect(f.kolom.find(k => k.key === 'nibar')!.lebar).toBeGreaterThanOrEqual(9)
    }
  })
})

describe('kodefikasi', () => {
  it('memecah & mengambil awalan', () => {
    expect(segmenKode('1.3.2.05.02.06.121')).toHaveLength(7)
    expect(prefixSeg('1.3.2.05.02.06.121', 3)).toBe('1.3.2')
    expect(prefixSeg('1.3.2.05.02.06.121', 6)).toBe('1.3.2.05.02.06')
  })

  it('kode lebih pendek dari yang diminta → dikembalikan utuh, bukan undefined', () => {
    expect(prefixSeg('1.3.2', 6)).toBe('1.3.2')
    expect(prefixSeg('', 3)).toBe('')
  })
})

// ── Mesin subtotal ──────────────────────────────────────────────────────────
const CONTOH: ItemLaporan<string>[] = [
  item('1.3.2.05.02.06.121', 1, 1_000),
  item('1.3.2.05.02.06.122', 2, 2_000),
  item('1.3.2.05.02.07.001', 1, 500),
  item('1.3.2.06.01.01.001', 3, 4_000),
  item('1.3.3.01.01.01.001', 1, 9_000),
]
const SUB = FORMAT_PEROLEHAN.hibah_masuk.subtotal

describe('susunRinci', () => {
  const baris = susunRinci(CONTOH, SUB)

  it('setiap barang tetap muncul, tak ada yang hilang', () => {
    const item2 = baris.filter(b => b.tipe === 'item')
    expect(item2).toHaveLength(CONTOH.length)
  })

  it('baris kelompok tampil SEBELUM anggotanya', () => {
    const i = baris.findIndex(b => b.tipe === 'item')
    const grupPertama = baris.slice(0, i)
    expect(grupPertama.every(b => b.tipe === 'grup')).toBe(true)
    // 4 tingkat: 3, 4, 5, 6 segmen — dari dangkal ke dalam.
    expect(grupPertama.map(b => (b as { seg: number }).seg)).toEqual([3, 4, 5, 6])
  })

  it('subtotal kelompok = jumlah anggotanya', () => {
    const g = baris.find(b => b.tipe === 'grup' && b.kode === '1.3.2.05.02.06')
    expect(g).toMatchObject({ jumlah: 3, nilai: 3_000 })
  })

  it('penanda subtotal: paling DALAM dapat angka terkecil', () => {
    const p = (kode: string) =>
      (baris.find(b => b.tipe === 'grup' && b.kode === kode) as { penanda: number }).penanda
    expect(p('1.3.2.05.02.06')).toBe(25)   // 6 segmen
    expect(p('1.3.2.05.02')).toBe(26)      // 5
    expect(p('1.3.2.05')).toBe(27)         // 4
    expect(p('1.3.2')).toBe(28)            // 3
  })

  it('kelompok tak diulang selama awalannya sama', () => {
    const gol = baris.filter(b => b.tipe === 'grup' && b.kode === '1.3.2')
    expect(gol).toHaveLength(1)
  })

  it('pindah cabang MEMBUKA ULANG kelompok yang lebih dalam', () => {
    // '1.3.2.05.02.06' lalu '…07': kelompok 6-segmen wajib muncul lagi.
    const enam = baris.filter(b => b.tipe === 'grup' && (b as { seg: number }).seg === 6)
    expect(enam.map(b => b.kode)).toEqual([
      '1.3.2.05.02.06', '1.3.2.05.02.07', '1.3.2.06.01.01', '1.3.3.01.01.01',
    ])
  })

  it('daftar kosong → tak ada baris sama sekali (bukan kelompok hampa)', () => {
    expect(susunRinci([], SUB)).toEqual([])
  })
})

describe('rekap — hierarki yang sama, dipotong lebih dangkal', () => {
  it('rekap mulai dari 2 SEGMEN (kelompok neraca), lembar rinci dari 3', () => {
    // Beda ini nyata di lembar aslinya: keempat rekap membuka dengan baris
    // `x. x.`, sedangkan lembar rinci membuka di `x x x`.
    const rekap = susunRekap(CONTOH, 6)
    expect(Math.min(...rekap.map(r => r.seg))).toBe(SEG_MIN_REKAP)
    expect(SEG_MIN_REKAP).toBe(2)
    expect(rekap[0].kode).toBe('1.3')

    const rinci = susunRinci(CONTOH, SUB)
    const grup = rinci.filter(b => b.tipe === 'grup') as { seg: number }[]
    expect(Math.min(...grup.map(g => g.seg))).toBe(3)
  })

  it('tiap tingkat rekap memuat seluruh kedalaman 2..segMax', () => {
    for (const t of TANGGA_REKAP) {
      const seg = [...new Set(susunRekap(CONTOH, t.seg).map(r => r.seg))].sort()
      const harap: number[] = []
      for (let x = SEG_MIN_REKAP; x <= t.seg; x++) harap.push(x)
      expect(seg).toEqual(harap)
    }
  })

  // Uji paling penting di berkas ini: lembar rinci & keempat rekapnya masuk
  // dalam SATU berkas yang ditandatangani. Kalau angkanya bisa berbeda, tak
  // ada satu pun yang akan berteriak.
  it.each(TANGGA_REKAP.map(t => [t.akhiran, t.menurut] as const))(
    'IV.A.<n>.%i (menurut %s) sama persis dgn subtotal lembar rinci',
    (akhiran) => {
      const t = TANGGA_REKAP.find(x => x.akhiran === akhiran)!
      const rinci = susunRinci(CONTOH, SUB)
      // Tingkat 3..segMax ada di KEDUA lembar — di situlah keduanya wajib sama.
      for (const r of susunRekap(CONTOH, t.seg).filter(x => x.seg >= 3)) {
        const g = rinci.find(b => b.tipe === 'grup' && b.seg === r.seg && b.kode === r.kode)
        expect(g, `kelompok ${r.kode} (${r.seg} seg) hilang dari lembar rinci`).toBeDefined()
        expect(g).toMatchObject({ jumlah: r.jumlah, nilai: r.nilai })
      }
    })

  it('tangga rekap: .3 paling DALAM, .6 paling dangkal', () => {
    expect(TANGGA_REKAP.map(t => t.akhiran)).toEqual([3, 4, 5, 6])
    expect(TANGGA_REKAP.map(t => t.seg)).toEqual([6, 5, 4, 3])
    // Sejajar dengan SEG_SUBTOTAL — kalau menyimpang, penanda subtotal di
    // lembar rinci jatuh di tingkat yang salah.
    expect(TANGGA_REKAP.map(t => t.seg)).toEqual([...SEG_SUBTOTAL])
  })

  it('makin dangkal, barisnya makin sedikit (atau sama)', () => {
    const n = TANGGA_REKAP.map(t => susunRekap(CONTOH, t.seg).length)
    for (let i = 1; i < n.length; i++) expect(n[i]).toBeLessThanOrEqual(n[i - 1])
  })

  it('SETIAP kedalaman menjumlah ke total yang sama', () => {
    const semuaTotal = totalSemua(CONTOH)
    expect(semuaTotal).toEqual({ jumlah: 8, nilai: 16_500 })
    const rekap = susunRekap(CONTOH, 6)
    for (let seg = SEG_MIN_REKAP; seg <= 6; seg++) {
      const baris = rekap.filter(r => r.seg === seg)
      expect(baris.reduce((a, x) => a + x.jumlah, 0)).toBe(semuaTotal.jumlah)
      expect(baris.reduce((a, x) => a + x.nilai, 0)).toBe(semuaTotal.nilai)
    }
  })

  it('totalPer urut menaik menurut kode', () => {
    const kode = totalPer(CONTOH, 3).map(x => x.kode)
    expect(kode).toEqual([...kode].sort())
  })

  it('daftar kosong → rekap kosong, bukan baris nol', () => {
    expect(susunRekap([], 6)).toEqual([])
    expect(totalSemua([])).toEqual({ jumlah: 0, nilai: 0 })
  })
})

describe('sebutan penanda tangan', () => {
  it('SKPD induk → Pengguna Barang; sub unit → Kuasa Pengguna Barang', () => {
    expect(sebutanPejabat(1)).toBe('Pengguna Barang')
    expect(sebutanPejabat(2)).toBe('Kuasa Pengguna Barang')
    expect(sebutanPejabat(3)).toBe('Kuasa Pengguna Barang')
  })

  it('level dihitung dengan menaiki parent_id', () => {
    const p = new Map<number, number | null>([[1, null], [2, 1], [3, 2]])
    expect(levelSkpd(1, p)).toBe(1)
    expect(levelSkpd(2, p)).toBe(2)
    expect(levelSkpd(3, p)).toBe(3)
  })

  it('pohon berlingkar tidak membekukan lembar cetak', () => {
    const p = new Map<number, number | null>([[1, 2], [2, 1]])
    expect(levelSkpd(1, p)).toBeLessThanOrEqual(21)
  })

  it('id yatim (tak ada di peta) dianggap akar', () => {
    expect(levelSkpd(99, new Map())).toBe(1)
  })
})

describe('nama tiap tingkat kodefikasi', () => {
  // ⚠️ `admin_kodefikasi_bmd` HANYA berisi baris 7 segmen (diverifikasi ke
  // produksi 2026-08-30). Mencari baris untuk awalan yang lebih pendek
  // mengembalikan nol baris TANPA error — kolom Nama Barang di seluruh baris
  // subtotal tinggal kosong. Nama tingkat WAJIB dari kolom hierarkinya.
  const baris = [{
    kode: '1.3.2.05.02.06.121',
    uraian: 'Pagar Besi',
    nama_jenis: 'PERALATAN DAN MESIN',
    nama_objek: 'ALAT KANTOR DAN RUMAH TANGGA',
    nama_rincian: 'ALAT RUMAH TANGGA',
    nama_sub_rincian: 'ALAT RUMAH TANGGA LAINNYA (HOME USE)',
  }]

  it('mengisi nama untuk SETIAP tingkat 3–7 dari satu baris kodefikasi', () => {
    const m = petaNamaTingkat(baris)
    expect(m.get('1.3.2')).toBe('PERALATAN DAN MESIN')
    expect(m.get('1.3.2.05')).toBe('ALAT KANTOR DAN RUMAH TANGGA')
    expect(m.get('1.3.2.05.02')).toBe('ALAT RUMAH TANGGA')
    expect(m.get('1.3.2.05.02.06')).toBe('ALAT RUMAH TANGGA LAINNYA (HOME USE)')
    expect(m.get('1.3.2.05.02.06.121')).toBe('Pagar Besi')
  })

  it('tingkat 2 segmen datang dari konstanta — tak ada di tabel kodefikasi', () => {
    const m = petaNamaTingkat(baris)
    expect(m.get('1.3')).toBe('ASET TETAP')
    expect(m.get('1.5')).toBe('ASET LAINNYA')
  })

  it('SEG_MIN_REKAP punya nama untuk tiap kelompok yang dipakai aplikasi', () => {
    // Kalau nanti ada kelompok neraca baru (mis. 1.4), lembarnya akan
    // menampilkan kode telanjang — ini yang mengingatkan.
    for (const g of ['1.3', '1.5']) expect(NAMA_KELOMPOK[g]).toBeTruthy()
  })

  it('nama kosong/spasi TIDAK menimpa — kodenya saja lebih jujur', () => {
    const m = petaNamaTingkat([{ ...baris[0], nama_objek: '   ', nama_rincian: null }])
    expect(m.has('1.3.2.05')).toBe(false)
    expect(m.has('1.3.2.05.02')).toBe(false)
    expect(m.get('1.3.2')).toBe('PERALATAN DAN MESIN')
  })

  it('daftar kosong → tetap membawa kelompok neraca', () => {
    expect(petaNamaTingkat([]).get('1.3')).toBe('ASET TETAP')
  })
})
