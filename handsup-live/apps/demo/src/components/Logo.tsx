const MARK = "M84 336C92 222 124 168 164 168C214 168 214 344 256 344C290 344 294 248 324 248C352 248 356 320 382 320C404 320 414 292 426 268";
const WORD = "M0 -74V-6M0 -28A22 22 0 0 1 44 -28V-6M67 -28A22 22 0 1 1 111 -28A22 22 0 1 1 67 -28ZM111 -50V-6M134 -50V-6M134 -28A22 22 0 0 1 178 -28V-6M201 -28A22 22 0 1 1 245 -28A22 22 0 1 1 201 -28ZM245 -74V-6M305 -43C302 -48 296 -50 288 -50C278 -50 271 -45.5 271 -39C271 -31.5 279 -30 288 -28C297 -26 305 -24 305 -16.5C305 -9.5 298 -6 288 -6C279 -6 272 -8.5 269.5 -13M351 -50V-28A22 22 0 0 0 395 -28M395 -50V-6M418 -28A22 22 0 1 1 462 -28A22 22 0 1 1 418 -28ZM418 -50V18";

export function LogoMark({ className }: { className?: string | undefined }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <path d={MARK} fill="none" stroke="currentColor" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Theme-aware: wordmark follows the foreground (Paper on dark, Ink on light). */
export function Logo({ className }: { className?: string | undefined }) {
  return (
    <svg viewBox="0 0 425.01 96" className={className} role="img" aria-label="Hands Up">
      <g transform="translate(-13.02 -5.76) scale(0.21)">
        <path d={MARK} fill="none" stroke="#FF5A36" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g transform="translate(109.11 75) scale(0.675)">
        <path d={WORD} fill="none" style={{ stroke: "var(--foreground)" }} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
