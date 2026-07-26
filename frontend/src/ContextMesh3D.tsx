import { useEffect, useRef, useState } from 'react';

const PALETTE: Record<string, string> = {
  State: '#e7b84e', PucRule: '#f0d68a', Moratorium: '#7cb2d6', AuthorityRule: '#d9a94a',
  BenefitProgram: '#5fb6a6', EligibilityCriterion: '#b8862f', LocalAgency: '#c99a3f',
  Customer: '#d5493b', AccountRecord: '#e5533c', KnowledgeGap: '#b07cc6', Node: '#efe0b0'
};
const colorFor = (group: string) => PALETTE[group] ?? PALETTE.Node;

let threeLoadPromise: Promise<any> | null = null;
function loadThree(): Promise<any> {
  if ((window as any).THREE) return Promise.resolve((window as any).THREE);
  if (threeLoadPromise) return threeLoadPromise;
  threeLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/three@0.160.0/build/three.min.js';
    script.onload = () => resolve((window as any).THREE);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return threeLoadPromise;
}

function hash(value: string) {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return Math.abs(result >>> 0);
}

function sphericalPosition(id: string, radius = 175) {
  const seed = hash(id);
  const theta = ((seed % 10000) / 10000) * Math.PI * 2;
  const phi = Math.acos(2 * (((seed >>> 8) % 10000) / 10000) - 1);
  const r = 42 + (((seed >>> 16) % 1000) / 1000) * radius;
  return {
    x: r * Math.sin(phi) * Math.cos(theta),
    y: r * Math.sin(phi) * Math.sin(theta),
    z: r * Math.cos(phi)
  };
}

function offsetFrom(anchor: { x: number; y: number; z: number }, id: string, distance = 28) {
  const direction = sphericalPosition(id, distance);
  const magnitude = Math.hypot(direction.x, direction.y, direction.z) || 1;
  return {
    x: anchor.x + (direction.x / magnitude) * distance,
    y: anchor.y + (direction.y / magnitude) * distance,
    z: anchor.z + (direction.z / magnitude) * distance
  };
}

function nodeTitle(node: any): [string, string] {
  const properties = node.properties || {};
  const detail = properties.citation || properties.summary || properties.text || '';
  return [
    node.label,
    `${node.primaryLabel}${properties.state ? ` · ${properties.state}` : ''}${detail && detail !== node.label ? ` · ${detail}` : ''}`
  ];
}

const ease = (progress: number) =>
  progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

