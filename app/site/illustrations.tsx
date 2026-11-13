/**
 * Brand illustrations for the website. Flat scenes drawn in the YourTour palette
 * (Aurès Petrol, Saffron, Timgad Stone, Ink). They stand in wherever a photo
 * would go until the agency supplies its own pictures, and weigh almost nothing.
 *
 * Every scene uses a 400 × 320 canvas and `slice`, so it fills any box; the
 * subject stays inside the middle band, which survives wide crops.
 */
import type { ReactNode } from "react";

const PETROL = "#0d3b44";
const SAFFRON = "#f2a93b";
const STONE = "#f5eee3";
const INK = "#14181c";

/** The plane from the logo, nose up, centred on 0,0 (about 22 × 24 units). */
const PLANE =
  "M0 -12 C1.2 -12 1.7 -10.6 1.7 -9 L1.7 -3.2 L11 2.6 L11 5 L1.7 2.4 L1.7 8.2 L4.6 10.4 L4.6 12 L0 10.9 L-4.6 12 L-4.6 10.4 L-1.7 8.2 L-1.7 2.4 L-11 5 L-11 2.6 L-1.7 -3.2 L-1.7 -9 C-1.7 -10.6 -1.2 -12 0 -12 Z";

function Scene({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 400 320" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

/** Umrah / Hajj: the Kaaba in the courtyard of the Haram at night. */
export function KaabaScene({ className }: { className?: string }) {
  const pilgrims = Array.from({ length: 17 }, (_, i) => {
    const angle = (Math.PI * (8 + i * 10.25)) / 180;
    return { x: Math.round(200 + Math.cos(angle) * 118), y: Math.round(250 + Math.sin(angle) * 24), key: i };
  });
  return (
    <Scene className={className}>
      <defs>
        <linearGradient id="yt-kaaba-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#04171b" />
          <stop offset="0.55" stopColor={PETROL} />
          <stop offset="1" stopColor="#2a6c77" />
        </linearGradient>
        <mask id="yt-kaaba-moon">
          <circle cx="316" cy="74" r="15" fill="#fff" />
          <circle cx="323" cy="69" r="13" fill="#000" />
        </mask>
      </defs>
      <rect width="400" height="320" fill="url(#yt-kaaba-sky)" />
      <g fill="#fff">
        <circle cx="42" cy="46" r="1.4" opacity="0.8" />
        <circle cx="96" cy="86" r="1" opacity="0.6" />
        <circle cx="148" cy="38" r="1.2" opacity="0.7" />
        <circle cx="214" cy="72" r="1" opacity="0.5" />
        <circle cx="262" cy="34" r="1.4" opacity="0.8" />
        <circle cx="372" cy="52" r="1.1" opacity="0.7" />
        <circle cx="356" cy="118" r="1" opacity="0.5" />
        <circle cx="26" cy="124" r="1" opacity="0.5" />
      </g>
      <rect x="300" y="58" width="32" height="32" fill={SAFFRON} mask="url(#yt-kaaba-moon)" />

      {/* arcade of the mosque and two minarets */}
      {[62, 338].map((x) => (
        <g key={x} fill="#b8d6d9">
          <path d={`M${x - 4.5} 100 L${x} 76 L${x + 4.5} 100Z`} />
          <rect x={x - 4.5} y="100" width="9" height="80" />
          <rect x={x - 8.5} y="118" width="17" height="4" rx="1" />
          <rect x={x - 8.5} y="148" width="17" height="4" rx="1" />
          <circle cx={x} cy="73" r="2" fill={SAFFRON} />
        </g>
      ))}
      <rect y="174" width="400" height="48" fill="#17505b" />
      <rect y="172" width="400" height="4" fill="#2a6c77" />
      {Array.from({ length: 13 }, (_, i) => (
        <path key={i} d={`M${6 + i * 31} 222 v-22 a10 10 0 0 1 20 0 v22Z`} fill="#0a3038" />
      ))}

      {/* courtyard */}
      <ellipse cx="200" cy="304" rx="300" ry="96" fill={STONE} />
      <ellipse cx="200" cy="300" rx="232" ry="66" fill="none" stroke="#e6dccb" strokeWidth="2" />
      <ellipse cx="200" cy="296" rx="168" ry="42" fill="none" stroke="#e6dccb" strokeWidth="2" />

      {/* Kaaba */}
      <ellipse cx="200" cy="241" rx="72" ry="8" fill="#000" opacity="0.14" />
      <rect x="146" y="234" width="108" height="6" rx="1" fill="#d6c9b2" />
      <rect x="150" y="126" width="100" height="110" fill={INK} />
      <rect x="150" y="150" width="100" height="12" fill={SAFFRON} />
      <g fill="#8a5a0f" opacity="0.75">
        {Array.from({ length: 9 }, (_, i) => (
          <rect key={i} x={155 + i * 10.4} y="154" width="6.4" height="4" rx="1" />
        ))}
      </g>
      <rect x="213" y="186" width="21" height="50" rx="1.5" fill={SAFFRON} />
      <rect x="216.5" y="190" width="14" height="46" rx="1" fill="none" stroke="#8a5a0f" strokeWidth="1.2" opacity="0.7" />

      {/* pilgrims circling */}
      <g fill="#fff">
        {pilgrims.map((p) => (
          <rect key={p.key} x={p.x - 2.2} y={p.y - 4.5} width="4.4" height="9" rx="2.2" />
        ))}
      </g>
    </Scene>
  );
}

function Balloon({ x, y, scale, body, stripe }: { x: number; y: number; scale: number; body: string; stripe: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M-5 42 L-4 50 M5 42 L4 50" stroke={INK} strokeWidth="1" opacity="0.55" />
      <path d="M0 -30 C20 -30 30 -14 30 2 C30 20 10 34 6 42 L-6 42 C-10 34 -30 20 -30 2 C-30 -14 -20 -30 0 -30Z" fill={body} />
      <path d="M0 -30 C8 -30 12 -14 12 2 C12 20 4 34 2.5 42 L-2.5 42 C-4 34 -12 20 -12 2 C-12 -14 -8 -30 0 -30Z" fill={stripe} />
      <rect x="-5" y="49" width="10" height="7" rx="1.5" fill="#8a5a0f" />
    </g>
  );
}

/** Turkey: an Istanbul mosque at sunrise, balloons of Cappadocia in the sky. */
export function TurkeyScene({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      <defs>
        <linearGradient id="yt-turkey-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fef7ea" />
          <stop offset="0.45" stopColor="#fcecd0" />
          <stop offset="0.8" stopColor="#f7c97a" />
          <stop offset="1" stopColor={SAFFRON} />
        </linearGradient>
      </defs>
      <rect width="400" height="320" fill="url(#yt-turkey-sky)" />
      <circle cx="286" cy="214" r="46" fill="#fffaf0" opacity="0.9" />

      {/* fairy chimneys far away */}
      <path
        d="M0 252 L24 226 L40 244 L62 208 L84 246 L112 230 L250 232 L272 204 L292 240 L318 214 L344 242 L366 222 L400 246 L400 320 L0 320Z"
        fill="#dc9024"
        opacity="0.45"
      />

      {/* mosque */}
      <g fill={PETROL}>
        {[60, 240].map((x) => (
          <g key={x}>
            <path d={`M${x - 3.5} 152 L${x} 128 L${x + 3.5} 152Z`} />
            <rect x={x - 3.5} y="152" width="7" height="116" />
            <rect x={x - 6.5} y="172" width="13" height="3.5" rx="1" />
            <rect x={x - 6.5} y="200" width="13" height="3.5" rx="1" />
          </g>
        ))}
        <path d="M110 228 a40 40 0 0 1 80 0Z" />
        <path d="M76 232 a23 23 0 0 1 46 0Z" />
        <path d="M178 232 a23 23 0 0 1 46 0Z" />
        <rect x="72" y="228" width="156" height="44" />
        <rect x="149" y="176" width="2" height="14" />
        <circle cx="150" cy="175" r="2.6" fill={SAFFRON} />
      </g>
      <g fill="#f7c97a" opacity="0.9">
        {[92, 112, 132, 150, 168, 188, 208].map((x) => (
          <path key={x} d={`M${x - 4} 262 v-10 a4 4 0 0 1 8 0 v10Z`} />
        ))}
      </g>

      {/* shore and water */}
      <path d="M0 266 C80 256 150 272 230 264 C300 257 350 268 400 260 L400 320 L0 320Z" fill="#0a3038" />
      <g stroke="#2a6c77" strokeWidth="2" strokeLinecap="round" opacity="0.8">
        <path d="M40 290 h34 M120 300 h46 M214 288 h30 M290 302 h44" />
      </g>

      <Balloon x={304} y={100} scale={1.2} body={PETROL} stripe="#f7c97a" />
      <Balloon x={214} y={84} scale={0.72} body="#dc9024" stripe="#fef7ea" />
      <Balloon x={366} y={176} scale={0.5} body="#2a6c77" stripe="#dcebec" />
    </Scene>
  );
}

/** Algeria: the arch of Timgad, the Aurès behind it, dunes and a palm in front. */
export function AlgeriaScene({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      <defs>
        <linearGradient id="yt-algeria-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#86b7bd" />
          <stop offset="0.55" stopColor="#dcebec" />
          <stop offset="0.85" stopColor="#fcecd0" />
        </linearGradient>
      </defs>
      <rect width="400" height="320" fill="url(#yt-algeria-sky)" />
      <circle cx="92" cy="94" r="50" fill="#fef7ea" opacity="0.5" />
      <circle cx="92" cy="94" r="30" fill={SAFFRON} />

      {/* Aurès mountains */}
      <path d="M0 206 L56 160 L96 190 L160 132 L214 186 L262 150 L318 196 L362 164 L400 190 L400 320 L0 320Z" fill="#4f8f98" opacity="0.55" />
      <path d="M0 232 L70 196 L130 224 L206 184 L270 222 L340 192 L400 216 L400 320 L0 320Z" fill="#2a6c77" opacity="0.75" />

      {/* arch of Trajan, Timgad */}
      <g>
        <path
          fillRule="evenodd"
          fill="#e8dfcf"
          d="M134 124 H266 V252 H134Z M180 252 V182 a20 20 0 0 1 40 0 V252Z M146 252 V208 a9 9 0 0 1 18 0 V252Z M236 252 V208 a9 9 0 0 1 18 0 V252Z"
        />
        <rect x="126" y="112" width="148" height="12" rx="1.5" fill="#d6c9b2" />
        <rect x="132" y="102" width="136" height="10" rx="1.5" fill="#e8dfcf" />
        <g fill="#d6c9b2">
          <rect x="168" y="130" width="6" height="122" />
          <rect x="226" y="130" width="6" height="122" />
          <rect x="134" y="130" width="6" height="122" />
          <rect x="260" y="130" width="6" height="122" />
          <rect x="144" y="176" width="22" height="5" />
          <rect x="234" y="176" width="22" height="5" />
        </g>
      </g>

      {/* dunes */}
      <path d="M0 262 C70 236 130 262 200 250 C280 236 330 262 400 244 L400 320 L0 320Z" fill={SAFFRON} />
      <path d="M0 290 C90 262 170 300 260 280 C320 266 360 280 400 272 L400 320 L0 320Z" fill="#dc9024" />

      {/* palm */}
      <path d="M330 282 C332 240 336 210 344 176 L349 177 C342 212 339 242 338 282Z" fill="#8a5a0f" />
      <g fill={PETROL}>
        <path d="M346 178 C330 160 308 160 294 172 C312 166 330 170 346 178Z" />
        <path d="M346 178 C340 154 322 142 304 144 C322 148 338 160 346 178Z" />
        <path d="M346 178 C352 154 372 144 390 150 C372 152 356 162 346 178Z" />
        <path d="M346 178 C364 164 386 168 398 182 C382 174 364 172 346 178Z" />
        <path d="M346 178 C346 158 356 142 372 136 C360 148 352 162 346 178Z" />
      </g>
    </Scene>
  );
}

/** Visas and tickets: a passport, a boarding pass and the logo's plane with its dotted trail. */
export function TicketScene({ className }: { className?: string }) {
  return (
    <Scene className={className}>
      <defs>
        <linearGradient id="yt-ticket-sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a6c77" />
          <stop offset="0.6" stopColor="#4f8f98" />
          <stop offset="1" stopColor="#86b7bd" />
        </linearGradient>
      </defs>
      <rect width="400" height="320" fill="url(#yt-ticket-sky)" />

      {/* clouds */}
      <g fill="#fff" opacity="0.22">
        <path d="M24 118 a16 16 0 0 1 30 -8 a20 20 0 0 1 38 4 a13 13 0 0 1 6 25 H30 a11 11 0 0 1 -6 -21Z" />
        <path d="M286 262 a16 16 0 0 1 30 -8 a20 20 0 0 1 38 4 a13 13 0 0 1 6 25 H292 a11 11 0 0 1 -6 -21Z" />
      </g>

      {/* flight trail and plane */}
      <path d="M36 96 C120 44 220 40 318 84" fill="none" stroke={SAFFRON} strokeWidth="5" strokeLinecap="round" strokeDasharray="0 13" />
      <g transform="translate(336 92) rotate(114) scale(1.7)">
        <path d={PLANE} fill={SAFFRON} />
      </g>

      {/* passport */}
      <g transform="rotate(-9 150 190)">
        <rect x="104" y="128" width="92" height="124" rx="9" fill={PETROL} />
        <rect x="104" y="128" width="10" height="124" rx="4" fill="#0a3038" />
        <g fill="none" stroke={SAFFRON} strokeWidth="2.2">
          <circle cx="154" cy="176" r="19" />
          <ellipse cx="154" cy="176" rx="8" ry="19" />
          <path d="M135 176 h38 M139 165 h30 M139 187 h30" />
        </g>
        <rect x="130" y="212" width="48" height="5" rx="2.5" fill={SAFFRON} />
        <rect x="140" y="224" width="28" height="4" rx="2" fill={SAFFRON} opacity="0.6" />
      </g>

      {/* boarding pass */}
      <g transform="rotate(7 250 200)">
        <rect x="172" y="162" width="168" height="78" rx="11" fill="#fff" />
        <path d="M290 166 V236" stroke="#b8d6d9" strokeWidth="2" strokeDasharray="4 5" />
        <rect x="186" y="176" width="34" height="6" rx="3" fill="#b8d6d9" />
        <rect x="186" y="190" width="52" height="11" rx="3" fill={PETROL} />
        <circle cx="190" cy="220" r="4" fill={SAFFRON} />
        <path d="M198 220 H262" stroke="#86b7bd" strokeWidth="2" strokeDasharray="1 6" strokeLinecap="round" />
        <circle cx="270" cy="220" r="4" fill={PETROL} />
        <g fill={INK}>
          <rect x="300" y="178" width="3" height="46" />
          <rect x="306" y="178" width="1.5" height="46" />
          <rect x="310" y="178" width="4" height="46" />
          <rect x="317" y="178" width="1.5" height="46" />
          <rect x="321" y="178" width="3" height="46" />
          <rect x="327" y="178" width="1.5" height="46" />
        </g>
      </g>
    </Scene>
  );
}

/**
 * Hero horizon: sunrise behind the Aurès, the logo's dotted flight path above.
 * Canvas 1440 × 300. Give the box that ratio on wide screens (nothing is cut);
 * on narrow ones a fixed height crops the sides only, so the sun and the plane
 * sit near the centre. The last layer is the colour of the section that follows.
 */
export function HorizonScene({ className, ground = STONE }: { className?: string; ground?: string }) {
  return (
    <svg viewBox="0 0 1440 300" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="yt-horizon-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={SAFFRON} stopOpacity="0.42" />
          <stop offset="1" stopColor={SAFFRON} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="yt-horizon-sun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f9d594" />
          <stop offset="1" stopColor={SAFFRON} />
        </linearGradient>
      </defs>
      <circle cx="640" cy="172" r="230" fill="url(#yt-horizon-glow)" />
      <circle cx="640" cy="172" r="74" fill="url(#yt-horizon-sun)" />

      {/* dotted flight path and plane, as in the logo */}
      <path d="M300 196 C430 116 620 70 992 62" fill="none" stroke={STONE} strokeOpacity="0.8" strokeWidth="4" strokeLinecap="round" strokeDasharray="0 14" />
      <g transform="translate(1016 60) rotate(86) scale(2.1)">
        <path d={PLANE} fill={SAFFRON} />
      </g>

      <path d="M0 194 L120 152 L210 174 L340 116 L450 162 L560 128 L690 170 L800 112 L900 148 L1010 104 L1130 154 L1240 120 L1340 152 L1440 128 L1440 300 L0 300Z" fill="#1b5a66" />
      <path d="M0 224 L140 192 L260 216 L400 172 L520 212 L650 186 L760 218 L900 178 L1040 216 L1180 182 L1300 212 L1440 190 L1440 300 L0 300Z" fill="#124652" />
      <path d="M0 258 C200 230 380 272 600 248 C820 224 1000 272 1200 248 C1300 236 1380 246 1440 240 L1440 300 L0 300Z" fill="#0a3038" />
      <path d="M0 286 C300 266 600 296 900 280 C1150 266 1300 286 1440 276 L1440 301 L0 301Z" fill={ground} />
    </svg>
  );
}
