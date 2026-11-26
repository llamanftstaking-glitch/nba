import { cn } from "@/lib/cn";

/**
 * JARVIS intelligence mark. Original geometry: a solid core, a broken inner ring, an outer arc with
 * twelve tick marks. Emerald/teal only. `active` slowly rotates the outer arc while a request is in
 * flight (CSS animation; disabled under prefers-reduced-motion by the global rule).
 */
export function JarvisMark({ className, active = false }: { className?: string; active?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("shrink-0", className ?? "h-5 w-5")} aria-hidden data-testid="jarvis-mark" data-active={active ? "1" : "0"}>
      <g className={active ? "origin-center animate-[spin_6s_linear_infinite]" : undefined} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
        <path d="M24 3a21 21 0 0 1 18.2 10.5" fill="none" stroke="rgb(var(--accent))" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M45 24a21 21 0 0 1-10.5 18.2" fill="none" stroke="rgb(var(--teal))" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
        <path d="M24 45A21 21 0 0 1 5.8 34.5" fill="none" stroke="rgb(var(--accent))" strokeWidth="2.5" strokeLinecap="round" opacity="0.55" />
        <path d="M3 24A21 21 0 0 1 13.5 5.8" fill="none" stroke="rgb(var(--teal))" strokeWidth="2.5" strokeLinecap="round" opacity="0.35" />
      </g>
      {Array.from({ length: 12 }).map((_, i) => (
        <line key={i} x1="24" y1="8.5" x2="24" y2={i % 3 === 0 ? 12.5 : 10.5} stroke="rgb(var(--text-2))" strokeWidth="1.2" strokeLinecap="round" transform={`rotate(${i * 30} 24 24)`} opacity={i % 3 === 0 ? 0.9 : 0.5} />
      ))}
      <path d="M24 15a9 9 0 1 1-8.5 6" fill="none" stroke="rgb(var(--teal))" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="24" r="3.6" fill="rgb(var(--accent))" />
    </svg>
  );
}
