// Hand-written for the tables the gate app touches, matching supabase/migrations.
// Replace with `supabase gen types typescript` output once the project is linked.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      devices: {
        Row: {
          id: string;
          org_id: string;
          site_id: string;
          gate_id: string;
          name: string;
          auth_user_id: string | null;
          paired_at: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          site_id: string;
          gate_id: string;
          name: string;
          auth_user_id?: string | null;
          paired_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['devices']['Insert']>;
        Relationships: [];
      };
      gate_users: {
        Row: {
          id: string;
          org_id: string;
          site_id: string;
          employee_number: string;
          first_name: string;
          last_name: string;
          role: string;
          pin_hash: Json;
          active: boolean;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          site_id: string;
          employee_number: string;
          first_name: string;
          last_name: string;
          role: string;
          pin_hash: Json;
          active?: boolean;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['gate_users']['Insert']>;
        Relationships: [];
      };
      gate_events: {
        Row: {
          id: string;
          org_id: string;
          site_id: string;
          device_id: string;
          gate_user_id: string | null;
          type: string;
          occurred_at: string;
          received_at: string;
          payload: Json;
        };
        Insert: {
          id: string;
          org_id: string;
          site_id: string;
          device_id: string;
          gate_user_id?: string | null;
          type: string;
          occurred_at: string;
          received_at?: string;
          payload?: Json;
        };
        Update: Partial<Database['public']['Tables']['gate_events']['Insert']>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
