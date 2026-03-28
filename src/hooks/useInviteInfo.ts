import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface InviteInfo {
  trip_name: string;
  trip_emoji: string;
  inviter_name: string;
}

export function useInviteInfo() {
  const token = sessionStorage.getItem("invite_token");
  const [info, setInfo] = useState<InviteInfo | null>(null);

  useEffect(() => {
    if (!token) return;

    supabase.functions
      .invoke("get-invite-info", { body: { token } })
      .then(({ data }) => {
        if (data && data.trip_name) {
          setInfo(data as InviteInfo);
        }
      })
      .catch(() => {
        // silently fail — just show generic invite message
      });
  }, [token]);

  return { isInviteFlow: !!token, info, token };
}
