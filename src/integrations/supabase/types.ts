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
      ai_usage_logs: {
        Row: {
          company_id: string | null
          company_name: string | null
          completion_tokens: number
          corrected_chars: number
          cost_brl: number | null
          created_at: string
          document_id: string | null
          document_type_id: string | null
          document_type_name: string | null
          duration_ms: number | null
          error_message: string | null
          extracted_chars: number
          file_name: string
          id: string
          model: string
          org_id: string
          prompt_tokens: number
          success: boolean
          total_tokens: number
          user_id: string
        }
        Insert: {
          company_id?: string | null
          company_name?: string | null
          completion_tokens?: number
          corrected_chars?: number
          cost_brl?: number | null
          created_at?: string
          document_id?: string | null
          document_type_id?: string | null
          document_type_name?: string | null
          duration_ms?: number | null
          error_message?: string | null
          extracted_chars?: number
          file_name: string
          id?: string
          model?: string
          org_id: string
          prompt_tokens?: number
          success?: boolean
          total_tokens?: number
          user_id: string
        }
        Update: {
          company_id?: string | null
          company_name?: string | null
          completion_tokens?: number
          corrected_chars?: number
          cost_brl?: number | null
          created_at?: string
          document_id?: string | null
          document_type_id?: string | null
          document_type_name?: string | null
          duration_ms?: number | null
          error_message?: string | null
          extracted_chars?: number
          file_name?: string
          id?: string
          model?: string
          org_id?: string
          prompt_tokens?: number
          success?: boolean
          total_tokens?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          cnpj: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          drive_folder_id: string | null
          email: string | null
          id: string
          name: string
          org_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          cnpj?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          drive_folder_id?: string | null
          email?: string | null
          id?: string
          name: string
          org_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          cnpj?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          drive_folder_id?: string | null
          email?: string | null
          id?: string
          name?: string
          org_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_balances: {
        Row: {
          balance_brl: number
          created_at: string
          low_balance_alert_enabled: boolean
          low_balance_threshold_brl: number
          org_id: string
          total_consumed_brl: number
          total_recharged_brl: number
          updated_at: string
        }
        Insert: {
          balance_brl?: number
          created_at?: string
          low_balance_alert_enabled?: boolean
          low_balance_threshold_brl?: number
          org_id: string
          total_consumed_brl?: number
          total_recharged_brl?: number
          updated_at?: string
        }
        Update: {
          balance_brl?: number
          created_at?: string
          low_balance_alert_enabled?: boolean
          low_balance_threshold_brl?: number
          org_id?: string
          total_consumed_brl?: number
          total_recharged_brl?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_balances_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          amount_brl: number
          balance_after_brl: number | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          org_id: string
          reference_id: string | null
          reference_type: string | null
          type: Database["public"]["Enums"]["credit_transaction_type"]
        }
        Insert: {
          amount_brl: number
          balance_after_brl?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          org_id: string
          reference_id?: string | null
          reference_type?: string | null
          type: Database["public"]["Enums"]["credit_transaction_type"]
        }
        Update: {
          amount_brl?: number
          balance_after_brl?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          org_id?: string
          reference_id?: string | null
          reference_type?: string | null
          type?: Database["public"]["Enums"]["credit_transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_type_fields: {
        Row: {
          char_length: number | null
          created_at: string
          document_type_id: string
          expected_length: number | null
          field_key: string
          field_type: string
          id: string
          is_lookup_key: boolean
          label: string
          location_hint: string | null
          options: Json | null
          org_id: string
          position: number
          required: boolean
          updated_at: string
        }
        Insert: {
          char_length?: number | null
          created_at?: string
          document_type_id: string
          expected_length?: number | null
          field_key: string
          field_type?: string
          id?: string
          is_lookup_key?: boolean
          label: string
          location_hint?: string | null
          options?: Json | null
          org_id: string
          position?: number
          required?: boolean
          updated_at?: string
        }
        Update: {
          char_length?: number | null
          created_at?: string
          document_type_id?: string
          expected_length?: number | null
          field_key?: string
          field_type?: string
          id?: string
          is_lookup_key?: boolean
          label?: string
          location_hint?: string | null
          options?: Json | null
          org_id?: string
          position?: number
          required?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_type_fields_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_type_fields_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_type_lookups: {
        Row: {
          company_id: string | null
          created_at: string
          document_type_id: string
          id: string
          key_value: string
          org_id: string
          updated_at: string
          values: Json
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          document_type_id: string
          id?: string
          key_value: string
          org_id: string
          updated_at?: string
          values?: Json
        }
        Update: {
          company_id?: string | null
          created_at?: string
          document_type_id?: string
          id?: string
          key_value?: string
          org_id?: string
          updated_at?: string
          values?: Json
        }
        Relationships: [
          {
            foreignKeyName: "document_type_lookups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_type_lookups_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_type_lookups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_types: {
        Row: {
          company_id: string | null
          created_at: string
          drive_folder_id: string | null
          id: string
          name: string
          org_id: string
          slug: string
          storage_table: string | null
          store_files: boolean
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          drive_folder_id?: string | null
          id?: string
          name: string
          org_id: string
          slug: string
          storage_table?: string | null
          store_files?: boolean
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          drive_folder_id?: string | null
          id?: string
          name?: string
          org_id?: string
          slug?: string
          storage_table?: string | null
          store_files?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          company_id: string | null
          created_at: string
          deleted_at: string | null
          document_type_id: string | null
          drive_file_id: string | null
          drive_web_view_link: string | null
          error_message: string | null
          field_values: Json
          id: string
          last_edited_by: string | null
          mime_type: string
          name: string
          org_id: string
          original_filename: string
          page_count: number | null
          size_bytes: number
          source_path: string | null
          status: Database["public"]["Enums"]["doc_status"]
          storage_path: string | null
          tags: string[]
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          document_type_id?: string | null
          drive_file_id?: string | null
          drive_web_view_link?: string | null
          error_message?: string | null
          field_values?: Json
          id?: string
          last_edited_by?: string | null
          mime_type: string
          name: string
          org_id: string
          original_filename: string
          page_count?: number | null
          size_bytes: number
          source_path?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          storage_path?: string | null
          tags?: string[]
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          document_type_id?: string | null
          drive_file_id?: string | null
          drive_web_view_link?: string | null
          error_message?: string | null
          field_values?: Json
          id?: string
          last_edited_by?: string | null
          mime_type?: string
          name?: string
          org_id?: string
          original_filename?: string
          page_count?: number | null
          size_bytes?: number
          source_path?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          storage_path?: string | null
          tags?: string[]
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dt_ale_seguros_c121c162: {
        Row: {
          company_id: string | null
          created_at: string
          document_id: string
          id: string
          nome: string | null
          org_id: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          document_id: string
          id?: string
          nome?: string | null
          org_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          document_id?: string
          id?: string
          nome?: string | null
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dt_ale_seguros_c121c162_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      dt_contra_cheque_filme013_7e3fb542: {
        Row: {
          company_id: string | null
          cpf: string | null
          created_at: string
          document_id: string
          id: string
          matricula: string | null
          mes_ano: string | null
          nome: string | null
          om: string | null
          org_id: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          cpf?: string | null
          created_at?: string
          document_id: string
          id?: string
          matricula?: string | null
          mes_ano?: string | null
          nome?: string | null
          om?: string | null
          org_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          cpf?: string | null
          created_at?: string
          document_id?: string
          id?: string
          matricula?: string | null
          mes_ano?: string | null
          nome?: string | null
          om?: string | null
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dt_contra_cheque_filme013_7e3fb542_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      dt_contra_cheque_filme013_copia_14173795: {
        Row: {
          company_id: string | null
          cpf: string | null
          created_at: string
          document_id: string
          id: string
          matricula: string | null
          mes_ano: string | null
          nome: string | null
          om: string | null
          org_id: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          cpf?: string | null
          created_at?: string
          document_id: string
          id?: string
          matricula?: string | null
          mes_ano?: string | null
          nome?: string | null
          om?: string | null
          org_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          cpf?: string | null
          created_at?: string
          document_id?: string
          id?: string
          matricula?: string | null
          mes_ano?: string | null
          nome?: string | null
          om?: string | null
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dt_contra_cheque_filme013_copia_14173795_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          org_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          ai_claude_model: string
          ai_cost_per_file: number
          ai_gemini_model: string
          ai_price_base_threshold: number
          ai_price_tier_increment: number
          ai_price_tier_step: number
          created_at: string
          drive_folder_id: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          ai_claude_model?: string
          ai_cost_per_file?: number
          ai_gemini_model?: string
          ai_price_base_threshold?: number
          ai_price_tier_increment?: number
          ai_price_tier_step?: number
          created_at?: string
          drive_folder_id?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          ai_claude_model?: string
          ai_cost_per_file?: number
          ai_gemini_model?: string
          ai_price_base_threshold?: number
          ai_price_tier_increment?: number
          ai_price_tier_step?: number
          created_at?: string
          drive_folder_id?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          current_org_id: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          current_org_id?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          current_org_id?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_org_id_fkey"
            columns: ["current_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_document_access: {
        Row: {
          company_id: string
          created_at: string
          document_type_id: string
          id: string
          org_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          document_type_id: string
          id?: string
          org_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          document_type_id?: string
          id?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_document_access_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_document_access_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_document_access_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          org_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _dt_safe_ident: { Args: { _raw: string }; Returns: string }
      _dt_sql_type: { Args: { _field_type: string }; Returns: string }
      add_doc_type_column: {
        Args: { _field_key: string; _field_type: string; _type_id: string }
        Returns: undefined
      }
      create_doc_type_table: { Args: { _type_id: string }; Returns: string }
      drop_doc_type_column: {
        Args: { _field_key: string; _type_id: string }
        Returns: undefined
      }
      exec_sql: { Args: { sql_query: string }; Returns: Json }
      get_document_stats: {
        Args: {
          _allowed_type_ids?: string[]
          _company_id: string
          _document_type_id: string
          _field_filters?: Json
          _org_id: string
          _search?: string
        }
        Returns: {
          failed: number
          pending: number
          processed: number
          total: number
        }[]
      }
      get_org_document_stats:
        | {
            Args: { _allowed_type_ids?: string[]; _org_id: string }
            Returns: {
              failed: number
              pending: number
              processed: number
              total: number
            }[]
          }
        | {
            Args: {
              _allowed_type_ids?: string[]
              _company_id?: string
              _org_id: string
            }
            Returns: {
              failed: number
              pending: number
              processed: number
              total: number
            }[]
          }
      has_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      upsert_doc_type_row: {
        Args: { _document_id: string; _type_id: string; _values: Json }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "platform_admin" | "org_admin" | "operator" | "viewer"
      credit_transaction_type:
        | "recharge"
        | "consumption"
        | "adjustment"
        | "refund"
      doc_status: "pending" | "processing" | "processed" | "failed"
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
      app_role: ["platform_admin", "org_admin", "operator", "viewer"],
      credit_transaction_type: [
        "recharge",
        "consumption",
        "adjustment",
        "refund",
      ],
      doc_status: ["pending", "processing", "processed", "failed"],
    },
  },
} as const
