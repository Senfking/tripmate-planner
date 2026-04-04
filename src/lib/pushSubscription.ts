import { supabase } from "@/integrations/supabase/client";

/**
 * Convert a base64 string to a Uint8Array (for applicationServerKey).
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * Subscribe the current user to web push notifications.
 *
 * 1. Gets the active service worker registration
 * 2. Calls pushManager.subscribe() with the VAPID public key
 * 3. Upserts the subscription into push_subscriptions (skips duplicates)
 *
 * Returns the PushSubscription on success, or null on failure.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  try {
    const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      console.warn("[push] VITE_VAPID_PUBLIC_KEY not set");
      return null;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.warn("[push] Push notifications not supported");
      return null;
    }

    const registration = await navigator.serviceWorker.ready;

    // Check for existing subscription first
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
      });
    }

    // Persist to database
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.warn("[push] No authenticated user, skipping persistence");
      return subscription;
    }

    const subJson = subscription.toJSON();
    const endpoint = subJson.endpoint!;
    const keys = subJson.keys as { p256dh: string; auth: string };

    // Check for existing row with same endpoint to avoid duplicates
    const { data: existing } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .eq("endpoint", endpoint)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from("push_subscriptions").insert({
        user_id: user.id,
        endpoint,
        keys,
        device_name: navigator.userAgent.slice(0, 100),
      });

      if (error) {
        console.error("[push] Failed to save subscription:", error.message);
      }
    }

    return subscription;
  } catch (err) {
    console.error("[push] subscribeToPush failed:", err);
    return null;
  }
}
