import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ThumbsUp, Plus, Sparkles, ChevronRight } from "lucide-react";
import { useTripIdeas, type TripIdea } from "@/hooks/useTripIdeas";
import { AddIdeaDialog } from "./AddIdeaDialog";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface Props {
  tripId: string;
}

const initials = (name: string | null | undefined) =>
  (name ?? "?").trim().slice(0, 1).toUpperCase();

const firstName = (name: string | null | undefined) => (name ?? "Member").split(/\s+/)[0];

function IdeaCard({
  idea,
  onVote,
  onClick,
}: {
  idea: TripIdea;
  onVote: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group snap-start shrink-0 w-[160px] md:w-[200px] rounded-2xl border border-border bg-card p-3 text-left shadow-sm hover:shadow-md transition-all"
    >
      <p className="text-[13px] font-semibold text-foreground line-clamp-3 min-h-[3.6em] leading-tight">
        {idea.title}
      </p>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          {idea.author?.avatar_url ? (
            <img
              src={idea.author.avatar_url}
              alt=""
              className="h-5 w-5 rounded-full object-cover"
            />
          ) : (
            <div className="h-5 w-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold">
              {initials(idea.author?.display_name)}
            </div>
          )}
          <span className="text-[11px] text-muted-foreground truncate">
            {firstName(idea.author?.display_name)}
          </span>
        </div>
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            onVote();
          }}
          className={cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors",
            idea.hasVoted
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/70",
          )}
        >
          <ThumbsUp className="h-3 w-3" />
          {idea.voteCount}
        </span>
      </div>
    </button>
  );
}

export function TripIdeasStrip({ tripId }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: ideas = [], isLoading, addIdea, toggleVote } = useTripIdeas(tripId);
  const [addOpen, setAddOpen] = useState(false);

  if (!user) return null;

  const visible = ideas.slice(0, 3);
  const hasMore = ideas.length > 3;

  const handleAdd = async (title: string, category: string | null) => {
    await addIdea.mutateAsync({ title, category });
  };

  const goToTab = () => navigate(`/app/trips/${tripId}/ideas`);

  return (
    <section className="mb-2">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-[#0D9488]" />
          <h3 className="text-[13px] font-semibold text-foreground">Ideas from your group</h3>
          {ideas.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {hasMore ? `${visible.length} of ${ideas.length}` : `${ideas.length}`}
            </span>
          )}
        </div>
        {ideas.length > 0 && (
          <button
            type="button"
            onClick={goToTab}
            className="flex items-center gap-0.5 text-[11px] font-semibold text-[#0D9488] hover:underline"
          >
            See all <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="shrink-0 w-[160px] md:w-[200px] h-[112px] rounded-2xl skeleton-shimmer"
            />
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="w-full rounded-2xl border border-dashed border-[#0D9488]/40 bg-[#0D9488]/5 px-4 py-5 text-left flex items-center gap-3 hover:bg-[#0D9488]/10 transition-colors"
        >
          <div className="h-9 w-9 rounded-xl bg-[#0D9488]/15 flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-[#0D9488]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-foreground">Start the conversation</p>
            <p className="text-[11px] text-muted-foreground">
              Share your first idea for this trip
            </p>
          </div>
          <Plus className="h-4 w-4 text-[#0D9488] shrink-0" />
        </button>
      ) : (
        <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 pb-1">
          {visible.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              onVote={() => toggleVote.mutate({ ideaId: idea.id, hasVoted: idea.hasVoted })}
              onClick={goToTab}
            />
          ))}
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="snap-start shrink-0 w-[120px] md:w-[140px] rounded-2xl border border-dashed border-[#0D9488]/40 bg-[#0D9488]/5 flex flex-col items-center justify-center gap-1.5 text-[#0D9488] hover:bg-[#0D9488]/10 transition-colors"
          >
            <div className="h-7 w-7 rounded-full bg-[#0D9488]/15 flex items-center justify-center">
              <Plus className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-semibold">Suggest something</span>
          </button>
        </div>
      )}

      <AddIdeaDialog open={addOpen} onOpenChange={setAddOpen} onSubmit={handleAdd} />
    </section>
  );
}
