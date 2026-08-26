'use client'
// ============================================================================
// Pop-up penyusun "Berita Acara Rekonsiliasi" (Format V.2 Permendagri 47/2021).
//
// Yang ditanyakan di sini adalah hal-hal yang TIDAK ADA di basis data dan tak
// bisa disimpulkan aplikasi: nomor BA, tempat & tanggal penandatanganan, dan
// SIAPA yang bertindak sebagai PIHAK PERTAMA/KEDUA. Nama pegawai boleh dipilih
// dari master, tapi keempat isiannya tetap bisa disunting — nomenklatur jabatan
// tiap SKPD berbeda, dan Pelaksana Fungsi Akuntansi tidak terdaftar sebagai
// `role_bmd` sama sekali, jadi untuk varian itu tak ada yang bisa ditebak.
//
// ⚠️ Yang belum diisi DIBIARKAN bertitik-titik di lembarnya. Mengarang nama /
// nomor di dokumen yang akan ditandatangani jauh lebih berbahaya daripada
// titik-titik yang jelas belum diisi — aturan yang sama dipakai lembar RKBMD,
// Standar Harga, & Laporan Penerimaan BMD.
//
// Pilihannya disimpan di localStorage per (SKPD × varian) supaya CETAK ULANG
// menghasilkan lembar yang SAMA: berkas ini diteken lalu dipindai, jadi versi
// kedua yang berbeda bikin kacau (pola `bmd_rkbmd_ttd_skpd_<id>`).
// ============================================================================
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  VARIAN_BA, KOMPS_DARI, LABEL_CAKUPAN, fetchPegawaiBA, pangkatGol, pihakDariPegawai,
  pihakKosong, saranPihak, tanggalCutoff, varianInfo,
  type CakupanKomptabel, type KonfigBA, type PegawaiBA, type PihakBA, type VarianBA,
} from '@/lib/beritaAcaraRekon'

const KABUPATEN = 'Kediri'

