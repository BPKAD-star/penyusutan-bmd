'use client'
// Penanda "ada transaksi sesudah barang ini diinventarisasi" + keterangan kunci
// posisi. Dipakai Lembar Kerja DAN Validasi supaya dua layar itu menyebut hal
// yang sama dengan kata yang sama.
//
// Sumbernya server: `fn_baris_berlaku_sesudah` (pasangan transaksi yang saling
// membatalkan sudah dibuang), dibandingkan dgn baris ledger TERAKHIR saat
// isiannya disimpan. Mengisi ulang lembar menyegarkan patokannya, jadi
// penandanya hilang begitu SKPD memperbarui isiannya.
import { useKonfirmasi } from '@/shared/ui/konfirmasi'
import { labelPosisi, labelTransaksi, type PosisiBerubah, type TransaksiSesudah as Trx } from '@/lib/inventarisasi'

export default function TransaksiSesudah({ transaksi, posisi, skpdBaru, golonganBaru }: {
  transaksi: Trx[]
  posisi?: PosisiBerubah | null
  skpdBaru?: string | null
  golonganBaru?: string | null
}) {
  const konfirmasi = useKonfirmasi()
  const pos = labelPosisi(posisi, skpdBaru, golonganBaru)
  if (transaksi.length === 0 && !pos) return null

  function buka() {
    void konfirmasi({
      nada: pos ? 'merah' : 'amber',
      ikon: pos ? '🔒' : '⚠',
      judul: pos ? 'Hasil inventarisasi ini terkunci' : 'Ada transaksi sesudah barang ini diinventarisasi',
      isi: (
        <div className="space-y-2">
          {pos && (
            <p>
              <b>{pos}.</b> Isian di posisi lama tidak bisa diubah, divalidasi, maupun dibatalkan
              validasinya. {posisi === 'keluar'
                ? 'Barangnya sudah tidak ada di Daftar Barang aktif.'
                : 'Di posisi barunya barang ini tampil "belum diinventarisasi" dan wajib diinventarisasi lagi.'}{' '}
              Kuncinya terbuka sendiri kalau barangnya kembali ke posisi semula.
            </p>
          )}
          {transaksi.length > 0 && (
            <>
              <p>Transaksi yang tercatat sesudah isian terakhir disimpan:</p>
              <ul className="list-disc ml-5 space-y-0.5">
                {transaksi.map((t, i) => <li key={i}>{labelTransaksi(t)}</li>)}
              </ul>
              {!pos && (
                <p className="text-gray-500">
                  Data barangnya mungkin sudah berbeda dari yang diperiksa petugas. Pengelola bisa
                  membatalkan validasi supaya SKPD mengisi ulang lembarnya.
                </p>
              )}
            </>
          )}
        </div>
      ),
      labelYa: 'Tutup',
      tanpaBatal: true,
    })
  }

  return (
    <button type="button" onClick={buka}
      className={`mt-1 block text-left text-[11px] font-medium hover:underline ${pos ? 'text-red-600' : 'text-amber-700'}`}>
      {pos ? `🔒 ${pos}` : `⚠ ${transaksi.length} transaksi sesudah diinventarisasi`}
    </button>
  )
}
