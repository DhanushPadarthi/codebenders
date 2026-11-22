export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type CustomerStatus = 'active' | 'inactive' | 'archived';
export type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
export type PaymentMode = 'upi' | 'cash' | 'bank_transfer' | 'cheque' | 'other';
export type BillCategory = 'rent' | 'electricity' | 'internet' | 'salary' | 'materials' | 'software' | 'other';
export type BillStatus = 'unpaid' | 'paid' | 'overdue';
export type PromiseStatus = 'pending' | 'fulfilled' | 'broken' | 'cancelled';
export type PriorityLevel = 'low' | 'medium' | 'high' | 'urgent';
export type ReminderTone = 'friendly' | 'professional' | 'firm' | 'urgent';
export type AgeingBucket = 'current' | '1-7_days' | '8-15_days' | '16-30_days' | '31+_days';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          phone: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          email: string;
          phone?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          email?: string;
          phone?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      businesses: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          currency: string;
          timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          currency?: string;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          currency?: string;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      business_settings: {
        Row: {
          id: string;
          business_id: string;
          opening_cash_balance: number;
          default_payment_terms_days: number;
          upi_id: string | null;
          upi_qr_code_url: string | null;
          invoice_prefix: string;
          monthly_burn_target: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          opening_cash_balance?: number;
          default_payment_terms_days?: number;
          upi_id?: string | null;
          upi_qr_code_url?: string | null;
          invoice_prefix?: string;
          monthly_burn_target?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          opening_cash_balance?: number;
          default_payment_terms_days?: number;
          upi_id?: string | null;
          upi_qr_code_url?: string | null;
          invoice_prefix?: string;
          monthly_burn_target?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      customers: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          parent_name: string | null;
          grade_subject: string | null;
          email: string | null;
          phone: string;
          whatsapp_number: string;
          default_fee_amount: number;
          billing_cycle_day: number;
          status: CustomerStatus;
          notes: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          parent_name?: string | null;
          grade_subject?: string | null;
          email?: string | null;
          phone: string;
          whatsapp_number: string;
          default_fee_amount?: number;
          billing_cycle_day?: number;
          status?: CustomerStatus;
          notes?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          parent_name?: string | null;
          grade_subject?: string | null;
          email?: string | null;
          phone?: string;
          whatsapp_number?: string;
          default_fee_amount?: number;
          billing_cycle_day?: number;
          status?: CustomerStatus;
          notes?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      invoices: {
        Row: {
          id: string;
          business_id: string;
          customer_id: string;
          invoice_number: string;
          issue_date: string;
          due_date: string;
          subtotal: number;
          discount: number;
          total_amount: number;
          amount_paid: number;
          balance_due: number;
          status: InvoiceStatus;
          notes: string | null;
          pdf_url: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          customer_id: string;
          invoice_number: string;
          issue_date?: string;
          due_date: string;
          subtotal?: number;
          discount?: number;
          total_amount: number;
          amount_paid?: number;
          status?: InvoiceStatus;
          notes?: string | null;
          pdf_url?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          customer_id?: string;
          invoice_number?: string;
          issue_date?: string;
          due_date?: string;
          subtotal?: number;
          discount?: number;
          total_amount?: number;
          amount_paid?: number;
          status?: InvoiceStatus;
          notes?: string | null;
          pdf_url?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      invoice_items: {
        Row: {
          id: string;
          business_id: string;
          invoice_id: string;
          description: string;
          quantity: number;
          unit_price: number;
          total_price: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          invoice_id: string;
          description: string;
          quantity?: number;
          unit_price: number;
          total_price: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          invoice_id?: string;
          description?: string;
          quantity?: number;
          unit_price?: number;
          total_price?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      payments: {
        Row: {
          id: string;
          business_id: string;
          invoice_id: string;
          customer_id: string;
          amount: number;
          payment_date: string;
          payment_mode: PaymentMode;
          reference_id: string | null;
          receipt_image_url: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          invoice_id: string;
          customer_id: string;
          amount: number;
          payment_date?: string;
          payment_mode?: PaymentMode;
          reference_id?: string | null;
          receipt_image_url?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          invoice_id?: string;
          customer_id?: string;
          amount?: number;
          payment_date?: string;
          payment_mode?: PaymentMode;
          reference_id?: string | null;
          receipt_image_url?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      bills: {
        Row: {
          id: string;
          business_id: string;
          title: string;
          category: BillCategory;
          amount: number;
          due_date: string;
          is_recurring: boolean;
          recurring_frequency: string | null;
          recurring_day_of_month: number | null;
          recurring_end_date: string | null;
          status: BillStatus;
          paid_date: string | null;
          vendor_name: string | null;
          notes: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          title: string;
          category: BillCategory;
          amount: number;
          due_date: string;
          is_recurring?: boolean;
          recurring_frequency?: string | null;
          recurring_day_of_month?: number | null;
          recurring_end_date?: string | null;
          status?: BillStatus;
          paid_date?: string | null;
          vendor_name?: string | null;
          notes?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          title?: string;
          category?: BillCategory;
          amount?: number;
          due_date?: string;
          is_recurring?: boolean;
          recurring_frequency?: string | null;
          recurring_day_of_month?: number | null;
          recurring_end_date?: string | null;
          status?: BillStatus;
          paid_date?: string | null;
          vendor_name?: string | null;
          notes?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      payment_promises: {
        Row: {
          id: string;
          business_id: string;
          customer_id: string;
          invoice_id: string | null;
          raw_message: string;
          promised_amount: number;
          promised_date: string;
          status: PromiseStatus;
          confidence_score: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          customer_id: string;
          invoice_id?: string | null;
          raw_message: string;
          promised_amount: number;
          promised_date: string;
          status?: PromiseStatus;
          confidence_score?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          customer_id?: string;
          invoice_id?: string | null;
          raw_message?: string;
          promised_amount?: number;
          promised_date?: string;
          status?: PromiseStatus;
          confidence_score?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      follow_up_tasks: {
        Row: {
          id: string;
          business_id: string;
          customer_id: string;
          invoice_id: string | null;
          priority_score: number;
          priority_level: PriorityLevel;
          due_date: string;
          status: 'pending' | 'completed' | 'dismissed';
          last_reminder_tone: ReminderTone | null;
          last_reminder_text: string | null;
          last_contacted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          customer_id: string;
          invoice_id?: string | null;
          priority_score?: number;
          priority_level?: PriorityLevel;
          due_date?: string;
          status?: 'pending' | 'completed' | 'dismissed';
          last_reminder_tone?: ReminderTone | null;
          last_reminder_text?: string | null;
          last_contacted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          customer_id?: string;
          invoice_id?: string | null;
          priority_score?: number;
          priority_level?: PriorityLevel;
          due_date?: string;
          status?: 'pending' | 'completed' | 'dismissed';
          last_reminder_tone?: ReminderTone | null;
          last_reminder_text?: string | null;
          last_contacted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      cashflow_scenarios: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          description: string | null;
          parameters: Json;
          result_summary: Json | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          description?: string | null;
          parameters?: Json;
          result_summary?: Json | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          description?: string | null;
          parameters?: Json;
          result_summary?: Json | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      v_invoices_effective: {
        Row: {
          id: string;
          business_id: string;
          customer_id: string;
          invoice_number: string;
          issue_date: string;
          due_date: string;
          subtotal: number;
          discount: number;
          total_amount: number;
          amount_paid: number;
          balance_due: number;
          status: InvoiceStatus;
          effective_status: InvoiceStatus;
          overdue_days: number;
          ageing_bucket: AgeingBucket;
          notes: string | null;
          pdf_url: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
    };
    Functions: {
      is_business_owner: {
        Args: { b_id: string };
        Returns: boolean;
      };
      get_invoice_effective_status: {
        Args: {
          p_status: string;
          p_due_date: string;
          p_amount_paid: number;
          p_total_amount: number;
        };
        Returns: string;
      };
      record_invoice_payment: {
        Args: {
          p_invoice_id: string;
          p_amount: number;
          p_payment_mode?: string;
          p_payment_date?: string;
          p_reference_id?: string | null;
          p_notes?: string | null;
          p_receipt_image_url?: string | null;
        };
        Returns: Json;
      };
      transition_invoice_status: {
        Args: {
          p_invoice_id: string;
          p_new_status: string;
        };
        Returns: Json;
      };
    };
  };
}
