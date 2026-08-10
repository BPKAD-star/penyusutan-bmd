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
// Pegawai SKPD induk tetap dibedakan: `asalSkpd` terisi (ditampilkan sbg baris
// kecil di bawah namanya) dan mereka diurutkan SESUDAH pegawai SKPD terpilih.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SSOption } from '@/components/SearchSelect'

export type PegawaiOpt = {
  id: string
  nama: string
  nip: string | null
  jabatan: string | null
  skpd_id: number | null
  /** Nama SKPD asal — HANYA diisi kalau pegawai ini datang dari SKPD induk,
   *  bukan dari SKPD yang sedang dipilih. Kosong = pegawai SKPD itu sendiri. */
  asalSkpd?: string
}

/** Pegawai SKPD terpilih + SKPD induk di atasnya, urut: SKPD sendiri dulu, lalu A→Z. */
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
      const { data } = await supabase.from('admin_pegawai')
        .select('id,nama,nip,jabatan,skpd_id')
        .in('skpd_id', rantai.map(s => s.id))
        .order('nama')

      const rows = ((data || []) as PegawaiOpt[]).map(p =>
        p.skpd_id === id ? p : { ...p, asalSkpd: namaSkpd.get(p.skpd_id ?? -1) })
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
