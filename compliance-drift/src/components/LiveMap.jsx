import React from 'react';
import { Icon } from '../icons.jsx';
import { MAP_NODES, MAP_STATS } from '../data/platform.js';

// Dark surface: the context highway. Agents (dots) travel curved paths
// between regulatory sources / internal systems and the engine core.
// Paths are quadratic beziers in a 1000×640 viewBox scaled to the stage.
const CX = 500;
const CY = 400;

function pathFor(n, i) {
  // node coords are on the same 1000×640 grid
  const mx = (n.x + CX) / 2;
  const my = (n.y + CY) / 2;
  // bow the curve perpendicular to the chord, alternating sign
  const dx = CX - n.x;
  const dy = CY - n.y;
  const len = Math.hypot(dx, dy) || 1;
  const off = 54 * (i % 2 === 0 ? 1 : -1);
  const px = mx + (-dy / len) * off;
  const py = my + (dx / len) * off;
  return `M ${n.x} ${n.y} Q ${px} ${py} ${CX} ${CY}`;
}

export default function LiveMap({ paused }) {
  return (
    <div className="mapwrap">
      <div className="mapstage">
        <div className="map-h">
          <div className="ml">Vocare · Context Highway</div>
          <h1>Agents moving live across every instrument</h1>
          <p>
            Each agent travels the highway between the regulatory registers, your
            internal artifacts and the context engine — reading, diffing, propagating
            in real time.
          </p>
        </div>

        <span className="maplive"><span className="d" />LIVE</span>

        <div className="map-stats">
          {MAP_STATS.map((s) => (
            <div className={`map-stat ${s.accent ? 'acc' : ''}`} key={s.cap}>
              <div className="n">{s.n}{s.den && <span className="den">{s.den}</span>}</div>
              <div className="c">{s.cap}</div>
            </div>
          ))}
        </div>

        <svg className="ringsvg" viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid slice">
          {/* orbital guide */}
          <ellipse cx={CX} cy={CY} rx="110" ry="82" fill="none" stroke="rgba(255,255,255,0.1)" strokeDasharray="2 9" />
          {MAP_NODES.map((n, i) => {
            const d = pathFor(n, i);
            return (
              <g key={n.id}>
                <path d={d} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1.4" />
                <path d={d} fill="none" stroke={n.dot} strokeWidth="1.4" strokeDasharray="5 27" opacity="0.55">
                  {!paused && <animate attributeName="stroke-dashoffset" from="0" to="-32" dur="1.4s" repeatCount="indefinite" />}
                </path>
                {/* traveling agent dot */}
                <circle r="3" fill={n.dot} opacity="0.95">
                  {!paused && (
                    <animateMotion dur={`${5 + i * 1.3}s`} repeatCount="indefinite" path={d} keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="linear" />
                  )}
                </circle>
                {/* chip label riding mid-path */}
                <g transform={`translate(${(n.x + CX) / 2}, ${(n.y + CY) / 2})`}>
                  <rect x="-22" y="-7" width="44" height="14" rx="7" fill="#08080A" stroke={n.dot} strokeOpacity="0.7" strokeWidth="0.6" />
                  <text textAnchor="middle" y="2.5" fontSize="7" fontWeight="700" fill={n.dot} fontFamily="inherit">{n.chip}</text>
                </g>
              </g>
            );
          })}
        </svg>

        {MAP_NODES.map((n) => (
          <div
            className="mapnode"
            key={n.id}
            style={{ left: `${(n.x / 1000) * 100}%`, top: `${(n.y / 640) * 100}%` }}
          >
            <div className="nm"><i style={{ background: n.dot }} />{n.label}</div>
            <div className="rl">{n.role}</div>
          </div>
        ))}

        <div className="enginecore">
          <div className="core"><Icon name="pauseSq" size={30} color="#0A0A0C" /></div>
          <div className="lb">Context Engine</div>
          <div className="st">ONLINE</div>
        </div>
      </div>
    </div>
  );
}
