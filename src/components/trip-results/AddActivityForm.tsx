import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AIActivity } from "./useResultsState";

interface Props {
  dayDate: string;
  onAdd: (activity: AIActivity) => void;
  onClose: () => void;
}

const DURATIONS = [30, 60, 90, 120, 180];

export function AddActivityForm({ dayDate, onAdd, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("12:00");
  const [duration, setDuration] = useState(60);

  const handleAdd = () => {
    if (!title.trim()) return;
    const activity: AIActivity = {
      title: title.trim(),
      description: "",
      category: "custom",
      start_time: startTime,
      duration_minutes: duration,
      estimated_cost_per_person: null,
      currency: "USD",
      location_name: "",
      latitude: null,
      longitude: null,
      google_maps_url: null,
      booking_url: null,
      photo_query: null,
      tips: null,
      dietary_notes: null,
    };
    onAdd(activity);
  };

  return (
    <div className="mx-4 mb-3 rounded-xl border border-dashed border-[#0D9488]/30 bg-[#0D9488]/5 p-3 animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-foreground">Add activity</span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-accent transition-colors">
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      <input
        type="text"
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What do you want to add?"
        className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#0D9488]/40 mb-2"
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd();
          if (e.key === "Escape") onClose();
        }}
      />

      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground block mb-0.5">Time</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#0D9488]/40"
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground block mb-0.5">Duration</label>
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#0D9488]/40"
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>{d} min</option>
            ))}
          </select>
        </div>
      </div>

      <Button
        onClick={handleAdd}
        disabled={!title.trim()}
        className="w-full h-8 text-xs bg-[#0D9488] hover:bg-[#0D9488]/90 text-white rounded-lg gap-1"
      >
        <Plus className="h-3 w-3" /> Add
      </Button>
    </div>
  );
}
