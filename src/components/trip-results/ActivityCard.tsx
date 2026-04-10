import { useState } from "react";
import { Star, ExternalLink, Trash2, X, Check, ChevronDown, ChevronUp } from "lucide-react";
import { getCategoryColor, getCategoryIcon } from "./categoryColors";
import type { AIActivity, AIDay } from "./useResultsState";

interface Props {
  activity: AIActivity;
  day: AIDay;
  index: number;
  isAdded: boolean;
  onToggleAdd: () => void;
  onRequestChange: () => void;
  onRemove: () => void;
  animDelay?: number;
}

export function ActivityCard({
  activity,
  index,
  isAdded,
  onToggleAdd,
  onRequestChange,
  onRemove,
  animDelay = 0,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const color = getCategoryColor(activity.category);
  const icon = getCategoryIcon(activity.category);

  return (
    <div
      className="mx-4 mb-2 rounded-xl border border-border/30 bg-[#161920] overflow-hidden transition-all duration-200 animate-fade-in"
      style={{
        animationDelay: `${animDelay}ms`,
        borderLeftColor: isAdded ? "#0D9488" : undefined,
        borderLeftWidth: isAdded ? 3 : undefined,
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-3 flex gap-3"
      >
        {/* Numbered pin */}
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white mt-0.5"
          style={{ backgroundColor: color }}
        >
          {index + 1}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p
            className="text-[10px] uppercase tracking-widest font-mono mb-0.5"
            style={{ color }}
          >
            {activity.category}
          </p>
          <h4 className="text-sm font-semibold text-foreground leading-tight">
            {activity.title}
          </h4>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
              4.5
            </span>
            <span>·</span>
            <span className="font-mono">{activity.duration_minutes} min</span>
            {activity.start_time && (
              <>
                <span>·</span>
                <span className="font-mono">{activity.start_time}</span>
              </>
            )}
          </div>
        </div>

        {/* Photo placeholder + chevron */}
        <div className="flex flex-col items-end gap-1">
          <div
            className="w-14 h-14 rounded-lg flex-shrink-0 flex items-center justify-center text-lg"
            style={{ background: `linear-gradient(135deg, ${color}30, ${color}10)` }}
          >
            {icon}
          </div>
          {expanded ? (
            <ChevronUp className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 pt-0 space-y-2 animate-fade-in">
          <p className="text-xs text-muted-foreground leading-relaxed pl-10">
            {activity.description}
          </p>

          {activity.tips && (
            <div className="ml-10 border-l-2 border-[#0D9488]/60 pl-3 py-1.5 bg-[#0D9488]/5 rounded-r-lg">
              <p className="text-[11px] text-muted-foreground">
                💡 <span className="text-foreground/80">{activity.tips}</span>
              </p>
            </div>
          )}

          {activity.dietary_notes && (
            <div className="ml-10">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
                🥬 {activity.dietary_notes}
              </span>
            </div>
          )}

          <div className="ml-10 flex flex-wrap gap-2 text-[11px]">
            {activity.google_maps_url && (
              <a
                href={activity.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
              >
                View on Google Maps <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
            {activity.booking_url && (
              <a
                href={activity.booking_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
              >
                Book on Viator <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Actions row */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border/20">
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-1 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRequestChange();
            }}
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
          >
            <X className="h-3 w-3" /> Change
          </button>
        </div>
        <div className="flex items-center gap-3">
          {activity.estimated_cost_per_person != null && (
            <span className="text-[11px] font-mono text-muted-foreground">
              ~{activity.currency || "€"}{activity.estimated_cost_per_person}/person
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleAdd();
            }}
            className={`text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all ${
              isAdded
                ? "bg-[#0D9488]/20 text-[#0D9488]"
                : "bg-[#1e2130] text-muted-foreground hover:text-foreground hover:bg-[#252836]"
            }`}
          >
            {isAdded ? (
              <span className="flex items-center gap-1">
                <Check className="h-3 w-3" /> Added
              </span>
            ) : (
              "Add ✓"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
