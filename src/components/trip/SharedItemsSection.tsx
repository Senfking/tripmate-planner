import { useState } from "react";
import { useSharedItems } from "@/hooks/useSharedItems";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChevronDown, Plus, Trash2, Hand } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const MAX_ITEMS = 15;

export function SharedItemsSection({ tripId }: { tripId: string }) {
  const { user } = useAuth();
  const { items, isLoading, addItem, claimItem, unclaimItem, deleteItem } = useSharedItems(tripId);
  const [open, setOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  // Fetch profiles for claimed_by users
  const claimerIds = [...new Set(items.filter((i) => i.claimed_by).map((i) => i.claimed_by!))];
  const { data: profiles } = useQuery({
    queryKey: ["shared-items-profiles", ...claimerIds],
    queryFn: async () => {
      if (!claimerIds.length) return [];
      const { data } = await supabase.rpc("get_public_profiles", { _user_ids: claimerIds });
      return data ?? [];
    },
    enabled: claimerIds.length > 0,
  });

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const handleAdd = () => {
    const title = newTitle.trim();
    if (!title) return;
    if (items.length >= MAX_ITEMS) {
      toast.error(`Maximum ${MAX_ITEMS} shared items per trip`);
      return;
    }
    addItem.mutate(title);
    setNewTitle("");
  };

  if (isLoading) return null;

  return (
    <div className="px-4 md:max-w-[900px] md:mx-auto md:px-8">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          <span className="flex items-center gap-2">
            🎒 Who's bringing what?
            {items.length > 0 && (
              <span className="text-xs bg-muted rounded-full px-2 py-0.5">{items.length}</span>
            )}
          </span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-2 pb-4">
          {/* Item list */}
          {items.map((item) => {
            const claimer = item.claimed_by ? profileMap.get(item.claimed_by) : null;
            const isMine = item.claimed_by === user?.id;
            const isCreator = item.created_by === user?.id;

            return (
              <div key={item.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <span className="flex-1 truncate">{item.title}</span>

                {claimer ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={claimer.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[10px]">
                        {(claimer.display_name ?? "?")[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground max-w-[80px] truncate">
                      {isMine ? "You" : claimer.display_name ?? "Someone"}
                    </span>
                    {isMine && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() => unclaimItem.mutate(item.id)}
                      >
                        ✕
                      </Button>
                    )}
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 shrink-0"
                    onClick={() => claimItem.mutate(item.id)}
                  >
                    <Hand className="h-3 w-3" /> I'll bring it
                  </Button>
                )}

                {isCreator && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => deleteItem.mutate(item.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })}

          {/* Add item */}
          {items.length < MAX_ITEMS && (
            <form
              className="flex gap-2"
              onSubmit={(e) => { e.preventDefault(); handleAdd(); }}
            >
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Speaker, first aid kit…"
                className="h-8 text-sm"
                maxLength={60}
              />
              <Button type="submit" size="sm" className="h-8 gap-1 shrink-0" disabled={!newTitle.trim() || addItem.isPending}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </form>
          )}

          {items.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Add shared group items like a speaker, adapter, or snorkeling gear.
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
