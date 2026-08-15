export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.15'
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
        Relationships: []
      }
      leads: {
        Row: {
          created_at: string
          id: string
          message: string | null
          name: string | null
          phone: string | null
          property_id: string | null
          source: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          name?: string | null
          phone?: string | null
          property_id?: string | null
          source?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          name?: string | null
          phone?: string | null
          property_id?: string | null
          source?: string
          tenant_id?: string
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
          location: string | null
          owner_name: string | null
          owner_phone: string | null
          features: string[]
          high_standard: boolean
          id: string
          neighborhood: string | null
          parking: number
          price: number
          purpose: Database['public']['Enums']['property_purpose']
          state: string | null
          status: Database['public']['Enums']['property_status']
          tenant_id: string
          title: string
          type: Database['public']['Enums']['property_type']
          updated_at: string
        }
        Insert: {
          area?: number
          bathrooms?: number
          bedrooms?: number
          broker_id?: string | null
          location?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          city?: string | null
          code: string
          created_at?: string
          description?: string | null
          featured?: boolean
          features?: string[]
          high_standard?: boolean
          id?: string
          neighborhood?: string | null
          parking?: number
          price?: number
          purpose: Database['public']['Enums']['property_purpose']
          state?: string | null
          status?: Database['public']['Enums']['property_status']
          tenant_id: string
          title: string
          type: Database['public']['Enums']['property_type']
          updated_at?: string
        }
        Update: {
          area?: number
          bathrooms?: number
          bedrooms?: number
          broker_id?: string | null
          location?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          city?: string | null
          code?: string
          created_at?: string
          description?: string | null
          featured?: boolean
          features?: string[]
          high_standard?: boolean
          id?: string
          neighborhood?: string | null
          parking?: number
          price?: number
          purpose?: Database['public']['Enums']['property_purpose']
          state?: string | null
          status?: Database['public']['Enums']['property_status']
          tenant_id?: string
          title?: string
          type?: Database['public']['Enums']['property_type']
          updated_at?: string
        }
        Relationships: []
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
        }
        Insert: {
          alt?: string | null
          created_at?: string
          id?: string
          is_cover?: boolean
          position?: number
          property_id: string
          url: string
        }
        Update: {
          alt?: string | null
          created_at?: string
          id?: string
          is_cover?: boolean
          position?: number
          property_id?: string
          url?: string
        }
        Relationships: []
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
        Relationships: []
      }
      tenant_members: {
        Row: {
          created_at: string
          id: string
          role: Database['public']['Enums']['member_role']
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database['public']['Enums']['member_role']
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database['public']['Enums']['member_role']
          tenant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          active: boolean
          alternate_names: string[]
          instagram: string | null
          website: string | null
          brand_accent: string
          brand_primary: string
          city: string | null
          created_at: string
          creci: string | null
          email: string | null
          hero_subtitle: string | null
          hero_title: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          slug: string
          state: string | null
          tagline: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          active?: boolean
          alternate_names?: string[]
          instagram?: string | null
          website?: string | null
          brand_accent?: string
          brand_primary?: string
          city?: string | null
          created_at?: string
          creci?: string | null
          email?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          slug: string
          state?: string | null
          tagline?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          active?: boolean
          alternate_names?: string[]
          instagram?: string | null
          website?: string | null
          brand_accent?: string
          brand_primary?: string
          city?: string | null
          created_at?: string
          creci?: string | null
          email?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          slug?: string
          state?: string | null
          tagline?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: {
      is_tenant_member: { Args: { t_id: string }; Returns: boolean }
    }
    Enums: {
      member_role: 'owner' | 'admin'
      property_purpose: 'venda' | 'aluguel'
      property_status: 'active' | 'sold' | 'rented' | 'draft'
      property_type: 'casa' | 'apartamento' | 'sobrado' | 'terreno'
    }
    CompositeTypes: Record<never, never>
  }
}
