'use client'
// Pengaturan IPA — hanya Admin Pemda (Pengelola Barang), ditegakkan RLS
// (`*_write` = fn_is_admin). Nilai awal = berkas Simulasi_IPA_Kabupaten_Kediri
// .xlsx; Excel sendiri menyebutnya "ilustratif", jadi semua bisa diubah di sini.
//
// ⚠️ Bobot TIDAK berversi per tahun: mengubahnya menggeser skor tahun-tahun yang
// sudah lewat juga saat dibuka ulang. Ubah di awal tahun penilaian.
import { Fragment, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncData } from '@/shared/ui/useAsyncData'
import { useProfilRole } from '@/components/useProfilRole'
import { useKonfirmasi, konfirmasiGagal } from '@/shared/ui/konfirmasi'
import { ASPEK_URUT, KLASTER_URUT, totalBobot, type KodeAspek, type KodeKlaster } from '@/lib/ipa'
import { muatPeriodeRekon, muatReferensi, type PeriodeRekon, type Referensi } from '@/lib/ipaData'
import { PesanError, PilihTahunBulan, TAHUN_INI } from '@/components/ipa/ipaUi'

type Muatan = { ref: Referensi; periode: PeriodeRekon[] }
const persen = (x: number) => Math.round(x * 10000) / 100

export default function PengaturanIpa() {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const { role } = useProfilRole()
  const [tahun, setTahun] = useState(TAHUN_INI)
  const [muatKe, setMuatKe] = useState(0)
  const { data, error, run } = useAsyncData<Muatan>()

  useEffect(() => {
    void run(async () => ({ ref: await muatReferensi(supabase), periode: await muatPeriodeRekon(supabase, tahun) }))
  }, [tahun, muatKe, run]) // eslint-disable-line react-hooks/exhaustive-deps

  const muatUlang = () => setMuatKe(k => k + 1)
  async function tulis(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    const { error: e } = await fn()
    if (e) { await konfirmasiGagal(konfirmasi, e.message); return false }
    return true
  }

  if (role && role !== 'admin') {
    return <div className="p-6"><div className="card p-6 text-sm text-gray-600">Pengaturan IPA hanya untuk Pengelola Barang (Admin Pemda).</div></div>
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pengaturan IPA</h1>
        <p className="text-gray-500 text-sm mt-1">Klaster SKPD, bobot aspek & indikator, parameter, dan periode rekonsiliasi.</p>
      </div>
      <PesanError pesan={error} />
      {data && (
        <>
          <BobotAspekEditor ref_={data.ref} tulis={tulis} onSimpan={muatUlang} />
          <BobotIndikatorEditor ref_={data.ref} tulis={tulis} onSimpan={muatUlang} />
          <ParameterEditor ref_={data.ref} tulis={tulis} onSimpan={muatUlang} />
          <div className="card">
            <div className="p-4 border-b border-gray-100 flex items-end justify-between gap-4">
              <div>
                <p className="font-semibold text-gray-900">Periode rekonsiliasi</p>
                <p className="text-xs text-gray-500">Penyebut indikator Ketepatan Waktu Rekonsiliasi = periode yang batasnya sudah lewat. Batas boleh jatuh di tahun berikutnya (mis. rekon Desember dilaksanakan Januari) — periodenya tetap dinilai di tahun ini.</p>
              </div>
              <PilihTahunBulan tahun={tahun} onTahun={setTahun} />
            </div>
            <PeriodeRekonEditor tahun={tahun} periode={data.periode} tulis={tulis} onSimpan={muatUlang} />
          </div>
          <KlasterEditor ref_={data.ref} tulis={tulis} onSimpan={muatUlang} />
        </>
      )}
    </div>
  )
}

type Tulis = (fn: () => PromiseLike<{ error: { message: string } | null }>) => Promise<boolean>

