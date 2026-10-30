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
      event_details: {
        Row: {
          erase_after: string | null
          event_id: string
          gate_user_id: string | null
          org_id: string
          payload: Json
          site_id: string
          visit_id: string | null
        }
        Insert: {
          erase_after?: string | null
          event_id: string
          gate_user_id?: string | null
          org_id: string
          payload: Json
          site_id: string
          visit_id?: string | null
        }
        Update: {
          erase_after?: string | null
          event_id?: string
          gate_user_id?: string | null
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
      organisations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
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
          code: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          lanes: string[]
          latitude: number | null
          longitude: number | null
          org_id: string
          radius_m: number
          site_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          lanes: string[]
          latitude?: number | null
          longitude?: number | null
          org_id: string
          radius_m?: number
          site_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          lanes?: string[]
          latitude?: number | null
          longitude?: number | null
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
          device_id: string
          end_reason: string | null
          ended_at: string | null
          erase_after: string | null
          gate_user_id: string | null
          id: string
          org_id: string
          period: string
          post: string
          site_id: string
          started_at: string
        }
        Insert: {
          device_id: string
          end_reason?: string | null
          ended_at?: string | null
          erase_after?: string | null
          gate_user_id?: string | null
          id: string
          org_id: string
          period: string
          post: string
          site_id: string
          started_at: string
        }
        Update: {
          device_id?: string
          end_reason?: string | null
          ended_at?: string | null
          erase_after?: string | null
          gate_user_id?: string | null
          id?: string
          org_id?: string
          period?: string
          post?: string
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
          client_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          overrides: Json
          site_type: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          overrides?: Json
          site_type: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          overrides?: Json
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
      can_manage_org: { Args: { _org: string }; Returns: boolean }
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
      device_for_token: { Args: { _token_hash: string }; Returns: string }
      device_snapshot: { Args: { _device_id: string }; Returns: Json }
      in_org: { Args: { _org: string }; Returns: boolean }
      ingest_events: {
        Args: { _device_id: string; _events: Json }
        Returns: string[]
      }
      is_super_user: { Args: never; Returns: boolean }
      mask: { Args: { _value: string }; Returns: string }
      mfa_passed: { Args: never; Returns: boolean }
      to_uuid: { Args: { _value: string }; Returns: string }
      transfer_client: {
        Args: { _client: string; _new_org: string }
        Returns: undefined
      }
      viewer_client: { Args: never; Returns: string }
      viewer_org: { Args: never; Returns: string }
      visible_site_ids: { Args: never; Returns: string[] }
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
