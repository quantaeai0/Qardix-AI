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
      ai_results: {
        Row: {
          abnormal_leads: string[]
          ai_summary: string
          assessment_id: string
          company_id: string | null
          confidence_json: Json
          created_at: string
          doctor_id: string
          ecg_record_id: string
          findings: Json
          id: string
          patient_explanation: string
          raw_output_json: Json
          urgency: string
          warning_signs: string[]
        }
        Insert: {
          abnormal_leads?: string[]
          ai_summary: string
          assessment_id: string
          company_id?: string | null
          confidence_json?: Json
          created_at?: string
          doctor_id: string
          ecg_record_id: string
          findings?: Json
          id?: string
          patient_explanation: string
          raw_output_json?: Json
          urgency: string
          warning_signs?: string[]
        }
        Update: {
          abnormal_leads?: string[]
          ai_summary?: string
          assessment_id?: string
          company_id?: string | null
          confidence_json?: Json
          created_at?: string
          doctor_id?: string
          ecg_record_id?: string
          findings?: Json
          id?: string
          patient_explanation?: string
          raw_output_json?: Json
          urgency?: string
          warning_signs?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "ai_results_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "patient_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_results_ecg_record_id_fkey"
            columns: ["ecg_record_id"]
            isOneToOne: false
            referencedRelation: "ecg_records"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          code: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          primary_contact: string | null
          status: Database["public"]["Enums"]["account_status"]
        }
        Insert: {
          code: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          primary_contact?: string | null
          status?: Database["public"]["Enums"]["account_status"]
        }
        Update: {
          code?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          primary_contact?: string | null
          status?: Database["public"]["Enums"]["account_status"]
        }
        Relationships: []
      }
      demo_requests: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string | null
          name: string
          organisation: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message?: string | null
          name: string
          organisation?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          name?: string
          organisation?: string | null
        }
        Relationships: []
      }
      doctor_validations: {
        Row: {
          ai_result_id: string
          assessment_id: string
          company_id: string | null
          corrected_interpretation: string | null
          doctor_id: string
          id: string
          notes: string | null
          status: string
          validated_at: string
        }
        Insert: {
          ai_result_id: string
          assessment_id: string
          company_id?: string | null
          corrected_interpretation?: string | null
          doctor_id: string
          id?: string
          notes?: string | null
          status: string
          validated_at?: string
        }
        Update: {
          ai_result_id?: string
          assessment_id?: string
          company_id?: string | null
          corrected_interpretation?: string | null
          doctor_id?: string
          id?: string
          notes?: string | null
          status?: string
          validated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_validations_ai_result_id_fkey"
            columns: ["ai_result_id"]
            isOneToOne: false
            referencedRelation: "ai_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_validations_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "patient_assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      ecg_records: {
        Row: {
          assessment_id: string
          company_id: string | null
          created_at: string
          doctor_id: string
          id: string
          image_path: string | null
          model_version: string | null
          processing_status: string
          quality_status: string
        }
        Insert: {
          assessment_id: string
          company_id?: string | null
          created_at?: string
          doctor_id: string
          id?: string
          image_path?: string | null
          model_version?: string | null
          processing_status?: string
          quality_status?: string
        }
        Update: {
          assessment_id?: string
          company_id?: string | null
          created_at?: string
          doctor_id?: string
          id?: string
          image_path?: string | null
          model_version?: string | null
          processing_status?: string
          quality_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ecg_records_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "patient_assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_assessments: {
        Row: {
          age: number
          anonymous_patient_id: string
          bmi: number | null
          bp_diastolic: number
          bp_systolic: number
          company_id: string | null
          created_at: string
          diabetes_status: string
          diabetic_complications: string[]
          doctor_id: string
          heart_rate: number
          height_cm: number
          id: string
          medicines: string[]
          sex: string
          spo2: number
          symptoms: Json
          training_consent: boolean
          weight_kg: number
        }
        Insert: {
          age: number
          anonymous_patient_id: string
          bmi?: number | null
          bp_diastolic: number
          bp_systolic: number
          company_id?: string | null
          created_at?: string
          diabetes_status: string
          diabetic_complications?: string[]
          doctor_id: string
          heart_rate: number
          height_cm: number
          id?: string
          medicines?: string[]
          sex: string
          spo2: number
          symptoms?: Json
          training_consent?: boolean
          weight_kg: number
        }
        Update: {
          age?: number
          anonymous_patient_id?: string
          bmi?: number | null
          bp_diastolic?: number
          bp_systolic?: number
          company_id?: string | null
          created_at?: string
          diabetes_status?: string
          diabetic_complications?: string[]
          doctor_id?: string
          heart_rate?: number
          height_cm?: number
          id?: string
          medicines?: string[]
          sex?: string
          spo2?: number
          symptoms?: Json
          training_consent?: boolean
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "patient_assessments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string
          display_name: string
          email: string | null
          force_password_reset: boolean
          id: string
          last_activity_at: string | null
          login_id: string
          specialty: string | null
          status: Database["public"]["Enums"]["account_status"]
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          display_name: string
          email?: string | null
          force_password_reset?: boolean
          id: string
          last_activity_at?: string | null
          login_id: string
          specialty?: string | null
          status?: Database["public"]["Enums"]["account_status"]
        }
        Update: {
          company_id?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          force_password_reset?: boolean
          id?: string
          last_activity_at?: string | null
          login_id?: string
          specialty?: string | null
          status?: Database["public"]["Enums"]["account_status"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          assessment_id: string
          company_id: string | null
          doctor_id: string
          generated_at: string
          id: string
          pdf_ref: string | null
          report_code: string
          report_status: string
          validation_id: string | null
        }
        Insert: {
          assessment_id: string
          company_id?: string | null
          doctor_id: string
          generated_at?: string
          id?: string
          pdf_ref?: string | null
          report_code: string
          report_status?: string
          validation_id?: string | null
        }
        Update: {
          assessment_id?: string
          company_id?: string | null
          doctor_id?: string
          generated_at?: string
          id?: string
          pdf_ref?: string | null
          report_code?: string
          report_status?: string
          validation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "patient_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_validation_id_fkey"
            columns: ["validation_id"]
            isOneToOne: false
            referencedRelation: "doctor_validations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          analysis_status: string | null
          company_id: string | null
          created_at: string
          doctor_id: string
          event_type: string
          id: string
        }
        Insert: {
          analysis_status?: string | null
          company_id?: string | null
          created_at?: string
          doctor_id: string
          event_type: string
          id?: string
        }
        Update: {
          analysis_status?: string | null
          company_id?: string | null
          created_at?: string
          doctor_id?: string
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      company_doctors: {
        Args: never
        Returns: {
          created_at: string
          display_name: string
          id: string
          last_activity_at: string
          login_id: string
          specialty: string
          status: Database["public"]["Enums"]["account_status"]
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_doctor: { Args: never; Returns: boolean }
      is_active_mm: { Args: never; Returns: boolean }
      is_active_user: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      my_company: { Args: never; Returns: string }
    }
    Enums: {
      account_status: "active" | "inactive"
      app_role: "super_admin" | "marketing_manager" | "doctor"
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
      account_status: ["active", "inactive"],
      app_role: ["super_admin", "marketing_manager", "doctor"],
    },
  },
} as const
