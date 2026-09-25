import { Suspense } from 'react'
import CapaianIpa from '@/components/ipa/CapaianIpa'

// Suspense wajib: CapaianIpa membaca ?skpd= lewat useSearchParams.
export default function IpaCapaianPage() {
  return <Suspense fallback={<div className="p-6 text-sm text-gray-400">Memuat…</div>}><CapaianIpa /></Suspense>
}
