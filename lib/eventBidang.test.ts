import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  normalisasiUrl, hostTautan, daftarTahunEvent, berkasEvent, urutEvent, ringkasEvent, AKSEP_BERKAS_EVENT,
  type EventBidang, type BerkasEvent,
} from './eventBidang'

const brk = (p: Partial<BerkasEvent>): BerkasEvent => ({
  id: 'b', event_id: 'e', jenis: 'materi', judul: 'x', keterangan: null, url: null, file_path: null,
  created_at: '2026-01-01T00:00:00Z', ...p,
})
const ev = (p: Partial<EventBidang>): EventBidang => ({
  id: 'e', nama: 'Bimtek', tanggal: '2026-03-10', tempat: null, keterangan: null,
  created_at: '2026-03-01T00:00:00Z', berkas: [], ...p,
})

describe('normalisasiUrl', () => {
  it('menerima tautan Drive apa adanya', () => {
    const u = 'https://drive.google.com/drive/folders/1AbC?usp=sharing'
    expect(normalisasiUrl(`  ${u} `)).toBe(u)
  })
  it('melengkapi skema yang terpotong', () => {
    expect(normalisasiUrl('drive.google.com/file/d/1/view')).toBe('https://drive.google.com/file/d/1/view')
  })
  it('MENOLAK skema berbahaya & non-http', () => {
    expect(normalisasiUrl('javascript:alert(1)')).toBeNull()
    expect(normalisasiUrl('data:text/html,<b>x</b>')).toBeNull()
    expect(normalisasiUrl('ftp://drive.google.com/x')).toBeNull()
  })
  it('menolak kosong, spasi di tengah, & host tanpa titik', () => {
    expect(normalisasiUrl('')).toBeNull()
    expect(normalisasiUrl('   ')).toBeNull()
    expect(normalisasiUrl('https://drive google.com')).toBeNull()
    expect(normalisasiUrl('https://abc')).toBeNull()
  })
  it('hasil yang lolos selalu memenuhi regex CHECK di DB', () => {
    for (const s of ['https://a.b/c', 'a.b/c', 'http://x.id/?q=1#h']) {
      expect(normalisasiUrl(s)).toMatch(/^https?:\/\/\S+$/i)
    }
  })
})

describe('urut & ringkas', () => {
  it('event terbaru dulu, urutan total', () => {
    const a = ev({ id: 'a', tanggal: '2026-01-05' })
    const b = ev({ id: 'b', tanggal: '2026-09-01' })
    const c = ev({ id: 'c', tanggal: '2026-09-01' })
    expect([a, c, b].sort(urutEvent).map(e => e.id)).toEqual(['b', 'c', 'a'])
    expect([b, a, c].sort(urutEvent).map(e => e.id)).toEqual(['b', 'c', 'a'])
  })
  it('daftar tahun unik, terbaru dulu', () => {
    expect(daftarTahunEvent([ev({ tanggal: '2025-02-01' }), ev({ tanggal: '2026-02-01' }), ev({ tanggal: '2026-07-01' })]))
      .toEqual([2026, 2025])
  })
  it('materi & dokumentasi dipisah, urut waktu dibuat', () => {
    const e = ev({ berkas: [
      brk({ id: '2', jenis: 'materi', created_at: '2026-01-02T00:00:00Z' }),
      brk({ id: '1', jenis: 'materi', created_at: '2026-01-01T00:00:00Z' }),
      brk({ id: '3', jenis: 'dokumentasi' }),
    ] })
    expect(berkasEvent(e, 'materi').map(b => b.id)).toEqual(['1', '2'])
    expect(berkasEvent(e, 'dokumentasi').map(b => b.id)).toEqual(['3'])
    expect(ringkasEvent(e)).toBe('2 materi · 1 dokumentasi')
  })
  it('hostTautan', () => {
    expect(hostTautan('https://www.drive.google.com/x')).toBe('drive.google.com')
  })
})

describe('kembaran dengan migrasi 20261011_01', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261011_01_event_bidang.sql'), 'utf8')
  it('ekstensi yang diterima form punya padanan mime di bucket', () => {
    const pasangan: Record<string, string> = {
      pdf: 'application/pdf', ppt: 'application/vnd.ms-powerpoint',
      pptx: 'presentationml.presentation', doc: 'application/msword', docx: 'wordprocessingml.document',
      xls: 'application/vnd.ms-excel', xlsx: 'spreadsheetml.sheet',
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    }
    const ekstensi = AKSEP_BERKAS_EVENT.split(',').map(x => x.replace('.', ''))
    expect(ekstensi.sort()).toEqual(Object.keys(pasangan).sort())
    for (const e of ekstensi) expect(sql, e).toContain(pasangan[e])
  })
  it('jenis berkas = dua nilai yang sama di DB', () => {
    expect(sql).toContain(`jenis in ('materi', 'dokumentasi')`)
  })
})
