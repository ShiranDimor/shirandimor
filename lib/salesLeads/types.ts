export type SalesLead = {
  id: string;
  monday_item_id: string | null;
  name: string;
  first_name: string | null;
  phone_original: string | null;
  phone_normalized: string;
  lead_date: string;
  source_info: string | null;
  sales_status: string;
  stage: 'in_progress' | 'registered' | 'not_relevant';
  priority: 'normal' | 'hot' | 'very_hot';
  last_contact_at: string | null;
  next_followup_at: string | null;
  next_followup_note: string | null;
  call_attempts_count: number;
  last_call_outcome: string | null;
  last_note: string | null;
  created_at: string;
  updated_at: string;
};

export type SalesLeadActivity = {
  id: string;
  lead_id: string;
  activity_type: string;
  note: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export const SALES_LEADS_LIST_COLUMNS =
  'id, monday_item_id, name, first_name, phone_original, phone_normalized, lead_date, sales_status, stage, priority, last_contact_at, next_followup_at, next_followup_note, call_attempts_count, last_call_outcome, last_note, created_at, updated_at';
