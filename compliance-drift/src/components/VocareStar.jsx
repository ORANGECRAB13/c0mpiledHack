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

/* One arm is the WHOLE mark — the caret and the arc that crowns it — with the
   arc outermost. Four of them at 90° put the carets nose-to-nose in a diamond
   at the centre and ring it with the four arcs, which is the four-pointed
   sparkle the design calls for. Using the caret alone would draw a plain
   diamond and throw away half the logo. */
const CARET = 'M-13 -14 L0 -28 L13 -14';
const ARC = 'M-15 -34 A20 20 0 0 1 15 -34';
const ARMS = [0, 90, 180, 270];

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
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ARMS.map((angle, index) => (
          <g key={angle} transform={`rotate(${angle})`} className="vs-arm" style={{ animationDelay: `${index * 0.2}s` }}>
            {/* Caret and arc travel together: they are one mark, and dimming
                them separately would read as two shapes rather than one. */}
            <path d={CARET} />
            <path d={ARC} />
          </g>
        ))}
      </g>
    </svg>
  );
}