export default function ContextMesh3D({ dense = true }: { dense?: boolean; refreshKey?: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [counts, setCounts] = useState({ nodes: 0, links: 0 });
  const [groups, setGroups] = useState<string[]>([]);
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    let disposed = false;
    let renderer: any;
    let raf = 0;
    let pollTimer: number | undefined;
    let resizeObserver: ResizeObserver | null = null;
    let syncing = false;

    (async () => {
      try {
        const THREE = await loadThree();
        if (disposed) return;
        const host = hostRef.current!;
        let width = host.clientWidth;
        let height = host.clientHeight;

        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x050403, 0.0018);
        const camera = new THREE.PerspectiveCamera(58, width / height, 1, 6000);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(2, devicePixelRatio));
        renderer.setSize(width, height);
        renderer.setClearColor(0x050403, 1);
        host.appendChild(renderer.domElement);

        const starPositions = new Float32Array(1200);
        for (let i = 0; i < 400; i += 1) {
          const point = sphericalPosition(`star-${i}`, 1900);
          starPositions[i * 3] = point.x * 6;
          starPositions[i * 3 + 1] = point.y * 6;
          starPositions[i * 3 + 2] = point.z * 6;
        }
        const starGeometry = new THREE.BufferGeometry();
        starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
        scene.add(new THREE.Points(
          starGeometry,
          new THREE.PointsMaterial({ color: 0x6b5a34, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.5 })
        ));

        const glow = (() => {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 64;
          const context = canvas.getContext('2d')!;
          const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
          gradient.addColorStop(0, 'rgba(255,246,220,1)');
          gradient.addColorStop(0.25, 'rgba(231,184,78,0.9)');
          gradient.addColorStop(0.55, 'rgba(231,184,78,0.35)');
          gradient.addColorStop(1, 'rgba(231,184,78,0)');
          context.fillStyle = gradient;
          context.fillRect(0, 0, 64, 64);
          return new THREE.CanvasTexture(canvas);
        })();

        const nodeMaterial = new THREE.ShaderMaterial({
          uniforms: { map: { value: glow }, hscale: { value: height * 0.55 } },
          vertexShader: `attribute float size; attribute vec3 acolor; varying vec3 vC;
            uniform float hscale;
            void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0);
              float depth=clamp(1.0-(-mv.z-200.0)/1400.0,0.28,1.0);
              vC=acolor*depth;
              gl_PointSize=size*(hscale/-mv.z); gl_Position=projectionMatrix*mv; }`,
          fragmentShader: `uniform sampler2D map; varying vec3 vC;
            void main(){ vec4 t=texture2D(map,gl_PointCoord); gl_FragColor=vec4(vC,1.0)*t; if(gl_FragColor.a<0.02)discard; }`,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const lineMaterial = new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.22,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });

        let nodeGeometry = new THREE.BufferGeometry();
        let lineGeometry = new THREE.BufferGeometry();
        const nodePoints = new THREE.Points(nodeGeometry, nodeMaterial);
        const lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
        scene.add(lineSegments);
        scene.add(nodePoints);

        const cage = new THREE.Mesh(
          new THREE.IcosahedronGeometry(46, 2),
          new THREE.MeshBasicMaterial({ color: 0xe7b84e, wireframe: true, transparent: true, opacity: 0.22 })
        );
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(20, 32, 32),
          new THREE.MeshBasicMaterial({ color: 0x2f6d8f, transparent: true, opacity: 0.5 })
        );
        cage.visible = core.visible = false;
        scene.add(cage);
        scene.add(core);

        type GraphNode = {
          id: string; title: string; meta: string; group: string; degree: number;
          x: number; y: number; z: number; sx: number; sy: number; sz: number;
          tx: number; ty: number; tz: number; createdAt: number; moveStartedAt: number;
          moveDuration: number; baseSize: number;
        };
        type GraphLink = { id: string; source: string; target: string; type: string; bornAt: number };
        const nodeMap = new Map<string, GraphNode>();
        const linkMap = new Map<string, GraphLink>();
        let consolidated = false;
        let consolidationDueAt: number | null = null;
        let nodeOrder: GraphNode[] = [];
        let linkOrder: GraphLink[] = [];
        let nodePositions = new Float32Array();
        let nodeSizes = new Float32Array();
        let nodeColors = new Float32Array();
        let linePositions = new Float32Array();
        let lineColors = new Float32Array();
        const color = new THREE.Color();

        function rebuildBuffers() {
          nodeOrder = [...nodeMap.values()];
          linkOrder = [...linkMap.values()];
          nodePositions = new Float32Array(nodeOrder.length * 3);
          nodeSizes = new Float32Array(nodeOrder.length);
          nodeColors = new Float32Array(nodeOrder.length * 3);
          nodeOrder.forEach((node, index) => {
            nodePositions.set([node.x, node.y, node.z], index * 3);
            nodeSizes[index] = node.baseSize;
            color.set(colorFor(node.group));
            nodeColors.set([color.r, color.g, color.b], index * 3);
          });

          linePositions = new Float32Array(linkOrder.length * 6);
          lineColors = new Float32Array(linkOrder.length * 6);
          nodeGeometry.dispose();
          nodeGeometry = new THREE.BufferGeometry();
          nodeGeometry.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3));
          nodeGeometry.setAttribute('size', new THREE.BufferAttribute(nodeSizes, 1));
          nodeGeometry.setAttribute('acolor', new THREE.BufferAttribute(nodeColors, 3));
          nodePoints.geometry = nodeGeometry;

          lineGeometry.dispose();
          lineGeometry = new THREE.BufferGeometry();
          lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
          lineGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
          lineSegments.geometry = lineGeometry;
          cage.visible = core.visible = nodeOrder.length > 0;
        }

        const hierarchy: Record<string, number> = {
          State: 0, PucRule: 1, BenefitProgram: 1, Customer: 1, AuthorityRule: 2,
          Moratorium: 2, LocalAgency: 2, EligibilityCriterion: 2, AccountRecord: 2
        };

        function attachNode(link: GraphLink, now: number) {
          const source = nodeMap.get(link.source);
          const target = nodeMap.get(link.target);
          if (!source || !target) return;
          source.degree += 1;
          target.degree += 1;
          source.baseSize = 5 + Math.min(26, source.degree * 2);
          target.baseSize = 5 + Math.min(26, target.degree * 2);
          const sourceRank = hierarchy[source.group] ?? 2;
          const targetRank = hierarchy[target.group] ?? 2;
          const child = sourceRank > targetRank ? source : target;
          const parent = child === source ? target : source;
          const destination = offsetFrom({ x: parent.tx, y: parent.ty, z: parent.tz }, `${link.id}:${child.id}`, 25 + (hash(link.id) % 18));
          child.sx = child.x;
          child.sy = child.y;
          child.sz = child.z;
          child.tx = destination.x;
          child.ty = destination.y;
          child.tz = destination.z;
          child.moveStartedAt = now;
          child.moveDuration = 1050;
        }

        function consolidateGraph(now: number) {
          for (const node of nodeMap.values()) {
            const direction = sphericalPosition(`consolidated:${node.id}`, 1);
            const magnitude = Math.hypot(direction.x, direction.y, direction.z) || 1;
            const seed = hash(`radius:${node.id}`) % 1000;
            const [minimumRadius, maximumRadius] =
              node.group === 'State' ? [52, 74]
                : ['PucRule', 'AuthorityRule', 'BenefitProgram'].includes(node.group) ? [78, 135]
                  : node.group === 'Customer' ? [105, 178]
                    : [135, 218];
            const radius = minimumRadius + (seed / 1000) * (maximumRadius - minimumRadius);
            node.sx = node.x;
            node.sy = node.y;
            node.sz = node.z;
            node.tx = (direction.x / magnitude) * radius;
            node.ty = (direction.y / magnitude) * radius;
            node.tz = (direction.z / magnitude) * radius;
            node.moveStartedAt = now;
            node.moveDuration = 1900;
          }
          consolidated = true;
        }

        async function syncGraph() {
          if (syncing || disposed) return;
          syncing = true;
          try {
            const response = await fetch(`/api/graph/visualization${dense ? '?dense=1' : ''}`);
            if (!response.ok) throw new Error(`uplink ${response.status}`);
            const body = await response.json();
            const graph = body.graph;
            const now = performance.now();

            if (graph.nodes.length === 0 && nodeMap.size > 0) {
              nodeMap.clear();
              linkMap.clear();
              consolidated = false;
              consolidationDueAt = null;
              rebuildBuffers();
            }

            let changed = false;
            for (const raw of graph.nodes) {
              if (nodeMap.has(raw.id)) continue;
              const [title, meta] = nodeTitle(raw);
              const target = sphericalPosition(raw.id);
              nodeMap.set(raw.id, {
                id: raw.id, title, meta, group: raw.primaryLabel, degree: 0,
                x: target.x * 0.06, y: target.y * 0.06, z: target.z * 0.06,
                sx: target.x * 0.06, sy: target.y * 0.06, sz: target.z * 0.06,
                tx: target.x, ty: target.y, tz: target.z,
                createdAt: now, moveStartedAt: now, moveDuration: 1050, baseSize: 5
              });
              changed = true;
            }
            for (const raw of graph.links) {
              if (linkMap.has(raw.id) || !nodeMap.has(raw.source) || !nodeMap.has(raw.target)) continue;
              const link = { id: raw.id, source: raw.source, target: raw.target, type: raw.type, bornAt: now };
              linkMap.set(raw.id, link);
              attachNode(link, now);
              changed = true;
            }
            if (changed) rebuildBuffers();

            if (graph.summary?.discoveryStatus === 'complete' && nodeMap.size > 0 && !consolidated) {
              if (consolidationDueAt === null) consolidationDueAt = now + 900;
              if (now >= consolidationDueAt) consolidateGraph(now);
            }

            setCounts({ nodes: nodeMap.size, links: linkMap.size });
            setGroups([...new Set([...nodeMap.values()].map((node) => node.group))].slice(0, 9));
            setStatus('ready');
          } finally {
            syncing = false;
          }
        }

        await syncGraph();
        pollTimer = window.setInterval(() => syncGraph().catch((error) => {
          if (!disposed) {
            setStatus('error');
            setErrMsg(error.message || 'failed to load');
          }
        }), 240);

        let azimuth = 0;
        let elevation = 0.22;
        let radius = 340;
        let targetRadius = 340;
        let autoRotate = true;
        let dragging = false;
        let lastX = 0;
        let lastY = 0;
        let pointerX = -1;
        let pointerY = -1;
        let pickPending = false;
        let autoRotateTimer: number | undefined;
        const vector = new THREE.Vector3();
        const canvas = renderer.domElement;
        canvas.style.cursor = 'grab';

        const onPointerDown = (event: PointerEvent) => {
          dragging = true;
          autoRotate = false;
          lastX = event.clientX;
          lastY = event.clientY;
          canvas.style.cursor = 'grabbing';
        };
        const onPointerUp = () => {
          dragging = false;
          canvas.style.cursor = 'grab';
          window.clearTimeout(autoRotateTimer);
          autoRotateTimer = window.setTimeout(() => (autoRotate = true), 3500);
        };
        const onPointerMove = (event: PointerEvent) => {
          const bounds = host.getBoundingClientRect();
          if (dragging) {
            azimuth -= (event.clientX - lastX) * 0.005;
            elevation = Math.max(-1.35, Math.min(1.35, elevation + (event.clientY - lastY) * 0.005));
            lastX = event.clientX;
            lastY = event.clientY;
          }
          pointerX = event.clientX - bounds.left;
          pointerY = event.clientY - bounds.top;
          pickPending = true;
        };
        const onWheel = (event: WheelEvent) => {
          event.preventDefault();
          targetRadius = Math.max(120, Math.min(900, targetRadius + event.deltaY * 0.4));
        };
        canvas.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('wheel', onWheel, { passive: false });

        function updateTooltip() {
          let bestIndex = -1;
          let bestDistance = 400;
          for (let index = 0; index < nodeOrder.length; index += 1) {
            vector.set(
              nodePositions[index * 3],
              nodePositions[index * 3 + 1],
              nodePositions[index * 3 + 2]
            ).project(camera);
            if (vector.z > 1) continue;
            const x = (vector.x * 0.5 + 0.5) * width;
            const y = (-vector.y * 0.5 + 0.5) * height;
            const distance = (x - pointerX) ** 2 + (y - pointerY) ** 2;
            if (distance < bestDistance) {
              bestDistance = distance;
              bestIndex = index;
            }
          }
          const tip = tipRef.current;
          if (!tip) return;
          if (bestIndex < 0) {
            tip.style.opacity = '0';
            return;
          }
          const node = nodeOrder[bestIndex];
          tip.querySelector('.t')!.textContent = node.title || '(untitled)';
          tip.querySelector('.m')!.textContent = node.meta || '';
          tip.style.opacity = '1';
          tip.style.left = `${Math.min(width - 260, pointerX + 14)}px`;
          tip.style.top = `${pointerY + 12}px`;
        }

        function animate() {
          raf = requestAnimationFrame(animate);
          const now = performance.now();
          const indexById = new Map(nodeOrder.map((node, index) => [node.id, index]));
          nodeOrder.forEach((node, index) => {
            const moveProgress = ease(Math.min(1, (now - node.moveStartedAt) / node.moveDuration));
            const sizeProgress = ease(Math.min(1, (now - node.createdAt) / 1050));
            node.x = node.sx + (node.tx - node.sx) * moveProgress;
            node.y = node.sy + (node.ty - node.sy) * moveProgress;
            node.z = node.sz + (node.tz - node.sz) * moveProgress;
            nodePositions.set([node.x, node.y, node.z], index * 3);
            nodeSizes[index] = Math.max(0.1, node.baseSize * sizeProgress);
          });
          linkOrder.forEach((link, index) => {
            const sourceIndex = indexById.get(link.source);
            const targetIndex = indexById.get(link.target);
            if (sourceIndex === undefined || targetIndex === undefined) return;
            linePositions.set([
              nodePositions[sourceIndex * 3], nodePositions[sourceIndex * 3 + 1], nodePositions[sourceIndex * 3 + 2],
              nodePositions[targetIndex * 3], nodePositions[targetIndex * 3 + 1], nodePositions[targetIndex * 3 + 2]
            ], index * 6);
            const fade = ease(Math.min(1, (now - link.bornAt) / 900));
            color.set(colorFor(nodeOrder[targetIndex].group));
            lineColors.set([
              color.r * fade, color.g * fade, color.b * fade,
              color.r * fade, color.g * fade, color.b * fade
            ], index * 6);
          });
          if (nodeGeometry.attributes.position) {
            nodeGeometry.attributes.position.needsUpdate = true;
            nodeGeometry.attributes.size.needsUpdate = true;
          }
          if (lineGeometry.attributes.position) {
            lineGeometry.attributes.position.needsUpdate = true;
            lineGeometry.attributes.color.needsUpdate = true;
          }

          if (autoRotate && !dragging) azimuth += 0.0011;
          radius += (targetRadius - radius) * 0.06;
          camera.position.set(
            Math.cos(elevation) * Math.sin(azimuth) * radius,
            Math.sin(elevation) * radius,
            Math.cos(elevation) * Math.cos(azimuth) * radius
          );
          camera.lookAt(0, 0, 0);
          cage.rotation.y += 0.0016;
          cage.rotation.x += 0.0006;
          core.material.opacity = 0.5 + Math.sin(Date.now() / 400) * 0.08;
          if (pickPending) {
            pickPending = false;
            camera.updateMatrixWorld();
            updateTooltip();
          }
          renderer.render(scene, camera);
        }
        animate();

        resizeObserver = new ResizeObserver(() => {
          width = host.clientWidth;
          height = host.clientHeight;
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
          nodeMaterial.uniforms.hscale.value = height * 0.55;
        });
        resizeObserver.observe(host);

        (host as any).__cleanup = () => {
          cancelAnimationFrame(raf);
          window.clearInterval(pollTimer);
          window.clearTimeout(autoRotateTimer);
          canvas.removeEventListener('pointerdown', onPointerDown);
          window.removeEventListener('pointerup', onPointerUp);
          window.removeEventListener('pointermove', onPointerMove);
          canvas.removeEventListener('wheel', onWheel);
          resizeObserver?.disconnect();
          nodeGeometry.dispose();
          lineGeometry.dispose();
          renderer.dispose();
          if (canvas.parentElement === host) host.removeChild(canvas);
        };
      } catch (error: any) {
        if (!disposed) {
          setStatus('error');
          setErrMsg(error.message || 'failed to load');
        }
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
      {status === 'loading' && <div className="mesh-loading">◍ connecting graph…</div>}
      {status === 'error' && <div className="mesh-loading mesh-error">mesh uplink failed: {errMsg}</div>}
      {status === 'ready' && counts.nodes === 0 && (
        <div className="mesh-empty">
          <span>0</span>
          <strong>Context graph is empty</strong>
          <small>Run discovery agents to create the first node.</small>
        </div>
      )}
      {status === 'ready' && (
        <>
          <div className="mesh-counts">MESH <b>{counts.nodes.toLocaleString()}</b> nodes <span>·</span> <b>{counts.links.toLocaleString()}</b> links</div>
          <div className="mesh-legend">
            {groups.map((group) => (
              <span key={group}><i style={{ background: colorFor(group) }} />{group}</span>
            ))}
          </div>
        </>
      )}
      <div className="mesh-tip" ref={tipRef}><div className="t" /><div className="m" /></div>
    </div>
  );
}
