import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    // ⚠️ WAJIB. Kelas Tailwind yang HANYA dipakai di berkas luar daftar ini
    // tidak pernah ikut ter-generate ke CSS — komponennya tetap dirender, cuma
    // tampil telanjang, TANPA satu pun error di konsol maupun saat build.
    // Terjadi 2026-08-19: KonfirmasiModal pindah ke shared/ui/ dan pop-upnya
    // muncul tanpa latar gelap sama sekali, menumpuk di atas isi halaman.
    // Sebelum itu shared/ isinya cuma logika (paginate/assertOk/useAsyncData)
    // tanpa JSX ber-kelas, jadi lubangnya tak pernah kelihatan.
    // Menambah folder ber-JSX baru → daftarkan di sini juga.
    './shared/**/*.{ts,tsx}',
    // ⚠️ WAJIB juga — insiden 2026-09-23: `WARNA_BAND_PEMANFAATAN` (warna bar
    // persentase Laporan Pemanfaatan) hidup di lib/pemanfaatan.ts sbg string
    // kelas ('bg-green-500' dkk), dan tanpa baris ini Tailwind TAK PERNAH
    // men-generate-nya — bar tampil TANPA WARNA SAMA SEKALI, tanpa satu pun
    // error. `lib/` memang murni logika, tapi beberapa berkas (di sini &
    // usulanPengurus.ts/rkbmdStandarUsulan.ts/rkbmd.ts/inventarisasi.ts)
    // menaruh string kelas Tailwind bersebelahan dgn fungsi murninya (satu
    // sumber warna+aturan, pola yang sama dgn `bandPemanfaatan`). Kalau lib/
    // BENAR-BENAR tak pernah lagi menaruh string kelas, baris ini boleh
    // dicabut — tapi verifikasi dulu (grep `bg-\w\|text-\w.*-[0-9]` ke lib/).
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy:  { DEFAULT: '#1e3a5f', light: '#274d7e', dark: '#152a45' },
        teal:  { DEFAULT: '#0d9488', light: '#14b8a6' },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      keyframes: {
        'bubble-in': {
          '0%':   { opacity: '0', transform: 'scale(0.85)' },
          '60%':  { opacity: '1', transform: 'scale(1.03)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'bubble-out': {
          '0%':   { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.85)' },
        },
        'fade-in':  { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'fade-out': { '0%': { opacity: '1' }, '100%': { opacity: '0' } },
      },
      animation: {
        'bubble-in':  'bubble-in 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'bubble-out': 'bubble-out 0.16s ease-in forwards',
        'fade-in':    'fade-in 0.2s ease-out forwards',
        'fade-out':   'fade-out 0.16s ease-in forwards',
      },
    },
  },
  plugins: [],
}
export default config
