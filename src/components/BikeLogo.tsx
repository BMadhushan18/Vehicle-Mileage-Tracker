/**
 * Animated motorbike mark: wheels spin, body bobs, speed lines stream.
 * Animation is pure CSS (see .bike-logo in styles.css) and stops for reduced-motion users.
 */
export function BikeLogo({
  size = 40,
  animated = true,
  className = '',
}: {
  size?: number;
  animated?: boolean;
  className?: string;
}) {
  return (
    <svg
      className={`bike-logo${animated ? ' is-animated' : ''} ${className}`}
      width={size}
      height={size * 0.75}
      viewBox="0 0 64 48"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <g className="bike-speed" strokeWidth="2.2">
        <path d="M1 19h7" />
        <path d="M0 26h9" />
        <path d="M3 33h6" />
      </g>
      <g className="bike-body">
        <g className="bike-wheel" strokeWidth="3">
          <circle cx="17" cy="35" r="8.5" />
          <path d="M17 29v12M11 35h12" strokeWidth="1.4" />
        </g>
        <g className="bike-wheel" strokeWidth="3">
          <circle cx="49" cy="35" r="8.5" />
          <path d="M49 29v12M43 35h12" strokeWidth="1.4" />
        </g>
        {/* frame, tank, seat, fork, handlebar */}
        <path d="M17 35 25 24h15l9 11" strokeWidth="3" />
        <path d="M27 24l5 11h8" strokeWidth="2.6" />
        <path d="M21 21h10" strokeWidth="3.6" />
        <path d="M32 21.5c2-3 7-3.5 9-1.5l-1 4H32z" fill="currentColor" strokeWidth="1.5" />
        <path d="M49 35 43 14" strokeWidth="2.8" />
        <path d="M39 13h7" strokeWidth="2.8" />
      </g>
    </svg>
  );
}
