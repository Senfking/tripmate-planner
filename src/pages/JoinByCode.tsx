import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Hash, AlertCircle } from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
  not_found: "That code doesn't match any trip. Double-check and try again.",
  already_member: "You're already in this trip!",
  not_authenticated: "Please sign in to join.",
};

export default function JoinByCode() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { code: urlCode } = useParams<{ code?: string }>();
  const [code, setCode] = useState(urlCode?.toUpperCase() || "");
  const attempted = useRef(false);

  const join = useMutation({
    mutationFn: async (joinCode: string) => {
      const { data, error } = await (supabase as any).rpc("join_by_code", {
        _code: joinCode,
      });
      if (error) throw error;
      return data as { success?: boolean; error?: string; trip_id?: string; trip_name?: string };
    },
    onSuccess: (result) => {
      sessionStorage.removeItem("join_code");
      if (result.success) {
        toast.success(`You've joined ${result.trip_name}! 🎉`);
        navigate(`/app/trips/${result.trip_id}`, { replace: true });
      } else if (result.error === "already_member" && result.trip_id) {
        toast.info("You're already in this trip!");
        navigate(`/app/trips/${result.trip_id}`, { replace: true });
      }
    },
  });

  // Handle redirect back from auth with stored code
  useEffect(() => {
    if (authLoading) return;

    const codeToUse = sessionStorage.getItem("join_code") || urlCode?.toUpperCase();
    if (codeToUse && user && !attempted.current) {
      attempted.current = true;
      setCode(codeToUse);
      join.mutate(codeToUse);
    }
  }, [user, authLoading, urlCode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    if (!user) {
      sessionStorage.setItem("join_code", trimmed);
      sessionStorage.setItem("invite_token", "__code__");
      navigate(`/signup?redirect=/join/${trimmed}`, { replace: true });
      return;
    }

    join.mutate(trimmed);
  };

  const errorKey = join.data?.error;
  const errorMsg = errorKey
    ? ERROR_MESSAGES[errorKey] || "Something went wrong. Please try again."
    : join.isError
    ? "Something went wrong. Please try again."
    : null;

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-primary text-white">
            <Hash className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Join a trip</CardTitle>
          <CardDescription>Enter the 6-character trip code to join.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {errorMsg && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{errorMsg}</p>
              </div>
            )}
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="TK4R9X"
              className="text-center text-2xl font-mono tracking-[0.3em] h-14"
              maxLength={6}
              autoFocus
            />
            <Button
              type="submit"
              className="w-full"
              disabled={code.trim().length < 6 || join.isPending}
            >
              {join.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {user ? "Join trip" : "Continue"}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
