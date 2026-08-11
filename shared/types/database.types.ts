export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_broadcast: {
        Row: {
          aktif: boolean
          created_at: string
          dibuat_oleh: string | null
          id: string
          isi: string
          judul: string
          updated_at: string
        }
        Insert: {
          aktif?: boolean
          created_at?: string
          dibuat_oleh?: string | null
          id?: string
          isi: string
          judul: string
          updated_at?: string
        }
        Update: {
          aktif?: boolean
          created_at?: string
          dibuat_oleh?: string | null
          id?: string
          isi?: string
          judul?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_dokumen: {
        Row: {
          created_at: string
          file_path: string
          id: string
          judul: string
          keterangan: string | null
          siklus: string
          skpd_id: number | null
          sub_jenis: string | null
          tahun: number
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_path: string
          id?: string
          judul: string
          keterangan?: string | null
          siklus: string
          skpd_id?: number | null
          sub_jenis?: string | null
          tahun: number
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: string
          judul?: string
          keterangan?: string | null
          siklus?: string
          skpd_id?: number | null
          sub_jenis?: string | null
          tahun?: number
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dokumen_siklus_skpd_id_fkey"
            columns: ["skpd_id"]
            isOneToOne: false
            referencedRelation: "admin_skpd"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_jenis_aset: {
        Row: {
          disusutkan: boolean
          golongan: string
          id: number
          metode: string
          nama: string
        }
        Insert: {
          disusutkan: boolean
          golongan: string
          id: number
          metode: string
          nama: string
        }
        Update: {
          disusutkan?: boolean
          golongan?: string
          id?: number
          metode?: string
          nama?: string
        }
        Relationships: []
      }
      admin_kodefikasi_bmd: {
        Row: {
          aktif: boolean
          batas_kapitalisasi: number | null
          jenis_aset_id: number | null
          kode: string
          kode_jenis: string
          kode_objek: string
          kode_rincian: string | null
          kode_sub_rincian: string | null
          masa_manfaat_smt: number | null
          masa_manfaat_tahun: number
          nama_jenis: string | null
          nama_objek: string | null
          nama_rincian: string | null
          nama_sub_rincian: string | null
          uraian: string
        }
        Insert: {
          aktif?: boolean
          batas_kapitalisasi?: number | null
          jenis_aset_id?: number | null
          kode: string
          kode_jenis: string
          kode_objek: string
          kode_rincian?: string | null
          kode_sub_rincian?: string | null
          masa_manfaat_smt?: number | null
          masa_manfaat_tahun?: number
          nama_jenis?: string | null
          nama_objek?: string | null
          nama_rincian?: string | null
          nama_sub_rincian?: string | null
          uraian: string
        }
        Update: {
          aktif?: boolean
          batas_kapitalisasi?: number | null
          jenis_aset_id?: number | null
          kode?: string
          kode_jenis?: string
          kode_objek?: string
          kode_rincian?: string | null
          kode_sub_rincian?: string | null
          masa_manfaat_smt?: number | null
          masa_manfaat_tahun?: number
          nama_jenis?: string | null
          nama_objek?: string | null
          nama_rincian?: string | null
          nama_sub_rincian?: string | null
          uraian?: string
        }
        Relationships: [
          {
            foreignKeyName: "kodefikasi_bmd_jenis_aset_id_fkey"
            columns: ["jenis_aset_id"]
            isOneToOne: false
            referencedRelation: "admin_jenis_aset"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_overhaul_band: {
        Row: {
          band_no: number
          id: number
          kode_prefix: string
          label: string | null
          pct_max: number | null
          pct_min: number
          tambahan_tahun: number
          uraian: string | null
        }
        Insert: {
          band_no: number
          id?: never
          kode_prefix: string
          label?: string | null
          pct_max?: number | null
          pct_min: number
          tambahan_tahun: number
          uraian?: string | null
        }
        Update: {
          band_no?: number
          id?: never
          kode_prefix?: string
          label?: string | null
          pct_max?: number | null
          pct_min?: number
          tambahan_tahun?: number
          uraian?: string | null
        }
        Relationships: []
      }
      admin_pegawai: {
        Row: {
          created_at: string
          golongan: string | null
          id: string
          jabatan: string | null
          jenis_kelamin: string | null
          nama: string
          nip: string | null
          pangkat: string | null
          role_bmd: string
          skpd_id: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          golongan?: string | null
          id?: string
          jabatan?: string | null
          jenis_kelamin?: string | null
          nama: string
          nip?: string | null
          pangkat?: string | null
          role_bmd?: string
          skpd_id?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          golongan?: string | null
          id?: string
          jabatan?: string | null
          jenis_kelamin?: string | null
          nama?: string
          nip?: string | null
          pangkat?: string | null
          role_bmd?: string
          skpd_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pegawai_skpd_id_fkey"
            columns: ["skpd_id"]
            isOneToOne: false
            referencedRelation: "admin_skpd"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_pegawai_penugasan: {
        Row: {
          aktif: boolean
          created_at: string
          id: string
          keterangan: string | null
          no_sk: string | null
          pegawai_id: string
          role_bmd: string
          skpd_id: number
          tmt: string | null
          updated_at: string
        }
        Insert: {
          aktif?: boolean
          created_at?: string
          id?: string
          keterangan?: string | null
          no_sk?: string | null
          pegawai_id: string
          role_bmd?: string
          skpd_id: number
          tmt?: string | null
          updated_at?: string
        }
        Update: {
          aktif?: boolean
          created_at?: string
          id?: string
          keterangan?: string | null
          no_sk?: string | null
          pegawai_id?: string
          role_bmd?: string
          skpd_id?: number
          tmt?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_pegawai_penugasan_pegawai_id_fkey"
            columns: ["pegawai_id"]
            isOneToOne: false
            referencedRelation: "admin_pegawai"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_pegawai_penugasan_skpd_id_fkey"
            columns: ["skpd_id"]
            isOneToOne: false
            referencedRelation: "admin_skpd"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_profiles: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          ipa_role: string | null
          pegawai_id: string | null
          role: string
          skpd_id: number | null
          username: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id: string
          ipa_role?: string | null
          pegawai_id?: string | null
          role?: string
          skpd_id?: number | null
          username?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          ipa_role?: string | null
          pegawai_id?: string | null
          role?: string
          skpd_id?: number | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_pegawai_id_fkey"
            columns: ["pegawai_id"]
            isOneToOne: false
            referencedRelation: "admin_pegawai"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_skpd_id_fkey"
            columns: ["skpd_id"]
            isOneToOne: false
            referencedRelation: "admin_skpd"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_program: {
        Row: {
          aktif: boolean
          created_at: string
          kode_bidang: string
          kode_kegiatan: string
          kode_program: string
          kode_sub_kegiatan: string
          kode_urusan: string
          updated_at: string
          uraian_bidang: string
          uraian_kegiatan: string
          uraian_program: string
          uraian_sub_kegiatan: string
          uraian_urusan: string
        }
        Insert: {
          aktif?: boolean
          created_at?: string
          kode_bidang: string
          kode_kegiatan: string
          kode_program: string
          kode_sub_kegiatan: string
          kode_urusan: string
          updated_at?: string
          uraian_bidang: string
          uraian_kegiatan: string
          uraian_program: string
          uraian_sub_kegiatan: string
          uraian_urusan: string
        }
        Update: {
          aktif?: boolean
          created_at?: string
          kode_bidang?: string
          kode_kegiatan?: string
          kode_program?: string
          kode_sub_kegiatan?: string
          kode_urusan?: string
          updated_at?: string
          uraian_bidang?: string
          uraian_kegiatan?: string
          uraian_program?: string
          uraian_sub_kegiatan?: string
          uraian_urusan?: string
        }
        Relationships: []
      }
      admin_rekening: {
        Row: {
          aktif: boolean
          created_at: string
          kelompok: string | null
          kode_jenis: string
          kode_klasifikasi: string
          kode_objek: string
          kode_rekening: string
          kode_rincian_objek: string
          kode_sub_rincian: string
          updated_at: string
          uraian_jenis: string
          uraian_klasifikasi: string
          uraian_objek: string
          uraian_rekening: string
          uraian_rincian_objek: string
          uraian_sub_rincian: string
        }
        Insert: {
          aktif?: boolean
          created_at?: string
          kelompok?: string | null
          kode_jenis: string
          kode_klasifikasi: string
          kode_objek: string
          kode_rekening: string
          kode_rincian_objek: string
          kode_sub_rincian: string
          updated_at?: string
          uraian_jenis: string
          uraian_klasifikasi: string
          uraian_objek: string
          uraian_rekening: string
          uraian_rincian_objek: string
          uraian_sub_rincian: string
        }
        Update: {
          aktif?: boolean
          created_at?: string
          kelompok?: string | null
          kode_jenis?: string
          kode_klasifikasi?: string
          kode_objek?: string
          kode_rekening?: string
          kode_rincian_objek?: string
          kode_sub_rincian?: string
          updated_at?: string
          uraian_jenis?: string
          uraian_klasifikasi?: string
          uraian_objek?: string
          uraian_rekening?: string
          uraian_rincian_objek?: string
          uraian_sub_rincian?: string
        }
        Relationships: []
      }
      admin_satuan_bmd: {
        Row: {
          created_at: string
          id: number
          keterangan: string | null
          nama: string
        }
        Insert: {
          created_at?: string
          id?: never
          keterangan?: string | null
          nama: string
        }
        Update: {
          created_at?: string
          id?: never
          keterangan?: string | null
          nama?: string
        }
        Relationships: []
      }
      admin_skpd: {
        Row: {
          created_at: string | null
          fpk_laporan: number | null
          fpk_temuan: number | null
          id: number
          jabatan: string | null
          kelompok_fpk: number | null
          kode_lokasi: string | null
          kode_raw: string | null
          kode_skpd: string
          level: number
          nama: string
          parent_id: number | null
          path: unknown
        }
        Insert: {
          created_at?: string | null
          fpk_laporan?: number | null
          fpk_temuan?: number | null
          id?: never
          jabatan?: string | null
          kelompok_fpk?: number | null
          kode_lokasi?: string | null
          kode_raw?: string | null
          kode_skpd: string
          level: number
          nama: string
          parent_id?: number | null
          path?: unknown
        }
        Update: {
          created_at?: string | null
          fpk_laporan?: number | null
          fpk_temuan?: number | null
          id?: never
          jabatan?: string | null
          kelompok_fpk?: number | null
          kode_lokasi?: string | null
          kode_raw?: string | null
          kode_skpd?: string
          level?: number
          nama?: string
          parent_id?: number | null
          path?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "skpd_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "admin_skpd"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_usulan_pengurus: {
        Row: {
          catatan_admin: string | null
          created_at: string
          created_by: string | null
          diajukan_at: string | null
          disetujui_at: string | null
          golongan: string | null
          id: string
          jabatan: string | null
          jenis: string
          jenis_kelamin: string | null
          nama: string
          nip: string
          no_usulan: string | null
          pangkat: string | null
          pegawai_created: boolean
          pegawai_id: string | null
          role_bmd: string
          skpd_id: number
          status: string
          tahun: number
          tgl_usulan: string | null
          updated_at: string
        }
        Insert: {
          catatan_admin?: string | null
          created_at?: string
          created_by?: string | null
          diajukan_at?: string | null
          disetujui_at?: string | null
          golongan?: string | null
          id?: string
          jabatan?: string | null
          jenis?: string
          jenis_kelamin?: string | null
          nama: string
          nip: string
          no_usulan?: string | null
          pangkat?: string | null
          pegawai_created?: boolean
          pegawai_id?: string | null
          role_bmd?: string
          skpd_id: number
          status?: string
          tahun?: number
          tgl_usulan?: string | null
          updated_at?: string
        }
        Update: {
          catatan_admin?: string | null
          created_at?: string
          created_by?: string | null
          diajukan_at?: string | null
          disetujui_at?: string | null
          golongan?: string | null
          id?: string
          jabatan?: string | null
          jenis?: string
          jenis_kelamin?: string | null
          nama?: string
          nip?: string
          no_usulan?: string | null
          pangkat?: string | null
          pegawai_created?: boolean
          pegawai_id?: string | null
          role_bmd?: string
          skpd_id?: number
          status?: string
          tahun?: number
          tgl_usulan?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_usulan_pengurus_pegawai_id_fkey"
            columns: ["pegawai_id"]
            isOneToOne: false
            referencedRelation: "admin_pegawai"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_usulan_pengurus_skpd_id_fkey"
            columns: ["skpd_id"]
            isOneToOne: false
            referencedRelation: "admin_skpd"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_wilayah: {
        Row: {
          kode: string
          level: number
          nama: string
          parent_kode: string | null
        }
        Insert: {
          kode: string
          level: number
          nama: string
          parent_kode?: string | null
        }
        Update: {
          kode?: string
          level?: number
          nama?: string
          parent_kode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wilayah_parent_kode_fkey"
            columns: ["parent_kode"]
            isOneToOne: false
            referencedRelation: "admin_wilayah"
            referencedColumns: ["kode"]
          },
        ]
      }
      aset: {
        Row: {
          alamat_detail: string | null
          asal_usul: string | null
          cara_perolehan: string
          created_at: string
          foto_paths: string[]
          golongan: string | null
          harga_satuan: number | null
          id: string
          intra_ekstra: string | null
          jenis_hak: string | null
          jumlah: number
          keterangan: string | null
          kode: string
          kode_register: string | null
          kondisi_barang: string | null
          latitude: number | null
          longitude: number | null
          luas: number | null
          merek_tipe: string | null
          nama_barang: string | null
          nama_dokumen_kepemilikan: string | null
          nibar: string | null
          nilai_perolehan: number
          no_bpkb: string | null
          no_mesin: string | null
          no_polisi: string | null
          no_rangka: string | null
          nomor_dokumen_kepemilikan: string | null
          pemanfaatan: string | null
          pengamanan: string | null
          penggunaan_pengamanan: string | null
          satuan: string | null
          skpd_id: number | null
          spesifikasi_lainnya: string | null
          status: string
          tahun_pengadaan: number | null
          tanggal_dokumen_kepemilikan: string | null
          tgl_perolehan: string | null
          updated_at: string
          uraian_barang: string | null
          wilayah_kode: string | null
        }
        Insert: {
          alamat_detail?: string | null
          asal_usul?: string | null
          cara_perolehan?: string
          created_at?: string
          foto_paths?: string[]
          golongan?: string | null
          harga_satuan?: number | null
          id?: string
          intra_ekstra?: string | null
          jenis_hak?: string | null
          jumlah?: number
          keterangan?: string | null
          kode: string
          kode_register?: string | null
          kondisi_barang?: string | null
          latitude?: number | null
          longitude?: number | null
          luas?: number | null
          merek_tipe?: string | null
          nama_barang?: string | null
          nama_dokumen_kepemilikan?: string | null
          nibar?: string | null
          nilai_perolehan?: number
          no_bpkb?: string | null
          no_mesin?: string | null
          no_polisi?: string | null
          no_rangka?: string | null
          nomor_dokumen_kepemilikan?: string | null
          pemanfaatan?: string | null
          pengamanan?: string | null
          penggunaan_pengamanan?: string | null
          satuan?: string | null
          skpd_id?: number | null
          spesifikasi_lainnya?: string | null
          status?: string
          tahun_pengadaan?: number | null
          tanggal_dokumen_kepemilikan?: string | null
          tgl_perolehan?: string | null
          updated_at?: string
          uraian_barang?: string | null
          wilayah_kode?: string | null
        }
        Update: {
          alamat_detail?: string | null
          asal_usul?: string | null
          cara_perolehan?: string
          created_at?: string
          foto_paths?: string[]
          golongan?: string | null
          harga_satuan?: number | null
          id?: string
          intra_ekstra?: string | null
          jenis_hak?: string | null
          jumlah?: number
          keterangan?: string | null
          kode?: string
          kode_register?: string | null
          kondisi_barang?: string | null
          latitude?: number | null
          longitude?: number | null
          luas?: number | null
          merek_tipe?: string | null
          nama_barang?: string | null
          nama_dokumen_kepemilikan?: string | null
          nibar?: string | null
          nilai_perolehan?: number
          no_bpkb?: string | null
          no_mesin?: string | null
          no_polisi?: string | null
          no_rangka?: string | null
          nomor_dokumen_kepemilikan?: string | null
          pemanfaatan?: string | null
          pengamanan?: string | null
          penggunaan_pengamanan?: string | null
          satuan?: string | null
          skpd_id?: number | null
          spesifikasi_lainnya?: string | null
          status?: string
          tahun_pengadaan?: number | null
          tanggal_dokumen_kepemilikan?: string | null
          tgl_perolehan?: string | null
          updated_at?: string
          uraian_barang?: string | null
          wilayah_kode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aset_skpd_id_fkey"
            columns: ["skpd_id"]
            isOneToOne: false
            referencedRelation: "admin_skpd"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aset_wilayah_kode_fkey"
            columns: ["wilayah_kode"]
            isOneToOne: false
            referencedRelation: "admin_wilayah"
            referencedColumns: ["kode"]
          },
          {
            foreignKeyName: "fk_aset_kodefikasi"
            columns: ["kode"]
            isOneToOne: false
            referencedRelation: "admin_kodefikasi_bmd"
            referencedColumns: ["kode"]
          },
        ]
      }
      aset_awal_2026: {
        Row: {
          akumulasi_2025: number
          alamat_detail: string | null
          asal_usul: string | null
          beban_penyusutan_per_smt: number | null
          created_at: string | null
          foto_paths: string[]
          golongan: string | null
          harga_satuan: number | null
          intra_ekstra: string | null
          jenis_hak: string | null
          jumlah: number
          keterangan: string | null
          kode: string
          kondisi_barang: string | null
          latitude: number | null
          longitude: number | null
          luas: number | null
          masa_manfaat_smt: number | null
          merek_tipe: string | null
          nama_barang: string
          nama_dokumen_kepemilikan: string | null
          nibar: string
          nilai_buku_awal: number
          nilai_perolehan: number
          no_bpkb: string | null
          no_mesin: string | null
          no_polisi: string | null
          no_rangka: string | null
          nomor_dokumen_kepemilikan: string | null
          pemanfaatan: string | null
          penggunaan_pengamanan: string | null
          satuan: string | null
          sisa_masa_manfaat_smt: number | null
          skpd_id: number
          spesifikasi_lainnya: string | null
          tahun_pengadaan: number | null
          tanggal_dokumen_kepemilikan: string | null
          tgl_perolehan: string | null
          uraian_barang: string | null
          wilayah_kode: string | null
        }
        Insert: {
          akumulasi_2025?: number
          alamat_detail?: string | null
          asal_usul?: string | null
          beban_penyusutan_per_smt?: number | null
          created_at?: string | null
          foto_paths?: string[]
          golongan?: string | null
          harga_satuan?: number | null
          intra_ekstra?: string | null
          jenis_hak?: string | null
          jumlah?: number
          keterangan?: string | null
          kode: string
          kondisi_barang?: string | null
          latitude?: number | null
          longitude?: number | null
          luas?: number | null
          masa_manfaat_smt?: number | null
          merek_tipe?: string | null
          nama_barang: string
          nama_dokumen_kepemilikan?: string | null
          nibar: string
          nilai_buku_awal: number
          nilai_perolehan: number
          no_bpkb?: string | null
          no_mesin?: string | null
          no_polisi?: string | null
          no_rangka?: string | null
          nomor_dokumen_kepemilikan?: string | null
          pemanfaatan?: string | null
          penggunaan_pengamanan?: string | null
          satuan?: string | null
          sisa_masa_manfaat_smt?: number | null
          skpd_id: number
          spesifikasi_lainnya?: string | null
          tahun_pengadaan?: number | null
          tanggal_dokumen_kepemilikan?: string | null
          tgl_perolehan?: string | null
          uraian_barang?: string | null
          wilayah_kode?: string | null
        }
        Update: {
          akumulasi_2025?: number
          alamat_detail?: string | null
          asal_usul?: string | null
          beban_penyusutan_per_smt?: number | null
          created_at?: string | null
          foto_paths?: string[]
          golongan?: string | null
          harga_satuan?: number | null
          intra_ekstra?: string | null
          jenis_hak?: string | null
          jumlah?: number
          keterangan?: string | null
          kode?: string
          kondisi_barang?: string | null
          latitude?: number | null
          longitude?: number | null
          luas?: number | null
          masa_manfaat_smt?: number | null
          merek_tipe?: string | null
          nama_barang?: string
          nama_dokumen_kepemilikan?: string | null
          nibar?: string
          nilai_buku_awal?: number
          nilai_perolehan?: number
          no_bpkb?: string | null
          no_mesin?: string | null
          no_polisi?: string | null
          no_rangka?: string | null
          nomor_dokumen_kepemilikan?: string | null
          pemanfaatan?: string | null
          penggunaan_pengamanan?: string | null
          satuan?: string | null
          sisa_masa_manfaat_smt?: number | null
          skpd_id?: number
          spesifikasi_lainnya?: string | null
          tahun_pengadaan?: number | null
          tanggal_dokumen_kepemilikan?: string | null
          tgl_perolehan?: string | null
          uraian_barang?: string | null
          wilayah_kode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saldo_awal_2026_skpd_id_fkey"
            columns: ["skpd_id"]
            isOneToOne: false
            referencedRelation: "admin_skpd"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saldo_awal_2026_wilayah_kode_fkey"
            columns: ["wilayah_kode"]
            isOneToOne: false
            referencedRelation: "admin_wilayah"
            referencedColumns: ["kode"]
          },
        ]
      }
      aset_bidang_tanah: {
        Row: {
          alamat_detail: string | null
          aset_id: string
          created_at: string
          id: string
          jenis_hak: string | null
          keterangan: string | null
          latitude: number | null
          longitude: number | null
          luas: number | null
          nama_bidang: string | null
          nama_dokumen_kepemilikan: string | null
          nomor_dokumen_kepemilikan: string | null
          sertifikat_path: string | null
          tanggal_berakhir_hak: string | null
          tanggal_dokumen_kepemilikan: string | null
          updated_at: string
          wilayah_kode: string | null
        }
        Insert: {
          alamat_detail?: string | null
          aset_id: string
          created_at?: string
          id?: string
          jenis_hak?: string | null
          keterangan?: string | null
          latitude?: number | null
          longitude?: number | null
          luas?: number | null
          nama_bidang?: string | null
          nama_dokumen_kepemilikan?: string | null
          nomor_dokumen_kepemilikan?: string | null
          sertifikat_path?: string | null
          tanggal_berakhir_hak?: string | null
          tanggal_dokumen_kepemilikan?: string | null
          updated_at?: string
          wilayah_kode?: string | null
        }
        Update: {
          alamat_detail?: string | null
          aset_id?: string
          created_at?: string
          id?: string
          jenis_hak?: string | null
          keterangan?: string | null
          latitude?: number | null
          longitude?: number | null
          luas?: number | null
          nama_bidang?: string | null
          nama_dokumen_kepemilikan?: string | null
          nomor_dokumen_kepemilikan?: string | null
          sertifikat_path?: string | null
          tanggal_berakhir_hak?: string | null
          tanggal_dokumen_kepemilikan?: string | null
          updated_at?: string
          wilayah_kode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aset_bidang_tanah_aset_id_fkey"
            columns: ["aset_id"]
            isOneToOne: false
            referencedRelation: "aset"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aset_bidang_tanah_wilayah_kode_fkey"
            columns: ["wilayah_kode"]
            isOneToOne: false
            referencedRelation: "admin_wilayah"
            referencedColumns: ["kode"]
          },
        ]
      }
      aset_kode_register: {
        Row: {
          alasan: string
          aset_id: string
          created_at: string
          id: number
          kode_lama: string | null
          kode_register: string
          periode: string
          tanggal: string
          trx_id: number | null
        }
        Insert: {
          alasan: string
          aset_id: string
          created_at?: string
          id?: never
          kode_lama?: string | null
          kode_register: string
          periode: string
          tanggal: string
          trx_id?: number | null
        }
        Update: {
          alasan?: string
          aset_id?: string
          created_at?: string
          id?: never
          kode_lama?: string | null
          kode_register?: string
          periode?: string
          tanggal?: string
          trx_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aset_kode_register_aset_id_fkey"
            columns: ["aset_id"]
            isOneToOne: false
            referencedRelation: "aset"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_kdp_komptabel_20260805: {
        Row: {
          aset_id: string | null
          aset_intra_ekstra_lama: string | null
          aset_kode_register_lama: string | null
          kode: string | null
          nama_barang: string | null
          nibar: string | null
          skpd_id: number | null
          snapshot_intra_ekstra_lama: string | null
        }
        Insert: {
          aset_id?: string | null
          aset_intra_ekstra_lama?: string | null
          aset_kode_register_lama?: string | null
          kode?: string | null
          nama_barang?: string | null
          nibar?: string | null
          skpd_id?: number | null
          snapshot_intra_ekstra_lama?: string | null
        }
        Update: {
          aset_id?: string | null
          aset_intra_ekstra_lama?: string | null
          aset_kode_register_lama?: string | null
          kode?: string | null
          nama_barang?: string | null
          nibar?: string | null
          skpd_id?: number | null
          snapshot_intra_ekstra_lama?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: number
          recipient_id: string | null
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: never
          recipient_id?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: never
          recipient_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages_ai: {
        Row: {
          content: string
          created_at: string
          id: number
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: never
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: never
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_ai_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_reads: {
        Row: {
          last_read_id: number
          room_key: string
          user_id: string
        }
        Insert: {
          last_read_id?: number
          room_key: string
          user_id: string
        }
        Update: {
          last_read_id?: number
          room_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventarisasi: {
        Row: {
          catatan_validator: string | null
          created_at: string
          created_by: string | null
          diajukan_at: string | null
          divalidasi_at: string | null
          divalidasi_by: string | null
          golongan: string
          id: string
          keterangan: string | null
          petugas: Json
          skpd_id: number
          status: string
          tahun: number
          updated_at: string
        }
        Insert: {
          catatan_validator?: string | null
          created_at?: string
          created_by?: string | null
          diajukan_at?: string | null
          divalidasi_at?: string | null
          divalidasi_by?: string | null
          golongan: string
          id?: string
          keterangan?: string | null
          petugas?: Json
          skpd_id: number
          status?: string
          tahun: number
          updated_at?: string
        }
        Update: {
          catatan_validator?: string | null
          created_at?: string
          created_by?: string | null
          diajukan_at?: string | null
          divalidasi_at?: string | null
          divalidasi_by?: string | null
          golongan?: string
          id?: string
          keterangan?: string | null
          petugas?: Json
          skpd_id?: number
          status?: string
          tahun?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventarisasi_skpd_id_fkey"
            columns: ["skpd_id"]
            isOneToOne: false
            referencedRelation: "admin_skpd"
            referencedColumns: ["id"]
          },
        ]
      }
      inventarisasi_baris: {
        Row: {
          aset_id: string | null
          created_at: string
          foto_paths: string[]
          id: string
          inventarisasi_id: string
          jawaban: Json
          snapshot: Json
          updated_at: string
        }
        Insert: {
          aset_id?: string | null
          created_at?: string
          foto_paths?: string[]
          id?: string
          inventarisasi_id: string
          jawaban?: Json
          snapshot?: Json
          updated_at?: string
        }
        Update: {
          aset_id?: string | null
          created_at?: string
          foto_paths?: string[]
          id?: string
          inventarisasi_id?: string
          jawaban?: Json
          snapshot?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventarisasi_baris_aset_id_fkey"
            columns: ["aset_id"]
            isOneToOne: false
            referencedRelation: "aset"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventarisasi_baris_inventarisasi_id_fkey"
            columns: ["inventarisasi_id"]
            isOneToOne: false
            referencedRelation: "inventarisasi"
            referencedColumns: ["id"]
          },
        ]
      }
      ipa_dokumen_bukti: {
        Row: {
          created_at: string
          id: string
          ipa_record_id: string
          mime_type: string | null
          nama_file: string
          parameter_nilai_id: string | null
          ukuran_bytes: number | null
          uploaded_by: string | null
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          ipa_record_id: string
          mime_type?: string | null
          nama_file: string
          parameter_nilai_id?: string | null
          ukuran_bytes?: number | null
          uploaded_by?: string | null
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          ipa_record_id?: string
          mime_type?: string | null
          nama_file?: string
          parameter_nilai_id?: string | null
          ukuran_bytes?: number | null
          uploaded_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "ipa_dokumen_bukti_ipa_record_id_fkey"
            columns: ["ipa_record_id"]
            isOneToOne: false
            referencedRelation: "ipa_record"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ipa_dokumen_bukti_parameter_nilai_id_fkey"
            columns: ["parameter_nilai_id"]
            isOneToOne: false
            referencedRelation: "ipa_parameter_nilai"
            referencedColumns: ["id"]
          },
        ]
      }
      ipa_log: {
        Row: {
          aksi: string
          created_at: string
          id: string
          ipa_record_id: string
          keterangan: string | null
          payload: Json | null
          user_id: string | null
        }
        Insert: {
          aksi: string
          created_at?: string
          id?: string
          ipa_record_id: string
          keterangan?: string | null
          payload?: Json | null
          user_id?: string | null
        }
        Update: {
          aksi?: string
          created_at?: string
          id?: string
          ipa_record_id?: string
          keterangan?: string | null
          payload?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ipa_log_ipa_record_id_fkey"
            columns: ["ipa_record_id"]
            isOneToOne: false
            referencedRelation: "ipa_record"
            referencedColumns: ["id"]
          },
        ]
      }
      ipa_parameter_nilai: {
        Row: {
          bobot: number | null
          created_at: string
          id: string
          indeks: number | null
          ipa_id: string
          kode_parameter: string
          metadata: Json | null
          nama_parameter: string
          nilai_terbobot: number | null
          persen_fpk: number | null
          persen_raw: number | null
          realisasi: number | null
          target: number | null
          updated_at: string
        }
        Insert: {
          bobot?: number | null
          created_at?: string
          id?: string
          indeks?: number | null
          ipa_id: string
          kode_parameter: string
          metadata?: Json | null
          nama_parameter: string
          nilai_terbobot?: number | null
          persen_fpk?: number | null
          persen_raw?: number | null
          realisasi?: number | null
          target?: number | null
          updated_at?: string
        }
        Update: {
          bobot?: number | null
          created_at?: string
          id?: string
          indeks?: number | null
          ipa_id?: string
          kode_parameter?: string
          metadata?: Json | null
          nama_parameter?: string
          nilai_terbobot?: number | null
          persen_fpk?: number | null
          persen_raw?: number | null
          realisasi?: number | null
          target?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ipa_parameter_nilai_ipa_id_fkey"
            columns: ["ipa_id"]
            isOneToOne: false
            referencedRelation: "ipa_record"
            referencedColumns: ["id"]
          },
        ]
      }
      ipa_record: {
        Row: {
          catatan_verifikasi: string | null
          created_at: string
          id: string
          ipa_final: number | null
          ipa_kategori: string | null
          skpd_id: number
          st1_nilai: number | null
          st2_nilai: number | null
          st3_nilai: number | null
          st4_nilai: number | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          tahun_id: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          catatan_verifikasi?: string | null
          created_at?: string
          id?: string
          ipa_final?: number | null
          ipa_kategori?: string | null
          skpd_id: number
          st1_nilai?: number | null
          st2_nilai?: number | null
          st3_nilai?: number | null
          st4_nilai?: number | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          tahun_id: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          catatan_verifikasi?: string | null
          created_at?: string
          id?: string
          ipa_final?: number | null
          ipa_kategori?: string | null
          skpd_id?: number
          st1_nilai?: number | null
          st2_nilai?: number | null
          st3_nilai?: number | null
          st4_nilai?: number | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          tahun_id?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ipa_record_skpd_id_fkey"
            columns: ["skpd_id"]
            isOneToOne: false
            referencedRelation: "admin_skpd"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ipa_record_tahun_id_fkey"
            columns: ["tahun_id"]
            isOneToOne: false
            referencedRelation: "ipa_tahun_anggaran"
            referencedColumns: ["id"]
          },
        ]
      }
      ipa_tahun_anggaran: {
        Row: {
          batas_submit_bkad: string | null
          batas_submit_pb: string | null
          created_at: string
          id: string
          is_active: boolean
          tahun: number
        }
        Insert: {
          batas_submit_bkad?: string | null
          batas_submit_pb?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          tahun: number
        }
        Update: {
          batas_submit_bkad?: string | null
          batas_submit_pb?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          tahun?: number
        }
        Relationships: []
      }
      jurnal_header: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          id: string
          jenis: string | null
          kategori: string
          keterangan: string | null
          no_sk: string
          payload: Json
          periode: string
          rejected_reason: string | null
          skpd_id: number
          skpd_tujuan: number | null
          sub_jenis: string | null
          tanggal: string
          updated_at: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          jenis?: string | null
          kategori: string
          keterangan?: string | null
          no_sk: string
          payload?: Json
          periode: string
          rejected_reason?: string | null
          skpd_id: number
          skpd_tujuan?: number | null
          sub_jenis?: string | null
          tanggal: string
          updated_at?: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          jenis?: string | null
          kategori?: string
          keterangan?: string | null
          no_sk?: string
          payload?: Json
          periode?: string
          rejected_reason?: string | null
          skpd_id?: number
          skpd_tujuan?: number | null
          sub_jenis?: string | null
          tanggal?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jurnal_header_skpd_id_fkey"
            columns: ["skpd_id"]
            isOneToOne: false
            referencedRelation: "admin_skpd"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jurnal_header_skpd_tujuan_fkey"
            columns: ["skpd_tujuan"]
            isOneToOne: false
            referencedRelation: "admin_skpd"
            referencedColumns: ["id"]
          },
        ]
      }
      kir_ruangan: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          keterangan: string | null
          kode_ruangan: string | null
          nama: string
          pegawai_id: string | null
          pj_jabatan: string | null
          pj_nama: string | null
          pj_nip: string | null
          skpd_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          keterangan?: string | null
          kode_ruangan?: string | null
          nama: string
          pegawai_id?: string | null
          pj_jabatan?: string | null
          pj_nama?: string | null
          pj_nip?: string | null
          skpd_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          keterangan?: string | null
          kode_ruangan?: string | null
          nama?: string
          pegawai_id?: string | null
          pj_jabatan?: string | null
          pj_nama?: string | null
          pj_nip?: string | null
          skpd_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kir_ruangan_pegawai_id_fkey"
            columns: ["pegawai_id"]
            isOneToOne: false
            referencedRelation: "admin_pegawai"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kir_ruangan_skpd_id_fkey"
            columns: ["skpd_id"]
            isOneToOne: false
            referencedRelation: "admin_skpd"
            referencedColumns: ["id"]
          },
        ]
      }
      kir_ruangan_aset: {
        Row: {
          aset_id: string
          created_at: string
          created_by: string | null
          id: string
          keterangan: string | null
          ruangan_id: string
        }
        Insert: {
          aset_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          keterangan?: string | null
          ruangan_id: string
        }
        Update: {
          aset_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          keterangan?: string | null
          ruangan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kir_ruangan_aset_aset_id_fkey"
            columns: ["aset_id"]
            isOneToOne: true
            referencedRelation: "aset"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kir_ruangan_aset_ruangan_id_fkey"
            columns: ["ruangan_id"]
            isOneToOne: false
            referencedRelation: "kir_ruangan"
            referencedColumns: ["id"]
          },
        ]
      }
      kode_register_seq: {
        Row: {
          diperbarui_at: string
          nomor_terakhir: number
          prefix38: string
        }
        Insert: {
          diperbarui_at?: string
          nomor_terakhir?: number
          prefix38: string
        }
        Update: {
          diperbarui_at?: string
          nomor_terakhir?: number
          prefix38?: string
        }
        Relationships: []
      }
      lra_realisasi: {
        Row: {
          bulan: number | null
          created_at: string
          created_by: string | null
          debit: number
          id: number
          jenis_tujuan: string | null
          kelompok: string | null
          keterangan: string | null
          klasifikasi: string | null
          kode_grup3: string | null
          kode_rekening: string
          no_bukti: string
          skpd_id: number
          tahun: number | null
          tanggal: string
          updated_at: string
          uraian: string | null
        }
        Insert: {
          bulan?: number | null
          created_at?: string
          created_by?: string | null
          debit?: number
          id?: never
          jenis_tujuan?: string | null
          kelompok?: string | null
          keterangan?: string | null
          klasifikasi?: string | null
          kode_grup3?: string | null
          kode_rekening: string
          no_bukti: string
          skpd_id: number
          tahun?: number | null
          tanggal: string
          updated_at?: string
          uraian?: string | null
        }
        Update: {
          bulan?: number | null
          created_at?: string
          created_by?: string | null
          debit?: number
          id?: never
          jenis_tujuan?: string | null
          kelompok?: string | null
          keterangan?: string | null
          klasifikasi?: string | null
          kode_grup3?: string | null
          kode_rekening?: string
          no_bukti?: string
          skpd_id?: number
          tahun?: number | null
          tanggal?: string
          updated_at?: string
          uraian?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lra_realisasi_skpd_id_fkey"
            columns: ["skpd_id"]
            isOneToOne: false
            referencedRelation: "admin_skpd"
            referencedColumns: ["id"]
          },
        ]
      }
      penyusutan_semester: {
        Row: {
          akumulasi: number
          aset_id: string
          beban: number
          dihitung_pada: string
          id: number
          masa_manfaat_tahun: number | null
          metode: string
          nilai_buku_akhir: number
          nilai_buku_awal: number
          nilai_perolehan: number
          periode: string
          sisa_semester: number
        }
        Insert: {
          akumulasi?: number
          aset_id: string
          beban?: number
          dihitung_pada?: string
          id?: never
          masa_manfaat_tahun?: number | null
          metode?: string
          nilai_buku_akhir?: number
          nilai_buku_awal?: number
          nilai_perolehan?: number
          periode: string
          sisa_semester?: number
        }
        Update: {
          akumulasi?: number
          aset_id?: string
          beban?: number
          dihitung_pada?: string
          id?: never
          masa_manfaat_tahun?: number | null
          metode?: string
          nilai_buku_akhir?: number
          nilai_buku_awal?: number
          nilai_perolehan?: number
          periode?: string
          sisa_semester?: number
        }
        Relationships: [
          {
            foreignKeyName: "penyusutan_semester_aset_id_fkey"
            columns: ["aset_id"]
            isOneToOne: false
            referencedRelation: "aset"
            referencedColumns: ["id"]
          },
        ]
      }
      proyek_barang: {
        Row: {
          aset_id: string
          created_at: string
          id: string
          komponen: string
          proyek_id: string
          status: string
          updated_at: string
        }
        Insert: {
          aset_id: string
          created_at?: string
          id?: string
          komponen: string
          proyek_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          aset_id?: string
          created_at?: string
          id?: string
          komponen?: string
          proyek_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proyek_barang_aset_id_fkey"
            columns: ["aset_id"]
            isOneToOne: false
            referencedRelation: "aset"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyek_barang_proyek_id_fkey"
            columns: ["proyek_id"]
            isOneToOne: false
            referencedRelation: "proyek_konstruksi"
            referencedColumns: ["id"]
          },
        ]
      }
      proyek_konstruksi: {
        Row: {
          aset_kdp_id: string | null
          created_at: string
          created_by: string | null
          id: string
          kegiatan: string | null
          keterangan: string | null
          kode_kdp: string | null
          nama_pekerjaan: string
          nama_penyedia: string | null
          nilai_kontrak: number | null
          no_kontrak: string | null
          ppk: string | null
          program: string | null
          skpd_id: number
          status: string
          sub_kegiatan: string | null
          tgl_kontrak: string | null
          updated_at: string
        }
        Insert: {
          aset_kdp_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kegiatan?: string | null
          keterangan?: string | null
          kode_kdp?: string | null
          nama_pekerjaan: string
          nama_penyedia?: string | null
          nilai_kontrak?: number | null
          no_kontrak?: string | null
          ppk?: string | null
          program?: string | null
          skpd_id: number
          status?: string
          sub_kegiatan?: string | null
          tgl_kontrak?: string | null
          updated_at?: string
        }
        Update: {
          aset_kdp_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kegiatan?: string | null
          keterangan?: string | null
          kode_kdp?: string | null
          nama_pekerjaan?: string
          nama_penyedia?: string | null
          nilai_kontrak?: number | null
          no_kontrak?: string | null
          ppk?: string | null
          program?: string | null
          skpd_id?: number
          status?: string
          sub_kegiatan?: string | null
          tgl_kontrak?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proyek_konstruksi_aset_kdp_id_fkey"
            columns: ["aset_kdp_id"]
            isOneToOne: false
            referencedRelation: "aset"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyek_konstruksi_kode_kdp_fkey"
            columns: ["kode_kdp"]
            isOneToOne: false
            referencedRelation: "admin_kodefikasi_bmd"
            referencedColumns: ["kode"]
          },
          {
            foreignKeyName: "proyek_konstruksi_skpd_id_fkey"
            columns: ["skpd_id"]
            isOneToOne: false
            referencedRelation: "admin_skpd"
            referencedColumns: ["id"]
          },
        ]
      }
      proyek_termin: {
        Row: {
          barang_id: string | null
          created_at: string
          created_by: string | null
          id: string
          kode_rekening: string | null
          komponen: string
          nilai: number
          no_bast: string | null
          proyek_id: string
          status: string
          tanggal: string
          trx_id: number | null
          updated_at: string
          uraian: string | null
        }
        Insert: {
          barang_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kode_rekening?: string | null
          komponen: string
          nilai: number
          no_bast?: string | null
          proyek_id: string
          status?: string
          tanggal: string
          trx_id?: number | null
          updated_at?: string
          uraian?: string | null
        }
        Update: {
          barang_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kode_rekening?: string | null
          komponen?: string
          nilai?: number
          no_bast?: string | null
          proyek_id?: string
          status?: string
          tanggal?: string
          trx_id?: number | null
          updated_at?: string
          uraian?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proyek_termin_barang_id_fkey"
            columns: ["barang_id"]
            isOneToOne: false
            referencedRelation: "proyek_barang"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyek_termin_proyek_id_fkey"
            columns: ["proyek_id"]
            isOneToOne: false
            referencedRelation: "proyek_konstruksi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyek_termin_trx_id_fkey"
            columns: ["trx_id"]
            isOneToOne: false
            referencedRelation: "transaksi_bmd"
            referencedColumns: ["id"]
          },
        ]
      }
      regulasi_chunks: {
        Row: {
          content: string
          created_at: string | null
          embedding: string | null
          id: number
          pasal: string
          source: string
        }
        Insert: {
          content: string
          created_at?: string | null
          embedding?: string | null
          id?: number
          pasal: string
          source: string
        }
        Update: {
          content?: string
          created_at?: string | null
          embedding?: string | null
          id?: number
          pasal?: string
          source?: string
        }
        Relationships: []
      }
      rkbmd: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          catatan_telaah: string | null
          created_at: string
          created_by: string | null
          diajukan_at: string | null
          id: string
          jenis: string
          keterangan: string | null
          parent_id: string | null
          skpd_id: number
          status: string
          tahun_anggaran: number
          updated_at: string
          versi: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          catatan_telaah?: string | null
          created_at?: string
          created_by?: string | null
          diajukan_at?: string | null
          id?: string
          jenis: string
          keterangan?: string | null
          parent_id?: string | null
          skpd_id: number
          status?: string
          tahun_anggaran: number
          updated_at?: string
          versi?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          catatan_telaah?: string | null
          created_at?: string
          created_by?: string | null
          diajukan_at?: string | null
          id?: string
          jenis?: string
          keterangan?: string | null
          parent_id?: string | null
          skpd_id?: number
          status?: string
          tahun_anggaran?: number
          updated_at?: string
          versi?: string
        }
        Relationships: [
          {
            foreignKeyName: "rkbmd_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "rkbmd"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rkbmd_skpd_id_fkey"
            columns: ["skpd_id"]
            isOneToOne: false
            referencedRelation: "admin_skpd"
            referencedColumns: ["id"]
          },
        ]
      }
      rkbmd_item: {
        Row: {
          alasan: string | null
          aset_id: string | null
          bentuk: string | null
          created_at: string
          estimasi_hasil: number | null
          harga_satuan: number | null
          id: string
          jangka_waktu: string | null
          jumlah: number | null
          jumlah_eksisting: number | null
          jumlah_kebutuhan: number | null
          jumlah_standar: number | null
          keterangan: string | null
          kode: string | null
          kode_rekening: string | null
          kondisi: string | null
          lokasi: string | null
          nama_barang: string | null
          nibar: string | null
          nilai_perolehan: number | null
          no_urut: number | null
          paket_id: string | null
          peruntukan: string | null
          rkbmd_id: string
          satuan: string | null
          spesifikasi: string | null
          standar_id: number | null
          tgl_perolehan: string | null
          total_anggaran: number | null
          updated_at: string
          uraian_pemeliharaan: string | null
        }
        Insert: {
          alasan?: string | null
          aset_id?: string | null
          bentuk?: string | null
          created_at?: string
          estimasi_hasil?: number | null
          harga_satuan?: number | null
          id?: string
          jangka_waktu?: string | null
          jumlah?: number | null
          jumlah_eksisting?: number | null
          jumlah_kebutuhan?: number | null
          jumlah_standar?: number | null
          keterangan?: string | null
          kode?: string | null
          kode_rekening?: string | null
          kondisi?: string | null
          lokasi?: string | null
          nama_barang?: string | null
          nibar?: string | null
          nilai_perolehan?: number | null
          no_urut?: number | null
          paket_id?: string | null
          peruntukan?: string | null
          rkbmd_id: string
          satuan?: string | null
          spesifikasi?: string | null
          standar_id?: number | null
          tgl_perolehan?: string | null
          total_anggaran?: number | null
          updated_at?: string
          uraian_pemeliharaan?: string | null
        }
        Update: {
          alasan?: string | null
          aset_id?: string | null
          bentuk?: string | null
          created_at?: string
          estimasi_hasil?: number | null
          harga_satuan?: number | null
          id?: string
          jangka_waktu?: string | null
          jumlah?: number | null
          jumlah_eksisting?: number | null
          jumlah_kebutuhan?: number | null
          jumlah_standar?: number | null
          keterangan?: string | null
          kode?: string | null
          kode_rekening?: string | null
          kondisi?: string | null
          lokasi?: string | null
          nama_barang?: string | null
          nibar?: string | null
          nilai_perolehan?: number | null
          no_urut?: number | null
          paket_id?: string | null
          peruntukan?: string | null
          rkbmd_id?: string
          satuan?: string | null
          spesifikasi?: string | null
          standar_id?: number | null
          tgl_perolehan?: string | null
          total_anggaran?: number | null
          updated_at?: string
          uraian_pemeliharaan?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rkbmd_item_aset_id_fkey"
            columns: ["aset_id"]
            isOneToOne: false
            referencedRelation: "aset"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rkbmd_item_kode_fkey"
            columns: ["kode"]
            isOneToOne: false
            referencedRelation: "admin_kodefikasi_bmd"
            referencedColumns: ["kode"]
          },
          {
            foreignKeyName: "rkbmd_item_kode_rekening_fkey"
            columns: ["kode_rekening"]
            isOneToOne: false
            referencedRelation: "admin_rekening"
            referencedColumns: ["kode_sub_rincian"]
          },
          {
            foreignKeyName: "rkbmd_item_paket_id_fkey"
            columns: ["paket_id"]
            isOneToOne: false
            referencedRelation: "rkbmd_paket"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rkbmd_item_rkbmd_id_fkey"
            columns: ["rkbmd_id"]
            isOneToOne: false
            referencedRelation: "rkbmd"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rkbmd_item_standar_id_fkey"
            columns: ["standar_id"]
            isOneToOne: false
            referencedRelation: "rkbmd_standar"
            referencedColumns: ["id"]
          },
        ]
      }
      rkbmd_paket: {
        Row: {
          created_at: string
          id: string
          kegiatan: string | null
          keterangan: string | null
          no_urut: number | null
          program: string | null
          rkbmd_id: string
          sub_kegiatan: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kegiatan?: string | null
          keterangan?: string | null
          no_urut?: number | null
          program?: string | null
          rkbmd_id: string
          sub_kegiatan?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kegiatan?: string | null
          keterangan?: string | null
          no_urut?: number | null
          program?: string | null
          rkbmd_id?: string
          sub_kegiatan?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rkbmd_paket_rkbmd_id_fkey"
            columns: ["rkbmd_id"]
            isOneToOne: false
            referencedRelation: "rkbmd"
            referencedColumns: ["id"]
          },
        ]
      }
      rkbmd_sbsk: {
        Row: {
          created_at: string
          id: number
          keterangan: string | null
          kode: string
          kuantitas_standar: number
          satuan: string | null
          satuan_pengukur: string
          spesifikasi: string | null
          tahun: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          keterangan?: string | null
          kode: string
          kuantitas_standar: number
          satuan?: string | null
          satuan_pengukur?: string
          spesifikasi?: string | null
          tahun: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          keterangan?: string | null
          kode?: string
          kuantitas_standar?: number
          satuan?: string | null
          satuan_pengukur?: string
          spesifikasi?: string | null
          tahun?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rkbmd_sbsk_kode_fkey"
            columns: ["kode"]
            isOneToOne: false
            referencedRelation: "admin_kodefikasi_bmd"
            referencedColumns: ["kode"]
          },
        ]
      }
      rkbmd_standar: {
        Row: {
          created_at: string
          created_by: string | null
          harga: number
          id: number
          identitas: string | null
          jenis: string
          keterangan: string | null
          kode: string | null
          nama: string
          satuan: string | null
          skpd_id: number | null
          tahun: number
          tkdn: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          harga?: number
          id?: number
          identitas?: string | null
          jenis: string
          keterangan?: string | null
          kode?: string | null
          nama: string
          satuan?: string | null
          skpd_id?: number | null
          tahun: number
          tkdn?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          harga?: number
          id?: number
          identitas?: string | null
          jenis?: string
          keterangan?: string | null
          kode?: string | null
          nama?: string
          satuan?: string | null
          skpd_id?: number | null
          tahun?: number
          tkdn?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rkbmd_standar_kode_fkey"
            columns: ["kode"]
            isOneToOne: false
            referencedRelation: "admin_kodefikasi_bmd"
            referencedColumns: ["kode"]
          },
          {
            foreignKeyName: "rkbmd_standar_skpd_id_fkey"
            columns: ["skpd_id"]
            isOneToOne: false
            referencedRelation: "admin_skpd"
            referencedColumns: ["id"]
          },
        ]
      }
      rkbmd_standar_rekening: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          kode_rekening: string
          skpd_id: number | null
          standar_id: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: number
          kode_rekening: string
          skpd_id?: number | null
          standar_id: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: number
          kode_rekening?: string
          skpd_id?: number | null
          standar_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "rkbmd_standar_rekening_kode_rekening_fkey"
            columns: ["kode_rekening"]
            isOneToOne: false
            referencedRelation: "admin_rekening"
            referencedColumns: ["kode_sub_rincian"]
          },
          {
            foreignKeyName: "rkbmd_standar_rekening_skpd_id_fkey"
            columns: ["skpd_id"]
            isOneToOne: false
            referencedRelation: "admin_skpd"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rkbmd_standar_rekening_standar_id_fkey"
            columns: ["standar_id"]
            isOneToOne: false
            referencedRelation: "rkbmd_standar"
            referencedColumns: ["id"]
          },
        ]
      }
      tahun_buku: {
        Row: {
          catatan: string | null
          ditutup_oleh: string | null
          ditutup_pada: string | null
          status: string
          tahun: number
        }
        Insert: {
          catatan?: string | null
          ditutup_oleh?: string | null
          ditutup_pada?: string | null
          status?: string
          tahun: number
        }
        Update: {
          catatan?: string | null
          ditutup_oleh?: string | null
          ditutup_pada?: string | null
          status?: string
          tahun?: number
        }
        Relationships: []
      }
      tahun_buku_log: {
        Row: {
          aksi: string
          catatan: string | null
          id: number
          oleh: string | null
          pada: string
          tahun: number
        }
        Insert: {
          aksi: string
          catatan?: string | null
          id?: never
          oleh?: string | null
          pada?: string
          tahun: number
        }
        Update: {
          aksi?: string
          catatan?: string | null
          id?: never
          oleh?: string | null
          pada?: string
          tahun?: number
        }
        Relationships: []
      }
      transaksi_bmd: {
        Row: {
          aset_id: string
          created_at: string
          created_by: string | null
          header_id: string | null
          id: number
          jenis: Database["public"]["Enums"]["jenis_transaksi_bmd"]
          keterangan: string | null
          nilai: number
          payload: Json
          periode: string
          skpd_asal: number | null
          skpd_tujuan: number | null
          tanggal: string
        }
        Insert: {
          aset_id: string
          created_at?: string
          created_by?: string | null
          header_id?: string | null
          id?: never
          jenis: Database["public"]["Enums"]["jenis_transaksi_bmd"]
          keterangan?: string | null
          nilai?: number
          payload?: Json
          periode: string
          skpd_asal?: number | null
          skpd_tujuan?: number | null
          tanggal?: string
        }
        Update: {
          aset_id?: string
          created_at?: string
          created_by?: string | null
          header_id?: string | null
          id?: never
          jenis?: Database["public"]["Enums"]["jenis_transaksi_bmd"]
          keterangan?: string | null
          nilai?: number
          payload?: Json
          periode?: string
          skpd_asal?: number | null
          skpd_tujuan?: number | null
          tanggal?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaksi_bmd_aset_id_fkey"
            columns: ["aset_id"]
            isOneToOne: false
            referencedRelation: "aset"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaksi_bmd_header_id_fkey"
            columns: ["header_id"]
            isOneToOne: false
            referencedRelation: "jurnal_header"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaksi_bmd_skpd_asal_fkey"
            columns: ["skpd_asal"]
            isOneToOne: false
            referencedRelation: "admin_skpd"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaksi_bmd_skpd_tujuan_fkey"
            columns: ["skpd_tujuan"]
            isOneToOne: false
            referencedRelation: "admin_skpd"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fn_alokasi_nomor_register: {
        Args: { p_prefix38: string }
        Returns: number
      }
      fn_aset_awal_2026_terkunci: {
        Args: { p_nibar: string }
        Returns: boolean
      }
      fn_aset_awal_2026_terkunci_batch: {
        Args: { p_nibars: string[] }
        Returns: {
          nibar: string
        }[]
      }
      fn_aset_pernah_dikelola: { Args: { p_aset_id: string }; Returns: boolean }
      fn_batal_pengalihan_barang: {
        Args: { p_aset_id: string; p_header_id: string }
        Returns: undefined
      }
      fn_batal_setujui_usulan_pengurus: {
        Args: { p_id: string }
        Returns: undefined
      }
      fn_daftar_barang: {
        Args: {
          p_golongan: string
          p_komptabel?: string
          p_limit?: number
          p_offset?: number
          p_periode: string
          p_search?: string
          p_skpd_ids?: number[]
        }
        Returns: {
          grand_total: number
          id: string
          intra_ekstra: string
          jenis_hak: string
          keterangan: string
          kode: string
          luas: number
          merek_tipe: string
          nama_barang: string
          nama_dokumen_kepemilikan: string
          nibar: string
          nilai_perolehan: number
          nomor_dokumen_kepemilikan: string
          owner_skpd: number
          skpd_id: number
          spesifikasi_lainnya: string
          status: string
          tanggal_dokumen_kepemilikan: string
          tgl_perolehan: string
          total_count: number
        }[]
      }
      fn_dashboard_rekap: { Args: never; Returns: Json }
      fn_ipa_role: { Args: never; Returns: string }
      fn_is_admin: { Args: never; Returns: boolean }
      fn_is_pengurus_barang_atas: {
        Args: { p_skpd_id: number }
        Returns: boolean
      }
      fn_is_pengurus_barang_skpd_induk: {
        Args: { p_skpd_id: number }
        Returns: boolean
      }
      fn_is_viewer: { Args: never; Returns: boolean }
      fn_kembalikan_inventarisasi: {
        Args: { p_catatan: string; p_id: string }
        Returns: undefined
      }
      fn_kembalikan_mutasi_internal: {
        Args: { p_aset_id: string; p_header_id: string }
        Returns: undefined
      }
      fn_kembalikan_pengalihan_barang: {
        Args: { p_aset_id: string; p_header_id: string }
        Returns: undefined
      }
      fn_lra_belanja_modal: {
        Args: { p_skpd_ids?: number[]; p_tahun: number }
        Returns: {
          bulan: number
          grup: string
          nilai: number
        }[]
      }
      fn_my_pernah_dikelola_aset: { Args: never; Returns: string[] }
      fn_my_skpd_ids: { Args: never; Returns: number[] }
      fn_my_skpd_path: { Args: never; Returns: unknown }
      fn_my_skpd_scope: { Args: never; Returns: number[] }
      fn_periode_dari_tanggal: { Args: { d: string }; Returns: string }
      fn_prefix_kode_register: {
        Args: {
          p_intra_ekstra: string
          p_kode: string
          p_kode_skpd: string
          p_tahun: string
        }
        Returns: string
      }
      fn_preview_tutup_tahun: {
        Args: { p_tahun: number }
        Returns: {
          kategori: string
          no_sk: string
          skpd_nama: string
          tanggal: string
        }[]
      }
      fn_rekap_bmd: {
        Args: { p_komptabel?: string; p_periode: string; p_skpd_ids?: number[] }
        Returns: {
          akumulasi: number
          beban: number
          count_peny: number
          golongan: string
          kuantitas: number
          nilai_buku_akhir: number
          perolehan: number
          skpd_id: number
        }[]
      }
      fn_rekap_saldo_awal: {
        Args: { p_komptabel?: string; p_skpd_ids?: number[] }
        Returns: {
          akumulasi: number
          beban: number
          golongan: string
          kuantitas: number
          nilai_buku: number
          perolehan: number
          skpd_id: number
        }[]
      }
      fn_rkbmd_standar_simpan: {
        Args: {
          p_harga: number
          p_jenis: string
          p_keterangan: string
          p_kode: string
          p_nama: string
          p_rekening: string[]
          p_satuan: string
          p_tahun: number
          p_tkdn: number
        }
        Returns: Json
      }
      fn_setujui_usulan_pengurus: { Args: { p_id: string }; Returns: string }
      fn_skpd_admin_induk: { Args: never; Returns: boolean }
      fn_skpd_root: { Args: { p_skpd_id: number }; Returns: number }
      fn_skpd_visible: { Args: { p_skpd_id: number }; Returns: boolean }
      fn_terima_mutasi_internal: {
        Args: { p_header_id: string }
        Returns: number
      }
      fn_terima_pengalihan: { Args: { p_header_id: string }; Returns: number }
      fn_tolak_mutasi_internal: {
        Args: { p_alasan: string; p_header_id: string }
        Returns: undefined
      }
      fn_tolak_pengalihan: {
        Args: { p_alasan: string; p_header_id: string }
        Returns: undefined
      }
      fn_tutup_tahun: {
        Args: { p_catatan?: string; p_tahun: number }
        Returns: number
      }
      fn_validasi_inventarisasi: {
        Args: { p_catatan?: string; p_id: string }
        Returns: undefined
      }
      match_regulasi: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content: string
          id: number
          pasal: string
          similarity: number
          source: string
        }[]
      }
      text2ltree: { Args: { "": string }; Returns: unknown }
    }
    Enums: {
      jenis_transaksi_bmd:
        | "saldo_awal"
        | "pengadaan"
        | "hibah_masuk"
        | "hasil_inventarisasi"
        | "perolehan_lainnya"
        | "mutasi_internal"
        | "pengalihan_status"
        | "reklas_kode"
        | "reklas_komptabel"
        | "koreksi_nilai"
        | "koreksi_spesifikasi"
        | "koreksi_kuantitas"
        | "kapitalisasi"
        | "penghapusan_pemindahtanganan"
        | "penghapusan_sebab_lain"
        | "batal_penghapusan"
        | "kapitalisasi_serap"
        | "batal_kapitalisasi"
        | "batal_pengadaan"
        | "saldo_awal_checkpoint"
        | "tukar_menukar"
        | "batal_hibah_masuk"
        | "batal_tukar_menukar"
        | "batal_hasil_inventarisasi"
        | "batal_perolehan_lainnya"
        | "reklas_golongan"
        | "koreksi_pencatatan_ganda"
        | "akumulasi_kdp"
        | "batal_akumulasi_kdp"
        | "kdp_selesai_keluar"
        | "kdp_selesai_masuk"
        | "pemecahan_keluar"
        | "pemecahan_masuk"
        | "batal_pemecahan"
        | "batal_pemecahan_masuk"
        | "batal_reklas"
        | "batal_koreksi_nilai"
        | "batal_koreksi_spesifikasi"
        | "batal_koreksi_pencatatan_ganda"
        | "pemanfaatan"
        | "pemanfaatan_selesai"
        | "batal_pemanfaatan"
        | "pengamanan"
        | "pengembalian_pengamanan"
        | "batal_pengamanan"
        | "batal_pengalihan"
        | "penggabungan_keluar"
        | "penggabungan_masuk"
        | "batal_penggabungan"
        | "batal_penggabungan_masuk"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      jenis_transaksi_bmd: [
        "saldo_awal",
        "pengadaan",
        "hibah_masuk",
        "hasil_inventarisasi",
        "perolehan_lainnya",
        "mutasi_internal",
        "pengalihan_status",
        "reklas_kode",
        "reklas_komptabel",
        "koreksi_nilai",
        "koreksi_spesifikasi",
        "koreksi_kuantitas",
        "kapitalisasi",
        "penghapusan_pemindahtanganan",
        "penghapusan_sebab_lain",
        "batal_penghapusan",
        "kapitalisasi_serap",
        "batal_kapitalisasi",
        "batal_pengadaan",
        "saldo_awal_checkpoint",
        "tukar_menukar",
        "batal_hibah_masuk",
        "batal_tukar_menukar",
        "batal_hasil_inventarisasi",
        "batal_perolehan_lainnya",
        "reklas_golongan",
        "koreksi_pencatatan_ganda",
        "akumulasi_kdp",
        "batal_akumulasi_kdp",
        "kdp_selesai_keluar",
        "kdp_selesai_masuk",
        "pemecahan_keluar",
        "pemecahan_masuk",
        "batal_pemecahan",
        "batal_pemecahan_masuk",
        "batal_reklas",
        "batal_koreksi_nilai",
        "batal_koreksi_spesifikasi",
        "batal_koreksi_pencatatan_ganda",
        "pemanfaatan",
        "pemanfaatan_selesai",
        "batal_pemanfaatan",
        "pengamanan",
        "pengembalian_pengamanan",
        "batal_pengamanan",
        "batal_pengalihan",
        "penggabungan_keluar",
        "penggabungan_masuk",
        "batal_penggabungan",
        "batal_penggabungan_masuk",
      ],
    },
  },
} as const
