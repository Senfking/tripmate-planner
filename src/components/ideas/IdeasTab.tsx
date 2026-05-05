import { useState } from "react";
import { ThumbsUp, Plus, Sparkles, Trash2 } from "lucide-react";
import { useTripIdeas, type TripIdea } from "@/hooks/useTripIdeas";
import { AddIdeaDialog } from "./AddIdeaDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface Props {
  tripId: string;
  myRole?: string;
}

const initials = (name: string | null | undefined) =>
  (name ?? "?").trim().slice(0, 1).toUpperCase();

function IdeaRow({
  idea,
  canDelete,
  onVote,
  onDelete,
}: {
  idea: TripIdea;
  canDelete: boolean;
  onVote: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {idea.author?.avatar_url ? (
          <img
            src={idea.author.avatar_url}
            alt=""
            className="h-9 w-9 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold shrink-0">
            {initials(idea.author?.display_name)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-foreground leading-snug break-words">
            {idea.title}
          </p>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{idea.author?.display_name ?? "Member"}</span>
            <span>·</span>
            <span>{formatDistanceToNow(new Date(idea.created_at), { addSuffix: true })}</span>
            {idea.category && (
              <>
                <span>·</span>
                <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{idea.category}</span>
              </>
            )}
          </div>
        </div>
        {canDelete && (
          <button
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive transition-colors p-1"
            aria-label="Delete idea"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          onClick={onVote}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
            idea.hasVoted
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground hover:bg-muted/70",
          )}
        >
          <ThumbsUp className="h-3.5 w-3.5" />
          {idea.voteCount} {idea.voteCount === 1 ? "vote" : "votes"}
        </button>
      </div>
    </div>
  );
}

export function IdeasTab({ tripId, myRole }: Props) {
  const { user } = useAuth();
  const { data: ideas = [], isLoading, addIdea, toggleVote, deleteIdea } = useTripIdeas(tripId);
  const [addOpen, setAddOpen] = useState(false);

  const isAdmin = myRole === "owner" || myRole === "admin";

  const handleAdd = async (title: string, category: string | null) => {
    await addIdea.mutateAsync({ title, category });
  };

  const sorted = [...ideas].sort((a, b) => {
    if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Ideas</h2>
          <p className="text-xs text-muted-foreground">
            {ideas.length === 0
              ? "Suggestions from your group"
              : `${ideas.length} idea${ideas.length === 1 ? "" : "s"} so far`}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add idea
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[110px] rounded-2xl skeleton-shimmer" />
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <div className="flex flex-col items-center text-center pt-12 pb-6 px-4">
          <div className="h-14 w-14 rounded-2xl bg-[#0D9488]/10 flex items-center justify-center mb-4">
            <Sparkles className="h-7 w-7 text-[#0D9488]" />
          </div>
          <h3 className="text-base font-bold text-foreground">No ideas yet</h3>
          <p className="mt-2 max-w-[280px] text-sm text-muted-foreground leading-relaxed">
            Be the first to propose an idea for this trip — a place, an activity, anything.
          </p>
          <Button onClick={() => setAddOpen(true)} className="mt-5 gap-1.5">
            <Plus className="h-4 w-4" /> Suggest something
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((idea) => (
            <IdeaRow
              key={idea.id}
              idea={idea}
              canDelete={isAdmin || idea.created_by === user?.id}
              onVote={() => toggleVote.mutate({ ideaId: idea.id, hasVoted: idea.hasVoted })}
              onDelete={() => deleteIdea.mutate(idea.id)}
            />
          ))}
        </div>
      )}

      <AddIdeaDialog open={addOpen} onOpenChange={setAddOpen} onSubmit={handleAdd} />
    </div>
  );
}
