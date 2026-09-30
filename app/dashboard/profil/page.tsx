'use client'
// Profil Pengguna (permintaan user 2026-10-01) — dibuka dari menu akun di
// TopBar. Tiga bagian dgn wewenang BERBEDA, dan bedanya disengaja:
//
// 1. Data pegawai (nama, NIP, pangkat/golongan, jabatan, JK) — HANYA DIBACA.
//    Itu data kepegawaian yang dicetak di lembar bertanda tangan (KIR, BA Rekon,
//    Surat Pernyataan); penyuntingnya admin di Daftar Pegawai, bukan pemilik akun.
// 2. Nomor HP — disunting pemilik akun SENDIRI lewat RPC `fn_profil_simpan_hp`
//    (migrasi 20261001_02), yang hanya menyentuh kolom `no_hp` pegawainya.
// 3. Ganti password — lewat Supabase Auth, dgn memverifikasi password lama dulu.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import AvatarPegawai, { jkPegawai } from '@/components/AvatarPegawai'
import EyeToggleButton from '@/shared/ui/EyeToggleButton'
import { ROLE_LABEL } from '@/lib/roles'
import { normalNoHp, tampilNoHp } from '@/lib/noHp'

type Pegawai = {
  id: string; nama: string; nip: string | null; pangkat: string | null; golongan: string | null
  jabatan: string | null; jenis_kelamin: string | null; no_hp: string | null
}
type Akun = { email: string; role: string; skpdNama: string | null; pegawai: Pegawai | null }

const DOMAIN_SINTETIS = '@pengguna.bmd.internal'
const PW_MIN = 8

function Baris({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm text-gray-800 mt-0.5">{children || <span className="text-gray-300">—</span>}</p>
    </div>
  )
}

function InputPassword({ label, value, onChange, autoComplete }: {
  label: string; value: string; onChange: (v: string) => void; autoComplete: string
}) {
  const [tampil, setTampil] = useState(false)
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <div className="relative">
        <input type={tampil ? 'text' : 'password'} className="select-filter w-full pr-9" value={value}
          autoComplete={autoComplete} onChange={e => onChange(e.target.value)} />
        <EyeToggleButton shown={tampil} onClick={() => setTampil(v => !v)} />
      </div>
    </div>
  )
}

