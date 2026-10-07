import { cn } from "@/lib/utils";

export function EcgLine({ className, animated = false, strokeWidth = 2 }: { className?: string; animated?: boolean; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 600 80" preserveAspectRatio="none" className={cn("w-full", className)} aria-hidden>
      <path
        d="M0 40 H90 L100 40 L108 30 L116 40 H150 L160 40 L168 8 L178 72 L188 30 L196 40 H260 L275 34 L290 40 H340 L350 40 L358 30 L366 40 H400 L410 40 L418 8 L428 72 L438 30 L446 40 H510 L525 34 L540 40 H600"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        className={animated ? "animate-ecg" : undefined}
      />
    </svg>
  );
}

export function Logo({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative grid size-9 place-items-center rounded-xl bg-signal text-signal-foreground shadow-[var(--shadow-card)]">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12h4l2-5 3 10 2-5h7" />
        </svg>
      </div>
      <span className={cn("font-display text-lg font-semibold tracking-tight", light ? "text-navy-foreground" : "text-foreground")}>
        Qardix<span className="text-signal"> AI</span>
      </span>
    </div>
  );
}
