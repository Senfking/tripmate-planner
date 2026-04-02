import { useState } from "react";
import { useItemComments } from "@/hooks/useItemComments";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Props {
  tripId: string;
  itemId: string;
  newCommentIds?: Set<string>;
}

export function ItemComments({ tripId, itemId, newCommentIds }: Props) {
  const { user } = useAuth();
  const { comments, postComment, deleteComment } = useItemComments(tripId, itemId);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");

  const handlePost = () => {
    if (!body.trim()) return;
    postComment.mutate(body.trim(), { onSuccess: () => setBody("") });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/60 px-2.5 py-2">
        <CollapsibleTrigger asChild>
          <button className="inline-flex min-w-0 items-center gap-2 text-left text-muted-foreground/75 transition-colors hover:text-foreground/80">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background shadow-sm">
              <MessageCircle className="h-3 w-3" />
            </span>
            <span className="truncate text-[11px] font-medium">
              {comments.length > 0 ? `${comments.length} comment${comments.length === 1 ? "" : "s"}` : "Comments"}
            </span>
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="mt-2 w-full max-w-full space-y-2 overflow-hidden border-t border-border/40 pt-2">
        {comments.length === 0 && (
          <p className="text-[11px] text-muted-foreground/60">No comments yet.</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className={`w-full overflow-hidden ${newCommentIds?.has(c.id) ? "animate-realtime-flash" : ""}`}>
            <div className="flex items-center justify-between gap-1">
              <span className="font-medium text-[11px] text-foreground/80 truncate">{c.display_name || "Member"}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] text-muted-foreground/50">
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
            <p className="text-muted-foreground text-[11px] break-words whitespace-pre-wrap leading-relaxed">{c.body}</p>
          </div>
        ))}
        <div className="flex w-full max-w-full gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment…"
            rows={1}
            className="min-h-[42px] flex-1 resize-none rounded-xl border-border/60 bg-background/80 px-3 py-2 text-[12px]"
          />
          <Button
            size="sm"
            onClick={handlePost}
            disabled={!body.trim() || postComment.isPending}
            className="h-[42px] shrink-0 self-end rounded-xl px-3 text-xs"
          >
            Post
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
