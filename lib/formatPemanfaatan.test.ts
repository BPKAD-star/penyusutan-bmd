// Penjaga lembar PEMANFAATAN (tabel datar 15 kolom) & pemuatnya.
//
// Yang dijaga semuanya kelas kegagalan SENYAP:
//   · total lebar ≠ 100                 → kolom melar & keluar halaman
//   · urutan/judul kolom menyimpang dari contoh user
//   · replay salah                      → perjanjian yang dibatalkan tetap tercetak,
//     atau yang dibatalkan SESUDAH periodenya ikut hilang dari periode lama
//   · irisan masa salah                 → perjanjian yang berjalan di semester itu
//     tak muncul (atau yang sudah berakhir sebelum semester itu ikut muncul)
//   · total berlipat ganda              → satu barang dihitung dua kali
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { FORMAT_PEMANFAATAN, KOLOM_PEMANFAATAN } from './formatPemanfaatan'
import {
  pemanfaatanBerlaku, berlakuPadaRentang, rentangPeriode, jumlahNilaiPerolehan,
  asetKembar, JENIS_PEMANFAATAN_LEDGER, type EvPemanfaatan,
} from './laporanPemanfaatanPermendagri'

const AKAR = path.resolve(__dirname, '..')

describe('format lembar Pemanfaatan', () => {
  it('susunan kolom = contoh tabel user, apa adanya', () => {
    expect(KOLOM_PEMANFAATAN.map(k => k.judul)).toEqual([
      'NIBAR', 'Kode Barang - Uraian Barang', 'Nama Barang', 'Merk/Tipe', 'No Polisi',
      'Lokasi', 'Nilai Perolehan', 'Jenis Pemanfaatan', 'Mitra Pemanfaatan', 'Jangka Waktu',
      'Mulai', 'Berakhir', 'No Dokumen Sumber', 'Tanggal Dokumen Sumber', 'Keterangan',
    ])
  })

  it('total lebar kolom PERSIS 100', () => {
    const total = KOLOM_PEMANFAATAN.reduce((s, k) => s + k.lebar, 0)
    expect(Math.round(total * 100) / 100).toBe(100)
  })

  it('NIBAR dapat kolom TERBESAR (potongan 26 digitnya wajib muat sebaris)', () => {
    const nibar = KOLOM_PEMANFAATAN.find(k => k.key === 'nibar')!
    expect(KOLOM_PEMANFAATAN.every(k => k.lebar <= nibar.lebar)).toBe(true)
  })

  it('kolom tanggal tak lebih sempit dari 4,0% (nowrap — meluber di tiap baris)', () => {
    for (const k of KOLOM_PEMANFAATAN.filter(x => x.rata === 'tengah' && /tanggal|mulai|berakhir/i.test(x.key))) {
      expect(k.lebar, k.key).toBeGreaterThanOrEqual(4.0)
    }
  })

  it('nomor format TIDAK dikarang — kosong sampai gambar resminya ada', () => {
    // ⚠️ Lembar bertuliskan "Format IV.x" yang keliru lebih berbahaya daripada
    // yang belum bernomor: ia ditandatangani lalu dicocokkan pemeriksa.
    expect(FORMAT_PEMANFAATAN.kode).toBe('')
  })

  it('kunci kolom unik', () => {
    const k = KOLOM_PEMANFAATAN.map(x => x.key)
    expect(new Set(k).size).toBe(k.length)
  })
})

describe('rentangPeriode', () => {
  it('semester & tahun', () => {
    expect(rentangPeriode('2026-S1')).toEqual({ awal: '2026-01-01', akhir: '2026-06-30' })
    expect(rentangPeriode('2026-S2')).toEqual({ awal: '2026-07-01', akhir: '2026-12-31' })
    expect(rentangPeriode('2026')).toEqual({ awal: '2026-01-01', akhir: '2026-12-31' })
  })
  it('kosong / tak dikenal → null (bukan rentang karangan)', () => {
    expect(rentangPeriode('')).toBeNull()
    expect(rentangPeriode('2026-S3')).toBeNull()
  })
})

