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
        <button className="h-6 w-6 inline-flex items-center justify-center gap-0.5 rounded text-muted-foreground/30 hover:text-foreground/70 transition-colors">
          <MessageCircle className="h-3 w-3" />
          {comments.length > 0 && (
            <span className="text-[10px] font-medium">{comments.length}</span>
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 mt-2 border-t border-border/40 space-y-2 w-full overflow-hidden">
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
        <div className="flex gap-2 w-full">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment…"
            rows={1}
            className="text-[12px] min-w-0 flex-1 min-h-[32px] py-1.5 resize-none"
          />
          <Button
            size="sm"
            onClick={handlePost}
            disabled={!body.trim() || postComment.isPending}
            className="shrink-0 self-end h-[32px] text-xs px-3"
          >
            Post
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
