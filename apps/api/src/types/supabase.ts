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
      academic_years: {
        Row: {
          created_at: string
          deleted_at: string | null
          end_date: string
          id: string
          is_active: boolean
          name: string
          school_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          end_date: string
          id?: string
          is_active?: boolean
          name: string
          school_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          end_date?: string
          id?: string
          is_active?: boolean
          name?: string
          school_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_event_receipts: {
        Row: {
          attendance_id: string | null
          device_id: string
          event_id: string
          id: string
          received_at: string
          result: Json
          school_id: string
          source: Database["public"]["Enums"]["attendance_source"]
        }
        Insert: {
          attendance_id?: string | null
          device_id: string
          event_id: string
          id?: string
          received_at?: string
          result: Json
          school_id: string
          source: Database["public"]["Enums"]["attendance_source"]
        }
        Update: {
          attendance_id?: string | null
          device_id?: string
          event_id?: string
          id?: string
          received_at?: string
          result?: Json
          school_id?: string
          source?: Database["public"]["Enums"]["attendance_source"]
        }
        Relationships: [
          {
            foreignKeyName: "attendance_event_receipts_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_event_receipts_device_fk"
            columns: ["school_id", "device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "attendance_event_receipts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_logs: {
        Row: {
          card_id: string
          class_id: string | null
          created_at: string
          device_id: string
          direction: Database["public"]["Enums"]["attendance_direction"]
          event_id: string
          id: string
          is_late: boolean
          local_sequence: number
          metadata: Json
          occurred_at_local: string
          occurred_at_server: string
          school_id: string
          source: Database["public"]["Enums"]["attendance_source"]
          student_id: string
        }
        Insert: {
          card_id: string
          class_id?: string | null
          created_at?: string
          device_id: string
          direction: Database["public"]["Enums"]["attendance_direction"]
          event_id: string
          id?: string
          is_late?: boolean
          local_sequence: number
          metadata?: Json
          occurred_at_local: string
          occurred_at_server?: string
          school_id: string
          source: Database["public"]["Enums"]["attendance_source"]
          student_id: string
        }
        Update: {
          card_id?: string
          class_id?: string | null
          created_at?: string
          device_id?: string
          direction?: Database["public"]["Enums"]["attendance_direction"]
          event_id?: string
          id?: string
          is_late?: boolean
          local_sequence?: number
          metadata?: Json
          occurred_at_local?: string
          occurred_at_server?: string
          school_id?: string
          source?: Database["public"]["Enums"]["attendance_source"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_card_fk"
            columns: ["school_id", "card_id"]
            isOneToOne: false
            referencedRelation: "student_cards"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "attendance_logs_class_fk"
            columns: ["school_id", "class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "attendance_logs_device_fk"
            columns: ["school_id", "device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "attendance_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_student_fk"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      attendance_rules: {
        Row: {
          checkout_start: string | null
          created_at: string
          deleted_at: string | null
          device_id: string | null
          duplicate_window_seconds: number
          entry_start: string | null
          id: string
          is_active: boolean
          mode: Database["public"]["Enums"]["gate_mode"]
          name: string
          on_time_until: string | null
          school_id: string
          updated_at: string
        }
        Insert: {
          checkout_start?: string | null
          created_at?: string
          deleted_at?: string | null
          device_id?: string | null
          duplicate_window_seconds?: number
          entry_start?: string | null
          id?: string
          is_active?: boolean
          mode?: Database["public"]["Enums"]["gate_mode"]
          name: string
          on_time_until?: string | null
          school_id: string
          updated_at?: string
        }
        Update: {
          checkout_start?: string | null
          created_at?: string
          deleted_at?: string | null
          device_id?: string | null
          duplicate_window_seconds?: number
          entry_start?: string | null
          id?: string
          is_active?: boolean
          mode?: Database["public"]["Enums"]["gate_mode"]
          name?: string
          on_time_until?: string | null
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_rules_device_fk"
            columns: ["school_id", "device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "attendance_rules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          http_status: number | null
          id: string
          metadata: Json
          occurred_at: string
          request_id: string | null
          resource_id: string | null
          resource_type: string
          route: string | null
          school_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          http_status?: number | null
          id?: string
          metadata?: Json
          occurred_at?: string
          request_id?: string | null
          resource_id?: string | null
          resource_type: string
          route?: string | null
          school_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          http_status?: number | null
          id?: string
          metadata?: Json
          occurred_at?: string
          request_id?: string | null
          resource_id?: string | null
          resource_type?: string
          route?: string | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      card_batches: {
        Row: {
          academic_year_id: string | null
          class_id: string | null
          created_at: string
          created_by: string
          id: string
          school_id: string
          template_version: string
        }
        Insert: {
          academic_year_id?: string | null
          class_id?: string | null
          created_at?: string
          created_by: string
          id: string
          school_id: string
          template_version?: string
        }
        Update: {
          academic_year_id?: string | null
          class_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          school_id?: string
          template_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_batches_school_id_class_id_academic_year_id_fkey"
            columns: ["school_id", "class_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["school_id", "id", "academic_year_id"]
          },
          {
            foreignKeyName: "card_batches_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      card_print_events: {
        Row: {
          actor_id: string
          batch_id: string
          created_at: string
          id: string
          kind: string
          reason: string
          school_id: string
        }
        Insert: {
          actor_id: string
          batch_id: string
          created_at?: string
          id: string
          kind: string
          reason: string
          school_id: string
        }
        Update: {
          actor_id?: string
          batch_id?: string
          created_at?: string
          id?: string
          kind?: string
          reason?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_print_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_print_events_school_id_batch_id_fkey"
            columns: ["school_id", "batch_id"]
            isOneToOne: false
            referencedRelation: "card_batches"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "card_print_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      card_write_jobs: {
        Row: {
          attempt_count: number
          card_id: string
          completed_at: string | null
          completion_device_id: string | null
          completion_result: Json | null
          completion_token: string | null
          created_at: string
          created_by: string
          id: string
          idempotency_key: string
          last_error_code: string | null
          lease_expires_at: string | null
          lease_token: string | null
          leased_by_device_id: string | null
          max_attempts: number
          school_id: string
          status: Database["public"]["Enums"]["card_write_job_status"]
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          card_id: string
          completed_at?: string | null
          completion_device_id?: string | null
          completion_result?: Json | null
          completion_token?: string | null
          created_at?: string
          created_by: string
          id?: string
          idempotency_key: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          leased_by_device_id?: string | null
          max_attempts?: number
          school_id: string
          status?: Database["public"]["Enums"]["card_write_job_status"]
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          card_id?: string
          completed_at?: string | null
          completion_device_id?: string | null
          completion_result?: Json | null
          completion_token?: string | null
          created_at?: string
          created_by?: string
          id?: string
          idempotency_key?: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          leased_by_device_id?: string | null
          max_attempts?: number
          school_id?: string
          status?: Database["public"]["Enums"]["card_write_job_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_write_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_write_jobs_school_id_card_id_fkey"
            columns: ["school_id", "card_id"]
            isOneToOne: false
            referencedRelation: "student_cards"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "card_write_jobs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_write_jobs_school_id_leased_by_device_id_fkey"
            columns: ["school_id", "leased_by_device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      card_write_logs: {
        Row: {
          attempt: number
          created_at: string
          device_id: string
          error_code: string | null
          expected_qr: string
          expected_rfid: string
          id: string
          job_id: string
          observed_qr: string | null
          observed_rfid: string | null
          qr_verified: boolean
          rfid_verified: boolean
          school_id: string
          success: boolean
        }
        Insert: {
          attempt: number
          created_at?: string
          device_id: string
          error_code?: string | null
          expected_qr: string
          expected_rfid: string
          id?: string
          job_id: string
          observed_qr?: string | null
          observed_rfid?: string | null
          qr_verified: boolean
          rfid_verified: boolean
          school_id: string
          success: boolean
        }
        Update: {
          attempt?: number
          created_at?: string
          device_id?: string
          error_code?: string | null
          expected_qr?: string
          expected_rfid?: string
          id?: string
          job_id?: string
          observed_qr?: string | null
          observed_rfid?: string | null
          qr_verified?: boolean
          rfid_verified?: boolean
          school_id?: string
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "card_write_logs_school_id_device_id_fkey"
            columns: ["school_id", "device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "card_write_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_write_logs_school_id_job_id_fkey"
            columns: ["school_id", "job_id"]
            isOneToOne: false
            referencedRelation: "card_write_jobs"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      classes: {
        Row: {
          academic_year_id: string
          code: string
          created_at: string
          deleted_at: string | null
          grade_level: number | null
          homeroom_teacher_user_id: string | null
          id: string
          is_active: boolean
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          code: string
          created_at?: string
          deleted_at?: string | null
          grade_level?: number | null
          homeroom_teacher_user_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          code?: string
          created_at?: string
          deleted_at?: string | null
          grade_level?: number | null
          homeroom_teacher_user_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_academic_year_fk"
            columns: ["school_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "classes_homeroom_teacher_user_id_fkey"
            columns: ["homeroom_teacher_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_daily_snapshots: {
        Row: {
          generated_at: string
          id: string
          metric_date: string
          metrics: Json
          school_id: string
          stale_after: string
        }
        Insert: {
          generated_at?: string
          id?: string
          metric_date: string
          metrics: Json
          school_id: string
          stale_after: string
        }
        Update: {
          generated_at?: string
          id?: string
          metric_date?: string
          metrics?: Json
          school_id?: string
          stale_after?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_daily_snapshots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      data_retention_policies: {
        Row: {
          created_at: string
          data_category: string
          id: string
          is_active: boolean
          legal_basis: string
          retention_days: number
          school_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_category: string
          id?: string
          is_active?: boolean
          legal_basis: string
          retention_days: number
          school_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_category?: string
          id?: string
          is_active?: boolean
          legal_basis?: string
          retention_days?: number
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_retention_policies_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      device_credentials: {
        Row: {
          created_at: string
          device_id: string
          expires_at: string | null
          id: string
          label: string | null
          last_used_at: string | null
          revoked_at: string | null
          school_id: string
          secret_hash: string
        }
        Insert: {
          created_at?: string
          device_id: string
          expires_at?: string | null
          id?: string
          label?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          school_id: string
          secret_hash: string
        }
        Update: {
          created_at?: string
          device_id?: string
          expires_at?: string | null
          id?: string
          label?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          school_id?: string
          secret_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_credentials_device_fk"
            columns: ["school_id", "device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "device_credentials_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      device_heartbeats: {
        Row: {
          device_id: string
          firmware_version: string
          id: string
          last_error: string | null
          received_at: string
          reported_at: string
          school_id: string
          signal_strength: number | null
          storage_status: Json
          uptime_seconds: number
        }
        Insert: {
          device_id: string
          firmware_version: string
          id?: string
          last_error?: string | null
          received_at?: string
          reported_at: string
          school_id: string
          signal_strength?: number | null
          storage_status?: Json
          uptime_seconds: number
        }
        Update: {
          device_id?: string
          firmware_version?: string
          id?: string
          last_error?: string | null
          received_at?: string
          reported_at?: string
          school_id?: string
          signal_strength?: number | null
          storage_status?: Json
          uptime_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "device_heartbeats_device_fk"
            columns: ["school_id", "device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "device_heartbeats_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          config: Json
          created_at: string
          deleted_at: string | null
          device_code: string
          device_type: Database["public"]["Enums"]["device_type"]
          firmware_version: string | null
          hardware_version: string | null
          id: string
          last_seen_at: string | null
          location: string | null
          name: string
          school_id: string
          status: Database["public"]["Enums"]["device_status"]
          update_channel: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          deleted_at?: string | null
          device_code: string
          device_type: Database["public"]["Enums"]["device_type"]
          firmware_version?: string | null
          hardware_version?: string | null
          id?: string
          last_seen_at?: string | null
          location?: string | null
          name: string
          school_id: string
          status?: Database["public"]["Enums"]["device_status"]
          update_channel?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          deleted_at?: string | null
          device_code?: string
          device_type?: Database["public"]["Enums"]["device_type"]
          firmware_version?: string | null
          hardware_version?: string | null
          id?: string
          last_seen_at?: string | null
          location?: string | null
          name?: string
          school_id?: string
          status?: Database["public"]["Enums"]["device_status"]
          update_channel?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      extracurricular_attendance: {
        Row: {
          created_at: string
          extracurricular_id: string
          id: string
          notes: string | null
          recorded_at: string
          recorded_by: string
          school_id: string
          session_id: string
          status: Database["public"]["Enums"]["extracurricular_attendance_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          extracurricular_id: string
          id?: string
          notes?: string | null
          recorded_at?: string
          recorded_by: string
          school_id: string
          session_id: string
          status: Database["public"]["Enums"]["extracurricular_attendance_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          extracurricular_id?: string
          id?: string
          notes?: string | null
          recorded_at?: string
          recorded_by?: string
          school_id?: string
          session_id?: string
          status?: Database["public"]["Enums"]["extracurricular_attendance_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "extracurricular_attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracurricular_attendance_school_id_extracurricular_id_st_fkey"
            columns: ["school_id", "extracurricular_id", "student_id"]
            isOneToOne: false
            referencedRelation: "extracurricular_members"
            referencedColumns: ["school_id", "extracurricular_id", "student_id"]
          },
          {
            foreignKeyName: "extracurricular_attendance_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracurricular_attendance_school_id_session_id_extracurri_fkey"
            columns: ["school_id", "session_id", "extracurricular_id"]
            isOneToOne: false
            referencedRelation: "extracurricular_sessions"
            referencedColumns: ["school_id", "id", "extracurricular_id"]
          },
        ]
      }
      extracurricular_events: {
        Row: {
          aggregate_id: string
          event_type: string
          id: string
          occurred_at: string
          payload: Json
          published_at: string | null
          school_id: string
        }
        Insert: {
          aggregate_id: string
          event_type: string
          id?: string
          occurred_at?: string
          payload: Json
          published_at?: string | null
          school_id: string
        }
        Update: {
          aggregate_id?: string
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json
          published_at?: string | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extracurricular_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      extracurricular_members: {
        Row: {
          created_at: string
          enrolled_at: string
          enrolled_by: string
          extracurricular_id: string
          id: string
          idempotency_key: string
          school_id: string
          status: Database["public"]["Enums"]["extracurricular_member_status"]
          student_id: string
        }
        Insert: {
          created_at?: string
          enrolled_at?: string
          enrolled_by: string
          extracurricular_id: string
          id?: string
          idempotency_key: string
          school_id: string
          status?: Database["public"]["Enums"]["extracurricular_member_status"]
          student_id: string
        }
        Update: {
          created_at?: string
          enrolled_at?: string
          enrolled_by?: string
          extracurricular_id?: string
          id?: string
          idempotency_key?: string
          school_id?: string
          status?: Database["public"]["Enums"]["extracurricular_member_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extracurricular_members_enrolled_by_fkey"
            columns: ["enrolled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracurricular_members_school_id_extracurricular_id_fkey"
            columns: ["school_id", "extracurricular_id"]
            isOneToOne: false
            referencedRelation: "extracurriculars"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "extracurricular_members_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracurricular_members_school_id_student_id_fkey"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      extracurricular_sessions: {
        Row: {
          created_at: string
          created_by: string
          ends_at: string
          extracurricular_id: string
          id: string
          name: string
          school_id: string
          starts_at: string
          status: Database["public"]["Enums"]["extracurricular_session_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          ends_at: string
          extracurricular_id: string
          id?: string
          name: string
          school_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["extracurricular_session_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          ends_at?: string
          extracurricular_id?: string
          id?: string
          name?: string
          school_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["extracurricular_session_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "extracurricular_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracurricular_sessions_school_id_extracurricular_id_fkey"
            columns: ["school_id", "extracurricular_id"]
            isOneToOne: false
            referencedRelation: "extracurriculars"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "extracurricular_sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      extracurriculars: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "extracurriculars_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      led_acknowledgements: {
        Row: {
          acknowledged_at: string
          content_id: string
          content_version: number
          device_id: string
          error_code: string | null
          id: string
          school_id: string
          success: boolean
        }
        Insert: {
          acknowledged_at?: string
          content_id: string
          content_version: number
          device_id: string
          error_code?: string | null
          id?: string
          school_id: string
          success: boolean
        }
        Update: {
          acknowledged_at?: string
          content_id?: string
          content_version?: number
          device_id?: string
          error_code?: string | null
          id?: string
          school_id?: string
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "led_acknowledgements_school_id_content_id_fkey"
            columns: ["school_id", "content_id"]
            isOneToOne: false
            referencedRelation: "led_content"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "led_acknowledgements_school_id_device_id_fkey"
            columns: ["school_id", "device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "led_acknowledgements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      led_content: {
        Row: {
          body: string
          created_at: string
          created_by: string
          ends_at: string | null
          id: string
          is_active: boolean
          priority: Database["public"]["Enums"]["led_content_priority"]
          school_id: string
          starts_at: string
          title: string | null
          updated_at: string
          version: number
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          priority: Database["public"]["Enums"]["led_content_priority"]
          school_id: string
          starts_at?: string
          title?: string | null
          updated_at?: string
          version?: never
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          priority?: Database["public"]["Enums"]["led_content_priority"]
          school_id?: string
          starts_at?: string
          title?: string | null
          updated_at?: string
          version?: never
        }
        Relationships: [
          {
            foreignKeyName: "led_content_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "led_content_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      led_gateway_heartbeats: {
        Row: {
          cached_content_id: string | null
          controller_online: boolean
          device_id: string
          firmware_version: string
          id: string
          last_error: string | null
          received_at: string
          reported_at: string
          school_id: string
        }
        Insert: {
          cached_content_id?: string | null
          controller_online: boolean
          device_id: string
          firmware_version: string
          id?: string
          last_error?: string | null
          received_at?: string
          reported_at: string
          school_id: string
        }
        Update: {
          cached_content_id?: string | null
          controller_online?: boolean
          device_id?: string
          firmware_version?: string
          id?: string
          last_error?: string | null
          received_at?: string
          reported_at?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "led_gateway_heartbeats_school_id_cached_content_id_fkey"
            columns: ["school_id", "cached_content_id"]
            isOneToOne: false
            referencedRelation: "led_content"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "led_gateway_heartbeats_school_id_device_id_fkey"
            columns: ["school_id", "device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "led_gateway_heartbeats_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      library_events: {
        Row: {
          aggregate_id: string
          event_type: string
          id: string
          occurred_at: string
          payload: Json
          published_at: string | null
          school_id: string
        }
        Insert: {
          aggregate_id: string
          event_type: string
          id?: string
          occurred_at?: string
          payload: Json
          published_at?: string | null
          school_id: string
        }
        Update: {
          aggregate_id?: string
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json
          published_at?: string | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      library_visits: {
        Row: {
          class_id: string | null
          device_id: string | null
          event_id: string
          id: string
          local_sequence: number
          metadata: Json
          occurred_at: string
          received_at: string
          school_id: string
          source: Database["public"]["Enums"]["library_visit_source"]
          student_id: string
        }
        Insert: {
          class_id?: string | null
          device_id?: string | null
          event_id: string
          id?: string
          local_sequence: number
          metadata?: Json
          occurred_at: string
          received_at?: string
          school_id: string
          source: Database["public"]["Enums"]["library_visit_source"]
          student_id: string
        }
        Update: {
          class_id?: string | null
          device_id?: string | null
          event_id?: string
          id?: string
          local_sequence?: number
          metadata?: Json
          occurred_at?: string
          received_at?: string
          school_id?: string
          source?: Database["public"]["Enums"]["library_visit_source"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_visits_school_id_class_id_fkey"
            columns: ["school_id", "class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "library_visits_school_id_device_id_fkey"
            columns: ["school_id", "device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "library_visits_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_visits_school_id_student_id_fkey"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      parent_link_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          relationship: Database["public"]["Enums"]["parent_relationship"]
          school_id: string
          student_id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          relationship: Database["public"]["Enums"]["parent_relationship"]
          school_id: string
          student_id: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          relationship?: Database["public"]["Enums"]["parent_relationship"]
          school_id?: string
          student_id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parent_link_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_link_tokens_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_link_tokens_student_fk"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      parent_profiles: {
        Row: {
          created_at: string
          full_name: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_student_links: {
        Row: {
          portal_session_id: string | null
          id: string
          linked_at: string
          parent_user_id: string
          relationship: Database["public"]["Enums"]["parent_relationship"]
          revoked_at: string | null
          school_id: string
          status: Database["public"]["Enums"]["parent_link_status"]
          student_id: string
        }
        Insert: {
          portal_session_id?: string | null
          id?: string
          linked_at?: string
          parent_user_id: string
          relationship: Database["public"]["Enums"]["parent_relationship"]
          revoked_at?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["parent_link_status"]
          student_id: string
        }
        Update: {
          portal_session_id?: string | null
          id?: string
          linked_at?: string
          parent_user_id?: string
          relationship?: Database["public"]["Enums"]["parent_relationship"]
          revoked_at?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["parent_link_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_student_links_parent_user_id_fkey"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_student_links_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_student_links_student_fk"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          school_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          school_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permissions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_operations: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          kind: string
          request_hash: string
          school_id: string | null
          user_id: string | null
        }
        Insert: {
          actor_id: string
          created_at?: string
          id: string
          kind: string
          request_hash: string
          school_id?: string | null
          user_id?: string | null
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          kind?: string
          request_hash?: string
          school_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_operations_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_operations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_operations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_access_tokens: {
        Row: {
          auth_user_id: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          last_used_at: string | null
          metadata: Json | null
          revoked_at: string | null
          role_code: string
          school_id: string
          shadow_email: string
          token_hash: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          metadata?: Json | null
          revoked_at?: string | null
          role_code: string
          school_id: string
          shadow_email: string
          token_hash: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          metadata?: Json | null
          revoked_at?: string | null
          role_code?: string
          school_id?: string
          shadow_email?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_access_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_access_tokens_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_id: string
          role_id: string
          school_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_id: string
          role_id: string
          school_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_id?: string
          role_id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_fk"
            columns: ["school_id", "permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "role_permissions_role_fk"
            columns: ["school_id", "role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "role_permissions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_user_roles: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          role_id: string
          school_id: string
          school_user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          role_id: string
          school_id: string
          school_user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          role_id?: string
          school_id?: string
          school_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_user_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_user_roles_membership_fk"
            columns: ["school_id", "school_user_id"]
            isOneToOne: false
            referencedRelation: "school_users"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "school_user_roles_role_fk"
            columns: ["school_id", "role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "school_user_roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_users: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          joined_at: string | null
          school_id: string
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          joined_at?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          joined_at?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_users_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          status: Database["public"]["Enums"]["school_status"]
          timezone: string
          updated_at: string
          waste_end_time: string | null
          waste_organic_points_per_kg: number | null
          waste_inorganic_points_per_kg: number | null
          waste_start_time: string | null
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          status?: Database["public"]["Enums"]["school_status"]
          timezone?: string
          updated_at?: string
          waste_end_time?: string | null
          waste_organic_points_per_kg?: number | null
          waste_inorganic_points_per_kg?: number | null
          waste_start_time?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          status?: Database["public"]["Enums"]["school_status"]
          timezone?: string
          updated_at?: string
          waste_end_time?: string | null
          waste_organic_points_per_kg?: number | null
          waste_inorganic_points_per_kg?: number | null
          waste_start_time?: string | null
        }
        Relationships: []
      }
      student_cards: {
        Row: {
          batch_id: string | null
          card_serial: string
          card_uid: string | null
          created_at: string
          expires_at: string | null
          id: string
          issued_at: string | null
          print_snapshot: Json | null
          production_status: string
          qr_key: string
          replaces_card_id: string | null
          revoked_at: string | null
          school_id: string
          status: Database["public"]["Enums"]["card_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          card_serial: string
          card_uid?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          print_snapshot?: Json | null
          production_status?: string
          qr_key: string
          replaces_card_id?: string | null
          revoked_at?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["card_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          card_serial?: string
          card_uid?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          print_snapshot?: Json | null
          production_status?: string
          qr_key?: string
          replaces_card_id?: string | null
          revoked_at?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["card_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_cards_school_id_batch_id_fkey"
            columns: ["school_id", "batch_id"]
            isOneToOne: false
            referencedRelation: "card_batches"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "student_cards_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_cards_school_id_replaces_card_id_fkey"
            columns: ["school_id", "replaces_card_id"]
            isOneToOne: false
            referencedRelation: "student_cards"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "student_cards_student_fk"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      student_class_history: {
        Row: {
          academic_year_id: string
          class_id: string
          created_at: string
          end_date: string | null
          id: string
          is_current: boolean
          school_id: string
          start_date: string
          student_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          class_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          school_id: string
          start_date: string
          student_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          class_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          school_id?: string
          start_date?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_class_history_class_fk"
            columns: ["school_id", "class_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["school_id", "id", "academic_year_id"]
          },
          {
            foreignKeyName: "student_class_history_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_class_history_student_fk"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "student_class_history_year_fk"
            columns: ["school_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      students: {
        Row: {
          photo_url: string | null
          created_at: string
          date_of_birth: string | null
          deleted_at: string | null
          deleted_by: string | null
          full_name: string
          gender: Database["public"]["Enums"]["gender_type"]
          id: string
          is_active: boolean
          nisn: string | null
          school_id: string
          student_number: string
          updated_at: string
        }
        Insert: {
          photo_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          full_name: string
          gender?: Database["public"]["Enums"]["gender_type"]
          id?: string
          is_active?: boolean
          nisn?: string | null
          school_id: string
          student_number: string
          updated_at?: string
        }
        Update: {
          photo_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          full_name?: string
          gender?: Database["public"]["Enums"]["gender_type"]
          id?: string
          is_active?: boolean
          nisn?: string | null
          school_id?: string
          student_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          full_name: string
          id: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      waste_transactions: {
        Row: {
          class_id: string
          created_at: string
          event_id: string
          id: string
          inorganic_kg: number
          points_earned: number | null
          organic_kg: number
          school_id: string
          source: Database["public"]["Enums"]["waste_source"]
          staff_user_id: string
          student_id: string
          total_kg: number | null
        }
        Insert: {
          class_id: string
          created_at?: string
          event_id: string
          id?: string
          inorganic_kg: number
          points_earned?: number | null
          organic_kg: number
          school_id: string
          source: Database["public"]["Enums"]["waste_source"]
          staff_user_id: string
          student_id: string
          total_kg?: number | null
        }
        Update: {
          class_id?: string
          created_at?: string
          event_id?: string
          id?: string
          inorganic_kg?: number
          points_earned?: number | null
          organic_kg?: number
          school_id?: string
          source?: Database["public"]["Enums"]["waste_source"]
          staff_user_id?: string
          student_id?: string
          total_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "waste_class_fk"
            columns: ["school_id", "class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "waste_student_fk"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "waste_transactions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_transactions_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      waste_dashboard: { Args: { p_school_id: string; p_period?: string }; Returns: Json }
      acknowledge_led_content: {
        Args: {
          device_secret: string
          p_content_id: string
          p_content_version: number
          p_error_code: string
          p_success: boolean
          target_device_id: string
        }
        Returns: Json
      }
      append_audit_log: {
        Args: {
          p_action: string
          p_after_data?: Json
          p_before_data?: Json
          p_http_status: number
          p_metadata?: Json
          p_request_id: string
          p_resource_id: string
          p_resource_type: string
          p_route: string
          target_school_id: string
        }
        Returns: string
      }
      can_manage_portal_access: {
        Args: { target_school_id: string }
        Returns: boolean
      }
      card_batch_action: {
        Args: {
          p_action: string
          p_batch: string
          p_event: string
          p_reason: string
        }
        Returns: undefined
      }
      card_station: {
        Args: { p_device: string; p_secret: string }
        Returns: {
          config: Json
          created_at: string
          deleted_at: string | null
          device_code: string
          device_type: Database["public"]["Enums"]["device_type"]
          firmware_version: string | null
          hardware_version: string | null
          id: string
          last_seen_at: string | null
          location: string | null
          name: string
          school_id: string
          status: Database["public"]["Enums"]["device_status"]
          update_channel: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "devices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_card_write_job: {
        Args: {
          device_secret: string
          p_lease_seconds?: number
          p_qr: string
          p_uid: string
          target_device_id: string
        }
        Returns: Json
      }
      claim_parent_link: {
        Args: {
          link_token: string
          profile_name: string
          profile_phone?: string
        }
        Returns: string
      }
      complete_card_write_job: {
        Args: {
          device_secret: string
          p_error_code?: string
          p_job_id: string
          p_lease_token: string
          p_observed_qr: string
          p_observed_rfid: string
          p_observed_uid: string
          p_retryable?: boolean
          target_device_id: string
        }
        Returns: Json
      }
      configure_school_roles: { Args: { target: string }; Returns: undefined }
      create_card_batch: {
        Args: {
          p_class?: string
          p_id: string
          p_replaces?: string
          p_school: string
          p_students: string[]
        }
        Returns: string
      }
      generate_shadow_access: {
        Args: {
          p_expires_at?: string
          p_metadata: Json
          p_role_code: string
          p_school_id: string
          p_shadow_email: string
          p_shadow_password: string
          p_token_hash: string
        }
        Returns: string
      }
      get_dashboard_today: { Args: { target_school_id: string }; Returns: Json }
      get_device_config: {
        Args: { device_secret: string; target_device_id: string }
        Returns: {
          config: Json
          device_code: string
          device_id: string
          device_type: Database["public"]["Enums"]["device_type"]
          firmware_version: string
          school_id: string
          update_channel: string
        }[]
      }
      get_led_gateway_state: {
        Args: { device_secret: string; target_device_id: string }
        Returns: Json
      }
      get_parent_child_today: {
        Args: { target_student_id: string }
        Returns: Json
      }
      get_parent_children: {
        Args: never
        Returns: {
          class_name: string
          full_name: string
          link_id: string
          relationship: Database["public"]["Enums"]["parent_relationship"]
          school_id: string
          school_name: string
          student_id: string
          student_number: string
        }[]
      }
      get_portal_context: { Args: never; Returns: Json }
      has_school_access: {
        Args: { target_school_id: string }
        Returns: boolean
      }
      has_school_permission: {
        Args: { permission_code: string; target_school_id: string }
        Returns: boolean
      }
      ingest_gate_attendance: {
        Args: {
          attendance_card_uid: string
          attendance_event_id: string
          attendance_local_sequence: number
          attendance_metadata?: Json
          attendance_occurred_at: string
          attendance_source: Database["public"]["Enums"]["attendance_source"]
          device_secret: string
          target_device_id: string
        }
        Returns: Json
      }
      ingest_library_visit: {
        Args: {
          device_secret: string
          target_device_id: string
          visit_card_uid: string
          visit_event_id: string
          visit_local_sequence: number
          visit_metadata?: Json
          visit_occurred_at: string
          visit_source?: Database["public"]["Enums"]["library_visit_source"]
        }
        Returns: Json
      }
      is_platform_admin: { Args: never; Returns: boolean }
      link_student_to_parent_portal: {
        Args: { p_dob: string; p_nisn: string; p_parent_name: string }
        Returns: Json
      }
      manage_card_job: {
        Args: { p_action: string; p_job: string; p_reason: string }
        Returns: undefined
      }
      platform_device_status: {
        Args: {
          p_device: string
          p_status: Database["public"]["Enums"]["device_status"]
        }
        Returns: Json
      }
      platform_rotate_device: {
        Args: { p_device: string; p_hash: string }
        Returns: undefined
      }
      platform_update_membership: {
        Args: {
          p_id: string
          p_roles: string[]
          p_status: Database["public"]["Enums"]["membership_status"]
        }
        Returns: Json
      }
      platform_update_school: {
        Args: {
          p_name: string
          p_school: string
          p_status: Database["public"]["Enums"]["school_status"]
          p_timezone: string
        }
        Returns: Json
      }
      portal_class_allowed: {
        Args: { target_class_id: string; target_school_id: string }
        Returns: boolean
      }
      portal_session_active: { Args: never; Returns: boolean }
      portal_student_allowed: {
        Args: { target_school_id: string; target_student_id: string }
        Returns: boolean
      }
      provision_portal_access: {
        Args: {
          p_actor_id: string
          p_email: string
          p_metadata: Json
          p_role_code: string
          p_school_id: string
          p_token_hash: string
          p_user_id: string
        }
        Returns: string
      }
      provision_school: {
        Args: {
          p_actor: string
          p_code: string
          p_existing_school: string
          p_full_name: string
          p_hash: string
          p_name: string
          p_operation: string
          p_timezone: string
          p_user: string
        }
        Returns: Json
      }
      reap_card_jobs: { Args: { p_school: string }; Returns: undefined }
      reconcile_card_jobs: { Args: never; Returns: undefined }
      record_device_heartbeat: {
        Args: {
          device_secret: string
          heartbeat_firmware_version: string
          heartbeat_last_error: string
          heartbeat_reported_at: string
          heartbeat_signal_strength: number
          heartbeat_storage_status: Json
          heartbeat_uptime_seconds: number
          target_device_id: string
        }
        Returns: {
          device_id: string
          firmware_version: string
          id: string
          last_error: string | null
          received_at: string
          reported_at: string
          school_id: string
          signal_strength: number | null
          storage_status: Json
          uptime_seconds: number
        }
        SetofOptions: {
          from: "*"
          to: "device_heartbeats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_led_heartbeat: {
        Args: {
          device_secret: string
          p_cached_content_id: string
          p_controller_online: boolean
          p_firmware_version: string
          p_last_error: string
          p_reported_at: string
          target_device_id: string
        }
        Returns: Json
      }
      record_portal_library_visit: {
        Args: {
          p_card_uid: string
          p_event_id: string
          p_local_sequence: number
          p_occurred_at: string
          target_school_id: string
        }
        Returns: Json
      }
      record_student_class_history: {
        Args: {
          effective_start_date: string
          target_academic_year_id: string
          target_class_id: string
          target_school_id: string
          target_student_id: string
        }
        Returns: {
          academic_year_id: string
          class_id: string
          created_at: string
          end_date: string | null
          id: string
          is_current: boolean
          school_id: string
          start_date: string
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "student_class_history"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refresh_dashboard_today: {
        Args: { target_school_id: string }
        Returns: Json
      }
      register_device: {
        Args: {
          new_config: Json
          new_device_code: string
          new_device_type: Database["public"]["Enums"]["device_type"]
          new_firmware_version: string
          new_hardware_version: string
          new_location: string
          new_name: string
          new_secret_hash: string
          new_update_channel: string
          target_school_id: string
        }
        Returns: {
          config: Json
          created_at: string
          deleted_at: string | null
          device_code: string
          device_type: Database["public"]["Enums"]["device_type"]
          firmware_version: string | null
          hardware_version: string | null
          id: string
          last_seen_at: string | null
          location: string | null
          name: string
          school_id: string
          status: Database["public"]["Enums"]["device_status"]
          update_channel: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "devices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_student_card: {
        Args: { p_qr: string; p_school: string }
        Returns: Json
      }
      revoke_portal_access: { Args: { p_token_id: string }; Returns: undefined }
      set_card_status: {
        Args: {
          p_card: string
          p_expires?: string
          p_reason: string
          p_status: Database["public"]["Enums"]["card_status"]
        }
        Returns: Json
      }
      switch_academic_year: {
        Args: { target_academic_year_id: string; target_school_id: string }
        Returns: {
          created_at: string
          deleted_at: string | null
          end_date: string
          id: string
          is_active: boolean
          name: string
          school_id: string
          start_date: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "academic_years"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sync_gate_attendance_batch: {
        Args: {
          attendance_events: Json
          device_secret: string
          target_device_id: string
        }
        Returns: Json
      }
      sync_library_visits: {
        Args: {
          device_secret: string
          target_device_id: string
          visit_events: Json
        }
        Returns: Json
      }
    }
    Enums: {
      attendance_direction: "CHECK_IN" | "CHECK_OUT"
      attendance_source: "REALTIME" | "OFFLINE_SYNC"
      card_status: "ACTIVE" | "LOST" | "BLOCKED" | "REPLACED" | "EXPIRED"
      card_write_job_status:
        | "QUEUED"
        | "LEASED"
        | "SUCCEEDED"
        | "FAILED"
        | "CANCELLED"
      device_status:
        | "PROVISIONING"
        | "ACTIVE"
        | "DISABLED"
        | "MAINTENANCE"
        | "RETIRED"
      device_type:
        | "GATE"
        | "LIBRARY"
        | "LED"
        | "CARD_STATION"
        | "WASTE_SCALE"
        | "OTHER"
      extracurricular_attendance_status: "PRESENT" | "EXCUSED" | "ABSENT"
      extracurricular_member_status: "ACTIVE" | "INACTIVE"
      extracurricular_session_status:
        | "SCHEDULED"
        | "OPEN"
        | "CLOSED"
        | "CANCELLED"
      gate_mode: "AUTO" | "ENTRY_ONLY" | "EXIT_ONLY"
      gender_type: "MALE" | "FEMALE" | "OTHER" | "UNDISCLOSED"
      led_content_priority:
        | "RUNNING_TEXT"
        | "NORMAL_DASHBOARD"
        | "ACHIEVEMENT"
        | "ADMIN_OVERRIDE"
        | "EMERGENCY"
      library_visit_source: "REALTIME" | "OFFLINE_SYNC"
      membership_status: "INVITED" | "ACTIVE" | "SUSPENDED" | "REVOKED"
      parent_link_status: "ACTIVE" | "REVOKED"
      parent_relationship: "FATHER" | "MOTHER" | "GUARDIAN" | "OTHER"
      school_status: "ACTIVE" | "SUSPENDED" | "INACTIVE"
      waste_source: "MANUAL" | "SCALE"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      attendance_direction: ["CHECK_IN", "CHECK_OUT"],
      attendance_source: ["REALTIME", "OFFLINE_SYNC"],
      card_status: ["ACTIVE", "LOST", "BLOCKED", "REPLACED", "EXPIRED"],
      card_write_job_status: [
        "QUEUED",
        "LEASED",
        "SUCCEEDED",
        "FAILED",
        "CANCELLED",
      ],
      device_status: [
        "PROVISIONING",
        "ACTIVE",
        "DISABLED",
        "MAINTENANCE",
        "RETIRED",
      ],
      device_type: [
        "GATE",
        "LIBRARY",
        "LED",
        "CARD_STATION",
        "WASTE_SCALE",
        "OTHER",
      ],
      extracurricular_attendance_status: ["PRESENT", "EXCUSED", "ABSENT"],
      extracurricular_member_status: ["ACTIVE", "INACTIVE"],
      extracurricular_session_status: [
        "SCHEDULED",
        "OPEN",
        "CLOSED",
        "CANCELLED",
      ],
      gate_mode: ["AUTO", "ENTRY_ONLY", "EXIT_ONLY"],
      gender_type: ["MALE", "FEMALE", "OTHER", "UNDISCLOSED"],
      led_content_priority: [
        "RUNNING_TEXT",
        "NORMAL_DASHBOARD",
        "ACHIEVEMENT",
        "ADMIN_OVERRIDE",
        "EMERGENCY",
      ],
      library_visit_source: ["REALTIME", "OFFLINE_SYNC"],
      membership_status: ["INVITED", "ACTIVE", "SUSPENDED", "REVOKED"],
      parent_link_status: ["ACTIVE", "REVOKED"],
      parent_relationship: ["FATHER", "MOTHER", "GUARDIAN", "OTHER"],
      school_status: ["ACTIVE", "SUSPENDED", "INACTIVE"],
      waste_source: ["MANUAL", "SCALE"],
    },
  },
} as const
