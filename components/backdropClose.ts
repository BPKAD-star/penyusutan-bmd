// Penutup modal "klik di luar" yang TIDAK ikut tertutup saat user memblok teks.
//
// MASALAHNYA perilaku bawaan browser, bukan bug React: event `click` dipicu pada
// LELUHUR BERSAMA antara elemen tempat tombol mouse ditekan dan tempat dilepas.
// Jadi kalau user menekan mouse di dalam <input> lalu menyeret keluar kotak
// modal untuk memblok teks, `mouseup`-nya mendarat di backdrop → leluhur
// bersamanya = backdrop itu sendiri → `onClick={onClose}` ikut terpicu dan
// modal tertutup padahal user cuma sedang menyeleksi teks. Ketikan yang belum
// disimpan hilang begitu saja.
//
// OBATNYA: ingat DI MANA tombol mouse mulai ditekan. Modal hanya ditutup kalau
// tekan DAN lepas sama-sama terjadi di backdrop (area gelap di luar kartu).
//
// Sengaja BUKAN React hook (`useBackdropClose`) walau butuh "ingatan": banyak
// modal di repo ini punya early-return (`if (!open) return null`) SEBELUM
// JSX-nya, jadi hook yang dipanggil di dalam JSX akan terlewat di sebagian
// render → urutan hook berubah → React melempar "Rendered fewer hooks than
// expected". Fungsi biasa + flag di scope modul aman karena interaksi tetikus
// itu serial: cuma ada satu kursor, dan tiap `mousedown` menimpa flag-nya —
// modal bertumpuk pun tetap benar.
import type { MouseEvent } from 'react'

let mulaiDiBackdrop = false

/**
 * Props untuk elemen backdrop modal. Pakai sebagai pengganti `onClick={onClose}`:
 *
 *   <div className="fixed inset-0 ..." {...backdropClose(onClose)}>
 *
 * Tombol × dan tombol Batal tetap memanggil `onClose` langsung — jalur itu tak
 * terpengaruh.
 */
export function backdropClose(onClose: () => void) {
  return {
    onMouseDown: (e: MouseEvent) => {
      // `currentTarget` = backdrop; `target` = elemen terdalam yang ditekan.
      // Sama artinya: user menekan di area gelap, bukan di dalam kartu modal.
      mulaiDiBackdrop = e.target === e.currentTarget
    },
    onClick: (e: MouseEvent) => {
      if (!mulaiDiBackdrop || e.target !== e.currentTarget) return
      mulaiDiBackdrop = false
      onClose()
    },
  }
}
