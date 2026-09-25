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
      ai_generations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          input_tokens: number
          kind: string
          model: string
          output_tokens: number
          property_id: string | null
          /** `reservada` nasce antes da chamada — ver reservar_geracao_ia. */
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          input_tokens?: number
          kind: string
          model: string
          output_tokens?: number
          property_id?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          input_tokens?: number
          kind?: string
          model?: string
          output_tokens?: number
          property_id?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: []
      }
      brokers: {
        Row: {
          active: boolean
          bio: string | null
          created_at: string
          creci: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          photo_url: string | null
          public_visible: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          bio?: string | null
          created_at?: string
          creci?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          photo_url?: string | null
          public_visible?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          bio?: string | null
          created_at?: string
          creci?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          photo_url?: string | null
          public_visible?: boolean
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
      charge_items: {
        Row: {
          amount: number
          charge_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          kind: string
          reverses_item_id: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          charge_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind: string
          reverses_item_id?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          charge_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          reverses_item_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "charge_items_charge_id_tenant_id_fkey"
            columns: ["charge_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "contract_charges"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "charge_items_reverses_item_id_fkey"
            columns: ["reverses_item_id"]
            isOneToOne: false
            referencedRelation: "charge_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charge_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      charge_settlements: {
        Row: {
          amount: number
          charge_id: string
          created_at: string
          created_by: string | null
          external_ref: string | null
          id: string
          idempotency_key: string | null
          method: string
          reverses_settlement_id: string | null
          settled_on: string
          tenant_id: string
        }
        Insert: {
          amount: number
          charge_id: string
          created_at?: string
          created_by?: string | null
          external_ref?: string | null
          id?: string
          idempotency_key?: string | null
          method: string
          reverses_settlement_id?: string | null
          settled_on: string
          tenant_id: string
        }
        Update: {
          amount?: number
          charge_id?: string
          created_at?: string
          created_by?: string | null
          external_ref?: string | null
          id?: string
          idempotency_key?: string | null
          method?: string
          reverses_settlement_id?: string | null
          settled_on?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "charge_settlements_charge_id_tenant_id_fkey"
            columns: ["charge_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "contract_charges"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "charge_settlements_reverses_settlement_id_fkey"
            columns: ["reverses_settlement_id"]
            isOneToOne: false
            referencedRelation: "charge_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charge_settlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_charges: {
        Row: {
          cancel_reason: string | null
          canceled_at: string | null
          canceled_by: string | null
          competence: string
          contract_id: string
          created_at: string
          created_by: string | null
          due_on: string
          id: string
          issued_amount: number | null
          kind: string
          tenant_id: string
        }
        Insert: {
          cancel_reason?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          competence: string
          contract_id: string
          created_at?: string
          created_by?: string | null
          due_on: string
          id?: string
          issued_amount?: number | null
          kind?: string
          tenant_id: string
        }
        Update: {
          cancel_reason?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          competence?: string
          contract_id?: string
          created_at?: string
          created_by?: string | null
          due_on?: string
          id?: string
          issued_amount?: number | null
          kind?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_charges_contract_id_tenant_id_fkey"
            columns: ["contract_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "contract_charges_tenant_id_fkey"
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
        Relationships: [
          {
            foreignKeyName: "contract_internal_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "contract_parties_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_parties_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "contracts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      owner_payouts: {
        Row: {
          cancel_reason: string | null
          canceled_at: string | null
          canceled_by: string | null
          competence: string
          contract_id: string
          created_at: string
          created_by: string | null
          destination_id: string | null
          external_ref: string | null
          id: string
          idempotency_key: string | null
          paid_at: string | null
          scheduled_for: string | null
          tenant_id: string
        }
        Insert: {
          cancel_reason?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          competence: string
          contract_id: string
          created_at?: string
          created_by?: string | null
          destination_id?: string | null
          external_ref?: string | null
          id?: string
          idempotency_key?: string | null
          paid_at?: string | null
          scheduled_for?: string | null
          tenant_id: string
        }
        Update: {
          cancel_reason?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          competence?: string
          contract_id?: string
          created_at?: string
          created_by?: string | null
          destination_id?: string | null
          external_ref?: string | null
          id?: string
          idempotency_key?: string | null
          paid_at?: string | null
          scheduled_for?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_payouts_contract_id_tenant_id_fkey"
            columns: ["contract_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "owner_payouts_destination_id_tenant_id_fkey"
            columns: ["destination_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "payout_destinations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "owner_payouts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_destinations: {
        Row: {
          account: string | null
          account_digit: string | null
          account_type: string | null
          active: boolean
          bank_code: string | null
          bank_ispb: string | null
          branch: string | null
          created_at: string
          created_by: string | null
          holder_doc: string
          holder_name: string
          id: string
          kind: string
          pix_key: string | null
          pix_key_type: string | null
          portal_user_id: string
          tenant_id: string
        }
        Insert: {
          account?: string | null
          account_digit?: string | null
          account_type?: string | null
          active?: boolean
          bank_code?: string | null
          bank_ispb?: string | null
          branch?: string | null
          created_at?: string
          created_by?: string | null
          holder_doc: string
          holder_name: string
          id?: string
          kind: string
          pix_key?: string | null
          pix_key_type?: string | null
          portal_user_id: string
          tenant_id: string
        }
        Update: {
          account?: string | null
          account_digit?: string | null
          account_type?: string | null
          active?: boolean
          bank_code?: string | null
          bank_ispb?: string | null
          branch?: string | null
          created_at?: string
          created_by?: string | null
          holder_doc?: string
          holder_name?: string
          id?: string
          kind?: string
          pix_key?: string | null
          pix_key_type?: string | null
          portal_user_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_destinations_portal_user_id_tenant_id_fkey"
            columns: ["portal_user_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "payout_destinations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_items: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          kind: string
          payout_id: string
          reverses_item_id: string | null
          source_charge_id: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind: string
          payout_id: string
          reverses_item_id?: string | null
          source_charge_id?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          payout_id?: string
          reverses_item_id?: string | null
          source_charge_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_items_payout_id_tenant_id_fkey"
            columns: ["payout_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "owner_payouts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "payout_items_reverses_item_id_fkey"
            columns: ["reverses_item_id"]
            isOneToOne: false
            referencedRelation: "payout_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_items_source_charge_id_tenant_id_fkey"
            columns: ["source_charge_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "contract_charges"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "payout_items_tenant_id_fkey"
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
        Relationships: [
          {
            foreignKeyName: "portal_document_access_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "portal_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_document_access_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_document_access_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "portal_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_users: {
        Row: {
          access_confirmed_at: string | null
          active: boolean
          created_at: string
          doc: string | null
          email: string
          id: string
          last_recovery_at: string | null
          name: string
          phone: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_confirmed_at?: string | null
          active?: boolean
          created_at?: string
          doc?: string | null
          email: string
          id?: string
          last_recovery_at?: string | null
          name: string
          phone?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_confirmed_at?: string | null
          active?: boolean
          created_at?: string
          doc?: string | null
          email?: string
          id?: string
          last_recovery_at?: string | null
          name?: string
          phone?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      tenant_features: {
        Row: {
          enabled: boolean
          enabled_at: string | null
          feature: string
          /** Tipo `date` no banco (YYYY-MM-DD), não timestamp — ver `recursoAtivo`. */
          grace_until: string | null
          notes: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          enabled_at?: string | null
          feature: string
          grace_until?: string | null
          notes?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          enabled_at?: string | null
          feature?: string
          grace_until?: string | null
          notes?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_features_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_mail_sender: {
        Row: {
          created_at: string
          from_address: string
          notes: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_address: string
          notes?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_address?: string
          notes?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_mail_sender_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
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
          about_content: Json
          about_enabled: boolean
          active: boolean
          address_complement: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_street: string | null
          address_zip: string | null
          ai_tone: string
          alternate_names: string[]
          brand_accent: string
          brand_primary: string
          city: string | null
          created_at: string
          creci: string | null
          email: string | null
          favicon_url: string | null
          footer_links: Json
          footer_pages: Json
          footer_text: string | null
          hero_cta_href: string | null
          hero_cta_label: string | null
          hero_image: string | null
          hero_image_position: string
          header_style: string
          site_theme: string
          hero_subtitle: string | null
          hero_title: string | null
          id: string
          instagram: string | null
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          name: string
          phone: string | null
          portal_enabled: boolean
          slug: string
          state: string | null
          tagline: string | null
          updated_at: string
          updated_by: string | null
          website: string | null
          whatsapp: string | null
          whatsapp_button_color: string | null
        }
        Insert: {
          about_content?: Json
          about_enabled?: boolean
          active?: boolean
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_street?: string | null
          address_zip?: string | null
          ai_tone?: string
          alternate_names?: string[]
          brand_accent?: string
          brand_primary?: string
          city?: string | null
          created_at?: string
          creci?: string | null
          email?: string | null
          favicon_url?: string | null
          footer_links?: Json
          footer_pages?: Json
          footer_text?: string | null
          hero_cta_href?: string | null
          hero_cta_label?: string | null
          hero_image?: string | null
          hero_image_position?: string
          header_style?: string
          site_theme?: string
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string
          instagram?: string | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          name: string
          phone?: string | null
          portal_enabled?: boolean
          slug: string
          state?: string | null
          tagline?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
          whatsapp?: string | null
          whatsapp_button_color?: string | null
        }
        Update: {
          about_content?: Json
          about_enabled?: boolean
          active?: boolean
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_street?: string | null
          address_zip?: string | null
          ai_tone?: string
          alternate_names?: string[]
          brand_accent?: string
          brand_primary?: string
          city?: string | null
          created_at?: string
          creci?: string | null
          email?: string | null
          favicon_url?: string | null
          footer_links?: Json
          footer_pages?: Json
          footer_text?: string | null
          hero_cta_href?: string | null
          hero_cta_label?: string | null
          hero_image?: string | null
          hero_image_position?: string
          header_style?: string
          site_theme?: string
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string
          instagram?: string | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          name?: string
          phone?: string | null
          portal_enabled?: boolean
          slug?: string
          state?: string | null
          tagline?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
          whatsapp?: string | null
          whatsapp_button_color?: string | null
        }
        Relationships: []
      }
      whatsapp_clicks: {
        Row: {
          broker_id: string | null
          created_at: string
          destination: string
          id: string
          ip_hash: string | null
          lead_id: string | null
          origin: string
          property_id: string | null
          tenant_id: string
        }
        Insert: {
          broker_id?: string | null
          created_at?: string
          destination: string
          id?: string
          ip_hash?: string | null
          lead_id?: string | null
          origin: string
          property_id?: string | null
          tenant_id: string
        }
        Update: {
          broker_id?: string | null
          created_at?: string
          destination?: string
          id?: string
          ip_hash?: string | null
          lead_id?: string | null
          origin?: string
          property_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_clicks_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_clicks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_clicks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_clicks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_member_of_slug: { Args: { folder: string }; Returns: boolean }
      is_portal_user: { Args: { t_id: string }; Returns: boolean }
      is_tenant_member: { Args: { t_id: string }; Returns: boolean }
      orphan_property_images: {
        Args: { grace_hours?: number }
        Returns: {
          name: string
        }[]
      }
      orphan_sweep_token_valid: {
        Args: { candidate: string }
        Returns: boolean
      }
      portal_can_read_doc_path: { Args: { p_path: string }; Returns: boolean }
      portal_my_parties: {
        Args: never
        Returns: {
          contract_id: string
          party_role: Database["public"]["Enums"]["contract_party_role"]
          tenant_id: string
        }[]
      }
      reservar_geracao_ia: {
        Args: {
          p_tenant_id: string
          p_created_by: string
          p_property_id: string | null
          p_kind: string
          p_model: string
          p_cota_mes: number
          p_cota_minuto: number
        }
        /** `null` = cota (mês ou minuto) estourada — não é o id de uma reserva. */
        Returns: string | null
      }
    }
    Enums: {
      contract_party_role: "inquilino" | "proprietario" | "fiador"
      contract_status: "ativo" | "encerrado"
      member_role: "owner" | "admin"
      portal_doc_category:
        | "contrato"
        | "vistoria"
        | "boleto"
        | "recibo"
        | "extrato"
        | "outro"
        | "contrato_administracao"
      property_purpose: "venda" | "aluguel"
      property_status: "active" | "sold" | "rented" | "draft"
      property_type: "casa" | "apartamento" | "sobrado" | "kitnet" | "chacara" | "rancho" | "terreno" | "barracao" | "sala" | "salao" | "predio" | "condominio"
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
      contract_party_role: ["inquilino", "proprietario", "fiador"],
      contract_status: ["ativo", "encerrado"],
      member_role: ["owner", "admin"],
      portal_doc_category: [
        "contrato",
        "vistoria",
        "boleto",
        "recibo",
        "extrato",
        "outro",
        "contrato_administracao",
      ],
      property_purpose: ["venda", "aluguel"],
      property_status: ["active", "sold", "rented", "draft"],
      property_type: ["casa", "apartamento", "sobrado", "kitnet", "chacara", "rancho", "terreno", "barracao", "sala", "salao", "predio", "condominio"],
    },
  },
} as const
