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
      className="absolute z-10 flex h-[38px] w-[38px] items-center justify-center rounded-full bg-white/20 ring-2 ring-white/25 overflow-hidden"
      style={{
        top: "calc(env(safe-area-inset-top, 0px) + 18px)",
        right: 22,
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      }}
    >
      {profile?.avatar_url ? (
        <img src={profile.avatar_url} alt="Profile" className="h-full w-full object-cover" />
      ) : (
        <span className="text-white text-sm font-semibold">{initials}</span>
      )}
    </Link>
  );
}

export interface HeroPill {
  icon?: ReactNode;
  label: string;
}

interface TabHeroHeaderProps {
  title: string;
  subtitle: string;
  pills?: HeroPill[];
  children?: ReactNode;
}

export function TabHeroHeader({ title, subtitle, pills, children }: TabHeroHeaderProps) {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
        boxShadow: "0 8px 24px rgba(13, 148, 136, 0.25)",
      }}
    >
      {/* Gradient base */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(145deg, #0f766e 0%, #0D9488 40%, #0891b2 100%)",
          borderBottomLeftRadius: 28,
          borderBottomRightRadius: 28,
        }}
      />
      {/* Glass shine overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.0) 45%, rgba(255,255,255,0.04) 100%)",
          borderBottomLeftRadius: 28,
          borderBottomRightRadius: 28,
        }}
      />

      {/* Avatar */}
      <HeaderAvatar />

      {/* Content */}
      <div
        className="relative z-10 flex flex-col justify-end"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 18px)",
          paddingLeft: 22,
          paddingRight: 22,
          paddingBottom: 22,
          minHeight: 172,
        }}
      >
        {/* ROW 1 — JUNTO label */}
        <span
          className="text-[10px] tracking-[0.2em] uppercase text-white/50"
          style={{ fontWeight: 900 }}
        >
          JUNTO
        </span>

        {/* ROW 2 — Title */}
        <h1 className="text-[28px] font-bold text-white tracking-tight leading-none mt-3">
          {title}
        </h1>

        {/* ROW 3 — Subtitle */}
        <p className="text-[13px] text-white/65 font-normal mt-2">{subtitle}</p>

        {/* ROW 4 — Pills */}
        {pills && pills.length > 0 && (
          <div className="flex items-center gap-1.5 mt-4 flex-wrap">
            {pills.map((pill, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/90"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 20,
                  paddingLeft: 10,
                  paddingRight: 10,
                  paddingTop: 5,
                  paddingBottom: 5,
                }}
              >
                {pill.icon}
                {pill.label}
              </span>
            ))}
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
