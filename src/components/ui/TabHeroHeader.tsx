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
      className="absolute z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 ring-[1.5px] ring-white/30 overflow-hidden"
      style={{
        top: "calc(env(safe-area-inset-top, 0px) + 14px)",
        right: 18,
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      }}
    >
      {profile?.avatar_url ? (
        <img src={profile.avatar_url} alt="Profile" className="h-full w-full object-cover" />
      ) : (
        <span className="text-white text-xs font-semibold">{initials}</span>
      )}
    </Link>
  );
}

export interface HeroPill {
  icon?: ReactNode;
  label: string;
  onClick?: () => void;
  to?: string;
}

interface TabHeroHeaderProps {
  title: string;
  subtitle?: string;
  pills?: HeroPill[];
  children?: ReactNode;
}

export function TabHeroHeader({ title, subtitle, pills, children }: TabHeroHeaderProps) {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        borderBottomLeftRadius: 20,
        borderBottomRightRadius: 20,
        boxShadow: "0 6px 20px rgba(13, 148, 136, 0.20)",
      }}
    >
      {/* Gradient base */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(150deg, #0f766e 0%, #0D9488 45%, #0891b2 100%)",
        }}
      />
      {/* Glass shine overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.0) 50%, rgba(255,255,255,0.05) 100%)",
        }}
      />

      {/* Avatar — top right */}
      <HeaderAvatar />

      {/* Content — consistent structure */}
      <div
        className="relative z-10 flex flex-col"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
          paddingLeft: 22,
          paddingRight: 22,
          paddingBottom: 18,
        }}
      >
        {/* JUNTO — centered */}
        <div className="flex justify-center w-full mb-3">
          <span className="text-[13px] font-extrabold tracking-[0.3em] uppercase text-white/70">
            JUNTO
          </span>
        </div>

        {/* Title — always at same vertical position */}
        <h1 className="text-[26px] font-bold text-white tracking-tight leading-tight">
          {title}
        </h1>

        {/* Subtitle */}
        {subtitle && (
          <p className="text-[13px] text-white/60 font-normal mt-1">{subtitle}</p>
        )}

        {/* Pills — actionable row */}
        {pills && pills.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
            {pills.map((pill, i) => {
              const inner = (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/90 cursor-pointer active:scale-95 transition-transform"
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
                  onClick={pill.onClick}
                >
                  {pill.icon}
                  {pill.label}
                </span>
              );
              if (pill.to) return <Link key={i} to={pill.to}>{inner}</Link>;
              return inner;
            })}
          </div>
        )}

        {/* Custom content area — per-tab functionality */}
        {children}
      </div>
    </div>
  );
}