describe('berlakuPadaRentang — irisan masa perjanjian dgn periode', () => {
  const S1 = { awal: '2026-01-01', akhir: '2026-06-30' }
  const S2 = { awal: '2026-07-01', akhir: '2026-12-31' }

  it('perjanjian yang melintasi periode → berlaku', () => {
    expect(berlakuPadaRentang({ mulai: '2026-03-01', berakhir: '2031-03-01' }, S1)).toBe(true)
    expect(berlakuPadaRentang({ mulai: '2026-03-01', berakhir: '2031-03-01' }, S2)).toBe(true)
  })

  it('belum dimulai sampai periode berakhir → TAK berlaku', () => {
    expect(berlakuPadaRentang({ mulai: '2026-08-01', berakhir: '2027-08-01' }, S1)).toBe(false)
  })

  it('sudah berakhir sebelum periode dimulai → TAK berlaku', () => {
    expect(berlakuPadaRentang({ mulai: '2024-01-01', berakhir: '2026-06-30' }, S2)).toBe(false)
  })

  it('di-Akhiri DI TENGAH periode → tetap tampil di periode itu, tidak di sesudahnya', () => {
    // ⚠️ Inilah alasan lembar ini bukan "posisi akhir periode" spt Pengamanan.
    const p = { mulai: '2026-01-10', berakhir: '2031-01-10', selesaiTgl: '2026-03-15' }
    expect(berlakuPadaRentang(p, S1)).toBe(true)
    expect(berlakuPadaRentang(p, S2)).toBe(false)
  })

  it('yang LEBIH AWAL antara berakhir & selesai yang menentukan', () => {
    expect(berlakuPadaRentang({ mulai: '2026-01-01', berakhir: '2026-02-01', selesaiTgl: '2026-09-01' }, S2)).toBe(false)
    expect(berlakuPadaRentang({ mulai: '2026-01-01', berakhir: '2026-12-01', selesaiTgl: '2026-02-01' }, S2)).toBe(false)
  })

  it('batas inklusif: berakhir tepat di hari pertama periode → masih berlaku', () => {
    expect(berlakuPadaRentang({ mulai: '2025-07-01', berakhir: '2026-07-01' }, S2)).toBe(true)
  })

  it('tanggal kosong = tak terbatas di sisi itu (tak bisa dinilai ≠ tak berlaku)', () => {
    expect(berlakuPadaRentang({ mulai: '', berakhir: '' }, S1)).toBe(true)
    expect(berlakuPadaRentang({ mulai: '2026-03-01' }, S1)).toBe(true)
  })

  it('tanpa rentang (periode kosong) → semuanya berlaku', () => {
    expect(berlakuPadaRentang({ mulai: '2099-01-01', berakhir: '2100-01-01' }, null)).toBe(true)
  })
})

