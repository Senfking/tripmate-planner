import { supabase } from "@/integrations/supabase/client";

export async function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>,
  userId?: string
): Promise<void> {
  try {
    const { error } = await supabase.from("analytics_events").insert({
      event_name: eventName,
      properties: properties || {},
      user_id: userId || null,
    });
    if (error) {
      console.warn("[analytics] trackEvent failed:", eventName, error.message);
    }
  } catch (e) {
    console.warn("[analytics] trackEvent exception:", eventName, e);
  }
}
