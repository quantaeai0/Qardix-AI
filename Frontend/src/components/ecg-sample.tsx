const LEADS = [["I", "aVR", "V1", "V4"], ["II", "aVL", "V2", "V5"], ["III", "aVF", "V3", "V6"]];
const BEAT = "l6 0 l3 -4 l3 4 l6 0 l3 2 l3 -22 l3 30 l3 -8 l8 0 l6 -6 l6 6 l10 0";

/** Stylised standard 12-lead layout (3x4 + rhythm strip). */
export function EcgSample({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 200" className={className} aria-label="Standard 12-lead ECG layout">
      <defs>
        <pattern id="sm" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M4 0H0V4" fill="none" stroke="oklch(0.6 0.2 22 / 0.15)" strokeWidth="0.3" /></pattern>
        <pattern id="lg" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="url(#sm)" /><path d="M20 0H0V20" fill="none" stroke="oklch(0.6 0.2 22 / 0.3)" strokeWidth="0.5" /></pattern>
      </defs>
      <rect width="400" height="200" fill="oklch(0.99 0.01 60)" />
      <rect width="400" height="200" fill="url(#lg)" />
      {LEADS.map((row, ri) =>
        row.map((lead, ci) => {
          const x = ci * 100, y = 30 + ri * 42;
          return (
            <g key={lead}>
              <text x={x + 4} y={y - 14} fontSize="7" fill="oklch(0.3 0.05 260)" fontFamily="monospace">{lead}</text>
              <path d={`M${x + 2} ${y} ${BEAT} ${BEAT}`} fill="none" stroke="oklch(0.25 0.05 260)" strokeWidth="0.9" />
            </g>
          );
        }),
      )}
      <text x="4" y="160" fontSize="7" fill="oklch(0.3 0.05 260)" fontFamily="monospace">II (rhythm)</text>
      <path d={`M2 176 ${Array(5).fill(BEAT).join(" ")}`} fill="none" stroke="oklch(0.25 0.05 260)" strokeWidth="0.9" />
      <text x="330" y="196" fontSize="6" fill="oklch(0.4 0.03 260)" fontFamily="monospace">25mm/s 10mm/mV</text>
    </svg>
  );
}

export function EcgPlaceholder({ label }: { label: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border">
      <EcgSample className="w-full opacity-70" />
      <span className="absolute bottom-2 left-2 rounded-md bg-card/90 px-2 py-1 text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
