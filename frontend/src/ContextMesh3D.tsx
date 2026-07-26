import { useEffect, useRef, useState } from 'react';

// Same rendering engine/visual design as the ai-brain project's fable.html —
// three.js additive-glow point cloud, wireframe cage + core, starfield,
// vignette/grain/scanline — ported to run inside a normal React container
// (not fullscreen) and fed from Vocare's real /api/graph/visualization.

const PALETTE: Record<string, string> = {
  State: '#e7b84e', PucRule: '#f0d68a', Moratorium: '#7cb2d6', AuthorityRule: '#d9a94a',
  BenefitProgram: '#5fb6a6', EligibilityCriterion: '#b8862f', LocalAgency: '#c99a3f',
  Customer: '#d5493b', AccountRecord: '#e5533c', KnowledgeGap: '#b07cc6', Node: '#efe0b0'
};
const colorFor = (g: string) => PALETTE[g] ?? PALETTE.Node;

let threeLoadPromise: Promise<any> | null = null;
function loadThree(): Promise<any> {
  if ((window as any).THREE) return Promise.resolve((window as any).THREE);
  if (threeLoadPromise) return threeLoadPromise;
  threeLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/three@0.160.0/build/three.min.js';
    s.onload = () => resolve((window as any).THREE);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return threeLoadPromise;
}

function layout(THREE: any, nodes: any[], links: any[], iters: number) {
  const CELL = 30, REST = 24, MAXR = 230;
  for (let it = 0; it < iters; it++) {
    for (const l of links) {
      let dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, dz = l.t.z - l.s.z;
      const d = Math.hypot(dx, dy, dz) || 1, f = (d - REST) * 0.04 / d;
      l.s.vx += dx * f; l.s.vy += dy * f; l.s.vz += dz * f;
      l.t.vx -= dx * f; l.t.vy -= dy * f; l.t.vz -= dz * f;
    }
    const grid = new Map<string, any[]>();
    for (const n of nodes) {
      const k = Math.floor(n.x / CELL) + ',' + Math.floor(n.y / CELL) + ',' + Math.floor(n.z / CELL);
      let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push(n);
    }
    for (const n of nodes) {
      const cx = Math.floor(n.x / CELL), cy = Math.floor(n.y / CELL), cz = Math.floor(n.z / CELL);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        const cell = grid.get((cx + a) + ',' + (cy + b) + ',' + (cz + c)); if (!cell) continue;
        for (const m of cell) {
          if (m === n) continue;
          const ex = n.x - m.x, ey = n.y - m.y, ez = n.z - m.z; const d2 = ex * ex + ey * ey + ez * ez || 1;
          if (d2 > CELL * CELL * 4) continue;
          const f = 170 / d2, d = Math.sqrt(d2);
          n.vx += ex / d * f; n.vy += ey / d * f; n.vz += ez / d * f;
        }
      }
    }
    for (const n of nodes) {
      n.vx *= 0.82; n.vy *= 0.82; n.vz *= 0.82; n.x += n.vx; n.y += n.vy; n.z += n.vz;
      const r = Math.hypot(n.x, n.y, n.z);
      if (r > MAXR) { const s = MAXR / r; n.x *= s; n.y *= s; n.z *= s; n.vx *= 0.5; n.vy *= 0.5; n.vz *= 0.5; }
    }
  }
}

function nodeTitle(n: any): [string, string] {
  const p = n.properties || {};
  const detail = p.citation || p.summary || p.text || '';
  return [n.label, `${n.primaryLabel}${p.state ? ' · ' + p.state : ''}${detail && detail !== n.label ? ' · ' + detail : ''}`];
}

