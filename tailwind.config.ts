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
