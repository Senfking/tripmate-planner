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
        <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors pt-2">
          <MessageCircle className="h-3.5 w-3.5" />
          <span>{comments.length}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3 space-y-3 w-full overflow-hidden">
        {comments.length === 0 && (
          <p className="text-xs text-muted-foreground">No comments yet.</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className={`text-sm space-y-0.5 w-full overflow-hidden ${newCommentIds?.has(c.id) ? "animate-realtime-flash" : ""}`}>
            <div className="flex items-center justify-between gap-1">
              <span className="font-medium text-xs truncate">{c.display_name || "Member"}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                </span>
                {c.user_id === user?.id && (
                  <button
                    onClick={() => deleteComment.mutate(c.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-muted-foreground text-xs break-words whitespace-pre-wrap">{c.body}</p>
          </div>
        ))}
        <div className="flex gap-2 w-full">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment…"
            rows={2}
            className="text-sm min-w-0 flex-1"
          />
          <Button
            size="sm"
            onClick={handlePost}
            disabled={!body.trim() || postComment.isPending}
            className="shrink-0 self-end"
          >
            Post
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
