import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface Member {
  user_id: string;
  role: string;
  joined_at: string;
  profile?: {
    display_name: string | null;
    avatar_url?: string | null;
  };
}

interface MemberListSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
}

function getInitial(name: string | null | undefined) {
  return (name || "?").charAt(0).toUpperCase();
}

function roleBadgeVariant(role: string) {
  if (role === "owner") return "default";
  if (role === "admin") return "secondary";
  return "outline";
}

function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function MemberListSheet({ open, onOpenChange, members }: MemberListSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh] overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle>{members.length} Members</SheetTitle>
        </SheetHeader>
        <div className="space-y-3">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                {m.profile?.avatar_url && (
                  <AvatarImage src={m.profile.avatar_url} alt={m.profile?.display_name || ""} />
                )}
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                  {getInitial(m.profile?.display_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">
                    {m.profile?.display_name || "Unknown"}
                  </span>
                  <Badge variant={roleBadgeVariant(m.role)} className="text-[10px] px-1.5 py-0">
                    {roleLabel(m.role)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Joined {format(new Date(m.joined_at), "MMM d, yyyy")}
                </p>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
