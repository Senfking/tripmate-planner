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
    queryKey: ["vibe-my-responses", tripId, user?.id],
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

  const submitAnswers = useMutation({
    mutationFn: async (
      answers: { questionKey: string; answerValue: string }[]
    ) => {
      // Delete all existing responses for this user+trip
      const { error: delError } = await supabase
        .from("vibe_responses")
        .delete()
        .eq("trip_id", tripId!)
        .eq("user_id", user!.id);
      if (delError) throw delError;

      // Insert all answers in one batch
      const rows = answers.map((a) => ({
        trip_id: tripId!,
        user_id: user!.id,
        question_key: a.questionKey,
        answer_value: a.answerValue,
      }));
      const { error: insError } = await supabase
        .from("vibe_responses")
        .insert(rows);
      if (insError) throw insError;
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
    submitAnswers,
    activateBoard,
    lockBoard,
  };
}
