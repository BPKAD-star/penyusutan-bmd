// Banner di KIBAR barang yang sudah dibatalkan lewat "Buka Kunci" kartu Cara
// Perolehan: menunjuk barang PENGGANTI yang diterbitkan saat kartunya
// disetujui ulang (lib/kibarPengganti.ts). Komponen server — dipanggil dari
// app/kibar/[nibar]/page.tsx dengan klien service-role halaman itu.
//
// ⚠️ Murni penunjuk: tak menulis apa pun. Gagal membaca = banner menyatakan
// gagal (bukan diam), karena tanpa banner pemindai QR label lama cuma melihat
// barang "dihapus" dan mengira barangnya hilang.
import Link from 'next/link'
import { formatRupiah2 } from '@/lib/export'
import {
  cariPengganti, JENIS_TERBIT, JENIS_BUKA_KUNCI, type AsetRingkas, type BarisKartu, type HasilPengganti,
} from '@/lib/kibarPengganti'
import type { createAdminClient } from '@/lib/supabase/server'

type Admin = ReturnType<typeof createAdminClient>

const KATEGORI: Record<string, string> = {
  pengadaan: 'Pengadaan', konstruksi: 'Pekerjaan Konstruksi', hibah_masuk: 'Hibah', tukar_menukar: 'Tukar Menukar',
  hasil_inventarisasi: 'Hasil Inventarisasi', perolehan_lainnya: 'Perolehan Lainnya',
}

/** Header kartu tempat barang ini dibatalkan lewat Buka Kunci, atau null. */
export function headerBukaKunci(trx: { jenis: string; header_id: string | null }[]): string | null {
  for (let i = trx.length - 1; i >= 0; i--) {
    const t = trx[i]
    if (t.header_id && (JENIS_BUKA_KUNCI as readonly string[]).includes(t.jenis)) return t.header_id
  }
  return null
}

type Muat =
  | { hasil: HasilPengganti; header: { no_sk: string | null; kategori: string; approval_status: string } }
  | { pesan: string }

async function muat(admin: Admin, asetId: string, headerId: string): Promise<Muat | null> {
  const [{ data: h, error: eH }, { data: rows, error: eR }] = await Promise.all([
    admin.from('jurnal_header').select('no_sk,kategori,approval_status').eq('id', headerId).maybeSingle(),
    admin.from('transaksi_bmd')
      .select('id,jenis,aset_id,aset:aset_id(id,nibar,kode,nama_barang,status,nilai_perolehan)')
      .eq('header_id', headerId)
      .in('jenis', [...JENIS_TERBIT, ...JENIS_BUKA_KUNCI])
      .order('id', { ascending: true })
      .limit(5000),
  ])
  if (eH || eR) return { pesan: (eH || eR)!.message }
  if (!h) return null
  const data = (rows || []) as unknown as (BarisKartu & { aset: AsetRingkas | null })[]
  const peta = new Map<string, AsetRingkas>()
  for (const r of data) if (r.aset) peta.set(r.aset.id, { ...r.aset, nilai_perolehan: r.aset.nilai_perolehan == null ? null : Number(r.aset.nilai_perolehan) })
  const hasil = cariPengganti(asetId, data, peta)
  if (!hasil) return null
  return { hasil, header: h as { no_sk: string | null; kategori: string; approval_status: string } }
}

function Barang({ a }: { a: AsetRingkas }) {
  return (
    <li className="py-1.5">
      <Link href={`/kibar/${a.nibar}`} className="font-medium text-teal hover:underline break-all">{a.nibar}</Link>
      <span className="text-gray-700"> — {a.nama_barang || a.kode}</span>
      {a.nilai_perolehan != null && <span className="text-gray-500"> · Rp {formatRupiah2(a.nilai_perolehan)}</span>}
      {a.status !== 'aktif' && <span className="text-amber-700"> (barang ini juga sudah dibatalkan — buka untuk menelusuri lebih lanjut)</span>}
    </li>
  )
}

export async function BannerPengganti({ admin, asetId, headerId }: { admin: Admin; asetId: string; headerId: string }) {
  const m = await muat(admin, asetId, headerId)
  if (!m) return null
  if ('pesan' in m) {
    return (
      <div className="kibar-no-print max-w-3xl mx-auto mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Barang ini sudah dibatalkan lewat Buka Kunci, tapi barang penggantinya gagal dicari — {m.pesan}
      </div>
    )
  }
  const { hasil, header } = m
  const dok = `${KATEGORI[header.kategori] || 'Cara Perolehan'}${header.no_sk ? ` No. ${header.no_sk}` : ''}`
  return (
    <div className="kibar-no-print max-w-3xl mx-auto mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-semibold">⚠ Nomor ini sudah tidak berlaku</p>
      <p className="mt-1">
        Dokumen <b>{dok}</b> pernah <b>dibuka kuncinya</b> untuk diperbaiki. Barang dengan NIBAR ini dibatalkan,
        dan saat dokumennya disetujui ulang barangnya <b>diterbitkan dengan NIBAR baru</b>.
      </p>
      {hasil.keadaan === 'belum_terbit' && (
        <p className="mt-2 text-amber-800">
          {header.approval_status === 'ditolak'
            ? 'Dokumen itu sudah diarsipkan — barangnya tidak diterbitkan ulang.'
            : 'Dokumen itu masih dalam perbaikan dan belum disetujui ulang, jadi NIBAR barunya belum terbit.'}
        </p>
      )}
      {hasil.keadaan === 'pasti' && (
        <>
          <p className="mt-2">Barang penggantinya:</p>
          <ul className="mt-0.5"><Barang a={hasil.pengganti} /></ul>
          <p className="text-xs text-amber-800">
            Dicocokkan lewat kode barang &amp; urutan nomor di dokumen yang sama.
            {hasil.semua.length > 1 && ` Dokumen ini memuat ${hasil.semua.length} barang.`}
          </p>
        </>
      )}
      {hasil.keadaan === 'kandidat' && (
        <>
          <p className="mt-2">
            Isi dokumennya berubah saat diperbaiki, jadi penggantinya tidak bisa dipastikan satu-satu.
            Barang yang diterbitkan ulang{hasil.kandidat.length < hasil.semua.length ? ' dengan kode barang yang sama' : ''}:
          </p>
          <ul className="mt-0.5 divide-y divide-amber-200">
            {hasil.kandidat.slice(0, 20).map(a => <Barang key={a.id} a={a} />)}
          </ul>
          {hasil.kandidat.length > 20 && <p className="text-xs text-amber-800">… dan {hasil.kandidat.length - 20} barang lainnya.</p>}
        </>
      )}
      <p className="mt-2 text-xs text-amber-800">Label yang menempel di barang sebaiknya dicetak ulang dari NIBAR yang baru.</p>
    </div>
  )
}
