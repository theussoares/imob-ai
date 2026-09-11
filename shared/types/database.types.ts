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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      brokers: {
        Row: {
          active: boolean
          created_at: string
          creci: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          creci?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          creci?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brokers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_internal: {
        Row: {
          admin_fee_percent: number | null
          contract_id: string
          external_id: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          admin_fee_percent?: number | null
          contract_id: string
          external_id?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          admin_fee_percent?: number | null
          contract_id?: string
          external_id?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      contract_parties: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          portal_user_id: string
          role: Database["public"]["Enums"]["contract_party_role"]
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          portal_user_id: string
          role: Database["public"]["Enums"]["contract_party_role"]
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          portal_user_id?: string
          role?: Database["public"]["Enums"]["contract_party_role"]
        }
        Relationships: []
      }
      contracts: {
        Row: {
          address_label: string | null
          adjustment_index: string | null
          code: string
          created_at: string
          due_day: number | null
          ends_on: string | null
          id: string
          property_id: string | null
          rent_amount: number | null
          source: string
          started_on: string | null
          status: Database["public"]["Enums"]["contract_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address_label?: string | null
          adjustment_index?: string | null
          code: string
          created_at?: string
          due_day?: number | null
          ends_on?: string | null
          id?: string
          property_id?: string | null
          rent_amount?: number | null
          source?: string
          started_on?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address_label?: string | null
          adjustment_index?: string | null
          code?: string
          created_at?: string
          due_day?: number | null
          ends_on?: string | null
          id?: string
          property_id?: string | null
          rent_amount?: number | null
          source?: string
          started_on?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          broker_id: string | null
          created_at: string
          id: string
          ip_hash: string | null
          lead_type: string
          message: string | null
          name: string | null
          next_contact_at: string | null
          notes: string | null
          phone: string | null
          property_id: string | null
          source: string
          stage: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          broker_id?: string | null
          created_at?: string
          id?: string
          ip_hash?: string | null
          lead_type?: string
          message?: string | null
          name?: string | null
          next_contact_at?: string | null
          notes?: string | null
          phone?: string | null
          property_id?: string | null
          source?: string
          stage?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          broker_id?: string | null
          created_at?: string
          id?: string
          ip_hash?: string | null
          lead_type?: string
          message?: string | null
          name?: string | null
          next_contact_at?: string | null
          notes?: string | null
          phone?: string | null
          property_id?: string | null
          source?: string
          stage?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_document_access: {
        Row: {
          created_at: string
          document_id: string
          id: string
          ip: string | null
          portal_user_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          ip?: string | null
          portal_user_id?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          ip?: string | null
          portal_user_id?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      portal_documents: {
        Row: {
          amount: number | null
          audience: Database["public"]["Enums"]["contract_party_role"][]
          category: Database["public"]["Enums"]["portal_doc_category"]
          competence: string | null
          contract_id: string
          created_at: string
          created_by: string | null
          due_on: string | null
          id: string
          mime: string | null
          published_at: string | null
          size_bytes: number | null
          storage_path: string
          tenant_id: string
          title: string
        }
        Insert: {
          amount?: number | null
          audience?: Database["public"]["Enums"]["contract_party_role"][]
          category: Database["public"]["Enums"]["portal_doc_category"]
          competence?: string | null
          contract_id: string
          created_at?: string
          created_by?: string | null
          due_on?: string | null
          id?: string
          mime?: string | null
          published_at?: string | null
          size_bytes?: number | null
          storage_path: string
          tenant_id: string
          title: string
        }
        Update: {
          amount?: number | null
          audience?: Database["public"]["Enums"]["contract_party_role"][]
          category?: Database["public"]["Enums"]["portal_doc_category"]
          competence?: string | null
          contract_id?: string
          created_at?: string
          created_by?: string | null
          due_on?: string | null
          id?: string
          mime?: string | null
          published_at?: string | null
          size_bytes?: number | null
          storage_path?: string
          tenant_id?: string
          title?: string
        }
        Relationships: []
      }
      portal_users: {
        Row: {
          active: boolean
          created_at: string
          doc: string | null
          email: string
          id: string
          name: string
          phone: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          doc?: string | null
          email: string
          id?: string
          name: string
          phone?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          doc?: string | null
          email?: string
          id?: string
          name?: string
          phone?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          area: number
          bathrooms: number
          bedrooms: number
          broker_id: string | null
          city: string | null
          code: string
          created_at: string
          description: string | null
          featured: boolean
          features: string[]
          high_standard: boolean
          id: string
          location: string | null
          neighborhood: string | null
          owner_name: string | null
          owner_phone: string | null
          parking: number
          price: number
          purpose: Database["public"]["Enums"]["property_purpose"]
          state: string | null
          status: Database["public"]["Enums"]["property_status"]
          suites: number
          tenant_id: string
          title: string
          type: Database["public"]["Enums"]["property_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          area?: number
          bathrooms?: number
          bedrooms?: number
          broker_id?: string | null
          city?: string | null
          code: string
          created_at?: string
          description?: string | null
          featured?: boolean
          features?: string[]
          high_standard?: boolean
          id?: string
          location?: string | null
          neighborhood?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          parking?: number
          price?: number
          purpose: Database["public"]["Enums"]["property_purpose"]
          state?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          suites?: number
          tenant_id: string
          title: string
          type: Database["public"]["Enums"]["property_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          area?: number
          bathrooms?: number
          bedrooms?: number
          broker_id?: string | null
          city?: string | null
          code?: string
          created_at?: string
          description?: string | null
          featured?: boolean
          features?: string[]
          high_standard?: boolean
          id?: string
          location?: string | null
          neighborhood?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          parking?: number
          price?: number
          purpose?: Database["public"]["Enums"]["property_purpose"]
          state?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          suites?: number
          tenant_id?: string
          title?: string
          type?: Database["public"]["Enums"]["property_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      property_images: {
        Row: {
          alt: string | null
          created_at: string
          id: string
          is_cover: boolean
          position: number
          property_id: string
          url: string
          url_sm: string | null
        }
        Insert: {
          alt?: string | null
          created_at?: string
          id?: string
          is_cover?: boolean
          position?: number
          property_id: string
          url: string
          url_sm?: string | null
        }
        Update: {
          alt?: string | null
          created_at?: string
          id?: string
          is_cover?: boolean
          position?: number
          property_id?: string
          url?: string
          url_sm?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_images_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_domains: {
        Row: {
          created_at: string
          domain: string
          id: string
          is_primary: boolean
          tenant_id: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          is_primary?: boolean
          tenant_id: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          is_primary?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_domains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["member_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          active: boolean
          alternate_names: string[]
          brand_accent: string
          brand_primary: string
          city: string | null
          created_at: string
          creci: string | null
          email: string | null
          hero_cta_href: string | null
          hero_cta_label: string | null
          hero_image: string | null
          hero_image_position: string
          hero_subtitle: string | null
          hero_title: string | null
          footer_links: Json
          footer_pages: Json
          footer_text: string | null
          id: string
          instagram: string | null
          favicon_url: string | null
          logo_url: string | null
          name: string
          phone: string | null
          slug: string
          state: string | null
          tagline: string | null
          updated_at: string
          updated_by: string | null
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          active?: boolean
          alternate_names?: string[]
          brand_accent?: string
          brand_primary?: string
          city?: string | null
          created_at?: string
          creci?: string | null
          email?: string | null
          hero_cta_href?: string | null
          hero_cta_label?: string | null
          hero_image?: string | null
          hero_image_position?: string
          hero_subtitle?: string | null
          hero_title?: string | null
          footer_links?: Json
          footer_pages?: Json
          footer_text?: string | null
          id?: string
          instagram?: string | null
          favicon_url?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          slug: string
          state?: string | null
          tagline?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          active?: boolean
          alternate_names?: string[]
          brand_accent?: string
          brand_primary?: string
          city?: string | null
          created_at?: string
          creci?: string | null
          email?: string | null
          hero_cta_href?: string | null
          hero_cta_label?: string | null
          hero_image?: string | null
          hero_image_position?: string
          hero_subtitle?: string | null
          hero_title?: string | null
          footer_links?: Json
          footer_pages?: Json
          footer_text?: string | null
          id?: string
          instagram?: string | null
          favicon_url?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          slug?: string
          state?: string | null
          tagline?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_member_of_slug: { Args: { folder: string }; Returns: boolean }
      is_portal_user: { Args: { t_id: string }; Returns: boolean }
      is_tenant_member: { Args: { t_id: string }; Returns: boolean }
    }
    Enums: {
      contract_party_role: "inquilino" | "proprietario" | "fiador"
      contract_status: "ativo" | "encerrado"
      member_role: "owner" | "admin"
      portal_doc_category: "contrato" | "vistoria" | "boleto" | "recibo" | "extrato" | "outro"
      property_purpose: "venda" | "aluguel"
      property_status: "active" | "sold" | "rented" | "draft"
      property_type: "casa" | "apartamento" | "sobrado" | "kitnet" | "chacara" | "rancho" | "terreno" | "barracao" | "sala" | "salao" | "predio"
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
      member_role: ["owner", "admin"],
      property_purpose: ["venda", "aluguel"],
      property_status: ["active", "sold", "rented", "draft"],
      property_type: ["casa", "apartamento", "sobrado", "kitnet", "chacara", "rancho", "terreno", "barracao", "sala", "salao", "predio"],
    },
  },
} as const
