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

  const count = comments.length;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-muted-foreground/60 hover:text-foreground/70 hover:bg-muted/40 transition-colors">
          <MessageCircle className="h-3 w-3" />
          {count > 0 && <span className="font-medium">{count}</span>}
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="col-span-full mt-2 space-y-2 border-t border-border/30 pt-2 px-3 pb-2 w-full overflow-hidden">
        {count === 0 && (
          <p className="text-[11px] text-muted-foreground/50">No comments yet.</p>
        )}

        {comments.map((c) => (
          <div key={c.id} className={`${newCommentIds?.has(c.id) ? "animate-realtime-flash" : ""}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] font-medium text-foreground/80 truncate">{c.display_name || "Member"}</span>
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
            <p className="text-[12px] text-muted-foreground leading-relaxed break-words whitespace-pre-wrap">{c.body}</p>
          </div>
        ))}

        <div className="flex gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a comment…"
            rows={1}
            className="min-h-[32px] min-w-0 flex-1 resize-none rounded-lg border-border/50 bg-muted/30 px-2.5 py-1.5 text-[12px] placeholder:text-muted-foreground/40"
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
      </CollapsibleContent>
    </Collapsible>
  );
}
