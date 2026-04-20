import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo, type ReactNode } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics";
import { ensureFreshSession } from "@/lib/sessionRefresh";

type NotificationPreferences = {
  new_activity: boolean;
  new_expense: boolean;
  new_member: boolean;
  route_confirmed: boolean;
  decisions_reminder: boolean;
};

type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  default_currency: string | null;
  subscription_tier: string;
  notification_preferences: NotificationPreferences;
  referral_code: string | null;
};

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ data: any; error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const PROFILE_SELECT = "id, display_name, avatar_url, default_currency, subscription_tier, notification_preferences, referral_code";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // [junto-diag] — remove when tab-switch race is diagnosed.
  const prevUserIdRef = useRef<string | null>(null);
  const prevAccessTokenTailRef = useRef<string | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("id", userId)
      .single();
    if (data) {
      setProfile({
        ...data,
        notification_preferences: (data.notification_preferences as unknown as NotificationPreferences) ?? {
          new_activity: true,
          new_expense: true,
          new_member: true,
          route_confirmed: true,
          decisions_reminder: true,
        },
      });
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const currentUser = user;
    if (currentUser) {
      await fetchProfile(currentUser.id);
    }
  }, [user, fetchProfile]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        const newUserId = newSession?.user?.id ?? null;
        const ts = new Date().toISOString().slice(11, 23);
        // eslint-disable-next-line no-console
        console.log(`[junto-mount ${ts}] AuthContext onAuthStateChange`, { event, newUserId, visible: document.visibilityState });

        // [junto-diag] — remove when tab-switch race is diagnosed.
        const newTokenTail = newSession?.access_token?.slice(-8) ?? null;
        const expiresInSec = newSession?.expires_at
          ? newSession.expires_at - Math.floor(Date.now() / 1000)
          : null;
        const isSpuriousSignIn =
          event === "SIGNED_IN" && !!newUserId && prevUserIdRef.current === newUserId;
        // eslint-disable-next-line no-console
        console.log(`[junto-diag ${ts}] authEvent`, {
          event,
          newUserId,
          prevUserId: prevUserIdRef.current,
          isSpuriousSignIn,
          tokenChanged: newTokenTail !== prevAccessTokenTailRef.current,
          newTokenTail,
          prevTokenTail: prevAccessTokenTailRef.current,
          expiresInSec,
          visible: document.visibilityState,
          willInvalidateQueries: event === "SIGNED_IN",
        });
        prevUserIdRef.current = newUserId;
        prevAccessTokenTailRef.current = newTokenTail;

        // Preserve the user reference when identity hasn't changed.
        // TOKEN_REFRESHED (fires on tab focus / near-expiry) hands us a NEW
        // User object with the same id — replacing it churns every useAuth()
        // consumer and cascades through ProtectedRoute → AppLayout → Outlet,
        // which unmounts the active route component (e.g. ExpensesTab).
        setUser((prev) => {
          if (newUserId && prev?.id === newUserId) return prev;
          return newSession?.user ?? null;
        });
        setSession((prev) => {
          if (newUserId && prev?.user?.id === newUserId && newSession) {
            // Same identity — keep prior reference to avoid cascading memo
            // invalidations. The access_token inside Supabase's internal state
            // is already updated; consumers that need the fresh token read it
            // via supabase.auth.getSession() or the client's own calls.
            return prev;
          }
          return newSession;
        });

        if (newSession?.user) {
          // Skip profile refetch on TOKEN_REFRESHED for the same user — the
          // profile can't have changed just because the JWT rotated, and the
          // redundant fetch adds another render cycle on every tab focus.
          if (event !== "TOKEN_REFRESHED") {
            setTimeout(() => fetchProfile(newSession.user.id), 0);
          }
        } else {
          setProfile(null);
        }
        setLoading(false);

        // Only flush caches on fresh sign-in, when queries may have been
        // populated without auth. TOKEN_REFRESHED means auth was already
        // valid — blanket invalidation here triggers a storm of refetches
        // on every tab focus and contributes to the unmount race above.
        if (event === "SIGNED_IN") {
          queryClient.invalidateQueries();
        }
      }
    );

    // On initial load, refresh the session if the cached JWT is close to
    // expiring. Reading a stale session from storage and firing queries with
    // an expired token is what causes the expenses page to render empty on
    // first load — a subsequent tab switch re-fetches with a fresh token and
    // everything appears.
    ensureFreshSession()
      .then(() => supabase.auth.getSession())
      .then(({ data: { session: existing } }) => {
        setSession(existing);
        setUser(existing?.user ?? null);
        if (existing?.user) {
          fetchProfile(existing.user.id);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data?.user) {
      trackEvent("user_login", { method: "email" }, data.user.id);
    }
    return { error: error as Error | null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (!error && data?.user) {
      trackEvent("user_signup", { method: "email" }, data.user.id);
    }
    return { data, error: error as Error | null };
  }, []);

  const signOut = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    await supabase.auth.signOut();
    if (userId) trackEvent("user_logout", {}, userId);
    setUser(null);
    setSession(null);
    setProfile(null);
  }, []);

  const value = useMemo(() => ({
    user, session, profile, loading, signIn, signUp, signOut, refreshProfile,
  }), [user, session, profile, loading, signIn, signUp, signOut, refreshProfile]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
