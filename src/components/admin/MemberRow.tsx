import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, ShieldCheck, ShieldMinus, UserMinus } from "lucide-react";
import { format } from "date-fns";

interface MemberRowProps {
  userId: string;
  displayName: string | null;
  role: string;
  joinedAt: string;
  attendanceStatus?: string;
  myRole: string | undefined;
  myUserId: string;
  onPromote: (userId: string) => void;
  onDemote: (userId: string) => void;
  onRemove: (userId: string) => void;
}

const roleBadge = (role: string) => {
  switch (role) {
    case "owner":
      return <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px] px-1.5 py-0">Owner</Badge>;
    case "admin":
      return <Badge className="bg-secondary/15 text-secondary-foreground border-secondary/30 text-[10px] px-1.5 py-0">Admin</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0">Member</Badge>;
  }
};

const attendanceBadge = (status: string | undefined) => {
  switch (status) {
    case "going":
      return <Badge className="bg-[#0D9488]/10 text-[#0D9488] border-[#0D9488]/30 text-[10px] px-1.5 py-0">Going</Badge>;
    case "maybe":
      return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px] px-1.5 py-0">Maybe</Badge>;
    case "not_going":
      return <Badge variant="outline" className="text-muted-foreground text-[10px] px-1.5 py-0">Can't make it</Badge>;
    case "pending":
      return <Badge variant="outline" className="text-muted-foreground text-[10px] px-1.5 py-0">Pending</Badge>;
    default:
      return null;
  }
};

function getInitials(name: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function MemberRow({
  userId,
  displayName,
  role,
  joinedAt,
  attendanceStatus,
  myRole,
  myUserId,
  onPromote,
  onDemote,
  onRemove,
}: MemberRowProps) {
  const isMe = userId === myUserId;
  const iAmOwner = myRole === "owner";
  const iAmAdmin = myRole === "admin";

  const canPromote = iAmOwner && role === "member";
  const canDemote = iAmOwner && role === "admin";
  const canRemove =
    (iAmOwner && role !== "owner") ||
    (iAmAdmin && role === "member");
  const showMenu = !isMe && (canPromote || canDemote || canRemove);

  return (
    <div className="flex items-center gap-3 py-2">
      <Avatar className="h-8 w-8 text-xs">
        <AvatarFallback className="bg-muted text-muted-foreground text-xs">
          {getInitials(displayName)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">
            {displayName || "Unknown"}{isMe && " (you)"}
          </span>
          {roleBadge(role)}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Joined {format(new Date(joinedAt), "MMM d, yyyy")}
        </p>
      </div>
      {showMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {canPromote && (
              <DropdownMenuItem onClick={() => onPromote(userId)}>
                <ShieldCheck className="h-3.5 w-3.5 mr-2" />
                Promote to Admin
              </DropdownMenuItem>
            )}
            {canDemote && (
              <DropdownMenuItem onClick={() => onDemote(userId)}>
                <ShieldMinus className="h-3.5 w-3.5 mr-2" />
                Demote to Member
              </DropdownMenuItem>
            )}
            {canRemove && (
              <DropdownMenuItem
                onClick={() => onRemove(userId)}
                className="text-destructive focus:text-destructive"
              >
                <UserMinus className="h-3.5 w-3.5 mr-2" />
                Remove
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
