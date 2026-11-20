/**
 * Login-panel illustration: one EasyHR workspace at the centre of a globe, connected to
 * offices in several countries and time zones. Drawn for the dark navy brand panel.
 */
const TEAL = "#5EEAD4";
const MUTED = "#8fa3bf";

type Office = { city: string; zone: string; x: number; y: number; path: string; dot: [number, number] };

const CARD_W = 136;
const CARD_H = 40;

// Each path runs from the card edge to the edge of the central hub (260,150).
const OFFICES: Office[] = [
  { city: "New York", zone: "EST · UTC−5", x: 8, y: 40, dot: [144, 60], path: "M144 60 Q214 66 240 130" },
  { city: "London", zone: "GMT · UTC+0", x: 376, y: 24, dot: [376, 44], path: "M376 44 Q306 58 280 128" },
  { city: "Bengaluru", zone: "IST · UTC+5:30", x: 376, y: 200, dot: [376, 220], path: "M376 220 Q308 214 282 172" },
  { city: "Singapore", zone: "SGT · UTC+8", x: 8, y: 200, dot: [144, 220], path: "M144 220 Q206 216 238 172" },
  { city: "Dubai", zone: "GST · UTC+4", x: 192, y: 254, dot: [260, 254], path: "M260 254 L260 174" },
];

function OfficeCard({ city, zone, x, y }: Office) {
  return (
    <g>
      <rect x={x} y={y} width={CARD_W} height={CARD_H} rx="10" fill="#fff" fillOpacity="0.07" stroke="#fff" strokeOpacity="0.14" />
      <rect x={x + 8} y={y + 8} width="24" height="24" rx="6" fill={TEAL} fillOpacity="0.14" />
      {/* office building */}
      <rect x={x + 14} y={y + 12.5} width="12" height="15.5" rx="1.5" fill="none" stroke={TEAL} strokeWidth="1.4" />
      {[[3, 3.5], [7, 3.5], [3, 7.5], [7, 7.5]].map(([dx, dy]) => (
        <rect key={`${dx}-${dy}`} x={x + 14 + dx} y={y + 12.5 + dy} width="2" height="2" rx="0.4" fill={TEAL} />
      ))}
      <rect x={x + 19} y={y + 24} width="2" height="4" fill={TEAL} />
      <text x={x + 40} y={y + 18} fill="#fff" fontSize="12" fontWeight="600">{city}</text>
      <text x={x + 40} y={y + 31} fill={MUTED} fontSize="10.5">{zone}</text>
    </g>
  );
}

export function GlobalOfficesArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 520 300"
      className={className}
      role="img"
      aria-label="EasyHR connects company offices in New York, London, Bengaluru, Singapore and Dubai across time zones"
    >
      {/* globe */}
      <g fill="none" stroke="#fff">
        <circle cx="260" cy="150" r="92" fill="#fff" fillOpacity="0.035" strokeOpacity="0.2" />
        <ellipse cx="260" cy="150" rx="36" ry="92" strokeOpacity="0.1" />
        <ellipse cx="260" cy="150" rx="70" ry="92" strokeOpacity="0.1" />
        <line x1="168" y1="150" x2="352" y2="150" strokeOpacity="0.1" />
        <line x1="177" y1="110" x2="343" y2="110" strokeOpacity="0.1" />
        <line x1="177" y1="190" x2="343" y2="190" strokeOpacity="0.1" />
      </g>

      {/* connections */}
      <g fill="none" stroke={TEAL} strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="3 5" strokeLinecap="round">
        {OFFICES.map((o) => (
          <path key={o.city} d={o.path} />
        ))}
      </g>
      {OFFICES.map((o) => (
        <circle key={o.city} cx={o.dot[0]} cy={o.dot[1]} r="3" fill={TEAL} />
      ))}

      {/* central EasyHR hub */}
      <circle cx="260" cy="150" r="34" fill={TEAL} fillOpacity="0.08" />
      <rect x="238" y="128" width="44" height="44" rx="12" fill="#fff" fillOpacity="0.14" stroke="#fff" strokeOpacity="0.25" />
      <g transform="translate(244 134)">
        <circle cx="12" cy="12.5" r="4" fill="#fff" />
        <path d="M5.5 24.5c.8-4 3.4-6.2 6.5-6.2s5.7 2.2 6.5 6.2" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <circle cx="22.5" cy="11" r="3" fill={TEAL} />
        <path d="M19.8 17.6c.8-.5 1.7-.8 2.7-.8 2.5 0 4.4 1.8 5 5" stroke={TEAL} strokeWidth="2.2" strokeLinecap="round" fill="none" />
      </g>

      {OFFICES.map((o) => (
        <OfficeCard key={o.city} {...o} />
      ))}
    </svg>
  );
}
