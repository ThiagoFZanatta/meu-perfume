// Tipos do banco de dados (Supabase / PostgreSQL).
// Gerados manualmente a partir de supabase/migrations/20260905120000_init_schema.sql
// (sem CLI do Supabase disponível neste ambiente). Ao alterar o schema, atualizar
// este arquivo junto com a migration correspondente.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ProfileRole = "master" | "vendedor";
export type ProductGender = "masculino" | "feminino" | "unissex";
export type PaymentMethod = "especie" | "debito" | "credito_avista" | "credito_parcelado";
export type SaleStatus = "concluida" | "parcialmente_devolvida" | "totalmente_devolvida";
export type OrderStatus = "aberto" | "atendido";
export type ExpenseCategory = "aluguel" | "taxa_maquina" | "outras";

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          role: ProfileRole;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          role?: ProfileRole;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          role?: ProfileRole;
          created_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          name: string;
          brand: string;
          gender: ProductGender;
          ml: number;
          description: string | null;
          image_url: string | null;
          stock_quantity: number;
          markup_percent: number;
          current_unit_cost_brl: number;
          current_sale_price: number;
          active: boolean;
          last_purchase_date: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          brand: string;
          gender: ProductGender;
          ml: number;
          description?: string | null;
          image_url?: string | null;
          stock_quantity?: number;
          markup_percent: number;
          current_unit_cost_brl?: number;
          current_sale_price?: number;
          active?: boolean;
          last_purchase_date?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          brand?: string;
          gender?: ProductGender;
          ml?: number;
          description?: string | null;
          image_url?: string | null;
          stock_quantity?: number;
          markup_percent?: number;
          current_unit_cost_brl?: number;
          current_sale_price?: number;
          active?: boolean;
          last_purchase_date?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      purchases: {
        Row: {
          id: string;
          purchase_date: string;
          exchange_rate: number;
          freight_cost_brl: number;
          total_cost_brl: number;
          created_by: string;
          created_at: string;
          updated_at: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          purchase_date?: string;
          exchange_rate: number;
          freight_cost_brl?: number;
          total_cost_brl?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string | null;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          purchase_date?: string;
          exchange_rate?: number;
          freight_cost_brl?: number;
          total_cost_brl?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      purchase_items: {
        Row: {
          id: string;
          purchase_id: string;
          product_id: string;
          quantity: number;
          unit_price_usd: number;
          unit_cost_brl: number;
          subtotal_brl: number;
        };
        Insert: {
          id?: string;
          purchase_id: string;
          product_id: string;
          quantity: number;
          unit_price_usd: number;
          unit_cost_brl?: number;
          subtotal_brl?: number;
        };
        Update: {
          id?: string;
          purchase_id?: string;
          product_id?: string;
          quantity?: number;
          unit_price_usd?: number;
          unit_cost_brl?: number;
          subtotal_brl?: number;
        };
        Relationships: [];
      };
      sales: {
        Row: {
          id: string;
          sale_date: string;
          seller_id: string;
          payment_method: PaymentMethod;
          total_amount: number;
          commission_amount: number;
          status: SaleStatus;
          created_at: string;
          updated_at: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          sale_date?: string;
          seller_id?: string;
          payment_method: PaymentMethod;
          total_amount?: number;
          commission_amount?: number;
          status?: SaleStatus;
          created_at?: string;
          updated_at?: string | null;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          sale_date?: string;
          seller_id?: string;
          payment_method?: PaymentMethod;
          total_amount?: number;
          commission_amount?: number;
          status?: SaleStatus;
          created_at?: string;
          updated_at?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      sale_items: {
        Row: {
          id: string;
          sale_id: string;
          product_id: string;
          quantity: number;
          unit_sale_price: number;
          discount_percent: number;
          subtotal: number;
          returned_quantity: number;
        };
        Insert: {
          id?: string;
          sale_id: string;
          product_id: string;
          quantity: number;
          unit_sale_price: number;
          discount_percent?: number;
          subtotal?: number;
          returned_quantity?: number;
        };
        Update: {
          id?: string;
          sale_id?: string;
          product_id?: string;
          quantity?: number;
          unit_sale_price?: number;
          discount_percent?: number;
          subtotal?: number;
          returned_quantity?: number;
        };
        Relationships: [];
      };
      sale_returns: {
        Row: {
          id: string;
          sale_item_id: string;
          quantity_returned: number;
          reason: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          sale_item_id: string;
          quantity_returned: number;
          reason?: string | null;
          created_by?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          sale_item_id?: string;
          quantity_returned?: number;
          reason?: string | null;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          customer_name: string;
          customer_contact: string;
          desired_product_text: string | null;
          desired_product_id: string | null;
          observation: string | null;
          status: OrderStatus;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_name: string;
          customer_contact: string;
          desired_product_text?: string | null;
          desired_product_id?: string | null;
          observation?: string | null;
          status?: OrderStatus;
          created_by?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          customer_name?: string;
          customer_contact?: string;
          desired_product_text?: string | null;
          desired_product_id?: string | null;
          observation?: string | null;
          status?: OrderStatus;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          key: string;
          value: Json;
        };
        Insert: {
          key: string;
          value: Json;
        };
        Update: {
          key?: string;
          value?: Json;
        };
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string;
          expense_date: string;
          category: ExpenseCategory;
          description: string | null;
          amount: number;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          expense_date?: string;
          category: ExpenseCategory;
          description?: string | null;
          amount: number;
          created_by?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          expense_date?: string;
          category?: ExpenseCategory;
          description?: string | null;
          amount?: number;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      products_catalog_v: {
        Row: {
          id: string;
          name: string;
          brand: string;
          gender: ProductGender;
          ml: number;
          description: string | null;
          image_url: string | null;
          stock_quantity: number;
          active: boolean;
          current_sale_price: number;
          last_purchase_date: string | null;
          created_at: string;
        };
        Relationships: [];
      };
      sales_seller_v: {
        Row: {
          id: string;
          sale_date: string;
          seller_id: string;
          payment_method: PaymentMethod;
          total_amount: number;
          status: SaleStatus;
          created_at: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      confirm_purchase: {
        Args: {
          p_purchase_date: string;
          p_exchange_rate: number;
          p_freight_cost_brl: number;
          p_items: Json;
        };
        Returns: string;
      };
      confirm_sale: {
        Args: {
          p_payment_method: PaymentMethod;
          p_items: Json;
        };
        Returns: string;
      };
      default_commission_percent: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      delete_purchase: {
        Args: { p_purchase_id: string };
        Returns: undefined;
      };
      delete_sale: {
        Args: { p_sale_id: string };
        Returns: undefined;
      };
      is_master: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_own_sale: {
        Args: { p_sale_id: string; p_within_edit_window?: boolean };
        Returns: boolean;
      };
      needs_bootstrap: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      return_sale_items: {
        Args: { p_sale_id: string; p_items: Json };
        Returns: undefined;
      };
      seller_edit_window_hours: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      update_purchase_pricing: {
        Args: {
          p_purchase_id: string;
          p_exchange_rate: number;
          p_freight_cost_brl: number;
          p_sale_prices: Json;
        };
        Returns: undefined;
      };
    };
    Enums: {
      profile_role: ProfileRole;
      product_gender: ProductGender;
      payment_method: PaymentMethod;
      sale_status: SaleStatus;
      order_status: OrderStatus;
      expense_category: ExpenseCategory;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      profile_role: ["master", "vendedor"],
      product_gender: ["masculino", "feminino", "unissex"],
      payment_method: ["especie", "debito", "credito_avista", "credito_parcelado"],
      sale_status: ["concluida", "parcialmente_devolvida", "totalmente_devolvida"],
      order_status: ["aberto", "atendido"],
      expense_category: ["aluguel", "taxa_maquina", "outras"],
    },
  },
} as const;
