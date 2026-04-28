"use client";

/**
 * DottleLogo — compact face + wordmark for the sidebar header.
 * Extracted from DottleMascot: just the head, antenna, blinking eyes, smile.
 * Matches the dottle.dev brand shown in the top-left navigation.
 */
export default function DottleLogo({
  size = 28,
  showText = true,
}: {
  size?: number;
  showText?: boolean;
}) {
  return (
    <span className="flex items-center gap-2 select-none min-w-0">
      {/* Face SVG — viewBox tightly crops the head + antenna */}
      <svg
        width={size}
        height={size}
        viewBox="270 186 82 94"
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: "visible", flexShrink: 0 }}
        aria-hidden="true"
      >
        <defs>
          <style>{`
            @keyframes dl-blink {
              0%, 88%, 100% { transform: scaleY(1); }
              94%            { transform: scaleY(0.08); }
            }
            @keyframes dl-sway {
              0%, 100% { transform: rotate(0deg); }
              30%       { transform: rotate(7deg); }
              70%       { transform: rotate(-7deg); }
            }
            .dl-eyeL { animation: dl-blink 4.2s ease-in-out infinite;     transform-origin: 298px 250px; }
            .dl-eyeR { animation: dl-blink 4.2s ease-in-out infinite 0.12s; transform-origin: 322px 248px; }
            .dl-ant  { animation: dl-sway  3.0s ease-in-out infinite;     transform-origin: 310px 219px; }
          `}</style>
        </defs>

        {/* Head body */}
        <circle cx="310" cy="255" r="36" fill="#C8613A" />
        {/* Shadow blob — gives the round depth */}
        <circle cx="296" cy="246" r="22" fill="#B8542F" />

        {/* Antenna */}
        <g className="dl-ant">
          <line x1="310" y1="219" x2="310" y2="200" stroke="#C8613A" strokeWidth="3" strokeLinecap="round" />
          <circle cx="310" cy="196" r="7" fill="#C8613A" />
          <circle cx="310" cy="196" r="3.5" fill="#FFF5F0" />
        </g>

        {/* Left eye — blinking */}
        <g className="dl-eyeL">
          <circle cx="298" cy="250" r="9" fill="#FFF5F0" />
          <circle cx="300" cy="252" r="4.5" fill="#1A1917" />
          <circle cx="302" cy="250" r="1.5" fill="white" />
        </g>

        {/* Right eye — blinking (slight offset) */}
        <g className="dl-eyeR">
          <circle cx="322" cy="248" r="9" fill="#FFF5F0" />
          <circle cx="324" cy="250" r="4.5" fill="#1A1917" />
          <circle cx="326" cy="248" r="1.5" fill="white" />
        </g>

        {/* Smile */}
        <path
          d="M299 267 Q310 276 321 267"
          fill="none"
          stroke="#1A1917"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>

      {/* Wordmark — "dottle" bold + ".dev" muted — hidden when collapsed */}
      {showText && (
        <span className="flex items-baseline gap-0 leading-none min-w-0">
          <span className="text-[15px] font-semibold tracking-tight text-ink-primary truncate">
            dottle
          </span>
          <span className="text-[15px] font-normal tracking-tight text-ink-muted">
            .dev
          </span>
        </span>
      )}
    </span>
  );
}
