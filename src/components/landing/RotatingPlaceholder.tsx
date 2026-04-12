import { useState, useEffect } from "react";

const PLACEHOLDERS = [
  "Bali with friends, 7 days",
  "Weekend in Barcelona for two",
  "Japan adventure, 2 weeks",
  "Girls trip to Tulum",
  "Bachelor party in Lisbon",
  "Family holiday in Thailand",
  "Island hopping in Greece",
  "Road trip through Portugal",
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
