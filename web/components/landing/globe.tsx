"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";

// Brand accent and globe tones, matching --primary in globals.css.
const ACCENT = "#4f8dff";
const DOT = "#8fb0e8";

const CITIES: [string, number, number][] = [
  ["New York", 40.7, -74],
  ["London", 51.5, -0.1],
  ["Frankfurt", 50.1, 8.7],
  ["Lagos", 6.5, 3.4],
  ["Dubai", 25.2, 55.3],
  ["Mumbai", 19.1, 72.9],
  ["Singapore", 1.35, 103.8],
  ["Tokyo", 35.7, 139.7],
  ["Sydney", -33.9, 151.2],
  ["São Paulo", -23.5, -46.6],
  ["Mexico City", 19.4, -99.1],
  ["Nairobi", -1.3, 36.8],
];

// Every bill between two cities. `net: true` are the few that survive netting.
const ARCS: [number, number, boolean][] = [
  [0, 1, true],
  [1, 0, false],
  [1, 2, false],
  [2, 4, false],
  [4, 5, true],
  [5, 4, false],
  [5, 6, false],
  [6, 7, false],
  [7, 6, false],
  [7, 8, true],
  [9, 0, false],
  [0, 10, false],
  [10, 9, false],
  [3, 1, false],
  [11, 4, false],
  [2, 3, false],
  [8, 6, false],
  [9, 3, true],
];

function toVec(lat: number, lon: number, r = 1) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

/** Evenly spread dots over the sphere (Fibonacci lattice). */
function useDots(count: number) {
  return useMemo(() => {
    const positions = new Float32Array(count * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const rad = Math.sqrt(1 - y * y);
      const t = golden * i;
      positions.set([Math.cos(t) * rad, y, Math.sin(t) * rad], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [count]);
}

const atmosphere = {
  uniforms: { color: { value: new THREE.Color(ACCENT) } },
  vertexShader: `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform vec3 color;
    varying vec3 vNormal;
    void main() {
      float rim = pow(clamp(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 2.2);
      gl_FragColor = vec4(color, 1.0) * rim * 0.85;
    }`,
};

type ArcLine = { points: THREE.Vector3[]; net: boolean };

function Arcs({ progress }: { progress: React.RefObject<number> }) {
  const arcs = useMemo<ArcLine[]>(
    () =>
      ARCS.map(([a, b, net]) => {
        const va = toVec(CITIES[a]![1], CITIES[a]![2], 1.005);
        const vb = toVec(CITIES[b]![1], CITIES[b]![2], 1.005);
        const lift = 1 + va.distanceTo(vb) * 0.38;
        const mid = va.clone().add(vb).multiplyScalar(0.5).normalize().multiplyScalar(lift);
        // Return legs bow slightly differently so A→B and B→A read as two bills.
        mid.add(va.clone().cross(vb).normalize().multiplyScalar(a < b ? 0.04 : -0.04));
        return { points: new THREE.QuadraticBezierCurve3(va, mid, vb).getPoints(48), net };
      }),
    [],
  );
  const refs = useRef<({ material: THREE.Material & { dashOffset: number; opacity: number } } | null)[]>([]);

  useFrame((_, delta) => {
    const p = progress.current ?? 0;
    refs.current.forEach((line, i) => {
      if (!line) return;
      const m = line.material;
      m.dashOffset -= delta * (arcs[i]!.net ? 0.35 : 0.25);
      // Gross bills fade out as you scroll; net flows brighten.
      m.opacity = arcs[i]!.net ? 0.55 + 0.45 * p : 0.6 * (1 - p);
    });
  });

  return (
    <>
      {arcs.map((arc, i) => (
        <Line
          key={i}
          ref={(el) => {
            refs.current[i] = el as unknown as (typeof refs.current)[number];
          }}
          points={arc.points}
          color={arc.net ? ACCENT : DOT}
          lineWidth={arc.net ? 2 : 1.2}
          dashed
          dashSize={0.08}
          gapSize={0.04}
          transparent
          opacity={0.6}
          depthWrite={false}
        />
      ))}
    </>
  );
}

function Globe({ progress, reduce }: { progress: React.RefObject<number>; reduce: boolean }) {
  const group = useRef<THREE.Group>(null);
  const dots = useDots(4200);
  const cityPoints = useMemo(() => CITIES.map(([, lat, lon]) => toVec(lat, lon, 1.01)), []);

  useFrame((state, delta) => {
    if (!group.current) return;
    if (!reduce) group.current.rotation.y += delta * 0.05;
    // Ease toward the pointer for a little depth.
    const tx = 0.32 + state.pointer.y * 0.06;
    group.current.rotation.x += (tx - group.current.rotation.x) * 0.05;
  });

  return (
    <group ref={group} rotation={[0.32, -1.9, 0]}>
      {/* Solid core hides the far side of the dot shell. */}
      <mesh>
        <sphereGeometry args={[0.992, 64, 64]} />
        <meshBasicMaterial color="#0a1020" />
      </mesh>
      <points geometry={dots}>
        <pointsMaterial color={DOT} size={0.011} sizeAttenuation transparent opacity={0.55} depthWrite={false} />
      </points>
      {cityPoints.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.014, 12, 12]} />
          <meshBasicMaterial color={ACCENT} />
        </mesh>
      ))}
      <Arcs progress={progress} />
      <mesh scale={1.13}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial args={[atmosphere]} side={THREE.BackSide} blending={THREE.AdditiveBlending} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

/** The hero globe. Scroll progress through the hero (0→1) fades gross bills into net flows. */
export default function GlobeCanvas() {
  const progress = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    const onScroll = () => {
      progress.current = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.8)));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    // Stop rendering once the hero is off screen.
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting));
    if (box.current) io.observe(box.current);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, []);

  return (
    <div ref={box} className="h-full w-full" aria-hidden>
      <Canvas
        frameloop={visible ? "always" : "never"}
        dpr={[1, 2]}
        camera={{ position: [0, 0, 3.75], fov: 40 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <Globe progress={progress} reduce={reduce} />
      </Canvas>
    </div>
  );
}
