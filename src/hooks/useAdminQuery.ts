import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

async function adminQuery(type: string, params: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("admin-query", {
    body: { type, ...params },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export function useAdminData(type: string, params: Record<string, unknown> = {}, opts?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: ["admin", type, params],
    queryFn: () => adminQuery(type, params),
    staleTime: 1000 * 60 * 2,
    refetchInterval: opts?.refetchInterval,
  });
}

export function useAdminMutation(type: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: Record<string, unknown>) => adminQuery(type, params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
  });
}