const hariIni = () => {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

const kunciSimpanan = (skpdId: number | null, varian: VarianBA) =>
  `bmd_ba_rekon_${skpdId ?? 'kab'}_${varian}`

/** Isi localStorage itu data dari luar program (versi lama, suntingan manual,
 *  tab lain). Gagal mengurainya cukup berarti "belum pernah diisi" — jangan
 *  sampai menjatuhkan pop-upnya. */
function bacaSimpanan(skpdId: number | null, varian: VarianBA): Partial<KonfigBA> | null {
  try {
    const v = localStorage.getItem(kunciSimpanan(skpdId, varian))
    return v ? (JSON.parse(v) as Partial<KonfigBA>) : null
  } catch {
    return null
  }
}

function konfigAwal(varian: VarianBA, namaSkpd: string): KonfigBA {
  const v = varianInfo(varian)
  return {
    varian,
    // Neraca hanya memuat Intrakomptabel — itu angka yang direkonsiliasi dengan
    // akuntansi. Ekstrakomptabel disediakan sbg pilihan karena rekonsiliasi
    // antar pengurus barang sering memakai keduanya.
    cakupan: 'intra',
    // MATI secara bawaan (keputusan user 2026-08-26): lembar ini umumnya
    // dicetak di atas kertas yang SUDAH berkop, jadi kop yang ikut tercetak
    // menabrak kop aslinya. Barisnya tetap disiapkan supaya tinggal dinyalakan.
    pakaiKop: false,
    kop: ['PEMERINTAH KABUPATEN KEDIRI', namaSkpd || 'BADAN KEUANGAN DAN ASET DAERAH'],
    nomor: '',
    tempat: KABUPATEN,
    tanggal: hariIni(),
    pertama: pihakKosong(v.pertama.sebagai),
    kedua: pihakKosong(v.kedua.sebagai),
    catatanAwal: '',
    catatanAkhir: '',
    catatanTrx: '',
    lraKode: '',
    lraNilai: '',
  }
}

const Label = ({ children }: { children: ReactNode }) =>
  <label className="block text-xs font-medium text-gray-600 mb-1">{children}</label>

export default function BeritaAcaraRekonModal({
  skpdId, namaSkpd, descendantIds, periode, onClose, onCetak,
}: {
  skpdId: number | null
  namaSkpd: string
  descendantIds: number[] | null
  periode: string
  onClose: () => void
  onCetak: (konfig: KonfigBA) => void
}) {
  const supabase = createClient()
  const [konfig, setKonfig] = useState<KonfigBA>(() => konfigAwal('pengguna_pengelola', namaSkpd))
  const [pegawai, setPegawai] = useState<PegawaiBA[]>([])
  const [peringatan, setPeringatan] = useState('')
  const [memuat, setMemuat] = useState(true)
  // id pegawai yang sedang dipilih di dropdown — TIDAK ikut disimpan ke KonfigBA:
  // yang dicetak adalah keempat isian teksnya, dan itu boleh berbeda dari master
  // (operator memperbaiki jabatan yang belum diperbarui, misalnya).
  const [pilih, setPilih] = useState<{ pertama: string; kedua: string }>({ pertama: '', kedua: '' })

  const lingkup = useMemo(
    () => (descendantIds && descendantIds.length > 0 ? new Set(descendantIds) : skpdId != null ? new Set([skpdId]) : null),
    [descendantIds, skpdId],
  )

  useEffect(() => {
    void (async () => {
      try {
        setPegawai(await fetchPegawaiBA(supabase))
      } catch (e) {
        // Daftar pegawai cuma SARAN — kegagalannya tak boleh membatalkan
        // pembuatan BA, tapi juga tak boleh disembunyikan: daftar yang
        // diam-diam kosong terbaca sebagai "pegawainya belum terdaftar".
        setPeringatan(`Daftar pegawai gagal dimuat (${(e as Error).message}) — isi identitas kedua pihak secara manual.`)
      } finally {
        setMemuat(false)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Terapkan simpanan + saran begitu daftar pegawai siap (atau varian diganti).
  // Sengaja dipanggil dari handler & efek pertama, BUKAN efek ber-deps `konfig`
  // — kalau tidak, tiap ketikan operator akan ditimpa lagi oleh sarannya.
  function terapkanVarian(varian: VarianBA, daftar: PegawaiBA[]) {
    const v = varianInfo(varian)
    const simpan = bacaSimpanan(skpdId, varian)
    const dasar: KonfigBA = { ...konfigAwal(varian, namaSkpd), ...simpan, varian }
    const isi = (peran: typeof v.pertama, tersimpan: PihakBA): PihakBA => {
      if (tersimpan.nama) return { ...tersimpan, sebagai: tersimpan.sebagai || peran.sebagai }
      const s = saranPihak(daftar, peran, lingkup)
      return s ? pihakDariPegawai(s, peran.sebagai) : pihakKosong(peran.sebagai)
    }
    const pertama = isi(v.pertama, dasar.pertama)
    const kedua = isi(v.kedua, dasar.kedua)
    setKonfig({ ...dasar, pertama, kedua })
    setPilih({
      pertama: daftar.find(p => p.nama === pertama.nama)?.id ?? '',
      kedua: daftar.find(p => p.nama === kedua.nama)?.id ?? '',
    })
  }

  useEffect(() => {
    if (!memuat) terapkanVarian(konfig.varian, pegawai)
  }, [memuat]) // eslint-disable-line react-hooks/exhaustive-deps

  const v = varianInfo(konfig.varian)
  const set = (patch: Partial<KonfigBA>) => setKonfig(k => ({ ...k, ...patch }))
  const setPihak = (sisi: 'pertama' | 'kedua', patch: Partial<PihakBA>) =>
    setKonfig(k => (sisi === 'pertama'
      ? { ...k, pertama: { ...k.pertama, ...patch } }
      : { ...k, kedua: { ...k.kedua, ...patch } }))

  // Pegawai SKPD terpilih (& turunannya) didahulukan — PIHAK PERTAMA hampir
  // selalu dari sana, sementara PIHAK KEDUA sering dari BKAD.
  const daftarUrut = useMemo(() => {
    const skor = (p: PegawaiBA) => (p.skpd_id != null && lingkup?.has(p.skpd_id) ? 0 : 1)
    return [...pegawai].sort((a, b) => skor(a) - skor(b) || a.nama.localeCompare(b.nama))
  }, [pegawai, lingkup])

  function pilihPegawai(sisi: 'pertama' | 'kedua', id: string) {
    setPilih(s => (sisi === 'pertama' ? { ...s, pertama: id } : { ...s, kedua: id }))
    const p = daftarUrut.find(x => x.id === id)
    if (!p) return // "— isi manual —": biarkan isian yang sudah diketik
    setPihak(sisi, { nama: p.nama, nip: p.nip || '', pangkat: pangkatGol(p), jabatan: p.jabatan || '' })
  }

  const wajibSkpd = v.perSkpd && skpdId == null
  const bolehCetak = !wajibSkpd

  function cetak() {
    if (!bolehCetak) return
    try {
      localStorage.setItem(kunciSimpanan(skpdId, konfig.varian), JSON.stringify(konfig))
    } catch { /* kuota penuh / mode privat — lembarnya tetap boleh dicetak */ }
    onCetak(konfig)
  }

  const blokPihak = (sisi: 'pertama' | 'kedua', judul: string) => {
    const p = konfig[sisi]
    return (
      <div className="rounded-lg border border-gray-200 p-3">
        <p className="text-sm font-semibold text-gray-800 mb-2">{judul}</p>
        <div className="mb-2">
          <Label>Pilih dari daftar pegawai</Label>
          <select className="select-filter w-full" value={pilih[sisi]}
            onChange={e => pilihPegawai(sisi, e.target.value)}>
            <option value="">— isi manual —</option>
            {daftarUrut.map(x => (
              <option key={x.id} value={x.id}>
                {x.nama}{x.jabatan ? ` — ${x.jabatan}` : ''}
                {/* Penanda ini hanya berarti kalau ADA lingkup SKPD-nya. Tanpa
                    filter SKPD (varian se-kabupaten) semua orang "di luar", dan
                    menandai semuanya sama saja tak menandai apa pun. */}
                {lingkup && !(x.skpd_id != null && lingkup.has(x.skpd_id)) ? ' · luar SKPD' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <Label>Nama</Label>
            <input className="select-filter w-full" value={p.nama}
              onChange={e => setPihak(sisi, { nama: e.target.value })} />
          </div>
          <div>
            <Label>NIP</Label>
            <input className="select-filter w-full" value={p.nip}
              onChange={e => setPihak(sisi, { nip: e.target.value })} />
          </div>
          <div>
            <Label>Pangkat / Gol.</Label>
            <input className="select-filter w-full" value={p.pangkat}
              onChange={e => setPihak(sisi, { pangkat: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Jabatan</Label>
            <input className="select-filter w-full" value={p.jabatan}
              onChange={e => setPihak(sisi, { jabatan: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Bertindak sebagai</Label>
            <input className="select-filter w-full" value={p.sebagai}
              onChange={e => setPihak(sisi, { sebagai: e.target.value })} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="card w-full max-w-4xl my-8 bg-white">
        <div className="flex items-start justify-between px-5 py-3 border-b border-gray-100 gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Cetak Berita Acara Rekonsiliasi</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Format V.2 Permendagri 47/2021 · periode <b>{periode}</b> (per {tanggalCutoff(periode)})
              {namaSkpd ? <> · <b>{namaSkpd}</b></> : <> · <b>se-Kabupaten</b></>}
            </p>
          </div>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0" onClick={onClose}>×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {peringatan && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">{peringatan}</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Rekonsiliasi antara</Label>
              <select className="select-filter w-full" value={konfig.varian}
                onChange={e => terapkanVarian(e.target.value as VarianBA, pegawai)}>
                {VARIAN_BA.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                Mengganti pilihan ini memuat ulang identitas kedua pihak (tersimpan terpisah per varian).
              </p>
            </div>
            <div>
              <Label>Angka yang direkonsiliasi</Label>
              <select className="select-filter w-full" value={konfig.cakupan}
                onChange={e => set({ cakupan: e.target.value as CakupanKomptabel })}>
                {(Object.keys(KOMPS_DARI) as CakupanKomptabel[]).map(c => (
                  <option key={c} value={c}>{LABEL_CAKUPAN[c]}</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                Neraca hanya memuat Intrakomptabel — pakai itu untuk rekonsiliasi dengan akuntansi.
              </p>
            </div>
          </div>

          {wajibSkpd && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              Varian ini menghasilkan lembar <b>per SKPD</b> — kop surat &amp; lampirannya menyebut satu SKPD.
              Pilih dulu SKPD di filter Rekonsiliasi lalu tekan <b>Proses</b>, baru cetak BA-nya.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-2 text-xs font-medium text-gray-600 mb-1">
                <input type="checkbox" checked={konfig.pakaiKop}
                  onChange={e => set({ pakaiKop: e.target.checked })} />
                Cetak kop surat
              </label>
              <textarea className="select-filter w-full h-[72px] disabled:bg-gray-50 disabled:text-gray-400"
                disabled={!konfig.pakaiKop} value={(konfig.kop || []).join('\n')}
                onChange={e => set({ kop: e.target.value.split('\n') })} />
              <p className="text-[11px] text-gray-400 mt-1">
                Biarkan mati kalau dicetak di atas kertas yang sudah berkop — lembarnya langsung mulai
                dari judul “BERITA ACARA REKONSILIASI”.
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Nomor Berita Acara</Label>
                <input className="select-filter w-full" placeholder="mis. 028/    /418.__/2026"
                  value={konfig.nomor} onChange={e => set({ nomor: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Bertempat di</Label>
                  <input className="select-filter w-full" value={konfig.tempat}
                    onChange={e => set({ tempat: e.target.value })} />
                </div>
                <div>
                  <Label>Tanggal Berita Acara</Label>
                  <input type="date" className="select-filter w-full" value={konfig.tanggal}
                    onChange={e => set({ tanggal: e.target.value })} />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {blokPihak('pertama', `PIHAK PERTAMA — ${v.pertama.sebagai}`)}
            {blokPihak('kedua', `PIHAK KEDUA — ${v.kedua.sebagai}`)}
          </div>

          <details className="rounded-lg border border-gray-200 px-3 py-2">
            <summary className="text-sm font-medium text-gray-700 cursor-pointer">
              Catatan Hasil Rekonsiliasi &amp; baris LRA (opsional)
            </summary>
            <p className="text-[11px] text-gray-400 mt-2">
              Satu butir per baris. Dibiarkan kosong → lembarnya mencetak baris titik-titik untuk diisi tangan.
              Selisih yang belum terpetakan ke baris Format V.2 <b>selalu</b> ditambahkan otomatis di lampiran
              Saldo Akhir — jangan dihapus dari sana, itu satu-satunya tempat ia muncul.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
              <div>
                <Label>Catatan — Saldo Awal</Label>
                <textarea className="select-filter w-full h-16" value={konfig.catatanAwal}
                  onChange={e => set({ catatanAwal: e.target.value })} />
              </div>
              <div>
                <Label>Catatan — Saldo Akhir</Label>
                <textarea className="select-filter w-full h-16" value={konfig.catatanAkhir}
                  onChange={e => set({ catatanAkhir: e.target.value })} />
              </div>
              <div>
                <Label>Catatan — Lampiran transaksi</Label>
                <textarea className="select-filter w-full h-16" value={konfig.catatanTrx}
                  onChange={e => set({ catatanTrx: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <Label>Baris LRA — kode/uraian</Label>
                <input className="select-filter w-full" value={konfig.lraKode}
                  onChange={e => set({ lraKode: e.target.value })} />
              </div>
              <div>
                <Label>Baris LRA — nilai (Rp)</Label>
                <input className="select-filter w-full" value={konfig.lraNilai}
                  onChange={e => set({ lraNilai: e.target.value })} />
              </div>
            </div>
          </details>
        </div>

        {/* ⚠️ Tanggal, jam, judul tab, & URL di tepi hasil cetak itu HEADER/FOOTER
            BAWAAN PERAMBAN — halaman web TIDAK BISA menghapusnya lewat CSS
            (CLAUDE.md, bagian cetak RKBMD). Satu-satunya cara ya mematikannya di
            dialog Print, jadi petunjuknya ditaruh tepat di sebelah tombolnya
            alih-alih menghabiskan waktu mencari trik yang tidak ada. */}
        <div className="mx-5 mb-3 rounded-lg bg-sky-50 border border-sky-200 px-3 py-2 text-[11px] text-sky-800">
          Di dialog Print nanti, hilangkan centang <b>“Headers and footers”</b> supaya tanggal, jam,
          judul tab, dan alamat halaman tidak ikut tercetak di tepi lembar. Setelan itu milik peramban —
          tidak bisa dimatikan dari aplikasi.
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <p className="mr-auto text-[11px] text-gray-400">
            Isian yang dikosongkan tercetak sebagai titik-titik — tidak ditebak.
          </p>
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={cetak} disabled={!bolehCetak || memuat}
            title={wajibSkpd ? 'Pilih SKPD dulu di filter Rekonsiliasi' : undefined}>
            🖨 Cetak / Simpan PDF
          </button>
        </div>
      </div>
    </div>
  )
}
