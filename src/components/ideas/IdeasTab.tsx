import { useMemo, useState } from "react";
import { ThumbsUp, Plus, Sparkles, Trash2, ArrowUpDown } from "lucide-react";
import { useTripIdeas, type TripIdea } from "@/hooks/useTripIdeas";
import { AddIdeaDialog } from "./AddIdeaDialog";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface Props {
  tripId: string;
  myRole?: string;
}

type SortMode = "votes" | "recent";

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
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {idea.author?.avatar_url ? (
          <img
            src={idea.author.avatar_url}
            alt=""
            className="h-9 w-9 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="h-9 w-9 rounded-full bg-[#0D9488]/15 text-[#0D9488] flex items-center justify-center text-sm font-bold shrink-0">
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
          aria-pressed={idea.hasVoted}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
            idea.hasVoted
              ? "bg-[#0D9488] text-white"
              : "bg-muted text-foreground hover:bg-muted/70",
          )}
        >
          <ThumbsUp className="h-3.5 w-3.5" />
          <span className="font-mono tabular-nums">{idea.voteCount}</span>
          <span className="hidden sm:inline">{idea.voteCount === 1 ? "vote" : "votes"}</span>
        </button>
      </div>
    </div>
  );
}

export function IdeasTab({ tripId, myRole }: Props) {
  const { user } = useAuth();
  const { data: ideas = [], isLoading, isError, refetch, addIdea, toggleVote, deleteIdea } =
    useTripIdeas(tripId);
  const [addOpen, setAddOpen] = useState(false);
  const [sort, setSort] = useState<SortMode>("votes");
  const [pendingDelete, setPendingDelete] = useState<TripIdea | null>(null);

  const isAdmin = myRole === "owner" || myRole === "admin";

  const handleAdd = async (title: string, category: string | null) => {
    try {
      await addIdea.mutateAsync({ title, category });
      toast.success("Idea added");
    } catch (e) {
      toast.error("Couldn't add idea", {
        description: "Please try again.",
        action: { label: "Retry", onClick: () => handleAdd(title, category) },
      });
      throw e;
    }
  };

  const handleVote = (idea: TripIdea) => {
    toggleVote.mutate(
      { ideaId: idea.id, hasVoted: idea.hasVoted },
      {
        onError: () =>
          toast.error("Vote didn't save", {
            action: { label: "Retry", onClick: () => handleVote(idea) },
          }),
      },
    );
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    deleteIdea.mutate(id, {
      onSuccess: () => toast.success("Idea deleted"),
      onError: () => toast.error("Couldn't delete idea"),
    });
  };

  const sorted = useMemo(() => {
    const arr = [...ideas];
    if (sort === "votes") {
      arr.sort((a, b) => {
        if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    } else {
      arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return arr;
  }, [ideas, sort]);

  if (isError) {
    return (
      <div className="mx-auto max-w-[700px] flex flex-col items-center text-center pt-12 pb-6 px-4">
        <h3 className="text-base font-bold text-foreground">Couldn't load ideas</h3>
        <p className="mt-2 text-sm text-muted-foreground">Check your connection and try again.</p>
        <Button onClick={() => refetch()} className="mt-4">Retry</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[700px] space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-foreground">Ideas</h2>
          <p className="text-xs text-muted-foreground">
            {isLoading
              ? "Loading…"
              : ideas.length === 0
                ? "Suggestions from your group"
                : `${ideas.length} idea${ideas.length === 1 ? "" : "s"} so far`}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-1.5 bg-[#0D9488] hover:bg-[#0D9488]/90 text-white">
          <Plus className="h-4 w-4" /> Add idea
        </Button>
      </div>

      {!isLoading && ideas.length > 1 && (
        <div className="flex items-center gap-1 rounded-full bg-muted p-1 w-fit">
          <button
            onClick={() => setSort("votes")}
            className={cn(
              "flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
              sort === "votes" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            <ArrowUpDown className="h-3 w-3" /> Most votes
          </button>
          <button
            onClick={() => setSort("recent")}
            className={cn(
              "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
              sort === "recent" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            Most recent
          </button>
        </div>
      )}

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
          <Button
            onClick={() => setAddOpen(true)}
            className="mt-5 gap-1.5 bg-[#0D9488] hover:bg-[#0D9488]/90 text-white"
          >
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
              onVote={() => handleVote(idea)}
              onDelete={() => setPendingDelete(idea)}
            />
          ))}
        </div>
      )}

      <AddIdeaDialog open={addOpen} onOpenChange={setAddOpen} onSubmit={handleAdd} />

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this idea?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDelete?.title}" will be removed for everyone. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
