import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type VibeAggregate = {
  question_key: string;
  answer_value: string;
  response_count: number;
};

export function useVibeBoard(tripId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const myResponses = useQuery({
    queryKey: ["vibe-my-responses", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vibe_responses")
        .select("id, question_key, answer_value")
        .eq("trip_id", tripId!)
        .eq("user_id", user!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!tripId && !!user,
  });

  const aggregates = useQuery({
    queryKey: ["vibe-aggregates", tripId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_vibe_aggregates", {
        _trip_id: tripId!,
      });
      if (error) throw error;
      return (data as VibeAggregate[]) || [];
    },
    enabled: !!tripId && !!user,
  });

  const respondentCount = useQuery({
    queryKey: ["vibe-respondent-count", tripId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_vibe_respondent_count", {
        _trip_id: tripId!,
      });
      if (error) throw error;
      return (data as number) || 0;
    },
    enabled: !!tripId && !!user,
  });

  const upsertAnswer = useMutation({
    mutationFn: async ({
      questionKey,
      answerValue,
    }: {
      questionKey: string;
      answerValue: string;
    }) => {
      if (questionKey !== "musthave") {
        // For non-musthave: delete existing then insert (upsert via partial unique index)
        const existing = myResponses.data?.find(
          (r) => r.question_key === questionKey
        );
        if (existing) {
          await supabase
            .from("vibe_responses")
            .delete()
            .eq("id", existing.id);
        }
        const { error } = await supabase.from("vibe_responses").insert({
          trip_id: tripId!,
          user_id: user!.id,
          question_key: questionKey,
          answer_value: answerValue,
        });
        if (error) throw error;
      } else {
        // musthave: toggle — if already selected remove it, otherwise add (max 2)
        const existing = myResponses.data?.find(
          (r) => r.question_key === "musthave" && r.answer_value === answerValue
        );
        if (existing) {
          const { error } = await supabase
            .from("vibe_responses")
            .delete()
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const currentMusthaves =
            myResponses.data?.filter((r) => r.question_key === "musthave") ||
            [];
          if (currentMusthaves.length >= 2) {
            // Remove oldest, add new
            await supabase
              .from("vibe_responses")
              .delete()
              .eq("id", currentMusthaves[0].id);
          }
          const { error } = await supabase.from("vibe_responses").insert({
            trip_id: tripId!,
            user_id: user!.id,
            question_key: "musthave",
            answer_value: answerValue,
          });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vibe-my-responses", tripId] });
      qc.invalidateQueries({ queryKey: ["vibe-aggregates", tripId] });
      qc.invalidateQueries({ queryKey: ["vibe-respondent-count", tripId] });
    },
  });

  const activateBoard = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("trips")
        .update({ vibe_board_active: true } as any)
        .eq("id", tripId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
    },
  });

  const lockBoard = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("trips")
        .update({ vibe_board_locked: true } as any)
        .eq("id", tripId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
    },
  });

  return {
    myResponses: myResponses.data || [],
    aggregates: aggregates.data || [],
    respondentCount: respondentCount.data || 0,
    isLoading:
      myResponses.isLoading ||
      aggregates.isLoading ||
      respondentCount.isLoading,
    upsertAnswer,
    activateBoard,
    lockBoard,
  };
}
