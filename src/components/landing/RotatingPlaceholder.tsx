import { useState, useEffect } from "react";

const PLACEHOLDERS = [
  "Bali with 4 friends, 7 days in August",
  "Weekend in Barcelona for two, late September",
  "Japan with my partner, 2 weeks in April",
  "Girls trip to Tulum, 5 days over NYE",
  "Bachelor party in Lisbon, long weekend in June",
  "Family holiday in Thailand, 10 days over Christmas",
  "Island hopping in Greece with 6 friends, July",
  "Road trip through Portugal, 8 days with 3 mates",
];

export function RotatingPlaceholder({
  value,
  onChange,
  onKeyDown,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % PLACEHOLDERS.length);
        setVisible(true);
      }, 300);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative flex-1">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="w-full bg-transparent text-[#1a1a1a] text-[15px] outline-none relative z-10"
      />
      {!value && (
        <span
          className="absolute inset-0 flex items-center text-gray-400 text-[15px] pointer-events-none transition-opacity duration-300"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {PLACEHOLDERS[idx]}
        </span>
      )}
    </div>
  );
}
