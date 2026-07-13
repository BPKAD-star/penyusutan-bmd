// Role 3 tingkat (migrasi 20260713_04):
//   'admin'             = Pengelola Barang (admin pemda / BKAD, super admin)
//   'pengurus_barang'   = Pengurus Barang (admin SKPD, node SKPD induk)
//   'pengurus_pembantu' = Pengurus Barang Pembantu (operator sub-OPD)
// Satu-satunya beda fungsional tingkat 2 vs 3: pengurus_barang boleh approve
// (setujui/buka kunci/arsip) jurnal Cara Perolehan milik sub-OPD STRICT di
// bawah node SKPD-nya. Jurnal SKPD-nya sendiri tetap wewenang admin pemda.
// Penegak sesungguhnya = trigger fn_jurnal_header_approval_guard di DB
// (fn_is_pengurus_barang_atas) — helper di sini cuma buat UI (render tombol).
import type { SupabaseClient } from '@supabase/supabase-js'

export const ROLE_LABEL: Record<string, string> = {
  admin: 'Pengelola Barang (Admin Pemda)',
  pengurus_barang: 'Pengurus Barang (SKPD)',
  pengurus_pembantu: 'Pengurus Barang Pembantu',
}
export const ROLE_VALUES = ['admin', 'pengurus_barang', 'pengurus_pembantu'] as const

export type ApprovalScope = {
  isAdmin: boolean
  role: string | null
  skpdId: number | null
  /** id SKPD STRICT di bawah node user (node sendiri TIDAK termasuk) — hanya diisi utk pengurus_barang. */
  bawahan: Set<number>
}
export const SCOPE_KOSONG: ApprovalScope = { isAdmin: false, role: null, skpdId: null, bawahan: new Set() }

/** Ambil role + (utk pengurus_barang) daftar sub-OPD di bawah nodenya — sekali per mount. */
export async function fetchApprovalScope(supabase: SupabaseClient): Promise<ApprovalScope> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return SCOPE_KOSONG
  const { data: p } = await supabase.from('admin_profiles').select('role,skpd_id').eq('id', user.id).single()
  if (!p) return SCOPE_KOSONG
  const scope: ApprovalScope = { isAdmin: p.role === 'admin', role: p.role, skpdId: p.skpd_id, bawahan: new Set() }
  if (p.role === 'pengurus_barang' && p.skpd_id != null) {
    // Turunan dihitung dari parent_id (BFS) — cukup id+parent_id, ~ratusan baris.
    const { data: rows } = await supabase.from('admin_skpd').select('id,parent_id').limit(5000)
    const anak = new Map<number, number[]>()
    for (const r of (rows || []) as { id: number; parent_id: number | null }[]) {
      if (r.parent_id != null) {
        const a = anak.get(r.parent_id) || []
        a.push(r.id)
        anak.set(r.parent_id, a)
      }
    }
    const antri = [...(anak.get(Number(p.skpd_id)) || [])]
    while (antri.length) {
      const id = antri.pop()!
      scope.bawahan.add(id)
      antri.push(...(anak.get(id) || []))
    }
  }
  return scope
}

/** Boleh approve jurnal milik SKPD ini? (admin = semua; pengurus_barang = sub-OPD-nya saja) */
export function bolehSetujuiSkpd(scope: ApprovalScope, skpdId: number | string | null | undefined): boolean {
  if (scope.isAdmin) return true
  if (skpdId == null || skpdId === '') return false
  return scope.bawahan.has(Number(skpdId))
}
