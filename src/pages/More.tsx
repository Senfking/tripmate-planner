import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, LogOut, User, Hash } from "lucide-react";

const More = () => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex flex-col items-center justify-center gap-6 p-8 pt-24 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
        <User className="h-10 w-10 text-primary" />
      </div>
      {profile?.display_name && (
        <h1 className="text-2xl font-bold text-foreground">{profile.display_name}</h1>
      )}
      <p className="max-w-sm text-muted-foreground">Settings, profile, and additional options.</p>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Button variant="outline" className="gap-2" asChild>
          <Link to="/join">
            <Hash className="h-4 w-4" />
            Join a trip
          </Link>
        </Button>

        <Button variant="outline" className="gap-2" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
};

export default More;
