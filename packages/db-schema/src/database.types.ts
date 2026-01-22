export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      cluster_gpus: {
        Row: {
          cluster_id: string
          cores: number
          created_at: string | null
          id: string
          memory_gb: number
          model: string
          updated_at: string | null
        }
        Insert: {
          cluster_id: string
          cores: number
          created_at?: string | null
          id?: string
          memory_gb: number
          model: string
          updated_at?: string | null
        }
        Update: {
          cluster_id?: string
          cores?: number
          created_at?: string | null
          id?: string
          memory_gb?: number
          model?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cluster_gpus_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "dpu_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_audit_log: {
        Row: {
          dpu_id: string
          id: string
          intent_hash: string
          proof_data: Json
          redline_violated: string | null
          timestamp: string
        }
        Insert: {
          dpu_id: string
          id?: string
          intent_hash: string
          proof_data?: Json
          redline_violated?: string | null
          timestamp?: string
        }
        Update: {
          dpu_id?: string
          id?: string
          intent_hash?: string
          proof_data?: Json
          redline_violated?: string | null
          timestamp?: string
        }
        Relationships: []
      }
      dpu_clusters: {
        Row: {
          avg_latency: number | null
          created_at: string | null
          gpus: number
          id: string
          last_heartbeat: string | null
          location: string
          name: string
          slug: string
          status: string
          total_requests: number | null
          updated_at: string | null
          uptime: number | null
        }
        Insert: {
          avg_latency?: number | null
          created_at?: string | null
          gpus?: number
          id?: string
          last_heartbeat?: string | null
          location: string
          name: string
          slug: string
          status?: string
          total_requests?: number | null
          updated_at?: string | null
          uptime?: number | null
        }
        Update: {
          avg_latency?: number | null
          created_at?: string | null
          gpus?: number
          id?: string
          last_heartbeat?: string | null
          location?: string
          name?: string
          slug?: string
          status?: string
          total_requests?: number | null
          updated_at?: string | null
          uptime?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      public_audit_trail: {
        Row: {
          dpu_id: string | null
          id: string | null
          intent_hash: string | null
          public_hash: string | null
          timestamp: string | null
          zkp_commitment: string | null
        }
        Insert: {
          dpu_id?: string | null
          id?: string | null
          intent_hash?: string | null
          public_hash?: never
          timestamp?: string | null
          zkp_commitment?: never
        }
        Update: {
          dpu_id?: string | null
          id?: string | null
          intent_hash?: string | null
          public_hash?: never
          timestamp?: string | null
          zkp_commitment?: never
        }
        Relationships: []
      }
      recent_violations: {
        Row: {
          attestation: string | null
          dpu_id: string | null
          id: string | null
          intent_hash: string | null
          redline_violated: string | null
          timestamp: string | null
          zkp_commitment: string | null
        }
        Insert: {
          attestation?: never
          dpu_id?: string | null
          id?: string | null
          intent_hash?: string | null
          redline_violated?: string | null
          timestamp?: string | null
          zkp_commitment?: never
        }
        Update: {
          attestation?: never
          dpu_id?: string | null
          id?: string | null
          intent_hash?: string | null
          redline_violated?: string | null
          timestamp?: string | null
          zkp_commitment?: never
        }
        Relationships: []
      }
    }
    Functions: {
      batch_log_enforcement_events: {
        Args: { p_events: Json }
        Returns: {
          inserted_count: number
          message: string
          success: boolean
        }[]
      }
      get_audit_statistics: {
        Args: { p_dpu_id?: string; p_hours_back?: number }
        Returns: {
          time_range_end: string
          time_range_start: string
          total_events: number
          total_violations: number
          unique_dpus: number
        }[]
      }
      log_enforcement_event: {
        Args: {
          p_dpu_id: string
          p_intent_hash?: string
          p_proof_data?: Json
          p_redline_violated?: string
        }
        Returns: {
          event_id: string
          event_timestamp: string
          message: string
          success: boolean
        }[]
      }
      verify_proof_integrity: {
        Args: { p_event_id: string }
        Returns: {
          is_valid: boolean
          verification_details: Json
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

