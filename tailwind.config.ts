import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
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
    },
  },
  plugins: [],
}
export default config
