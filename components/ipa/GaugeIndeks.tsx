'use client'
// Gauge (speedometer) Indeks IPA — permintaan user 2026-09-25, mencontoh
// mockup lima-pita (merah·oranye·kuning·hijau muda·hijau) dgn jarum penunjuk
// & angka indeks di tengah lingkaran.
//
// Rentang SELALU 1–4 (skala Indeks baku aplikasi ini, lihat lib/ipa.ts
// `indeksDariSkor`), bukan 0–100 — supaya jarum & warnanya konsisten dgn
// KategoriPill/ambang yang sama persis dipakai di seluruh Dashboard IPA:
// Sangat Buruk <2,65 · Buruk <3,10 · Baik <3,55 · Sangat Baik ≥3,55.
// Lima pita di mockup dipetakan ke EMPAT kategori aplikasi ini (bukan lima) —
// menambah pita kelima tanpa kategori kelima cuma mengarang batas yang tak
// bisa dijelaskan di mana pun di aplikasi.
import { WARNA_KATEGORI, type KategoriIndeks } from '@/lib/ipa'

// Warna SVG (fill) kembar dgn kelas WARNA_KATEGORI (Tailwind, tak bisa dipakai
// langsung sbg atribut SVG `stop-color`/`fill`) — satu peta kecil di sini,
// bukan mem-parsing kelas Tailwind saat runtime.
const WARNA_SVG: Record<KategoriIndeks, string> = {
  'Sangat Buruk': '#ef4444', // red-500
  'Buruk': '#f59e0b', // amber-500
  'Baik': '#38bdf8', // sky-400
  'Sangat Baik': '#10b981', // emerald-500
}

const MIN = 1
const MAKS = 4
// Ambang PERSIS sama dgn kategoriDariSkor (skor 55/70/85 ≡ indeks 2,65/3,10/3,55).
const AMBANG = [2.65, 3.1, 3.55]
const URUTAN: KategoriIndeks[] = ['Sangat Buruk', 'Buruk', 'Baik', 'Sangat Baik']

/** Sudut (derajat, 0=kiri 180=kanan) untuk sebuah nilai indeks di rentang 1..4. */
function sudutUntuk(nilai: number): number {
  const v = Math.min(MAKS, Math.max(MIN, nilai))
  return ((v - MIN) / (MAKS - MIN)) * 180
}

function titikBusur(sudutDerajat: number, r: number, cx: number, cy: number) {
  // 0° = kiri (180° matematis), 180° = kanan (0° matematis) — searah jarum jam.
  const rad = ((180 - sudutDerajat) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) }
}

function segmenPath(dariV: number, keV: number, r: number, tebal: number, cx: number, cy: number): string {
  const a1 = sudutUntuk(dariV)
  const a2 = sudutUntuk(keV)
  const rLuar = r
  const rDalam = r - tebal
  const pLuar1 = titikBusur(a1, rLuar, cx, cy)
  const pLuar2 = titikBusur(a2, rLuar, cx, cy)
  const pDalam2 = titikBusur(a2, rDalam, cx, cy)
  const pDalam1 = titikBusur(a1, rDalam, cx, cy)
  const besar = a2 - a1 > 180 ? 1 : 0
  return [
    `M ${pLuar1.x} ${pLuar1.y}`,
    `A ${rLuar} ${rLuar} 0 ${besar} 1 ${pLuar2.x} ${pLuar2.y}`,
    `L ${pDalam2.x} ${pDalam2.y}`,
    `A ${rDalam} ${rDalam} 0 ${besar} 0 ${pDalam1.x} ${pDalam1.y}`,
    'Z',
  ].join(' ')
}

export function GaugeIndeks({ nilai, kategori, label, ukuran = 240 }: {
  /** Indeks 1–4, atau `null` kalau belum bisa dihitung (SKPD belum lengkap datanya). */
  nilai: number | null
  kategori: KategoriIndeks | null
  label: string
  ukuran?: number
}) {
  const w = ukuran
  const h = ukuran * 0.62
  const cx = w / 2
  const cy = h - 4
  const r = w / 2 - 12
  const tebal = r * 0.22

  const batas = [MIN, ...AMBANG, MAKS]
  const segmen = URUTAN.map((k, i) => ({ kategori: k, path: segmenPath(batas[i], batas[i + 1], r, tebal, cx, cy) }))

  const sudutJarum = nilai == null ? 90 : sudutUntuk(nilai)
  const panjangJarum = r - tebal - 6
  const ujungJarum = titikBusur(sudutJarum, panjangJarum, cx, cy)

  return (
    <div className="flex flex-col items-center">
      <svg width={w} height={h + 8} viewBox={`0 0 ${w} ${h + 8}`}>
        {segmen.map(s => <path key={s.kategori} d={s.path} fill={WARNA_SVG[s.kategori]} />)}
        {/* Poros jarum */}
        <circle cx={cx} cy={cy} r={6} fill="#1f2937" />
        {nilai != null && (
          <line x1={cx} y1={cy} x2={ujungJarum.x} y2={ujungJarum.y} stroke="#1f2937" strokeWidth={3} strokeLinecap="round" />
        )}
      </svg>
      <div className="-mt-2 text-center">
        <p className="text-3xl font-bold text-gray-900 tabular-nums">{nilai == null ? '—' : nilai.toFixed(2)}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
        {kategori && <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${WARNA_KATEGORI[kategori]}`}>{kategori}</span>}
        {!kategori && nilai == null && <span className="inline-block mt-1 text-xs text-amber-600">Belum dapat dihitung</span>}
      </div>
    </div>
  )
}
