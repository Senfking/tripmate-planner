import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

function HeaderAvatar() {
  const { profile, user } = useAuth();

  const initials = (() => {
    if (profile?.display_name) return profile.display_name.charAt(0).toUpperCase();
    if (user?.email) return user.email.charAt(0).toUpperCase();
    return "?";
  })();

  return (
    <Link
      to="/app/more"
      className="absolute z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 ring-2 ring-white/30 overflow-hidden"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 16px)", right: 20 }}
    >
      {profile?.avatar_url ? (
        <img src={profile.avatar_url} alt="Profile" className="h-full w-full object-cover" />
      ) : (
        <span className="text-white text-sm font-semibold">{initials}</span>
      )}
    </Link>
  );
}

interface TabHeroHeaderProps {
  title: string;
  subtitle: string;
  children?: ReactNode;
}

export function TabHeroHeader({ title, subtitle, children }: TabHeroHeaderProps) {
  return (
    <div className="relative w-full overflow-hidden" style={{ minHeight: 160 }}>
      {/* Teal gradient base */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(135deg, #0D9488 0%, #0369a1 100%)",
        }}
      />
      {/* Glass shine overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.0) 50%, rgba(255,255,255,0.06) 100%)",
        }}
      />

      {/* Avatar */}
      <HeaderAvatar />

      {/* Content */}
      <div
        className="relative z-10 flex flex-col justify-end h-full"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)",
          paddingLeft: 20,
          paddingRight: 20,
          paddingBottom: 20,
          minHeight: 160,
        }}
      >
        <span className="text-[11px] font-semibold tracking-widest uppercase text-white/60">
          JUNTO
        </span>
        <h1 className="text-[26px] font-bold text-white leading-tight mt-1">{title}</h1>
        <p className="text-[13px] text-white/70 mt-1">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}
