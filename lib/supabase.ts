export type EventType =
  | "biberon"
  | "couche"
  | "sieste"
  | "pleure"
  | "nuit"
  | "sieste_active";

export type BebebouEvent = {
  id: string;
  type: EventType;
  note: string | null;
  quantity: number | null;
  created_at: string;
  session_id?: string | null;
  user_id?: string | null;
  baby_id?: string | null;
};

export { supabase, createClient } from "./supabase/client";
