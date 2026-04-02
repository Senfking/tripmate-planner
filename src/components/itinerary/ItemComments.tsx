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
      <CollapsibleTrigger asChild>
        <button className="inline-flex h-6 w-6 items-center justify-center gap-0.5 rounded text-muted-foreground/30 transition-colors hover:text-foreground/70">
          <MessageCircle className="h-2.5 w-2.5" />
          {comments.length > 0 && (
            <span className="text-[9px] font-medium">{comments.length}</span>
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1.5 w-full max-w-full space-y-1.5 overflow-hidden border-t border-border/30 pt-1.5">
        {comments.length === 0 && (
          <p className="text-[10px] text-muted-foreground/50">No comments yet.</p>
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
        <div className="flex w-full max-w-full gap-1.5">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment…"
            rows={1}
            className="min-h-[28px] min-w-0 flex-1 resize-none py-1 px-2 text-[11px]"
          />
          <Button
            size="sm"
            onClick={handlePost}
            disabled={!body.trim() || postComment.isPending}
            className="h-[28px] shrink-0 self-end px-2.5 text-[10px]"
          >
            Post
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
