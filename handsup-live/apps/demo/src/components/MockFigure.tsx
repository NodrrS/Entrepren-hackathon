/** The stick figure of the mockups, shown instead of a camera in Mock mode. The hands move a little while it plays. */
export function MockFigure({ active, className }: { active: boolean; className?: string | undefined }) {
  return (
    <svg viewBox="0 0 300 300" className={className} role="img" aria-label="Signer (scripted example, no camera)">
      <circle cx="150" cy="70" r="30" fill="none" stroke="#7A7A7A" strokeWidth="3" />
      <path d="M150 100 V 270 M88 135 H 212" stroke="#7A7A7A" strokeWidth="3" strokeLinecap="round" />
      <g>
        <path d="M88 135 L 66 205 L 122 172" fill="none" stroke="#FF5A36" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="122" cy="172" r="7" fill="#FF5A36">
          {active && <animate attributeName="cy" values="172;150;172" dur="1.2s" repeatCount="indefinite" />}
        </circle>
      </g>
      <g>
        <path d="M212 135 L 240 198 L 176 160" fill="none" stroke="#5FB6FF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="176" cy="160" r="7" fill="#5FB6FF">
          {active && <animate attributeName="cy" values="160;180;160" dur="1.6s" repeatCount="indefinite" />}
        </circle>
      </g>
    </svg>
  );
}