function BobotAspekEditor({ ref_, tulis, onSimpan }: { ref_: Referensi; tulis: Tulis; onSimpan: () => void }) {
  const supabase = createClient()
  const [nilai, setNilai] = useState(() => Object.fromEntries(KLASTER_URUT.map(k =>
    [k, Object.fromEntries(ASPEK_URUT.map(a => [a, String(persen(ref_.bobotAspek[k][a] ?? 0))]))])) as Record<KodeKlaster, Record<KodeAspek, string>>)
  const total = (k: KodeKlaster) => totalBobot(ASPEK_URUT.map(a => Number(nilai[k][a]) || 0))
  const semuaPas = KLASTER_URUT.every(k => Math.abs(total(k) - 100) < 0.001)

  async function simpan() {
    const rows = KLASTER_URUT.flatMap(k => ASPEK_URUT.map(a => ({ klaster: k, aspek: a, bobot: (Number(nilai[k][a]) || 0) / 100 })))
    if (await tulis(() => supabase.from('ipa_bobot_aspek').upsert(rows))) onSimpan()
  }
  return (
    <div className="card">
      <div className="p-4 border-b border-gray-100">
        <p className="font-semibold text-gray-900">Bobot aspek per klaster (%)</p>
        <p className="text-xs text-gray-500">Tiap klaster wajib berjumlah 100%.</p>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50"><tr>
          <th className="table-th">Aspek</th>
          {KLASTER_URUT.map(k => <th key={k} className="table-th text-right">Klaster {k}</th>)}
        </tr></thead>
        <tbody>
          {ref_.aspek.map(a => (
            <tr key={a.kode} className="border-t border-gray-50">
              <td className="table-td">{a.nama}</td>
              {KLASTER_URUT.map(k => (
                <td key={k} className="table-td text-right">
                  <input type="number" min={0} max={100} step="0.01" className="select-filter w-24 text-right py-1"
                    value={nilai[k][a.kode]} onChange={e => setNilai(v => ({ ...v, [k]: { ...v[k], [a.kode]: e.target.value } }))} />
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t border-gray-200 font-semibold">
            <td className="table-td">Total</td>
            {KLASTER_URUT.map(k => (
              <td key={k} className={`table-td text-right ${Math.abs(total(k) - 100) < 0.001 ? 'text-emerald-700' : 'text-red-600'}`}>{total(k)}%</td>
            ))}
          </tr>
        </tbody>
      </table>
      <div className="p-4 flex justify-end gap-3 items-center">
        {!semuaPas && <span className="text-xs text-red-600">Setiap klaster harus total 100%.</span>}
        <button className="btn-primary disabled:opacity-50" disabled={!semuaPas} onClick={simpan}>Simpan bobot aspek</button>
      </div>
    </div>
  )
}

function BobotIndikatorEditor({ ref_, tulis, onSimpan }: { ref_: Referensi; tulis: Tulis; onSimpan: () => void }) {
  const supabase = createClient()
  const [nilai, setNilai] = useState(() => Object.fromEntries(ref_.indikator.map(i => [i.kode, String(persen(i.bobot))])))
  const total = (a: KodeAspek) => totalBobot(ref_.indikator.filter(i => i.aspek === a).map(i => Number(nilai[i.kode]) || 0))
  const semuaPas = ASPEK_URUT.every(a => Math.abs(total(a) - 100) < 0.001)

  async function simpan() {
    for (const i of ref_.indikator) {
      const ok = await tulis(() => supabase.from('ipa_indikator').update({ bobot: (Number(nilai[i.kode]) || 0) / 100 }).eq('kode', i.kode))
      if (!ok) return
    }
    onSimpan()
  }
  return (
    <div className="card">
      <div className="p-4 border-b border-gray-100">
        <p className="font-semibold text-gray-900">Bobot indikator di dalam aspek (%)</p>
        <p className="text-xs text-gray-500">Tiap aspek wajib berjumlah 100%. Indikator yang N/A dikeluarkan & bobotnya dibagi ulang otomatis.</p>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {ref_.aspek.map(a => (
            <Fragment key={a.kode}>
              <tr className="bg-gray-50">
                <td className="table-td font-semibold">{a.nama}</td>
                <td className={`table-td text-right text-xs font-semibold ${Math.abs(total(a.kode) - 100) < 0.001 ? 'text-emerald-700' : 'text-red-600'}`}>Total {total(a.kode)}%</td>
              </tr>
              {ref_.indikator.filter(i => i.aspek === a.kode).map(i => (
                <tr key={i.kode} className="border-t border-gray-50">
                  <td className="table-td pl-8">{i.nama}</td>
                  <td className="table-td text-right">
                    <input type="number" min={0} max={100} step="0.01" className="select-filter w-24 text-right py-1"
                      value={nilai[i.kode]} onChange={e => setNilai(v => ({ ...v, [i.kode]: e.target.value }))} />
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
      <div className="p-4 flex justify-end gap-3 items-center">
        {!semuaPas && <span className="text-xs text-red-600">Setiap aspek harus total 100%.</span>}
        <button className="btn-primary disabled:opacity-50" disabled={!semuaPas} onClick={simpan}>Simpan bobot indikator</button>
      </div>
    </div>
  )
}

function ParameterEditor({ ref_, tulis, onSimpan }: { ref_: Referensi; tulis: Tulis; onSimpan: () => void }) {
  const supabase = createClient()
  const [nilai, setNilai] = useState(() => Object.fromEntries(ref_.parameterBaris.map(p => [p.kunci, String(p.nilai)])))
  async function simpan() {
    for (const p of ref_.parameterBaris) {
      const n = Number(nilai[p.kunci])
      if (!Number.isFinite(n) || n < 0) return
      if (n === p.nilai) continue
      if (!(await tulis(() => supabase.from('ipa_parameter').update({ nilai: n }).eq('kunci', p.kunci)))) return
    }
    onSimpan()
  }
  return (
    <div className="card">
      <div className="p-4 border-b border-gray-100 font-semibold text-gray-900">Parameter</div>
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ref_.parameterBaris.map(p => (
          <label key={p.kunci} className="block text-xs text-gray-500">
            {p.keterangan}
            <input type="number" min={0} className="select-filter w-full mt-1" value={nilai[p.kunci]}
              onChange={e => setNilai(v => ({ ...v, [p.kunci]: e.target.value }))} />
          </label>
        ))}
      </div>
      <div className="px-4 pb-4 flex justify-end"><button className="btn-primary" onClick={simpan}>Simpan parameter</button></div>
    </div>
  )
}

function PeriodeRekonEditor({ tahun, periode, tulis, onSimpan }: { tahun: number; periode: PeriodeRekon[]; tulis: Tulis; onSimpan: () => void }) {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const [nama, setNama] = useState('')
  const [batas, setBatas] = useState('')
  async function tambah() {
    if (!nama.trim() || !batas) return
    // Batas boleh jatuh di tahun BERIKUTNYA (keputusan user 2026-09-25): rekon
    // bulan Desember baru bisa dilaksanakan Januari. Periodenya tetap milik
    // tahun penilaian ini — `ipa_rekon_periode.tahun` yang menentukan, bukan
    // tahun batasnya — jadi indikatornya ikut terhitung di IPA tahun ini begitu
    // batasnya lewat.
    if (batas < `${tahun}-01-01` || batas > `${tahun + 1}-12-31`) {
      await konfirmasiGagal(konfirmasi, `Batas tanggal harus di tahun ${tahun} atau ${tahun + 1}.`, 'Tanggal tidak sah'); return
    }
    if (await tulis(() => supabase.from('ipa_rekon_periode').insert({ tahun, nama: nama.trim(), batas_tanggal: batas }))) {
      setNama(''); setBatas(''); onSimpan()
    }
  }
  async function hapus(p: PeriodeRekon) {
    const hasil = await konfirmasi({
      judul: `Hapus periode "${p.nama}"?`, nada: 'merah', labelYa: 'Hapus',
      isi: 'Seluruh isian pelaksanaan SKPD untuk periode ini ikut terhapus.',
    })
    if (hasil.ya && await tulis(() => supabase.from('ipa_rekon_periode').delete().eq('id', p.id))) onSimpan()
  }
  return (
    <div>
      <table className="w-full text-sm">
        <tbody>
          {periode.length === 0 && <tr><td className="table-td text-gray-400">Belum ada periode untuk {tahun}.</td></tr>}
          {periode.map(p => (
            <tr key={p.id} className="border-t border-gray-50">
              <td className="table-td">{p.nama}</td>
              <td className="table-td text-gray-500">Batas {p.batas_tanggal}</td>
              <td className="table-td text-right"><button className="text-xs text-red-600 hover:underline" onClick={() => hapus(p)}>Hapus</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-4 flex flex-wrap gap-2 items-end border-t border-gray-100">
        <label className="text-xs text-gray-500">Nama periode
          <input className="select-filter block mt-1 w-64" placeholder="mis. Rekonsiliasi Semester I" value={nama} onChange={e => setNama(e.target.value)} />
        </label>
        <label className="text-xs text-gray-500">Batas tanggal
          <input type="date" className="select-filter block mt-1" value={batas} min={`${tahun}-01-01`} max={`${tahun + 1}-12-31`} onChange={e => setBatas(e.target.value)} />
        </label>
        <button className="btn-primary disabled:opacity-50" disabled={!nama.trim() || !batas} onClick={tambah}>+ Tambah periode</button>
      </div>
    </div>
  )
}

function KlasterEditor({ ref_, tulis, onSimpan }: { ref_: Referensi; tulis: Tulis; onSimpan: () => void }) {
  const supabase = createClient()
  const [cari, setCari] = useState('')
  const rows = useMemo(() => ref_.skpd.filter(s => !cari || s.nama.toLowerCase().includes(cari.toLowerCase())), [ref_, cari])
  const hitung = Object.fromEntries(KLASTER_URUT.map(k => [k, ref_.skpd.filter(s => s.klaster === k).length]))
  return (
    <div className="card">
      <div className="p-4 border-b border-gray-100 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-semibold text-gray-900">Klaster & cakupan SKPD</p>
          <p className="text-xs text-gray-500">
            A {hitung.A} · B {hitung.B} · C {hitung.C} · D {hitung.D}.
            {' '}"Sertakan unit di bawahnya" = data seluruh sub-unit ikut dihitung (bawaan: hanya Sekretariat Daerah & Kecamatan Pare).
          </p>
        </div>
        <input className="select-filter w-64" placeholder="Cari SKPD…" value={cari} onChange={e => setCari(e.target.value)} />
      </div>
      <div className="max-h-[32rem] overflow-y-auto">
        <table className="w-full text-sm">
          <tbody>
            {rows.map(s => (
              <tr key={s.skpd_id} className="border-t border-gray-50">
                <td className="table-td">{s.nama}</td>
                <td className="table-td">
                  <select className="select-filter py-1" value={s.klaster}
                    onChange={async e => { if (await tulis(() => supabase.from('ipa_skpd').update({ klaster: e.target.value }).eq('skpd_id', s.skpd_id))) onSimpan() }}>
                    {KLASTER_URUT.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </td>
                <td className="table-td">
                  <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input type="checkbox" checked={s.sertakan_turunan}
                      onChange={async e => { if (await tulis(() => supabase.from('ipa_skpd').update({ sertakan_turunan: e.target.checked }).eq('skpd_id', s.skpd_id))) onSimpan() }} />
                    Sertakan unit di bawahnya
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
