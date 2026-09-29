'use client'
// Daftar pegawai untuk kolom "Nama PPK" di menu Cara Perolehan (Pengadaan
// non-fisik & Konstruksi) — DIBATASI ke SKPD kartu, bukan seluruh pemda.
// Sebelum ini keempat picker menarik SELURUH `admin_pegawai` (se-kabupaten,
// ribuan baris) sehingga operator harus mengingat nama persis untuk menemukan
// PPK-nya sendiri.
//
// ⚠️ Yang diambil adalah RANTAI SKPD: node yang dipilih **plus induk-induknya**,
// bukan `skpd_id = <node>` telanjang. Alasannya bukan kehati-hatian belaka —
// picker SKPD di menu Cara Perolehan sudah dibuka ke seluruh subtree sejak
// 2026-07-27, jadi kartu boleh dibuat atas nama sub-OPD (mis. satu sekolah di
// bawah Dinas Pendidikan) sementara PPK-nya duduk di SKPD induk. Dengan filter
// telanjang, kartu sub-OPD akan dapat dropdown KOSONG — dan `SearchSelect`
// TIDAK menerima teks bebas (nilai wajib salah satu opsi), jadi kolomnya jadi
// mustahil diisi, bukan sekadar merepotkan.
//
// Pegawai SKPD induk & pemegang rangkap Pengguna Barang (admin_pegawai_
// penugasan, lihat catatan di usePegawaiSkpd) tetap dibedakan: `asalSkpd`
// terisi (ditampilkan sbg baris kecil di bawah namanya) dan mereka diurutkan
// SESUDAH pegawai SKPD terpilih.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SSOption } from '@/components/SearchSelect'

export type PegawaiOpt = {
  id: string
  nama: string
  nip: string | null
  jabatan: string | null
  skpd_id: number | null
  /** Keterangan asal — diisi kalau pegawai ini BUKAN pegawai pokok SKPD yang
   *  sedang dipilih: datang dari SKPD induk ("Dinas X") atau merangkap Pengguna
   *  Barang dari SKPD lain ("Merangkap dari Dinas Y"). Kosong = pegawai SKPD
   *  itu sendiri. */
  asalSkpd?: string
}

/**
 * Pegawai SKPD terpilih + SKPD induk di atasnya + Kepala yang MERANGKAP
 * mengampu SKPD ini/induknya, urut: SKPD sendiri dulu, lalu A→Z.
 *
 * ⚠️ Rangkap (`admin_pegawai_penugasan`, khusus Pengguna Barang) TIDAK IKUT
 * `rantai`-nya sendiri sendiri: rangkap itu antar-SKPD BERSEBELAHAN (mis.
 * Kepala Dinas PU merangkap Kepala Dinas Perumahan — dua Dinas yang sama-sama
 * level teratas, bukan satu anak-induk yang lain), jadi tak akan pernah
 * ketemu lewat `parent_id`. Sebelum ini picker "Nama PPK" cuma menaiki
 * `parent_id`, jadi Kepala yang rangkap SELALU hilang dari dropdown SKPD yang
 * ia rangkap — persis kelas bug yang sudah ditutup utk pemilih penanda tangan
 * cetak lewat `fetchCalonTtd` (lib/penandaTangan.ts, 2026-08-16); di sini
 * ditutup ulang khusus utk hook ini krn hook ini TIDAK menerima peta SKPD
 * penuh dari pemanggil (beda dari `fetchCalonTtd`), jadi nama SKPD asal
 * pegawai rangkap perlu query tambahan sendiri — bukan disatukan jadi satu
 * fungsi, keduanya melayani bentuk pemanggil yang berbeda.
 */
