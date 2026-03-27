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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      checkpoints: {
        Row: {
          completed_at: string | null
          created_at: string | null
          cronjob_name: string
          error_message: string | null
          id: string
          last_processed_id: string | null
          processed_count: number | null
          retry_count: number | null
          started_at: string | null
          status: string | null
          total_count: number | null
          updated_at: string | null
          wave_date: string
          wave_number: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          cronjob_name: string
          error_message?: string | null
          id?: string
          last_processed_id?: string | null
          processed_count?: number | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          total_count?: number | null
          updated_at?: string | null
          wave_date: string
          wave_number: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          cronjob_name?: string
          error_message?: string | null
          id?: string
          last_processed_id?: string | null
          processed_count?: number | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          total_count?: number | null
          updated_at?: string | null
          wave_date?: string
          wave_number?: number
        }
        Relationships: []
      }
      local_governments: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string | null
          created_at: string | null
          email: string | null
          government_type: string | null
          head_name: string | null
          head_title: string | null
          id: string
          is_active: boolean | null
          municipality_id: string | null
          name: string
          notes: string | null
          phone: string | null
          postal_code: string | null
          updated_at: string | null
          wave_number: number | null
          website_url: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          government_type?: string | null
          head_name?: string | null
          head_title?: string | null
          id?: string
          is_active?: boolean | null
          municipality_id?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          updated_at?: string | null
          wave_number?: number | null
          website_url?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          government_type?: string | null
          head_name?: string | null
          head_title?: string | null
          id?: string
          is_active?: boolean | null
          municipality_id?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          updated_at?: string | null
          wave_number?: number | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "local_governments_municipality_id_fkey"
            columns: ["municipality_id"]
            isOneToOne: false
            referencedRelation: "municipalities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "local_governments_municipality_id_fkey"
            columns: ["municipality_id"]
            isOneToOne: false
            referencedRelation: "v_x_warmup_status"
            referencedColumns: ["id"]
          },
        ]
      }
      municipalities: {
        Row: {
          ai_governance_signals: Json | null
          batch_status: string | null
          council_emails: string[] | null
          country: string
          created_at: string | null
          discovered_at: string | null
          general_email: string | null
          id: string
          mayor_email: string | null
          mayor_name: string | null
          name: string
          notes: Json | null
          outreach_sent_at: string | null
          outreach_variant: string | null
          pain_points: string[] | null
          phone: string | null
          population: number | null
          priority_score: number | null
          province: string | null
          region: string | null
          replied_at: string | null
          reply_sentiment: string | null
          researched_at: string | null
          updated_at: string | null
          verified_at: string | null
          wave_date: string | null
          wave_number: number | null
          website_url: string | null
          x_engagement_count: number | null
          x_handle: string | null
          x_last_engagement_at: string | null
          x_url: string | null
          x_warmup_phase1_at: string | null
          x_warmup_phase2_at: string | null
        }
        Insert: {
          ai_governance_signals?: Json | null
          batch_status?: string | null
          council_emails?: string[] | null
          country: string
          created_at?: string | null
          discovered_at?: string | null
          general_email?: string | null
          id?: string
          mayor_email?: string | null
          mayor_name?: string | null
          name: string
          notes?: Json | null
          outreach_sent_at?: string | null
          outreach_variant?: string | null
          pain_points?: string[] | null
          phone?: string | null
          population?: number | null
          priority_score?: number | null
          province?: string | null
          region?: string | null
          replied_at?: string | null
          reply_sentiment?: string | null
          researched_at?: string | null
          updated_at?: string | null
          verified_at?: string | null
          wave_date?: string | null
          wave_number?: number | null
          website_url?: string | null
          x_engagement_count?: number | null
          x_handle?: string | null
          x_last_engagement_at?: string | null
          x_url?: string | null
          x_warmup_phase1_at?: string | null
          x_warmup_phase2_at?: string | null
        }
        Update: {
          ai_governance_signals?: Json | null
          batch_status?: string | null
          council_emails?: string[] | null
          country?: string
          created_at?: string | null
          discovered_at?: string | null
          general_email?: string | null
          id?: string
          mayor_email?: string | null
          mayor_name?: string | null
          name?: string
          notes?: Json | null
          outreach_sent_at?: string | null
          outreach_variant?: string | null
          pain_points?: string[] | null
          phone?: string | null
          population?: number | null
          priority_score?: number | null
          province?: string | null
          region?: string | null
          replied_at?: string | null
          reply_sentiment?: string | null
          researched_at?: string | null
          updated_at?: string | null
          verified_at?: string | null
          wave_date?: string | null
          wave_number?: number | null
          website_url?: string | null
          x_engagement_count?: number | null
          x_handle?: string | null
          x_last_engagement_at?: string | null
          x_url?: string | null
          x_warmup_phase1_at?: string | null
          x_warmup_phase2_at?: string | null
        }
        Relationships: []
      }
      outreach_emails: {
        Row: {
          body: string
          created_at: string | null
          follow_up_needed: boolean | null
          id: string
          local_government_id: string | null
          meeting_requested: boolean | null
          message_id: string | null
          political_context: Json | null
          political_figure_id: string | null
          recipient_email: string
          recipient_name: string | null
          referred_to: string | null
          reply_category: string | null
          reply_confidence: number | null
          reply_received_at: string | null
          reply_sentiment: string | null
          sent_at: string | null
          status: string | null
          subject: string
          variant: string | null
          wave_date: string | null
          wave_number: number | null
        }
        Insert: {
          body: string
          created_at?: string | null
          follow_up_needed?: boolean | null
          id?: string
          local_government_id?: string | null
          meeting_requested?: boolean | null
          message_id?: string | null
          political_context?: Json | null
          political_figure_id?: string | null
          recipient_email: string
          recipient_name?: string | null
          referred_to?: string | null
          reply_category?: string | null
          reply_confidence?: number | null
          reply_received_at?: string | null
          reply_sentiment?: string | null
          sent_at?: string | null
          status?: string | null
          subject: string
          variant?: string | null
          wave_date?: string | null
          wave_number?: number | null
        }
        Update: {
          body?: string
          created_at?: string | null
          follow_up_needed?: boolean | null
          id?: string
          local_government_id?: string | null
          meeting_requested?: boolean | null
          message_id?: string | null
          political_context?: Json | null
          political_figure_id?: string | null
          recipient_email?: string
          recipient_name?: string | null
          referred_to?: string | null
          reply_category?: string | null
          reply_confidence?: number | null
          reply_received_at?: string | null
          reply_sentiment?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string
          variant?: string | null
          wave_date?: string | null
          wave_number?: number | null
        }
        Relationships: []
      }
      outreach_templates: {
        Row: {
          body_template: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          reply_rate: number | null
          sent_count: number | null
          subject_template: string
          updated_at: string | null
          variables: string[] | null
          variant: string
          version: string
        }
        Insert: {
          body_template: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          reply_rate?: number | null
          sent_count?: number | null
          subject_template: string
          updated_at?: string | null
          variables?: string[] | null
          variant: string
          version: string
        }
        Update: {
          body_template?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          reply_rate?: number | null
          sent_count?: number | null
          subject_template?: string
          updated_at?: string | null
          variables?: string[] | null
          variant?: string
          version?: string
        }
        Relationships: []
      }
      political_figures: {
        Row: {
          ai_governance_interest: string | null
          contact_preference: string | null
          created_at: string | null
          department: string | null
          email: string | null
          full_name: string
          id: string
          influence_level: number | null
          is_active: boolean | null
          is_decision_maker: boolean | null
          last_contacted_at: string | null
          linkedin_url: string | null
          local_government_id: string | null
          municipality_id: string | null
          notes: string | null
          phone: string | null
          role_description: string | null
          title: string | null
          updated_at: string | null
          wave_number: number | null
          x_handle: string | null
        }
        Insert: {
          ai_governance_interest?: string | null
          contact_preference?: string | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          full_name: string
          id?: string
          influence_level?: number | null
          is_active?: boolean | null
          is_decision_maker?: boolean | null
          last_contacted_at?: string | null
          linkedin_url?: string | null
          local_government_id?: string | null
          municipality_id?: string | null
          notes?: string | null
          phone?: string | null
          role_description?: string | null
          title?: string | null
          updated_at?: string | null
          wave_number?: number | null
          x_handle?: string | null
        }
        Update: {
          ai_governance_interest?: string | null
          contact_preference?: string | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          full_name?: string
          id?: string
          influence_level?: number | null
          is_active?: boolean | null
          is_decision_maker?: boolean | null
          last_contacted_at?: string | null
          linkedin_url?: string | null
          local_government_id?: string | null
          municipality_id?: string | null
          notes?: string | null
          phone?: string | null
          role_description?: string | null
          title?: string | null
          updated_at?: string | null
          wave_number?: number | null
          x_handle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "political_figures_local_government_id_fkey"
            columns: ["local_government_id"]
            isOneToOne: false
            referencedRelation: "local_governments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "political_figures_municipality_id_fkey"
            columns: ["municipality_id"]
            isOneToOne: false
            referencedRelation: "municipalities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "political_figures_municipality_id_fkey"
            columns: ["municipality_id"]
            isOneToOne: false
            referencedRelation: "v_x_warmup_status"
            referencedColumns: ["id"]
          },
        ]
      }
      x_engagements: {
        Row: {
          engaged_at: string | null
          engagement_type: string
          id: string
          local_government_id: string | null
          target_tweet_id: string | null
          target_tweet_url: string | null
          wave_number: number | null
        }
        Insert: {
          engaged_at?: string | null
          engagement_type: string
          id?: string
          local_government_id?: string | null
          target_tweet_id?: string | null
          target_tweet_url?: string | null
          wave_number?: number | null
        }
        Update: {
          engaged_at?: string | null
          engagement_type?: string
          id?: string
          local_government_id?: string | null
          target_tweet_id?: string | null
          target_tweet_url?: string | null
          wave_number?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      v_cronjob_status: {
        Row: {
          completed_at: string | null
          completion_percentage: number | null
          cronjob_name: string | null
          error_message: string | null
          processed_count: number | null
          started_at: string | null
          status: string | null
          total_count: number | null
          wave_number: number | null
        }
        Insert: {
          completed_at?: string | null
          completion_percentage?: never
          cronjob_name?: string | null
          error_message?: string | null
          processed_count?: number | null
          started_at?: string | null
          status?: string | null
          total_count?: number | null
          wave_number?: number | null
        }
        Update: {
          completed_at?: string | null
          completion_percentage?: never
          cronjob_name?: string | null
          error_message?: string | null
          processed_count?: number | null
          started_at?: string | null
          status?: string | null
          total_count?: number | null
          wave_number?: number | null
        }
        Relationships: []
      }
      v_pipeline_summary: {
        Row: {
          approved: number | null
          drafted: number | null
          failed: number | null
          replied: number | null
          reply_rate_percent: number | null
          researched: number | null
          sent: number | null
          total_municipalities: number | null
          wave_number: number | null
        }
        Relationships: []
      }
      v_wave_status: {
        Row: {
          batch_status: string | null
          count_in_status: number | null
          total_municipalities: number | null
          wave_date: string | null
          wave_number: number | null
        }
        Relationships: []
      }
      v_x_warmup_status: {
        Row: {
          id: string | null
          name: string | null
          warmup_status: string | null
          x_engagement_count: number | null
          x_handle: string | null
          x_warmup_phase1_at: string | null
          x_warmup_phase2_at: string | null
        }
        Insert: {
          id?: string | null
          name?: string | null
          warmup_status?: never
          x_engagement_count?: number | null
          x_handle?: string | null
          x_warmup_phase1_at?: string | null
          x_warmup_phase2_at?: string | null
        }
        Update: {
          id?: string | null
          name?: string | null
          warmup_status?: never
          x_engagement_count?: number | null
          x_handle?: string | null
          x_warmup_phase1_at?: string | null
          x_warmup_phase2_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_priority_score: {
        Args: {
          p_has_ai_signals: boolean
          p_has_email: boolean
          p_has_pain_points: boolean
          p_has_x_handle: boolean
          p_population: number
        }
        Returns: number
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
  public: {
    Enums: {},
  },
} as const