export default function ContextMesh3D({ dense = true }: { dense?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [counts, setCounts] = useState({ nodes: 0, links: 0 });
  const [groups, setGroups] = useState<string[]>([]);
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    let disposed = false;
    let renderer: any, scene: any, camera: any, raf = 0;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      try {
        const THREE = await loadThree();
        if (disposed) return;
        const host = hostRef.current!;
        const res = await fetch(`/api/graph/visualization${dense ? '?dense=1' : ''}`);
        if (!res.ok) throw new Error('uplink ' + res.status);
        const body = await res.json();
        const data = body.graph;
        if (disposed) return;

        const map = new Map<string, any>();
        data.nodes.forEach((n: any) => {
          const th = 2 * Math.PI * Math.random(), ph = Math.acos(2 * Math.random() - 1), rr = 40 + Math.sqrt(Math.random()) * 160;
          const [title, meta] = nodeTitle(n);
          map.set(n.id, {
            id: n.id, title, meta, group: n.primaryLabel, deg: 0,
            x: rr * Math.sin(ph) * Math.cos(th), y: rr * Math.sin(ph) * Math.sin(th), z: rr * Math.cos(ph),
            vx: 0, vy: 0, vz: 0
          });
        });
        const links = data.links.filter((e: any) => map.has(e.source) && map.has(e.target)).map((e: any) => ({ s: map.get(e.source), t: map.get(e.target) }));
        links.forEach((l: any) => { l.s.deg++; l.t.deg++; });
        const nodes = [...map.values()];
        layout(THREE, nodes, links, nodes.length > 800 ? 40 : 70);
        const idx = new Map(nodes.map((n, i) => [n.id, i]));
        const adj: number[][] = nodes.map(() => []);
        links.forEach((l: any) => { const a = idx.get(l.s.id)!, b = idx.get(l.t.id)!; adj[a].push(b); adj[b].push(a); });
        const N = nodes.length;

        setCounts({ nodes: N, links: links.length });
        setGroups([...new Set(nodes.map((n) => n.group))].slice(0, 9));

        let W = host.clientWidth, H = host.clientHeight;
        scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x050403, 0.0018);
        camera = new THREE.PerspectiveCamera(58, W / H, 1, 6000);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(2, devicePixelRatio));
        renderer.setSize(W, H); renderer.setClearColor(0x050403, 1);
        host.appendChild(renderer.domElement);

        const sN = 400, sp = new Float32Array(sN * 3);
        for (let i = 0; i < sN; i++) {
          const rr = 900 + Math.random() * 1200, t = Math.random() * 6.28, p = Math.acos(2 * Math.random() - 1);
          sp[i * 3] = rr * Math.sin(p) * Math.cos(t); sp[i * 3 + 1] = rr * Math.sin(p) * Math.sin(t); sp[i * 3 + 2] = rr * Math.cos(p);
        }
        const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
        scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x6b5a34, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.5 })));

        const lpos = new Float32Array(links.length * 6);
        links.forEach((l: any, i: number) => lpos.set([l.s.x, l.s.y, l.s.z, l.t.x, l.t.y, l.t.z], i * 6));
        const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lpos, 3));
        const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xe7b84e, transparent: true, opacity: 0.08, depthWrite: false }));
        scene.add(lines);

        const GLOW = (() => {
          const cv = document.createElement('canvas'); cv.width = cv.height = 64;
          const g = cv.getContext('2d')!; const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
          grd.addColorStop(0, 'rgba(255,246,220,1)'); grd.addColorStop(0.25, 'rgba(231,184,78,0.9)');
          grd.addColorStop(0.55, 'rgba(231,184,78,0.35)'); grd.addColorStop(1, 'rgba(231,184,78,0)');
          g.fillStyle = grd; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv);
        })();

        const px = new Float32Array(N * 3), sizeAttr = new Float32Array(N), colAttr = new Float32Array(N * 3), baseSize = new Float32Array(N);
        const col = new THREE.Color();
        nodes.forEach((n, i) => {
          px[i * 3] = n.x; px[i * 3 + 1] = n.y; px[i * 3 + 2] = n.z;
          const s = 5 + Math.min(26, n.deg * 2); sizeAttr[i] = s; baseSize[i] = s;
          col.set(colorFor(n.group)); colAttr[i * 3] = col.r; colAttr[i * 3 + 1] = col.g; colAttr[i * 3 + 2] = col.b;
        });
        const ng = new THREE.BufferGeometry();
        ng.setAttribute('position', new THREE.BufferAttribute(px, 3));
        ng.setAttribute('size', new THREE.BufferAttribute(sizeAttr, 1));
        ng.setAttribute('acolor', new THREE.BufferAttribute(colAttr, 3));
        const nmat = new THREE.ShaderMaterial({
          uniforms: { map: { value: GLOW }, hscale: { value: H * 0.55 } },
          vertexShader: `attribute float size; attribute vec3 acolor; varying vec3 vC;
            uniform float hscale;
            void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0);
              float depth=clamp(1.0-(-mv.z-200.0)/1400.0,0.28,1.0);
              vC=acolor*depth;
              gl_PointSize=size*(hscale/-mv.z); gl_Position=projectionMatrix*mv; }`,
          fragmentShader: `uniform sampler2D map; varying vec3 vC;
            void main(){ vec4 t=texture2D(map,gl_PointCoord); gl_FragColor=vec4(vC,1.0)*t; if(gl_FragColor.a<0.02)discard; }`,
          transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
        });
        const nodesPts = new THREE.Points(ng, nmat); scene.add(nodesPts);

        const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        const hlLines = new THREE.LineSegments(hg, new THREE.LineBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.75 }));
        hlLines.visible = false; scene.add(hlLines);

        const cage = new THREE.Mesh(new THREE.IcosahedronGeometry(46, 2), new THREE.MeshBasicMaterial({ color: 0xe7b84e, wireframe: true, transparent: true, opacity: 0.22 }));
        scene.add(cage);
        const core = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 32), new THREE.MeshBasicMaterial({ color: 0x2f6d8f, transparent: true, opacity: 0.5 }));
        scene.add(core);

        let az = 0, elev = 0.22, R = 340, targetR = 340, autoRot = true, dragging = false, lastX = 0, lastY = 0;
        let mouseX = -1, mouseY = -1, hovered = -1, pickPending = false;
        let arTimer: any;

        const canvas = renderer.domElement;
        canvas.style.cursor = 'grab';
        const onDown = (e: PointerEvent) => { dragging = true; autoRot = false; lastX = e.clientX; lastY = e.clientY; canvas.style.cursor = 'grabbing'; };
        const onUp = () => { dragging = false; canvas.style.cursor = 'grab'; clearTimeout(arTimer); arTimer = setTimeout(() => (autoRot = true), 3500); };
        const onMove = (e: PointerEvent) => {
          const rect = host.getBoundingClientRect();
          if (dragging) { az -= (e.clientX - lastX) * 0.005; elev = Math.max(-1.35, Math.min(1.35, elev + (e.clientY - lastY) * 0.005)); lastX = e.clientX; lastY = e.clientY; }
          mouseX = e.clientX - rect.left; mouseY = e.clientY - rect.top; pickPending = true;
        };
        const onWheel = (e: WheelEvent) => { e.preventDefault(); targetR = Math.max(120, Math.min(900, targetR + e.deltaY * 0.4)); };
        canvas.addEventListener('pointerdown', onDown);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointermove', onMove);
        canvas.addEventListener('wheel', onWheel, { passive: false });

        const _v = new (THREE as any).Vector3();
        function pick() {
          let best = -1, bestD = 20 * 20;
          for (let i = 0; i < N; i++) {
            _v.set(px[i * 3], px[i * 3 + 1], px[i * 3 + 2]).project(camera);
            if (_v.z > 1) continue;
            const sx = (_v.x * 0.5 + 0.5) * W, sy = (-_v.y * 0.5 + 0.5) * H;
            const d = (sx - mouseX) * (sx - mouseX) + (sy - mouseY) * (sy - mouseY);
            if (d < bestD) { bestD = d; best = i; }
          }
          return best;
        }
        function setHover(i: number) {
          if (i === hovered) return;
          if (hovered >= 0) sizeAttr[hovered] = baseSize[hovered];
          hovered = i;
          const tip = tipRef.current;
          if (!tip) return;
          if (i < 0) { tip.style.opacity = '0'; hlLines.visible = false; }
          else {
            sizeAttr[i] = baseSize[i] * 2.1;
            const n = nodes[i];
            tip.querySelector('.t')!.textContent = n.title || '(untitled)';
            tip.querySelector('.m')!.textContent = n.meta || '';
            tip.style.opacity = '1';
            const nb = adj[i], hp = new Float32Array(nb.length * 6);
            for (let k = 0; k < nb.length; k++) { const j = nb[k]; hp.set([px[i * 3], px[i * 3 + 1], px[i * 3 + 2], px[j * 3], px[j * 3 + 1], px[j * 3 + 2]], k * 6); }
            hlLines.geometry.dispose(); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(hp, 3));
            hlLines.geometry = g; hlLines.visible = true;
          }
          ng.attributes.size.needsUpdate = true;
        }

        function animate() {
          raf = requestAnimationFrame(animate);
          if (autoRot && !dragging) az += 0.0011;
          R += (targetR - R) * 0.06;
          camera.position.set(Math.cos(elev) * Math.sin(az) * R, Math.sin(elev) * R, Math.cos(elev) * Math.cos(az) * R);
          camera.lookAt(0, 0, 0);
          cage.rotation.y += 0.0016; cage.rotation.x += 0.0006;
          core.material.opacity = 0.5 + Math.sin(Date.now() / 400) * 0.08;
          if (pickPending) { pickPending = false; camera.updateMatrixWorld(); setHover(pick());
            if (tipRef.current) { tipRef.current.style.left = Math.min(W - 260, mouseX + 14) + 'px'; tipRef.current.style.top = (mouseY + 12) + 'px'; } }
          renderer.render(scene, camera);
        }
        animate();

        resizeObserver = new ResizeObserver(() => {
          W = host.clientWidth; H = host.clientHeight;
          camera.aspect = W / H; camera.updateProjectionMatrix(); renderer.setSize(W, H);
          nmat.uniforms.hscale.value = H * 0.55;
        });
        resizeObserver.observe(host);

        setStatus('ready');

        (host as any).__cleanup = () => {
          cancelAnimationFrame(raf);
          canvas.removeEventListener('pointerdown', onDown);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointermove', onMove);
          canvas.removeEventListener('wheel', onWheel);
          resizeObserver?.disconnect();
          renderer.dispose();
          if (canvas.parentElement === host) host.removeChild(canvas);
        };
      } catch (e: any) {
        if (!disposed) { setStatus('error'); setErrMsg(e.message || 'failed to load'); }
      }
    })();

    return () => {
      disposed = true;
      const host = hostRef.current as any;
      host?.__cleanup?.();
    };
  }, [dense]);

  return (
    <div className="context-mesh3d">
      <div ref={hostRef} className="mesh-canvas-host" />
      <div className="mesh-vignette" />
      <div className="mesh-grain" />
      {status === 'loading' && <div className="mesh-loading">◍ assembling mesh…</div>}
      {status === 'error' && <div className="mesh-loading mesh-error">mesh uplink failed: {errMsg}</div>}
      {status === 'ready' && (
        <>
          <div className="mesh-counts">MESH <b>{counts.nodes.toLocaleString()}</b> nodes <span>·</span> <b>{counts.links.toLocaleString()}</b> links</div>
          <div className="mesh-legend">
            {groups.map((g) => (
              <span key={g}><i style={{ background: colorFor(g) }} />{g}</span>
            ))}
          </div>
        </>
      )}
      <div className="mesh-tip" ref={tipRef}><div className="t" /><div className="m" /></div>
    </div>
  );
}
