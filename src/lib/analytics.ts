import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export async function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>,
  userId?: string
): Promise<void> {
  try {
    const { error } = await supabase.from("analytics_events").insert([{
      event_name: eventName,
      properties: (properties || {}) as Json,
      user_id: userId || null,
    }]);
    if (error) {
      console.warn("[analytics] trackEvent failed:", eventName, error.message);
    }
  } catch (e) {
    console.warn("[analytics] trackEvent exception:", eventName, e);
  }
}
