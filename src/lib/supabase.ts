import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Profile = {
  id: string;
  cpm_tier: 'conservative' | 'standard' | 'premium' | 'specialized' | 'custom';
  cpm_custom: number | null;
  youtube_avg_views: number;
  tiktok_avg_views: number;
  instagram_avg_views: number;
  youtube_shorts_avg_views: number;
  include_youtube_longform: boolean;
  revision_rounds_included: number;
  extra_revision_fee: number;
  payment_terms: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
};

export type Deal = {
  id: string;
  user_id: string;
  brand: string;
  contact_name: string;
  contact_email: string;
  product: string;
  category: string;
  source: string;
  objective: 'Awareness' | 'Repurposing' | 'Conversion' | '';
  outcome_wanted: string;
  requested_deliverables: string;
  recommended_package: 'Starter' | 'Core' | 'Premium' | 'Platinum' | 'Custom' | '';
  paid_usage: boolean;
  paid_usage_duration: number;
  whitelisting: boolean;
  whitelisting_duration: number;
  exclusivity: boolean;
  exclusivity_category: string;
  exclusivity_months: number;
  brief_date: string | null;
  draft_date: string | null;
  publish_date: string | null;
  rush_level: 'None' | 'Standard' | 'Extreme';
  budget_shared: boolean;
  budget_range: string;
  red_flags: string;
  quote_low: number;
  quote_standard: number;
  quote_stretch: number;
  final_amount: number;
  stage: 'Intake' | 'Quoted' | 'Negotiating' | 'Contracted' | 'In Production' | 'Delivered' | 'Closed';
  payment_status: 'Not Started' | 'Deposit Paid' | 'Fully Paid' | 'Overdue';
  next_followup: string | null;
  follow_up_count: number;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type DealReport = {
  id: string;
  deal_id: string;
  user_id: string;
  deliverables_shipped: string;
  results_summary: string;
  best_comments: string;
  what_worked: string;
  what_to_improve: string;
  next_campaign_ideas: string;
  renewal_recommendation: string;
  created_at: string;
  updated_at: string;
};

export type DealTemplate = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  objective: 'Awareness' | 'Repurposing' | 'Conversion' | '';
  recommended_package: 'Starter' | 'Core' | 'Premium' | 'Platinum' | 'Custom' | '';
  paid_usage: boolean;
  paid_usage_duration: number;
  whitelisting: boolean;
  whitelisting_duration: number;
  exclusivity: boolean;
  exclusivity_category: string;
  exclusivity_months: number;
  rush_level: 'None' | 'Standard' | 'Extreme';
  short_form_youtube: number;
  short_form_tiktok: number;
  short_form_instagram: number;
  long_form_posts: number;
  long_form_factor: 'mention' | 'adSpot' | 'dedicated';
  created_at: string;
  updated_at: string;
};

export type CopySnippet = {
  id: string;
  user_id: string;
  category: string;
  label: string;
  text: string;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
};

export type DefaultSnippetFavorite = {
  id: string;
  user_id: string;
  snippet_key: string;
  created_at: string;
};
