import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface InviteInfo {
  trip_name: string;
  trip_emoji: string;
  inviter_name: string;
}

export function useInviteInfo() {
  const token = sessionStorage.getItem("invite_token");
  const joinCode = sessionStorage.getItem("join_code");
  const [info, setInfo] = useState<InviteInfo | null>(null);

  const isInviteFlow = !!token || !!joinCode;

  useEffect(() => {
    if (!token && !joinCode) return;

    // If token is the code sentinel, fetch by code instead
    const body = token && token !== "__code__"
      ? { token }
      : joinCode
      ? { code: joinCode }
      : null;

    if (!body) return;

    supabase.functions
      .invoke("get-invite-info", { body })
      .then(({ data }) => {
        if (data && data.trip_name) {
          setInfo(data as InviteInfo);
        }
      })
      .catch(() => {
        // silently fail — just show generic invite message
      });
  }, [token, joinCode]);

  return { isInviteFlow, info, token };
}
