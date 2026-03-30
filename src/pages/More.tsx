import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, User, Hash, Mail } from "lucide-react";

const More = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-[calc(100vh-10rem)] bg-[#F1F5F9] px-4 pb-32 pt-6">
      <div className="flex flex-col items-center gap-4 pt-12 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#0D9488]/10">
          <User className="h-10 w-10 text-[#0D9488]" />
        </div>
        {profile?.display_name && (
          <h1 className="text-2xl font-bold text-foreground">{profile.display_name}</h1>
        )}
        {user?.email && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />
            {user.email}
          </p>
        )}

        <div className="flex flex-col gap-3 w-full max-w-xs mt-4">
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
    </div>
  );
};

export default More;
