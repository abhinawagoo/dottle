/**
 * DottleMascot — animated SVG mascot for dottle.dev
 *
 * Usage:
 *   import DottleMascot from '@/components/dottle-mascot'
 *   <DottleMascot variant="detecting" size={400} />
 *
 * Variants:
 *   "idle"       — gentle bob, blinking, antenna sway (default)
 *   "detecting"  — red speech bubble: agent loop detected
 *   "fixing"     — green thought bubble: fixing live...
 *   "happy"      — both bubbles, checkmark, resolved state
 *   "sleeping"   — closed eyes, slow bob, zzz bubbles
 */

const VARIANTS = {
  idle: {
    leftBubble: null,
    rightBubble: null,
    eyeColor: '#1A1917',
    smile: 'M299 267 Q310 276 321 267',
  },
  detecting: {
    leftBubble: {
      lines: ['agent loop', 'detected'],
      sub: 'session #4821',
      color: '#C8613A',
      bg: '#FFF8F5',
    },
    rightBubble: null,
    eyeColor: '#1A1917',
    smile: 'M299 267 Q310 272 321 267',
  },
  fixing: {
    leftBubble: null,
    rightBubble: {
      lines: ['fixing live...'],
      sub: 'cost: $0.0024 · 1.2s',
      color: '#3A8C5C',
      bg: '#F5FFF8',
      showCursor: true,
    },
    eyeColor: '#1A1917',
    smile: 'M299 267 Q310 276 321 267',
  },
  happy: {
    leftBubble: null,
    rightBubble: {
      lines: ['all clear!'],
      sub: '0 loops · 0 errors',
      color: '#3A8C5C',
      bg: '#F5FFF8',
      showCheck: true,
    },
    eyeColor: '#1A1917',
    smile: 'M296 267 Q310 280 324 267',
  },
  sleeping: {
    leftBubble: null,
    rightBubble: null,
    eyeColor: '#1A1917',
    smile: 'M301 268 Q310 272 319 268',
    sleeping: true,
  },
}