export function usePegawaiSkpd(skpdId: number | string | null | undefined): PegawaiOpt[] {
  const supabase = createClient()
  const [list, setList] = useState<PegawaiOpt[]>([])
  const id = Number(skpdId)

  useEffect(() => {
    if (!id) { setList([]); return }
    let batal = false
    ;(async () => {
      // Naik dari node terpilih ke induknya. Pohon SKPD di sini cuma 3 level
      // (pengguna → kuasa pengguna → sub kuasa pengguna), jadi maksimal 3 query
      // ringan; `dilihat` menjaga dari parent_id yang melingkar.
      const rantai: { id: number; nama: string }[] = []
      const dilihat = new Set<number>()
      let cur: number | null = id
      while (cur != null && !dilihat.has(cur)) {
        dilihat.add(cur)
        const { data } = await supabase.from('admin_skpd').select('id,nama,parent_id').eq('id', cur).single()
        if (!data) break
        rantai.push({ id: data.id, nama: data.nama })
        cur = data.parent_id
      }
      if (rantai.length === 0) { if (!batal) setList([]); return }

      const namaSkpd = new Map(rantai.map(s => [s.id, s.nama]))
      const idRantai = rantai.map(s => s.id)

      const [{ data }, { data: rangkapData }] = await Promise.all([
        supabase.from('admin_pegawai')
          .select('id,nama,nip,jabatan,skpd_id')
          .in('skpd_id', idRantai)
          .order('nama'),
        // Skema: admin_pegawai_penugasan.skpd_id = SKPD yang DIAMPU (rangkap
        // masuk), pegawai:admin_pegawai(...) = pegawai POKOKnya (rangkap dari
        // mana). Pola query sama dgn fetchCalonTtd (lib/penandaTangan.ts).
        supabase.from('admin_pegawai_penugasan')
          .select('pegawai:admin_pegawai(id,nama,nip,jabatan,skpd_id)')
          .in('skpd_id', idRantai)
          .eq('aktif', true),
      ])

      const rows = ((data || []) as PegawaiOpt[]).map(p =>
        p.skpd_id === id ? p : { ...p, asalSkpd: namaSkpd.get(p.skpd_id ?? -1) })

      // ⚠️ `pegawai:admin_pegawai(...)` di sini SATU OBJEK, bukan array — arah FK
      // dari `admin_pegawai_penugasan` (anak) ke `admin_pegawai` (induk) selalu
      // begitu, beda dari embed kebalikannya. Rumah pegawai rangkap (`p.skpd_id`)
      // bisa SAJA di luar `rantai` (justru itu intinya), jadi nama SKPD asalnya
      // dicari terpisah — cuma utk yang belum ketemu di `namaSkpd`.
      type PenugasanRow = { pegawai: PegawaiOpt | null }
      const rangkap = ((rangkapData || []) as unknown as PenugasanRow[])
        .map(r => r.pegawai)
        .filter((p): p is PegawaiOpt => !!p && p.skpd_id !== id) // rangkap di SKPD sendiri bukan rangkap

      const idAsalBelumDikenal = [...new Set(rangkap.map(p => p.skpd_id).filter((x): x is number => x != null))]
        .filter(x => !namaSkpd.has(x))
      if (idAsalBelumDikenal.length > 0) {
        const { data: skpdAsal } = await supabase.from('admin_skpd').select('id,nama').in('id', idAsalBelumDikenal)
        for (const s of (skpdAsal || []) as { id: number; nama: string }[]) namaSkpd.set(s.id, s.nama)
      }

      for (const p of rangkap) rows.push({ ...p, asalSkpd: `Merangkap dari ${namaSkpd.get(p.skpd_id ?? -1) || 'SKPD lain'}` })

      rows.sort((a, b) => (a.asalSkpd ? 1 : 0) - (b.asalSkpd ? 1 : 0) || a.nama.localeCompare(b.nama))

      // Dedup by NAMA: yang tersimpan di payload cuma string nama (bukan id),
      // jadi dua baris bernama sama tak bisa dibedakan lagi setelah dipilih —
      // dan `SearchSelect` memakai value sbg React key, jadi kembarannya juga
      // memicu peringatan key ganda. Yang menang = pegawai SKPD terpilih
      // (sudah diurutkan lebih dulu di atas).
      const unik = new Map<string, PegawaiOpt>()
      for (const p of rows) if (!unik.has(p.nama)) unik.set(p.nama, p)

      if (!batal) setList([...unik.values()])
    })()
    return () => { batal = true }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  return list
}

/** Opsi SearchSelect untuk kolom PPK — satu bentuk label dipakai keempat picker. */
export function pegawaiOptions(list: PegawaiOpt[]): SSOption[] {
  return list.map(p => ({
    value: p.nama,
    label: `${p.nama} — ${p.nip || 'Non-ASN'}${p.jabatan ? ` · ${p.jabatan}` : ''}`,
    sub: p.asalSkpd,
  }))
}