describe('pemanfaatanBerlaku — replay per (header, aset)', () => {
  const ev = (id: number, jenis: string, periode = '2026-S2', tanggal = '2026-08-01', header = 'h1', aset = 'a'): EvPemanfaatan =>
    ({ id, header_id: header, aset_id: aset, periode, tanggal, jenis })

  it('dicatat → berlaku, belum diakhiri', () => {
    const m = pemanfaatanBerlaku([ev(1, 'pemanfaatan')], '')
    expect(m.get('h1|a')).toEqual({ barisId: 1, selesaiTgl: null })
  })

  it('di-Akhiri → TETAP ada (riwayat sah), membawa hari berakhirnya', () => {
    const m = pemanfaatanBerlaku([ev(1, 'pemanfaatan'), ev(2, 'pemanfaatan_selesai', '2026-S2', '2026-09-09')], '')
    expect(m.get('h1|a')).toEqual({ barisId: 1, selesaiTgl: '2026-09-09' })
  })

  it('dibatalkan (salah catat) → hilang', () => {
    expect(pemanfaatanBerlaku([ev(1, 'pemanfaatan'), ev(2, 'batal_pemanfaatan')], '').size).toBe(0)
  })

  it('manfaat → selesai → manfaat lagi: baris terakhir menang & selesai di-reset', () => {
    const m = pemanfaatanBerlaku([
      ev(1, 'pemanfaatan'), ev(2, 'pemanfaatan_selesai'), ev(3, 'pemanfaatan'),
    ], '')
    expect(m.get('h1|a')).toEqual({ barisId: 3, selesaiTgl: null })
  })

  it('kunci per (header, aset): barang yang sama di dua perjanjian tak saling menimpa', () => {
    const m = pemanfaatanBerlaku([ev(1, 'pemanfaatan', '2026-S2', '2026-08-01', 'h1'), ev(2, 'pemanfaatan', '2026-S2', '2026-08-01', 'h2')], '')
    expect(m.size).toBe(2)
  })

  it('PERISTIWA BERLAKU SEJAK PERIODENYA: batal di S2 tak menghapus perjanjian dari laporan S1', () => {
    const rows = [ev(1, 'pemanfaatan', '2026-S1'), ev(2, 'batal_pemanfaatan', '2026-S2')]
    expect(pemanfaatanBerlaku(rows, '2026-S1').size).toBe(1)
    expect(pemanfaatanBerlaku(rows, '2026-S2').size).toBe(0)
  })

  it('peristiwa SESUDAH periode tak ikut dihitung (perjanjian baru di S2 tak muncul di S1)', () => {
    expect(pemanfaatanBerlaku([ev(1, 'pemanfaatan', '2026-S2')], '2026-S1').size).toBe(0)
  })

  it('diurutkan (periode, id) — urutan array masukan tak berpengaruh', () => {
    const a = pemanfaatanBerlaku([ev(2, 'batal_pemanfaatan'), ev(1, 'pemanfaatan')], '')
    expect(a.size).toBe(0)
  })

  it('daftar jenis ledger KEMBAR dgn muatPemanfaatan (laporan Daftar)', () => {
    const sumber = fs.readFileSync(path.join(AKAR, 'lib/laporanPemanfaatan.ts'), 'utf8')
    for (const j of JENIS_PEMANFAATAN_LEDGER) expect(sumber, j).toContain(`'${j}'`)
  })
})

describe('jumlahNilaiPerolehan — SEKALI per barang', () => {
  const r = (id: string, nilai: number | null) => ({ aset: { id, nilai_perolehan: nilai } })

  it('menjumlah barang yang berbeda', () => {
    expect(jumlahNilaiPerolehan([r('a', 100), r('b', 250)])).toBe(350)
  })

  it('barang yang muncul di dua perjanjian dihitung SEKALI', () => {
    // Perjanjian A diakhiri Februari, B dimulai April — keduanya di S1.
    expect(jumlahNilaiPerolehan([r('a', 100), r('a', 100), r('b', 50)])).toBe(150)
  })

  it('nilai null dibaca 0, bukan NaN', () => {
    expect(jumlahNilaiPerolehan([r('a', null), r('b', 5)])).toBe(5)
  })

  it('asetKembar menandai barang yang muncul lebih dari sekali', () => {
    expect([...asetKembar([r('a', 1), r('b', 1), r('a', 1)])]).toEqual(['a'])
    expect(asetKembar([r('a', 1), r('b', 1)]).size).toBe(0)
  })
})

describe('pemuat — wewenang & ketahanan', () => {
  const sumber = fs.readFileSync(path.join(AKAR, 'lib/laporanPemanfaatanPermendagri.ts'), 'utf8')
  // Komentar kepala berkas memang MENYEBUT `aset.skpd_id` (untuk menjelaskan
  // kenapa tak dipakai) — yang dipindai hanya baris kode.
  const kode = sumber.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')

  it('SKPD disaring lewat jurnal_header.skpd_id (terkunci), BUKAN aset.skpd_id', () => {
    // Pelajaran Laporan Reklasifikasi 2026-09-17.
    expect(kode).toMatch(/desc\.has\(h\.skpd_id\)/)
    expect(kode).not.toMatch(/aset\.skpd_id/)
  })

  it('memakai paginate() (keyset + MELEMPAR), bukan loop/range tulis-tangan', () => {
    expect(sumber).toContain("from '@/shared/db/paginate'")
    expect(sumber).not.toMatch(/\.range\(/)
    expect(sumber).not.toMatch(/const \{ data \} = await/)
  })
})