export default function DottleMascot({ variant = 'detecting', size = 480 }) {
  const v = VARIANTS[variant] || VARIANTS.idle
  const scale = size / 480

  return (
    <svg
      width={size}
      height={size * (500 / 480)}
      viewBox="0 0 680 500"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: 'visible' }}
      aria-label={`dottle mascot — ${variant}`}
    >
      <defs>
        <style>{`
          @keyframes bob {
            0%,100% { transform: translateY(0px); }
            50%      { transform: translateY(-8px); }
          }
          @keyframes breathe {
            0%,100% { transform: scaleY(1) scaleX(1); }
            50%      { transform: scaleY(1.04) scaleX(0.97); }
          }
          @keyframes blink {
            0%,90%,100% { transform: scaleY(1); }
            95%          { transform: scaleY(0.08); }
          }
          @keyframes antennaSway {
            0%,100% { transform: rotate(0deg); }
            25%      { transform: rotate(8deg); }
            75%      { transform: rotate(-8deg); }
          }
          @keyframes bubbleIn {
            0%   { opacity:0; transform: scale(0.6); }
            15%  { opacity:1; transform: scale(1); }
            85%  { opacity:1; transform: scale(1); }
            100% { opacity:0; transform: scale(0.9); }
          }
          @keyframes thoughtDot {
            0%,30% { opacity:0; transform:scale(0); }
            50%,85%{ opacity:1; transform:scale(1); }
            100%   { opacity:0; }
          }
          @keyframes floatUp {
            0%   { opacity:0;   transform: translateY(0) scale(0.6); }
            10%  { opacity:0.7; transform: translateY(-8px) scale(1); }
            90%  { opacity:0.2; transform: translateY(-55px) scale(0.8); }
            100% { opacity:0;   transform: translateY(-65px) scale(0.6); }
          }
          @keyframes alertPulse {
            0%,100% { transform: scale(1);   opacity:0.6; }
            50%      { transform: scale(1.5); opacity:0;   }
          }
          @keyframes shimmer {
            0%,100% { opacity:0.3; }
            50%      { opacity:0.85; }
          }
          @keyframes cursor {
            0%,100% { opacity:1; }
            50%      { opacity:0; }
          }
          @keyframes checkDraw {
            from { stroke-dashoffset: 40; }
            to   { stroke-dashoffset: 0; }
          }
          @keyframes zzz {
            0%   { opacity:0; transform: translateY(0) scale(0.5); }
            20%  { opacity:1; transform: translateY(-8px) scale(1); }
            80%  { opacity:0.6; transform: translateY(-28px) scale(1.1); }
            100% { opacity:0; transform: translateY(-40px) scale(0.8); }
          }

          .dm-group   { animation: bob 3s ease-in-out infinite; transform-origin: 340px 320px; }
          .dm-body    { animation: breathe 3s ease-in-out infinite; transform-origin: 310px 300px; }
          .dm-eyeL    { animation: blink 4s ease-in-out infinite; transform-origin: 298px 250px; }
          .dm-eyeR    { animation: blink 4s ease-in-out infinite 0.1s; transform-origin: 322px 248px; }
          .dm-antenna { animation: antennaSway 2.5s ease-in-out infinite; transform-origin: 310px 219px; }
          .dm-bubbleL { animation: bubbleIn 5s ease-in-out infinite; transform-origin: 124px 182px; }
          .dm-bubbleR { animation: bubbleIn 5s ease-in-out infinite 2.5s; transform-origin: 554px 157px; }
          .dm-td1     { animation: thoughtDot 5s ease-in-out infinite 2.5s; transform-origin: 396px 235px; }
          .dm-td2     { animation: thoughtDot 5s ease-in-out infinite 2.8s; transform-origin: 420px 218px; }
          .dm-td3     { animation: thoughtDot 5s ease-in-out infinite 3.1s; transform-origin: 448px 204px; }
          .dm-fb1     { animation: floatUp 3.5s ease-in infinite; }
          .dm-fb2     { animation: floatUp 3.5s ease-in infinite 0.9s; }
          .dm-fb3     { animation: floatUp 3.5s ease-in infinite 1.7s; }
          .dm-alert   { animation: alertPulse 1.4s ease-out infinite; transform-origin: 196px 158px; }
          .dm-shimmer { animation: shimmer 2s ease-in-out infinite; }
          .dm-cursor  { animation: cursor 0.8s step-end infinite; }
          .dm-check   { stroke-dasharray:40; stroke-dashoffset:40; animation: checkDraw 0.7s ease-out 3s forwards; }
          .dm-zzz1    { animation: zzz 3s ease-in-out infinite; transform-origin: 360px 220px; }
          .dm-zzz2    { animation: zzz 3s ease-in-out infinite 1s; transform-origin: 376px 205px; }
          .dm-zzz3    { animation: zzz 3s ease-in-out infinite 2s; transform-origin: 394px 188px; }
          .dm-eyeSleep { transform: scaleY(0.12); }
        `}</style>
      </defs>

      {/* ── DOTTLE BODY ── */}
      <g className="dm-group">

        {/* Body */}
        <g className="dm-body">
          <circle cx="310" cy="300" r="38" fill="#C8613A"/>
          <circle cx="295" cy="288" r="24" fill="#B8542F"/>
          <circle cx="328" cy="310" r="20" fill="#D4703F"/>
        </g>

        {/* Left arm */}
        <circle cx="264" cy="295" r="18" fill="#C8613A"/>
        <circle cx="249" cy="305" r="12" fill="#C8613A"/>
        <circle cx="238" cy="316" r="8"  fill="#C8613A"/>
        <circle cx="230" cy="308" r="5"  fill="#C8613A"/>
        <circle cx="226" cy="320" r="5"  fill="#C8613A"/>
        <circle cx="235" cy="328" r="5"  fill="#C8613A"/>

        {/* Right arm */}
        <circle cx="356" cy="292" r="18" fill="#C8613A"/>
        <circle cx="372" cy="300" r="12" fill="#C8613A"/>
        <circle cx="384" cy="310" r="8"  fill="#C8613A"/>
        <circle cx="392" cy="302" r="5"  fill="#C8613A"/>
        <circle cx="394" cy="316" r="5"  fill="#C8613A"/>
        <circle cx="386" cy="323" r="5"  fill="#C8613A"/>

        {/* Left leg */}
        <circle cx="289" cy="333" r="16" fill="#C8613A"/>
        <circle cx="281" cy="350" r="13" fill="#C8613A"/>
        <circle cx="276" cy="366" r="10" fill="#C8613A"/>
        <circle cx="268" cy="376" r="8"  fill="#C8613A"/>
        <circle cx="260" cy="381" r="6"  fill="#C8613A"/>
        <circle cx="275" cy="383" r="6"  fill="#C8613A"/>

        {/* Right leg */}
        <circle cx="330" cy="335" r="16" fill="#C8613A"/>
        <circle cx="338" cy="352" r="13" fill="#C8613A"/>
        <circle cx="343" cy="368" r="10" fill="#C8613A"/>
        <circle cx="348" cy="378" r="8"  fill="#C8613A"/>
        <circle cx="340" cy="384" r="6"  fill="#C8613A"/>
        <circle cx="355" cy="381" r="6"  fill="#C8613A"/>

        {/* Head */}
        <circle cx="310" cy="255" r="36" fill="#C8613A"/>
        <circle cx="296" cy="246" r="22" fill="#B8542F"/>

        {/* Eyes */}
        {v.sleeping ? (
          <>
            <g className="dm-eyeL dm-eyeSleep">
              <circle cx="298" cy="250" r="9" fill="#FFF5F0"/>
              <circle cx="300" cy="252" r="4.5" fill="#1A1917"/>
            </g>
            <g className="dm-eyeR dm-eyeSleep">
              <circle cx="322" cy="248" r="9" fill="#FFF5F0"/>
              <circle cx="324" cy="250" r="4.5" fill="#1A1917"/>
            </g>
          </>
        ) : (
          <>
            <g className="dm-eyeL">
              <circle cx="298" cy="250" r="9" fill="#FFF5F0"/>
              <circle cx="300" cy="252" r="4.5" fill={v.eyeColor}/>
              <circle cx="302" cy="250" r="1.5" fill="white"/>
            </g>
            <g className="dm-eyeR">
              <circle cx="322" cy="248" r="9" fill="#FFF5F0"/>
              <circle cx="324" cy="250" r="4.5" fill={v.eyeColor}/>
              <circle cx="326" cy="248" r="1.5" fill="white"/>
            </g>
          </>
        )}

        {/* Smile */}
        <path d={v.smile} fill="none" stroke="#1A1917" strokeWidth="2" strokeLinecap="round"/>

        {/* Antenna */}
        <g className="dm-antenna">
          <line x1="310" y1="219" x2="310" y2="200" stroke="#C8613A" strokeWidth="3" strokeLinecap="round"/>
          <circle cx="310" cy="196" r="7" fill="#C8613A"/>
          <circle cx="310" cy="196" r="3.5" fill="#FFF5F0"/>
        </g>
      </g>

      {/* ── FLOATING MINI BUBBLES ── */}
      <g className="dm-fb1">
        <circle cx="295" cy="272" r="9" fill="none" stroke="#C8613A" strokeWidth="1.2" opacity="0.6"/>
        <text x="295" y="276" fontFamily="monospace" fontSize="8" fill="#C8613A" textAnchor="middle">!</text>
      </g>
      <g className="dm-fb2">
        <circle cx="320" cy="268" r="7" fill="none" stroke="#3A8C5C" strokeWidth="1.2" opacity="0.5"/>
      </g>
      <g className="dm-fb3">
        <circle cx="307" cy="270" r="5" fill="none" stroke="#C8613A" strokeWidth="1" opacity="0.4"/>
      </g>

      {/* ── SLEEPING ZZZ ── */}
      {v.sleeping && (
        <>
          <text className="dm-zzz1" x="360" y="220" fontFamily="monospace" fontSize="14" fill="#C8613A" opacity="0.7">z</text>
          <text className="dm-zzz2" x="376" y="205" fontFamily="monospace" fontSize="18" fill="#C8613A" opacity="0.6">z</text>
          <text className="dm-zzz3" x="394" y="188" fontFamily="monospace" fontSize="22" fill="#C8613A" opacity="0.5">z</text>
        </>
      )}

      {/* ── LEFT SPEECH BUBBLE ── */}
      {v.leftBubble && (
        <g className="dm-bubbleL">
          <rect x="28" y="148" width="192" height="78" rx="14"
            fill={v.leftBubble.bg} stroke={v.leftBubble.color} strokeWidth="1.5"/>
          <polygon points="220,178 242,190 220,200"
            fill={v.leftBubble.bg} stroke={v.leftBubble.color} strokeWidth="1.5" strokeLinejoin="round"/>
          <line x1="220" y1="178" x2="220" y2="200" stroke={v.leftBubble.bg} strokeWidth="3"/>
          {v.leftBubble.lines.map((line, i) => (
            <text key={i} x="124" y={174 + i * 17}
              fontFamily="monospace" fontSize="12"
              fill={i === 1 ? v.leftBubble.color : '#1A1917'}
              textAnchor="middle" fontWeight={i === 1 ? 'bold' : 'normal'}>
              {line}
            </text>
          ))}
          {v.leftBubble.sub && (
            <text x="124" y="210" fontFamily="monospace" fontSize="10" fill="#888" textAnchor="middle">
              {v.leftBubble.sub}
            </text>
          )}
          {/* Alert pulse dot */}
          <circle cx="196" cy="158" r="5" fill={v.leftBubble.color}/>
          <circle className="dm-alert" cx="196" cy="158" r="10" fill="none"
            stroke={v.leftBubble.color} strokeWidth="1.5"/>
        </g>
      )}

      {/* ── RIGHT THOUGHT BUBBLE ── */}
      {v.rightBubble && (
        <>
          <g className="dm-td1"><circle cx="396" cy="235" r="5" fill="none" stroke={v.rightBubble.color} strokeWidth="1.5"/></g>
          <g className="dm-td2"><circle cx="420" cy="218" r="7" fill="none" stroke={v.rightBubble.color} strokeWidth="1.5"/></g>
          <g className="dm-td3"><circle cx="448" cy="204" r="10" fill="none" stroke={v.rightBubble.color} strokeWidth="1.5"/></g>
          <g className="dm-bubbleR">
            <rect x="456" y="112" width="196" height="90" rx="16"
              fill={v.rightBubble.bg} stroke={v.rightBubble.color} strokeWidth="1.5"/>
            {v.rightBubble.lines.map((line, i) => (
              <text key={i} x="554" y={140 + i * 18}
                fontFamily="monospace" fontSize="12"
                fill={v.rightBubble.color} textAnchor="middle" fontWeight="bold">
                {line}
              </text>
            ))}
            {v.rightBubble.sub && (
              <text x="554" y="172" fontFamily="monospace" fontSize="10" fill="#555" textAnchor="middle">
                {v.rightBubble.sub}
              </text>
            )}
            {v.rightBubble.showCursor && (
              <text className="dm-cursor" x="554" y="192"
                fontFamily="monospace" fontSize="12" fill={v.rightBubble.color} textAnchor="middle">▌</text>
            )}
            {v.rightBubble.showCheck && (
              <path className="dm-check"
                d="M520 195 L534 208 L572 175"
                fill="none" stroke={v.rightBubble.color}
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            )}
          </g>
        </>
      )}

      {/* ── STATUS ORBS ── */}
      <circle className="dm-shimmer" cx="155" cy="100" r="28" fill="none" stroke="#C8613A" strokeWidth="1"/>
      <text className="dm-shimmer" x="155" y="97"  fontFamily="monospace" fontSize="10" fill="#C8613A" textAnchor="middle">loop</text>
      <text className="dm-shimmer" x="155" y="111" fontFamily="monospace" fontSize="10" fill="#C8613A" textAnchor="middle">×3</text>

      <circle className="dm-shimmer" cx="510" cy="390" r="24" fill="none" stroke="#3A8C5C" strokeWidth="1"/>
      <text className="dm-shimmer" x="510" y="387" fontFamily="monospace" fontSize="10" fill="#3A8C5C" textAnchor="middle">200</text>
      <text className="dm-shimmer" x="510" y="401" fontFamily="monospace" fontSize="10" fill="#3A8C5C" textAnchor="middle">ok</text>

      {/* ── WORDMARK ── */}
      <text x="300" y="465" fontFamily="sans-serif" fontSize="22" fontWeight="500" fill="#1A1917" textAnchor="end">dottle</text>
      <text x="304" y="465" fontFamily="sans-serif" fontSize="22" fontWeight="400" fill="#888" textAnchor="start">.dev</text>
    </svg>
  )
}
