import { cn } from "@/lib/cn";

/**
 * JARVIS mark. Original geometry: a solid core, a broken inner ring, an outer arc with twelve tick marks.
 * Drawn in the current text colour (ink, or the sheet colour on an ink button). `active` slowly rotates
 * the outer arc while a request is in flight; the global rule stops it under prefers-reduced-motion.
 */
export function JarvisMark({ className, active = false }: { className?: string; active?: boolean; onDark?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("shrink-0", className ?? "h-5 w-5")} aria-hidden data-testid="jarvis-mark" data-active={active ? "1" : "0"}>
      <g className={active ? "origin-center animate-[spin_6s_linear_infinite]" : undefined} style={{ transformBox: "fill-box", transformOrigin: "center" }} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <path d="M24 3a21 21 0 0 1 18.2 10.5" />
        <path d="M45 24a21 21 0 0 1-10.5 18.2" opacity="0.7" />
        <path d="M24 45A21 21 0 0 1 5.8 34.5" opacity="0.5" />
        <path d="M3 24A21 21 0 0 1 13.5 5.8" opacity="0.35" />
      </g>
      {Array.from({ length: 12 }).map((_, i) => (
        <line key={i} x1="24" y1="8.5" x2="24" y2={i % 3 === 0 ? 12.5 : 10.5} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" transform={`rotate(${i * 30} 24 24)`} opacity={i % 3 === 0 ? 0.8 : 0.45} />
      ))}
      <path d="M24 15a9 9 0 1 1-8.5 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="24" cy="24" r="3.8" fill="currentColor" />
    </svg>
  );
}
