import { supabase } from "@/integrations/supabase/client";

export async function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>,
  userId?: string
): Promise<void> {
  try {
    await supabase.from("analytics_events" as any).insert({
      event_name: eventName,
      properties: properties || {},
      user_id: userId || null,
    });
  } catch {
    // Silently swallow — tracking must never break the app
  }
}
