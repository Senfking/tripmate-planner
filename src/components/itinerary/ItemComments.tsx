import { useState } from "react";
import { useItemComments } from "@/hooks/useItemComments";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Props {
  tripId: string;
  itemId: string;
  newCommentIds?: Set<string>;
}

export function ItemComments({ tripId, itemId, newCommentIds }: Props) {
  const { user } = useAuth();
  const { comments, postComment, deleteComment } = useItemComments(tripId, itemId);
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState("");

  const handlePost = () => {
    if (!body.trim()) return;
    postComment.mutate(body.trim(), { onSuccess: () => setBody("") });
  };

  const count = comments.length;
  const latestComment = count > 0 ? comments[count - 1] : null;
  const showExpand = count > 1 && !expanded;
  const visibleComments = expanded ? comments : latestComment ? [latestComment] : [];

  return (
    <div className="space-y-2.5">
      {count === 0 && (
        <p className="text-[11px] text-muted-foreground/50 italic">No comments yet</p>
      )}

      {visibleComments.map((c) => (
        <div
          key={c.id}
          className={`rounded-lg bg-muted/30 px-3 py-2 ${newCommentIds?.has(c.id) ? "animate-realtime-flash" : ""}`}
        >
          <div className="flex items-baseline justify-between gap-2 mb-0.5">
            <span className="text-[11px] font-semibold text-foreground/80 truncate">
              {c.display_name || "Member"}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] text-muted-foreground/40">
                {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
              </span>
              {c.user_id === user?.id && (
                <button
                  onClick={() => deleteComment.mutate(c.id)}
                  className="text-muted-foreground/30 hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          </div>
          <p className="text-[12px] text-muted-foreground leading-relaxed break-words whitespace-pre-wrap">
            {c.body}
          </p>
        </div>
      ))}

      {showExpand && (
        <button
          onClick={() => setExpanded(true)}
          className="text-[11px] font-medium text-primary/70 hover:text-primary transition-colors"
        >
          View all {count} comments
        </button>
      )}

      {expanded && count > 1 && (
        <button
          onClick={() => setExpanded(false)}
          className="text-[11px] font-medium text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          Collapse
        </button>
      )}

      <div className="flex gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a comment…"
          rows={1}
          className="min-h-[32px] min-w-0 flex-1 resize-none rounded-lg border-border/50 bg-muted/20 px-2.5 py-1.5 text-[12px] placeholder:text-muted-foreground/40"
        />
        <Button
          size="sm"
          onClick={handlePost}
          disabled={!body.trim() || postComment.isPending}
          className="h-[32px] shrink-0 self-end rounded-lg px-3 text-[11px]"
        >
          Post
        </Button>
      </div>
    </div>
  );
}
