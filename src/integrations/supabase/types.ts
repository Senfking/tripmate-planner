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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      attachments: {
        Row: {
          booking_data: Json | null
          created_at: string
          created_by: string | null
          file_path: string | null
          id: string
          itinerary_item_id: string | null
          notes: string | null
          og_description: string | null
          og_image_url: string | null
          og_title: string | null
          title: string
          trip_id: string
          type: string
          url: string | null
        }
        Insert: {
          booking_data?: Json | null
          created_at?: string
          created_by?: string | null
          file_path?: string | null
          id?: string
          itinerary_item_id?: string | null
          notes?: string | null
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          title: string
          trip_id: string
          type: string
          url?: string | null
        }
        Update: {
          booking_data?: Json | null
          created_at?: string
          created_by?: string | null
          file_path?: string | null
          id?: string
          itinerary_item_id?: string | null
          notes?: string | null
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          title?: string
          trip_id?: string
          type?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_itinerary_item_id_fkey"
            columns: ["itinerary_item_id"]
            isOneToOne: false
            referencedRelation: "itinerary_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          attachment_id: string | null
          body: string
          created_at: string
          id: string
          itinerary_item_id: string | null
          trip_id: string
          user_id: string
        }
        Insert: {
          attachment_id?: string | null
          body: string
          created_at?: string
          id?: string
          itinerary_item_id?: string | null
          trip_id: string
          user_id: string
        }
        Update: {
          attachment_id?: string | null
          body?: string
          created_at?: string
          id?: string
          itinerary_item_id?: string | null
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_itinerary_item_id_fkey"
            columns: ["itinerary_item_id"]
            isOneToOne: false
            referencedRelation: "itinerary_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      date_option_votes: {
        Row: {
          date_option_id: string
          id: string
          user_id: string
          value: string
        }
        Insert: {
          date_option_id: string
          id?: string
          user_id: string
          value: string
        }
        Update: {
          date_option_id?: string
          id?: string
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "date_option_votes_date_option_id_fkey"
            columns: ["date_option_id"]
            isOneToOne: false
            referencedRelation: "proposal_date_options"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rate_cache: {
        Row: {
          base_currency: string
          fetched_at: string | null
          rates: Json
        }
        Insert: {
          base_currency: string
          fetched_at?: string | null
          rates: Json
        }
        Update: {
          base_currency?: string
          fetched_at?: string | null
          rates?: Json
        }
        Relationships: []
      }
      expense_splits: {
        Row: {
          expense_id: string
          id: string
          share_amount: number
          user_id: string
        }
        Insert: {
          expense_id: string
          id?: string
          share_amount: number
          user_id: string
        }
        Update: {
          expense_id?: string
          id?: string
          share_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_splits_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          currency: string
          id: string
          incurred_on: string
          itinerary_item_id: string | null
          notes: string | null
          payer_id: string
          title: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          currency?: string
          id?: string
          incurred_on: string
          itinerary_item_id?: string | null
          notes?: string | null
          payer_id: string
          title: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          currency?: string
          id?: string
          incurred_on?: string
          itinerary_item_id?: string | null
          notes?: string | null
          payer_id?: string
          title?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_itinerary_item_id_fkey"
            columns: ["itinerary_item_id"]
            isOneToOne: false
            referencedRelation: "itinerary_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          body: string | null
          created_at: string
          id: string
          rating: number
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          rating: number
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          rating?: number
          user_id?: string
        }
        Relationships: []
      }
      invite_redemptions: {
        Row: {
          id: string
          invite_id: string
          redeemed_at: string
          user_id: string
        }
        Insert: {
          id?: string
          invite_id: string
          redeemed_at?: string
          user_id: string
        }
        Update: {
          id?: string
          invite_id?: string
          redeemed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_redemptions_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "invites"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          created_by: string
          expires_at: string
          id: string
          revoked_at: string | null
          role: string
          token: string
          trip_id: string
        }
        Insert: {
          created_by: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          role?: string
          token: string
          trip_id: string
        }
        Update: {
          created_by?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          role?: string
          token?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_attendance: {
        Row: {
          id: string
          itinerary_item_id: string
          status: string
          trip_id: string
          user_id: string
        }
        Insert: {
          id?: string
          itinerary_item_id: string
          status: string
          trip_id: string
          user_id: string
        }
        Update: {
          id?: string
          itinerary_item_id?: string
          status?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_attendance_itinerary_item_id_fkey"
            columns: ["itinerary_item_id"]
            isOneToOne: false
            referencedRelation: "itinerary_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_attendance_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_items: {
        Row: {
          created_at: string
          created_by: string
          day_date: string
          end_time: string | null
          id: string
          location_text: string | null
          notes: string | null
          sort_order: number
          start_time: string | null
          status: string
          title: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          day_date: string
          end_time?: string | null
          id?: string
          location_text?: string | null
          notes?: string | null
          sort_order?: number
          start_time?: string | null
          status?: string
          title: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          day_date?: string
          end_time?: string | null
          id?: string
          location_text?: string | null
          notes?: string | null
          sort_order?: number
          start_time?: string | null
          status?: string
          title?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_options: {
        Row: {
          end_date: string | null
          id: string
          label: string
          poll_id: string
          sort_order: number
          start_date: string | null
        }
        Insert: {
          end_date?: string | null
          id?: string
          label: string
          poll_id: string
          sort_order?: number
          start_date?: string | null
        }
        Update: {
          end_date?: string | null
          id?: string
          label?: string
          poll_id?: string
          sort_order?: number
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          created_at: string
          id: string
          status: string
          title: string
          trip_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          title: string
          trip_id: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          title?: string
          trip_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "polls_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_currency: string | null
          display_name: string | null
          feature_flags: Json
          id: string
          notification_preferences: Json
          referral_code: string | null
          referred_by: string | null
          stripe_customer_id: string | null
          subscription_expires_at: string | null
          subscription_status: string
          subscription_tier: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_currency?: string | null
          display_name?: string | null
          feature_flags?: Json
          id: string
          notification_preferences?: Json
          referral_code?: string | null
          referred_by?: string | null
          stripe_customer_id?: string | null
          subscription_expires_at?: string | null
          subscription_status?: string
          subscription_tier?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_currency?: string | null
          display_name?: string | null
          feature_flags?: Json
          id?: string
          notification_preferences?: Json
          referral_code?: string | null
          referred_by?: string | null
          stripe_customer_id?: string | null
          subscription_expires_at?: string | null
          subscription_status?: string
          subscription_tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_date_options: {
        Row: {
          created_at: string
          created_by: string
          end_date: string
          id: string
          proposal_id: string
          start_date: string
        }
        Insert: {
          created_at?: string
          created_by: string
          end_date: string
          id?: string
          proposal_id: string
          start_date: string
        }
        Update: {
          created_at?: string
          created_by?: string
          end_date?: string
          id?: string
          proposal_id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_date_options_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "trip_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_reactions: {
        Row: {
          id: string
          proposal_id: string
          user_id: string
          value: string
        }
        Insert: {
          id?: string
          proposal_id: string
          user_id: string
          value: string
        }
        Update: {
          id?: string
          proposal_id?: string
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_reactions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "trip_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          created_at: string
          device_name: string | null
          endpoint: string
          id: string
          keys: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          endpoint: string
          id?: string
          keys: Json
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          endpoint?: string
          id?: string
          keys?: Json
          user_id?: string
        }
        Relationships: []
      }
      trip_last_seen: {
        Row: {
          last_seen_at: string
          trip_id: string
          user_id: string
        }
        Insert: {
          last_seen_at?: string
          trip_id: string
          user_id: string
        }
        Update: {
          last_seen_at?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_last_seen_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_members: {
        Row: {
          attendance_status: string
          id: string
          joined_at: string
          role: string
          trip_id: string
          user_id: string
        }
        Insert: {
          attendance_status?: string
          id?: string
          joined_at?: string
          role: string
          trip_id: string
          user_id: string
        }
        Update: {
          attendance_status?: string
          id?: string
          joined_at?: string
          role?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_proposals: {
        Row: {
          created_at: string
          created_by: string
          destination: string
          end_date: string | null
          id: string
          note: string | null
          start_date: string | null
          trip_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          destination: string
          end_date?: string | null
          id?: string
          note?: string | null
          start_date?: string | null
          trip_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          destination?: string
          end_date?: string | null
          id?: string
          note?: string | null
          start_date?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_proposals_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_route_stops: {
        Row: {
          confirmed_at: string
          confirmed_by: string
          destination: string
          end_date: string
          id: string
          notes: string | null
          proposal_id: string | null
          start_date: string
          trip_id: string
        }
        Insert: {
          confirmed_at?: string
          confirmed_by: string
          destination: string
          end_date: string
          id?: string
          notes?: string | null
          proposal_id?: string | null
          start_date: string
          trip_id: string
        }
        Update: {
          confirmed_at?: string
          confirmed_by?: string
          destination?: string
          end_date?: string
          id?: string
          notes?: string | null
          proposal_id?: string | null
          start_date?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_route_stops_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "trip_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_route_stops_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_share_tokens: {
        Row: {
          created_by: string
          expires_at: string
          id: string
          revoked_at: string | null
          token: string
          trip_id: string
        }
        Insert: {
          created_by: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          token: string
          trip_id: string
        }
        Update: {
          created_by?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          token?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_share_tokens_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          created_at: string
          emoji: string | null
          id: string
          name: string
          route_locked: boolean
          settlement_currency: string
          share_permission: string
          tentative_end_date: string | null
          tentative_start_date: string | null
          trip_code: string
          updated_at: string
          vibe_board_active: boolean
          vibe_board_locked: boolean
        }
        Insert: {
          created_at?: string
          emoji?: string | null
          id?: string
          name: string
          route_locked?: boolean
          settlement_currency?: string
          share_permission?: string
          tentative_end_date?: string | null
          tentative_start_date?: string | null
          trip_code: string
          updated_at?: string
          vibe_board_active?: boolean
          vibe_board_locked?: boolean
        }
        Update: {
          created_at?: string
          emoji?: string | null
          id?: string
          name?: string
          route_locked?: boolean
          settlement_currency?: string
          share_permission?: string
          tentative_end_date?: string | null
          tentative_start_date?: string | null
          trip_code?: string
          updated_at?: string
          vibe_board_active?: boolean
          vibe_board_locked?: boolean
        }
        Relationships: []
      }
      vibe_responses: {
        Row: {
          answer_value: string
          created_at: string
          id: string
          question_key: string
          trip_id: string
          user_id: string
        }
        Insert: {
          answer_value: string
          created_at?: string
          id?: string
          question_key: string
          trip_id: string
          user_id: string
        }
        Update: {
          answer_value?: string
          created_at?: string
          id?: string
          question_key?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vibe_responses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      votes: {
        Row: {
          id: string
          poll_option_id: string
          user_id: string
          value: string
        }
        Insert: {
          id?: string
          poll_option_id: string
          user_id: string
          value: string
        }
        Update: {
          id?: string
          poll_option_id?: string
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "votes_poll_option_id_fkey"
            columns: ["poll_option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_trip_code: { Args: never; Returns: string }
      get_date_option_vote_counts: {
        Args: { _trip_id: string }
        Returns: {
          count: number
          date_option_id: string
          value: string
        }[]
      }
      get_poll_vote_counts: {
        Args: { _poll_id: string }
        Returns: {
          count: number
          poll_option_id: string
          value: string
        }[]
      }
      get_public_profiles: {
        Args: { _user_ids: string[] }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
        }[]
      }
      get_trip_proposal_reaction_counts: {
        Args: { _trip_id: string }
        Returns: {
          count: number
          proposal_id: string
          value: string
        }[]
      }
      get_vibe_aggregates: {
        Args: { _trip_id: string }
        Returns: {
          answer_value: string
          question_key: string
          response_count: number
        }[]
      }
      get_vibe_respondent_count: { Args: { _trip_id: string }; Returns: number }
      is_trip_admin_or_owner: {
        Args: { _trip_id: string; _user_id: string }
        Returns: boolean
      }
      is_trip_member: {
        Args: { _trip_id: string; _user_id: string }
        Returns: boolean
      }
      join_by_code: { Args: { _code: string }; Returns: Json }
      redeem_invite: { Args: { _token: string }; Returns: Json }
      regenerate_trip_code: { Args: { _trip_id: string }; Returns: Json }
      remove_trip_member: {
        Args: { _target_user_id: string; _trip_id: string }
        Returns: Json
      }
      update_member_role: {
        Args: { _new_role: string; _target_user_id: string; _trip_id: string }
        Returns: Json
      }
      user_has_feature: {
        Args: { _feature: string; _user_id: string }
        Returns: boolean
      }
      user_tier: { Args: { _user_id: string }; Returns: string }
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
