import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { friendlyError } from "@/lib/friendlyError";
import { useInviteInfo } from "@/hooks/useInviteInfo";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Map, Loader2 } from "lucide-react";

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const { isInviteFlow, info } = useInviteInfo();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    const { error: err } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    setGoogleLoading(false);
    if (err) setError(friendlyError(String(err)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signIn(email, password);
    setLoading(false);
    if (err) {
      setError(friendlyError(err.message));
    } else {
      navigate(redirectTo || "/app/trips", { replace: true });
    }
  };

  const signupLink = redirectTo ? `/signup?redirect=${encodeURIComponent(redirectTo)}` : "/signup";

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          {isInviteFlow ? (
            <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-primary text-2xl">
              {info?.trip_emoji ?? "✈️"}
            </div>
          ) : (
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-primary text-white">
              <Map className="h-6 w-6" />
            </div>
          )}
          {isInviteFlow ? (
            <>
              <CardTitle className="text-2xl">You're invited!</CardTitle>
              <CardDescription className="space-y-1">
                {info ? (
                  <>
                    <span className="block font-medium text-foreground">
                      {info.inviter_name} invited you to {info.trip_name}
                    </span>
                    <span className="block">Sign in to join the trip.</span>
                  </>
                ) : (
                  <span>You've been invited to a trip on Junto. Sign in to join.</span>
                )}
              </CardDescription>
            </>
          ) : (
            <>
              <CardTitle className="text-2xl">Welcome back</CardTitle>
              <CardDescription>Sign in to Junto</CardDescription>
            </>
          )}
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isInviteFlow ? "Sign in & join" : "Sign in"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link to={signupLink} className="text-primary underline-offset-4 hover:underline">Sign up</Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
