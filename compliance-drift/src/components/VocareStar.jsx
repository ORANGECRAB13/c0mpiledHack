import React from 'react';

/* ============================================================================
 * VocareStar — the Vocare mark used as a working indicator.
 *
 * The mark is a chevron. Repeat it five times around a centre with the tips
 * pointing outward and the arms resolve into a five-pointed star: each chevron
 * is one point, and the gap between neighbouring arms closes into the star's
 * concave notch. So the star is not a new shape bolted on — it is the logo,
 * five times.
 *
 * Drawn as vector paths rather than the PNG in vocare-mark.svg: no rounded
 * black plate, no raster edges at small sizes, and the colour comes from
 * `currentColor`, so it is ink on light surfaces and white on the dark band
 * without a second asset or an invert filter.
 *
 * Motion: the whole star turns, and a highlight chases the arms in sequence.
 * The chase matters — five-fold symmetry rotating at a constant rate reads as
 * almost stationary, because every 72° looks like the last one. The chase gives
 * the eye something to follow, and it also signals "work is happening" rather
 * than "an image is spinning".
 *
 * `spinning={false}` renders the same star at rest, which is what the finished
 * and reduced-motion states use.
 * ========================================================================== */

// One arm: the chevron, tip outward. Five of these at 72° make the star.
const ARM = 'M-13 -24 L0 -40 L13 -24';
const ARMS = [0, 72, 144, 216, 288];

export default function VocareStar({ size = 21, spinning = true, className = '', title }) {
  return (
    <svg
      className={`vs-star ${spinning ? 'is-spinning' : ''} ${className}`}
      width={size}
      height={size}
      viewBox="-50 -50 100 100"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : 'true'}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      <g
        className="vs-spin"
        fill="none"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ARMS.map((angle, index) => (
          <g key={angle} transform={`rotate(${angle})`}>
            {/* The per-arm delay is what makes the chase travel around the
                star instead of every arm pulsing together. */}
            <path d={ARM} className="vs-arm" style={{ animationDelay: `${index * 0.16}s` }} />
          </g>
        ))}
      </g>
    </svg>
  );
}
