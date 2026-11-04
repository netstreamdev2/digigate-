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
    PostgrestVersion: "14.18"
  }
  digigate: {
    Tables: {
      alerts: {
        Row: {
          event_id: string | null
          id: string
          org_id: string
          post: string | null
          raised_at: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          rule_code: string
          severity: string
          site_id: string
          source: string
          status: string
          visit_id: string | null
        }
        Insert: {
          event_id?: string | null
          id?: string
          org_id: string
          post?: string | null
          raised_at: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_code: string
          severity: string
          site_id: string
          source: string
          status?: string
          visit_id?: string | null
        }
        Update: {
          event_id?: string | null
          id?: string
          org_id?: string
          post?: string | null
          raised_at?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_code?: string
          severity?: string
          site_id?: string
          source?: string
          status?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "check_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          at: string
          category: string
          detail: string | null
          device_id: string | null
          id: string
          org_id: string | null
          site_id: string | null
          target: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          at?: string
          category: string
          detail?: string | null
          device_id?: string | null
          id?: string
          org_id?: string | null
          site_id?: string | null
          target?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          at?: string
          category?: string
          detail?: string | null
          device_id?: string | null
          id?: string
          org_id?: string | null
          site_id?: string | null
          target?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_activity: {
        Row: {
          acknowledged: number
          blocked: number
          checks: number
          day: string
          exits: number
          hours: number[]
          org_id: string
          overrides: number
          people_in: number
          rules: Json
          site_id: string
          stay_minutes: number
          turned_away: number
          vehicles_in: number
          visit_types: Json
          warnings: number
        }
        Insert: {
          acknowledged?: number
          blocked?: number
          checks?: number
          day: string
          exits?: number
          hours?: number[]
          org_id: string
          overrides?: number
          people_in?: number
          rules?: Json
          site_id: string
          stay_minutes?: number
          turned_away?: number
          vehicles_in?: number
          visit_types?: Json
          warnings?: number
        }
        Update: {
          acknowledged?: number
          blocked?: number
          checks?: number
          day?: string
          exits?: number
          hours?: number[]
          org_id?: string
          overrides?: number
          people_in?: number
          rules?: Json
          site_id?: string
          stay_minutes?: number
          turned_away?: number
          vehicles_in?: number
          visit_types?: Json
          warnings?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_activity_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_counts: {
        Row: {
          age_band: string
          day: string
          kind: string
          org_id: string
          sex: string
          site_id: string
          visit_type: string
          visits: number
        }
        Insert: {
          age_band?: string
          day: string
          kind: string
          org_id: string
          sex?: string
          site_id: string
          visit_type: string
          visits?: number
        }
        Update: {
          age_band?: string
          day?: string
          kind?: string
          org_id?: string
          sex?: string
          site_id?: string
          visit_type?: string
          visits?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_counts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          health: Json | null
          health_at: string | null
          id: string
          last_seen_at: string | null
          name: string
          org_id: string
          paired_at: string
          revoked_at: string | null
          revoked_by: string | null
          site_id: string
          token_hash: string
        }
        Insert: {
          health?: Json | null
          health_at?: string | null
          id?: string
          last_seen_at?: string | null
          name: string
          org_id: string
          paired_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
          site_id: string
          token_hash: string
        }
        Update: {
          health?: Json | null
          health_at?: string | null
          id?: string
          last_seen_at?: string | null
          name?: string
          org_id?: string
          paired_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
          site_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_site_id_org_id_fkey"
            columns: ["site_id", "org_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      engagements: {
        Row: {
          client_id: string
          ended_at: string | null
          id: string
          org_id: string
          started_at: string
        }
        Insert: {
          client_id: string
          ended_at?: string | null
          id?: string
          org_id: string
          started_at?: string
        }
        Update: {
          client_id?: string
          ended_at?: string | null
          id?: string
          org_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      erasure_files: {
        Row: {
          bucket: string
          path: string
          queued_at: string
        }
        Insert: {
          bucket: string
          path: string
          queued_at?: string
        }
        Update: {
          bucket?: string
          path?: string
          queued_at?: string
        }
        Relationships: []
      }
      event_details: {
        Row: {
          erase_after: string | null
          event_id: string
          gate_user_id: string | null
          licence_photo_path: string | null
          org_id: string
          payload: Json
          site_id: string
          visit_id: string | null
        }
        Insert: {
          erase_after?: string | null
          event_id: string
          gate_user_id?: string | null
          licence_photo_path?: string | null
          org_id: string
          payload: Json
          site_id: string
          visit_id?: string | null
        }
        Update: {
          erase_after?: string | null
          event_id?: string
          gate_user_id?: string | null
          licence_photo_path?: string | null
          org_id?: string
          payload?: Json
          site_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_details_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "check_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_details_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          device_id: string
          id: string
          occurred_at: string
          org_id: string
          outcome: string | null
          received_at: string
          rule_codes: string[]
          shift_id: string | null
          site_id: string
          type: string
          visit_id: string | null
        }
        Insert: {
          device_id: string
          id: string
          occurred_at: string
          org_id: string
          outcome?: string | null
          received_at?: string
          rule_codes?: string[]
          shift_id?: string | null
          site_id: string
          type: string
          visit_id?: string | null
        }
        Update: {
          device_id?: string
          id?: string
          occurred_at?: string
          org_id?: string
          outcome?: string | null
          received_at?: string
          rule_codes?: string[]
          shift_id?: string | null
          site_id?: string
          type?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      expected_visitors: {
        Row: {
          arrived_at: string | null
          arrived_event: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          erase_after: string
          id: string
          id_last_four: string | null
          note: string | null
          org_id: string
          person_key: string | null
          plate: string | null
          plate_key: string | null
          site_id: string
          valid_from: string
          valid_until: string
          visit_type: string | null
          visitor_name: string
        }
        Insert: {
          arrived_at?: string | null
          arrived_event?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          erase_after: string
          id?: string
          id_last_four?: string | null
          note?: string | null
          org_id: string
          person_key?: string | null
          plate?: string | null
          plate_key?: string | null
          site_id: string
          valid_from: string
          valid_until: string
          visit_type?: string | null
          visitor_name: string
        }
        Update: {
          arrived_at?: string | null
          arrived_event?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          erase_after?: string
          id?: string
          id_last_four?: string | null
          note?: string | null
          org_id?: string
          person_key?: string | null
          plate?: string | null
          plate_key?: string | null
          site_id?: string
          valid_from?: string
          valid_until?: string
          visit_type?: string | null
          visitor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "expected_visitors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expected_visitors_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_user_records: {
        Row: {
          gate_user_id: string
          home_address: string | null
          id_number_cipher: string | null
          id_number_hmac: string | null
          id_number_last4: string | null
          id_type: string | null
          next_of_kin_name: string | null
          next_of_kin_phone: string | null
          next_of_kin_relationship: string | null
          org_id: string
          phone: string | null
          photo_path: string | null
          psira_grade: string | null
          psira_number: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          gate_user_id: string
          home_address?: string | null
          id_number_cipher?: string | null
          id_number_hmac?: string | null
          id_number_last4?: string | null
          id_type?: string | null
          next_of_kin_name?: string | null
          next_of_kin_phone?: string | null
          next_of_kin_relationship?: string | null
          org_id: string
          phone?: string | null
          photo_path?: string | null
          psira_grade?: string | null
          psira_number?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          gate_user_id?: string
          home_address?: string | null
          id_number_cipher?: string | null
          id_number_hmac?: string | null
          id_number_last4?: string | null
          id_type?: string | null
          next_of_kin_name?: string | null
          next_of_kin_phone?: string | null
          next_of_kin_relationship?: string | null
          org_id?: string
          phone?: string | null
          photo_path?: string | null
          psira_grade?: string | null
          psira_number?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gate_user_records_gate_user_id_fkey"
            columns: ["gate_user_id"]
            isOneToOne: true
            referencedRelation: "gate_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_user_records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_user_records_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_users: {
        Row: {
          created_at: string
          employee_number: string
          first_name: string
          id: string
          is_active: boolean
          last_name: string
          org_id: string
          pin: Json
          pin_set_at: string
          role: string
          site_ids: string[]
        }
        Insert: {
          created_at?: string
          employee_number: string
          first_name: string
          id?: string
          is_active?: boolean
          last_name: string
          org_id: string
          pin: Json
          pin_set_at?: string
          role: string
          site_ids?: string[]
        }
        Update: {
          created_at?: string
          employee_number?: string
          first_name?: string
          id?: string
          is_active?: boolean
          last_name?: string
          org_id?: string
          pin?: Json
          pin_set_at?: string
          role?: string
          site_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "gate_users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      hotlist: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          erase_after: string | null
          expires_at: string | null
          guard_note: string
          id: string
          id_last_four: string | null
          kind: string
          label: string
          match_key: string
          org_id: string
          reason: string
          removed_at: string | null
          removed_by: string | null
          site_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          erase_after?: string | null
          expires_at?: string | null
          guard_note: string
          id?: string
          id_last_four?: string | null
          kind: string
          label: string
          match_key: string
          org_id: string
          reason: string
          removed_at?: string | null
          removed_by?: string | null
          site_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          erase_after?: string | null
          expires_at?: string | null
          guard_note?: string
          id?: string
          id_last_four?: string | null
          kind?: string
          label?: string
          match_key?: string
          org_id?: string
          reason?: string
          removed_at?: string | null
          removed_by?: string | null
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotlist_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotlist_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          brand_color: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          logo_path: string | null
          name: string
          slug: string
        }
        Insert: {
          brand_color?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          logo_path?: string | null
          name: string
          slug: string
        }
        Update: {
          brand_color?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          logo_path?: string | null
          name?: string
          slug?: string
        }
        Relationships: []
      }
      pairing_codes: {
        Row: {
          code_hash: string
          created_at: string
          created_by: string
          device_name: string
          expires_at: string
          id: string
          org_id: string
          site_id: string
          used_at: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string
          created_by?: string
          device_name: string
          expires_at: string
          id?: string
          org_id: string
          site_id: string
          used_at?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string
          created_by?: string
          device_name?: string
          expires_at?: string
          id?: string
          org_id?: string
          site_id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pairing_codes_site_id_org_id_fkey"
            columns: ["site_id", "org_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      person_keys: {
        Row: {
          created_at: string
          key: string
          org_id: string
        }
        Insert: {
          created_at?: string
          key: string
          org_id: string
        }
        Update: {
          created_at?: string
          key?: string
          org_id?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          anpr: boolean
          booms: string[]
          cctv_cameras: number
          code: string
          created_at: string
          gate_type: string
          id: string
          is_active: boolean
          label: string
          lanes: string[]
          latitude: number | null
          longitude: number | null
          manned: boolean
          org_id: string
          radius_m: number
          site_id: string
        }
        Insert: {
          anpr?: boolean
          booms?: string[]
          cctv_cameras?: number
          code: string
          created_at?: string
          gate_type?: string
          id?: string
          is_active?: boolean
          label: string
          lanes: string[]
          latitude?: number | null
          longitude?: number | null
          manned?: boolean
          org_id: string
          radius_m?: number
          site_id: string
        }
        Update: {
          anpr?: boolean
          booms?: string[]
          cctv_cameras?: number
          code?: string
          created_at?: string
          gate_type?: string
          id?: string
          is_active?: boolean
          label?: string
          lanes?: string[]
          latitude?: number | null
          longitude?: number | null
          manned?: boolean
          org_id?: string
          radius_m?: number
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_site_id_org_id_fkey"
            columns: ["site_id", "org_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      profiles: {
        Row: {
          client_id: string | null
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          login: string
          org_id: string | null
          roles: Database["digigate"]["Enums"]["dashboard_role"][]
          site_ids: string[]
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          full_name: string
          id: string
          is_active?: boolean
          login: string
          org_id?: string | null
          roles: Database["digigate"]["Enums"]["dashboard_role"][]
          site_ids?: string[]
        }
        Update: {
          client_id?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          login?: string
          org_id?: string | null
          roles?: Database["digigate"]["Enums"]["dashboard_role"][]
          site_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      report_schedules: {
        Row: {
          bcc: string[]
          cc: string[]
          client_id: string | null
          created_at: string
          created_by: string | null
          frequency: string
          id: string
          is_active: boolean
          last_run_at: string | null
          message: string
          name: string
          next_run_at: string
          org_id: string
          recipients: string[]
          send_at: string
        }
        Insert: {
          bcc?: string[]
          cc?: string[]
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          frequency: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          message?: string
          name: string
          next_run_at?: string
          org_id: string
          recipients: string[]
          send_at: string
        }
        Update: {
          bcc?: string[]
          cc?: string[]
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          message?: string
          name?: string
          next_run_at?: string
          org_id?: string
          recipients?: string[]
          send_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_schedules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      report_sends: {
        Row: {
          bcc: string[]
          cc: string[]
          client_id: string | null
          frequency: string
          id: string
          org_id: string
          period_from: string
          period_to: string
          problem: string | null
          provider_id: string | null
          recipients: string[]
          schedule_id: string | null
          sent_at: string
          sent_by: string | null
          status: string
          subject: string
        }
        Insert: {
          bcc?: string[]
          cc?: string[]
          client_id?: string | null
          frequency: string
          id?: string
          org_id: string
          period_from: string
          period_to: string
          problem?: string | null
          provider_id?: string | null
          recipients: string[]
          schedule_id?: string | null
          sent_at?: string
          sent_by?: string | null
          status: string
          subject: string
        }
        Update: {
          bcc?: string[]
          cc?: string[]
          client_id?: string | null
          frequency?: string
          id?: string
          org_id?: string
          period_from?: string
          period_to?: string
          problem?: string | null
          provider_id?: string | null
          recipients?: string[]
          schedule_id?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_sends_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_sends_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_sends_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "report_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_version: {
        Row: {
          applied_at: string
          version: number
        }
        Insert: {
          applied_at?: string
          version: number
        }
        Update: {
          applied_at?: string
          version?: number
        }
        Relationships: []
      }
      shifts: {
        Row: {
          away_reason: string | null
          away_until: string | null
          device_id: string
          end_reason: string | null
          ended_at: string | null
          erase_after: string | null
          gate_user_id: string | null
          id: string
          org_id: string
          period: string
          post: string
          selfie: string | null
          selfie_path: string | null
          site_id: string
          started_at: string
        }
        Insert: {
          away_reason?: string | null
          away_until?: string | null
          device_id: string
          end_reason?: string | null
          ended_at?: string | null
          erase_after?: string | null
          gate_user_id?: string | null
          id: string
          org_id: string
          period: string
          post: string
          selfie?: string | null
          selfie_path?: string | null
          site_id: string
          started_at: string
        }
        Update: {
          away_reason?: string | null
          away_until?: string | null
          device_id?: string
          end_reason?: string | null
          ended_at?: string | null
          erase_after?: string | null
          gate_user_id?: string | null
          id?: string
          org_id?: string
          period?: string
          post?: string
          selfie?: string | null
          selfie_path?: string | null
          site_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          address: string | null
          client_id: string
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          open_parking: boolean
          org_id: string
          overrides: Json
          parking_spaces: number | null
          radius_m: number | null
          shift_periods: Json
          site_type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          client_id: string
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          open_parking?: boolean
          org_id: string
          overrides?: Json
          parking_spaces?: number | null
          radius_m?: number | null
          shift_periods?: Json
          site_type: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          client_id?: string
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          open_parking?: boolean
          org_id?: string
          overrides?: Json
          parking_spaces?: number | null
          radius_m?: number | null
          shift_periods?: Json
          site_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_client_org_fkey"
            columns: ["client_id", "org_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "sites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_details: {
        Row: {
          disc_expires_on: string | null
          disc_number: string | null
          erase_after: string | null
          org_id: string
          person_key: string
          person_name: string
          plate: string | null
          site_id: string
          vehicle_description: string | null
          vin: string | null
          visit_id: string
        }
        Insert: {
          disc_expires_on?: string | null
          disc_number?: string | null
          erase_after?: string | null
          org_id: string
          person_key: string
          person_name: string
          plate?: string | null
          site_id: string
          vehicle_description?: string | null
          vin?: string | null
          visit_id: string
        }
        Update: {
          disc_expires_on?: string | null
          disc_number?: string | null
          erase_after?: string | null
          org_id?: string
          person_key?: string
          person_name?: string
          plate?: string | null
          site_id?: string
          vehicle_description?: string | null
          vin?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_details_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: true
            referencedRelation: "visit_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_details_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: true
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          entered_at: string
          exited_at: string | null
          id: string
          kind: string
          occupants_in: number | null
          occupants_out: number | null
          org_id: string
          post: string | null
          site_id: string
          visit_type: string
        }
        Insert: {
          entered_at: string
          exited_at?: string | null
          id: string
          kind: string
          occupants_in?: number | null
          occupants_out?: number | null
          org_id: string
          post?: string | null
          site_id: string
          visit_type: string
        }
        Update: {
          entered_at?: string
          exited_at?: string | null
          id?: string
          kind?: string
          occupants_in?: number | null
          occupants_out?: number | null
          org_id?: string
          post?: string | null
          site_id?: string
          visit_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      check_records: {
        Row: {
          details_erased: boolean | null
          id: string | null
          in_full: boolean | null
          occurred_at: string | null
          org_id: string | null
          outcome: string | null
          person_name: string | null
          plate: string | null
          post: string | null
          rule_codes: string[] | null
          site_id: string | null
          type: string | null
          typed_plate: string | null
          vehicle_description: string | null
          visit_entered_at: string | null
          visit_id: string | null
          visit_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_records: {
        Row: {
          details_erased: boolean | null
          disc_number: string | null
          entered_at: string | null
          exited_at: string | null
          id: string | null
          in_full: boolean | null
          kind: string | null
          occupants_in: number | null
          occupants_out: number | null
          org_id: string | null
          person_name: string | null
          plate: string | null
          post: string | null
          site_id: string | null
          vehicle_description: string | null
          vin: string | null
          visit_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visits_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_counts: { Args: { _a: Json; _b: Json }; Returns: Json }
      add_expected_visitor: {
        Args: {
          _from: string
          _id_number: string
          _name: string
          _note: string
          _org: string
          _plate: string
          _site: string
          _until: string
          _visit_type: string
        }
        Returns: string
      }
      add_hotlist_entry: {
        Args: {
          _expires_at?: string
          _guard_note: string
          _kind: string
          _label: string
          _org: string
          _reason: string
          _site?: string
          _value: string
        }
        Returns: string
      }
      admin_org: { Args: never; Returns: string }
      apply_passage: {
        Args: {
          _at: string
          _device: string
          _org: string
          _payload: Json
          _site: string
          _type: string
        }
        Returns: undefined
      }
      attach_licence_photo: {
        Args: { _device: string; _event: string; _path: string }
        Returns: boolean
      }
      attach_selfie: {
        Args: { _device: string; _path: string; _shift: string }
        Returns: undefined
      }
      audit_gate_event: {
        Args: {
          _at: string
          _device: string
          _gate_user: string
          _org: string
          _payload: Json
          _site: string
          _type: string
        }
        Returns: undefined
      }
      audit_summary: {
        Args: { _from: string; _org?: string; _to: string }
        Returns: {
          category: string
          entries: number
        }[]
      }
      can_manage_org: { Args: { _org: string }; Returns: boolean }
      can_watch_org: { Args: { _org: string }; Returns: boolean }
      cancel_expected_visitor: { Args: { _id: string }; Returns: undefined }
      check_detail: { Args: { _event: string }; Returns: Json }
      claim_pairing_code: {
        Args: {
          _code_hash: string
          _new_person_key: string
          _token_hash: string
        }
        Returns: {
          device_id: string
          org_id: string
          person_key: string
          site_id: string
        }[]
      }
      close_left_post: {
        Args: {
          _at: string
          _by: string
          _resolution: string
          _shift: string
          _site: string
        }
        Returns: undefined
      }
      company_board: {
        Args: { _limit: number; _offset: number; _search: string }
        Returns: {
          brand_color: string
          cars_on_site: number
          clients: number
          gate_staff: number
          id: string
          is_active: boolean
          logo_path: string
          name: string
          on_site: number
          open_alerts: number
          sites: number
          total: number
        }[]
      }
      create_site: {
        Args: {
          _access_points: Json
          _client?: string
          _org: string
          _site: Json
        }
        Returns: string
      }
      device_board: {
        Args: {
          _limit: number
          _offset: number
          _org?: string
          _search: string
          _status: string
        }
        Returns: {
          checks_today: number
          client_name: string
          guard: string
          health: Json
          health_at: string
          id: string
          last_check_at: string
          last_seen_at: string
          name: string
          org_name: string
          paired_at: string
          post: string
          site_id: string
          site_name: string
          status: string
          total: number
        }[]
      }
      device_for_token: { Args: { _token_hash: string }; Returns: string }
      device_snapshot: { Args: { _device_id: string }; Returns: Json }
      device_summary: {
        Args: { _org?: string; _search: string }
        Returns: {
          devices: number
          status: string
        }[]
      }
      erase_due: { Args: { _batch?: number }; Returns: Json }
      erasure_files_done: {
        Args: { _bucket: string; _paths: string[] }
        Returns: undefined
      }
      erasure_token_ok: { Args: { _token: string }; Returns: boolean }
      fleet: {
        Args: { _org: string; _search: string }
        Returns: {
          client_name: string
          guard: string
          health: Json
          health_at: string
          id: string
          last_seen_at: string
          name: string
          org_name: string
          paired_at: string
          post: string
          site_id: string
          site_name: string
          status: string
        }[]
      }
      free_company_code: { Args: { _name: string }; Returns: string }
      gate_board: {
        Args: { _site: string }
        Returns: {
          away_reason: string
          away_until: string
          device: string
          device_seen_at: string
          guard: string
          has_fence: boolean
          has_selfie: boolean
          label: string
          lanes: string[]
          last_check_at: string
          on_duty_since: string
          period: string
          post: string
          selfie: string
          shift_id: string
        }[]
      }
      gate_staff_board: {
        Args: {
          _limit: number
          _newest: boolean
          _offset: number
          _org?: string
          _role: string
          _search: string
          _status: string
        }
        Returns: {
          company: string
          created_at: string
          employee_number: string
          first_name: string
          id: string
          is_active: boolean
          last_name: string
          on_duty_at: string
          role: string
          site_count: number
          total: number
        }[]
      }
      gate_staff_counts: {
        Args: { _org?: string; _search: string }
        Returns: {
          is_active: boolean
          on_duty: number
          people: number
          role: string
        }[]
      }
      guard_board: {
        Args: {
          _limit: number
          _offset: number
          _org: string
          _search: string
          _status: string
        }
        Returns: {
          employee_number: string
          first_name: string
          has_address: boolean
          has_id: boolean
          has_next_of_kin: boolean
          has_photo: boolean
          has_psira: boolean
          id: string
          is_active: boolean
          last_name: string
          psira_grade: string
          role: string
          sites: string
          total: number
        }[]
      }
      hmac_sha256: { Args: { _key: string; _message: string }; Returns: string }
      hotlist_in_force: {
        Args: { _org: string; _site: string }
        Returns: {
          guard_note: string
          id: string
          kind: string
          match_key: string
        }[]
      }
      in_org: { Args: { _org: string }; Returns: boolean }
      ingest_events: {
        Args: { _device_id: string; _events: Json }
        Returns: string[]
      }
      is_super_user: { Args: never; Returns: boolean }
      licence_photo_for: {
        Args: { _event: string }
        Returns: {
          org_id: string
          path: string
          person: string
          site_id: string
        }[]
      }
      logo_company: { Args: { _name: string }; Returns: string }
      mask: { Args: { _value: string }; Returns: string }
      mfa_passed: { Args: never; Returns: boolean }
      next_report_run: {
        Args: { _after: string; _frequency: string; _send_at: string }
        Returns: string
      }
      note_sign_in: { Args: never; Returns: undefined }
      org_person_key: { Args: { _org: string }; Returns: string }
      people_board: {
        Args: {
          _limit: number
          _newest: boolean
          _offset: number
          _org?: string
          _role: string
          _search: string
          _status: string
        }
        Returns: {
          client: string
          company: string
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          login: string
          role: string
          site_count: number
          total: number
        }[]
      }
      people_counts: {
        Args: { _org?: string; _search: string }
        Returns: {
          is_active: boolean
          people: number
          role: string
        }[]
      }
      person_key_for: {
        Args: { _id_number: string; _org: string }
        Returns: string
      }
      plate_key: { Args: { _value: string }; Returns: string }
      post_code_for: {
        Args: { _label: string; _site: string }
        Returns: string
      }
      record_device_health: {
        Args: { _device: string; _health: Json }
        Returns: undefined
      }
      remove_hotlist_entry: { Args: { _id: string }; Returns: undefined }
      report_board: {
        Args: { _day: string; _limit: number; _offset: number; _search: string }
        Returns: {
          active_sites: number
          blocked: number
          checks: number
          company: string
          entries: number
          exits: number
          org_id: string
          overrides: number
          sites: number
          total: number
          trend: number[]
          warnings: number
        }[]
      }
      report_data: {
        Args: {
          _client: string
          _day: string
          _frequency: string
          _org: string
        }
        Returns: Json
      }
      report_day_totals: {
        Args: { _day: string }
        Returns: {
          blocked: number
          checks: number
          companies: number
          day: string
          entries: number
          warnings: number
        }[]
      }
      report_period: {
        Args: { _day: string; _frequency: string }
        Returns: {
          from_day: string
          to_day: string
        }[]
      }
      report_summary: {
        Args: {
          _client?: string
          _day: string
          _frequency: string
          _org: string
        }
        Returns: Json
      }
      scope_logins: { Args: never; Returns: number }
      set_company_brand: {
        Args: { _color: string; _logo_path: string; _org: string }
        Returns: undefined
      }
      site_board: {
        Args: {
          _limit: number
          _offset: number
          _org?: string
          _search: string
        }
        Returns: {
          amber: number
          client_name: string
          on_duty: number
          on_site: number
          red: number
          site_id: string
          site_name: string
          total: number
        }[]
      }
      tally_event: {
        Args: {
          _at: string
          _org: string
          _payload: Json
          _site: string
          _type: string
        }
        Returns: undefined
      }
      tally_passage: {
        Args: {
          _at: string
          _entered: string
          _kind: string
          _org: string
          _site: string
          _visit_type: string
        }
        Returns: undefined
      }
      to_uuid: { Args: { _value: string }; Returns: string }
      token_is_revoked: { Args: { _token_hash: string }; Returns: boolean }
      transfer_client: {
        Args: { _client: string; _new_org: string }
        Returns: undefined
      }
      valid_shift_periods: { Args: { _periods: Json }; Returns: boolean }
      viewer_client: { Args: never; Returns: string }
      viewer_org: { Args: never; Returns: string }
      visible_site_ids: { Args: never; Returns: string[] }
      write_audit: {
        Args: {
          _action: string
          _actor: string
          _actor_name: string
          _at?: string
          _category: string
          _detail: string
          _device: string
          _org: string
          _site: string
          _target: string
        }
        Returns: undefined
      }
    }
    Enums: {
      dashboard_role:
        | "super_user"
        | "admin"
        | "manager"
        | "control_room"
        | "supervisor"
        | "client_viewer"
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
  digigate: {
    Enums: {
      dashboard_role: [
        "super_user",
        "admin",
        "manager",
        "control_room",
        "supervisor",
        "client_viewer",
      ],
    },
  },
} as const
