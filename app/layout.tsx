import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BMD | Kabupaten Kediri',
  description: 'Sistem Pengelolaan Barang Milik Daerah Kabupaten Kediri',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}