export default function ProfilPage() {
  const supabase = createClient()
  const [akun, setAkun] = useState<Akun | null>(null)
  const [errMuat, setErrMuat] = useState('')

  const [hp, setHp] = useState('')
  const [hpBusy, setHpBusy] = useState(false)
  const [hpMsg, setHpMsg] = useState('')

  const [pwLama, setPwLama] = useState('')
  const [pwBaru, setPwBaru] = useState('')
  const [pwUlang, setPwUlang] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwMsg, setPwMsg] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const { data: { user }, error: eu } = await supabase.auth.getUser()
        if (eu || !user) throw new Error(eu?.message || 'belum login')
        const { data: p, error: ep } = await supabase.from('admin_profiles')
          .select('role, pegawai_id, skpd:admin_skpd(nama)').eq('id', user.id).maybeSingle()
        if (ep) throw new Error(ep.message)
        const prof = p as unknown as { role: string; pegawai_id: string | null; skpd: { nama: string } | null } | null
        let pegawai: Pegawai | null = null
        if (prof?.pegawai_id) {
          const { data: pg, error: eg } = await supabase.from('admin_pegawai')
            .select('id,nama,nip,pangkat,golongan,jabatan,jenis_kelamin,no_hp').eq('id', prof.pegawai_id).maybeSingle()
          if (eg) throw new Error(eg.message)
          pegawai = pg as Pegawai | null
        }
        setAkun({ email: user.email || '', role: prof?.role || '', skpdNama: prof?.skpd?.nama || null, pegawai })
        setHp(tampilNoHp(pegawai?.no_hp))
      } catch (e) {
        setErrMuat(e instanceof Error ? e.message : String(e))
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function simpanHp(e: React.FormEvent) {
    e.preventDefault()
    setHpMsg('')
    let nilai: string | null
    try { nilai = normalNoHp(hp) } catch (er) { setHpMsg(`Error: ${(er as Error).message}`); return }
    setHpBusy(true)
    try {
      const { data, error } = await supabase.rpc('fn_profil_simpan_hp', { p_no_hp: nilai })
      if (error) throw new Error(error.message)
      const tersimpan = (data as string | null) ?? null
      setAkun(a => a && a.pegawai ? { ...a, pegawai: { ...a.pegawai, no_hp: tersimpan } } : a)
      setHp(tampilNoHp(tersimpan))
      setHpMsg(tersimpan ? 'Nomor HP tersimpan.' : 'Nomor HP dihapus.')
    } catch (er) {
      setHpMsg(`Error: ${(er as Error).message}`)
    } finally {
      setHpBusy(false)
    }
  }

  async function gantiPassword(e: React.FormEvent) {
    e.preventDefault()
    setPwMsg('')
    if (!pwLama) { setPwMsg('Error: isi password lama.'); return }
    if (pwBaru.length < PW_MIN) { setPwMsg(`Error: password baru minimal ${PW_MIN} karakter.`); return }
    if (pwBaru === pwLama) { setPwMsg('Error: password baru harus berbeda dari yang lama.'); return }
    if (pwBaru !== pwUlang) { setPwMsg('Error: ulangi password baru — keduanya belum sama.'); return }
    if (!akun?.email) { setPwMsg('Error: akun tidak terbaca, muat ulang halaman.'); return }
    setPwBusy(true)
    try {
      // Verifikasi password lama dulu: sesi yang tertinggal terbuka di komputer
      // bersama tak boleh cukup untuk mengambil alih akun.
      const { error: el } = await supabase.auth.signInWithPassword({ email: akun.email, password: pwLama })
      if (el) throw new Error('Password lama salah.')
      const { error: eu } = await supabase.auth.updateUser({ password: pwBaru })
      if (eu) throw new Error(eu.message)
      // Keluarkan sesi di perangkat lain — gunanya ganti password justru itu.
      await supabase.auth.signOut({ scope: 'others' }).catch(() => undefined)
      setPwLama(''); setPwBaru(''); setPwUlang('')
      setPwMsg('Password berhasil diganti. Sesi di perangkat lain sudah dikeluarkan.')
    } catch (er) {
      setPwMsg(`Error: ${(er as Error).message}`)
    } finally {
      setPwBusy(false)
    }
  }

  const pg = akun?.pegawai
  const username = akun?.email.endsWith(DOMAIN_SINTETIS) ? akun.email.slice(0, -DOMAIN_SINTETIS.length) : akun?.email
  const pesan = (m: string) => m && (
    <p className={`text-xs mt-2 ${m.startsWith('Error') ? 'text-red-600' : 'text-green-700'}`}>{m}</p>
  )

  return (
    <FormShell judul="Profil Saya" deskripsi="Data diri, nomor HP, dan password akun Anda." msg="">
      {errMuat && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Gagal memuat profil: {errMuat}</div>}
      {!akun && !errMuat && <p className="text-sm text-gray-400">Memuat...</p>}

      {akun && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl">
          <div className="card p-5 lg:col-span-2 flex items-center gap-4">
            <AvatarPegawai jk={jkPegawai(pg?.jenis_kelamin, pg?.nip)} nama={pg?.nama || username || ''} />
            <div className="min-w-0">
              <p className="text-lg font-semibold text-gray-900 truncate">{pg?.nama || username}</p>
              <p className="text-xs text-gray-500">
                {ROLE_LABEL[akun.role] || akun.role || '—'}{akun.skpdNama ? ` · ${akun.skpdNama}` : ''}
              </p>
              <p className="text-xs text-gray-400">Username: {username}</p>
            </div>
          </div>

          <div className="card p-5">
            <p className="text-sm font-semibold text-gray-800 mb-3">Data Pegawai</p>
            {pg ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Baris label="Nama">{pg.nama}</Baris>
                  <Baris label="NIP">{pg.nip || 'Non-ASN'}</Baris>
                  <Baris label="Pangkat / Golongan">
                    {[pg.pangkat, pg.golongan].filter(Boolean).join(' — ')}
                  </Baris>
                  <Baris label="Jenis Kelamin">
                    {pg.jenis_kelamin === 'L' ? 'Laki-laki' : pg.jenis_kelamin === 'P' ? 'Perempuan' : ''}
                  </Baris>
                  <div className="col-span-2"><Baris label="Jabatan">{pg.jabatan}</Baris></div>
                </div>
                <p className="text-[11px] text-gray-400 mt-4">
                  Data kepegawaian dikelola Pengelola Barang di Admin → Daftar Pegawai. Kalau ada yang keliru,
                  hubungi admin — data ini ikut tercetak di dokumen bertanda tangan.
                </p>
              </>
            ) : (
              <p className="text-xs text-amber-700">
                Akun ini belum ditautkan ke data pegawai. Minta admin menautkannya di Admin → Daftar User.
              </p>
            )}
          </div>

          <div className="space-y-4">
            <form onSubmit={simpanHp} className="card p-5">
              <p className="text-sm font-semibold text-gray-800">Nomor HP (WhatsApp)</p>
              <p className="text-[11px] text-gray-400 mb-3">
                Dipakai untuk menghubungi Anda terkait BMD. Satu nomor hanya untuk satu pegawai.
              </p>
              <div className="flex gap-2">
                <input className="select-filter flex-1" value={hp} inputMode="tel" placeholder="0812-3456-7890"
                  disabled={!pg || hpBusy} onChange={e => setHp(e.target.value)} />
                <button type="submit" className="btn-primary text-sm" disabled={!pg || hpBusy}>
                  {hpBusy ? 'Menyimpan…' : 'Simpan'}
                </button>
              </div>
              {pesan(hpMsg)}
            </form>

            <form onSubmit={gantiPassword} className="card p-5 space-y-3">
              <p className="text-sm font-semibold text-gray-800">Ganti Password</p>
              <InputPassword label="Password lama" value={pwLama} onChange={setPwLama} autoComplete="current-password" />
              <InputPassword label={`Password baru (min. ${PW_MIN} karakter)`} value={pwBaru} onChange={setPwBaru} autoComplete="new-password" />
              <InputPassword label="Ulangi password baru" value={pwUlang} onChange={setPwUlang} autoComplete="new-password" />
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-gray-400">Lupa password? Minta admin mereset lewat Admin → Daftar User.</p>
                <button type="submit" className="btn-primary text-sm flex-shrink-0" disabled={pwBusy}>
                  {pwBusy ? 'Memproses…' : 'Ganti Password'}
                </button>
              </div>
              {pesan(pwMsg)}
            </form>
          </div>
        </div>
      )}
    </FormShell>
  )
}
