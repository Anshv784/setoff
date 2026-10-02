"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import landDots from "@/lib/land-dots.json";
import { BILLS, CITIES, FLOWS, heroProgress, NETS, smooth } from "./story";

const ACCENT = new THREE.Color("#4f8dff");
const ICE = new THREE.Color("#a9c4f5");
const LAND_A = new THREE.Color("#3d63b8");
const LAND_B = new THREE.Color("#9db8ee");

function toVec(lat: number, lon: number, r = 1) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

// ------------------------------------------------------------------ continents

const landVertex = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixel;
  varying float vSeed;
  varying float vFacing;
  void main() {
    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFacing = dot(normalize(normalMatrix * position), vec3(0.0, 0.0, 1.0));
    gl_PointSize = uPixel * (0.9 + 0.5 * aSeed) * (3.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const landFragment = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uB;
  uniform float uTime;
  varying float vSeed;
  varying float vFacing;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float edge = smoothstep(0.5, 0.15, d);
    float twinkle = 0.75 + 0.25 * sin(uTime * 1.3 + vSeed * 40.0);
    // Brighter toward the viewer, fading at the limb for depth.
    float light = smoothstep(-0.1, 0.9, vFacing);
    vec3 col = mix(uA, uB, vSeed * 0.6 + light * 0.4);
    gl_FragColor = vec4(col, edge * twinkle * (0.25 + 0.75 * light));
  }`;

function Continents() {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => {
    const coords = landDots as number[];
    const n = coords.length / 2;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = toVec(coords[i * 2]!, coords[i * 2 + 1]!, 1.001);
      pos.set([v.x, v.y, v.z], i * 3);
      const x = Math.sin(i * 12.9898) * 43758.5453;
      seed[i] = x - Math.floor(x);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, []);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uPixel: { value: 3.2 * Math.min(2, window.devicePixelRatio || 1) }, uA: { value: LAND_A }, uB: { value: LAND_B } }),
    [],
  );
  useFrame((_, dt) => {
    if (mat.current) mat.current.uniforms.uTime!.value += dt;
  });
  return (
    <points geometry={geometry}>
      <shaderMaterial ref={mat} vertexShader={landVertex} fragmentShader={landFragment} uniforms={uniforms} transparent depthWrite={false} />
    </points>
  );
}

// ------------------------------------------------------------------- payments

const arcVertex = /* glsl */ `
  varying float vT;
  void main() {
    vT = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const arcFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uHead;
  uniform float uOpacity;
  uniform float uBase;
  varying float vT;
  void main() {
    // A comet: bright head travelling along the arc with a fading tail.
    float d = uHead - vT;
    float tail = d > 0.0 && d < 0.35 ? pow(1.0 - d / 0.35, 2.2) : 0.0;
    float head = smoothstep(0.03, 0.0, abs(d)) * 0.6;
    float a = (uBase + tail + head) * uOpacity;
    gl_FragColor = vec4(uColor * (1.0 + head), a);
  }`;

function arcCurve(a: number, b: number, bow: number) {
  const va = toVec(CITIES[a]!.lat, CITIES[a]!.lon, 1.004);
  const vb = toVec(CITIES[b]!.lat, CITIES[b]!.lon, 1.004);
  const lift = 1 + va.distanceTo(vb) * 0.42;
  const mid = va.clone().add(vb).multiplyScalar(0.5).normalize().multiplyScalar(lift);
  mid.add(va.clone().cross(vb).normalize().multiplyScalar(bow));
  return new THREE.QuadraticBezierCurve3(va, mid, vb);
}

type ArcSpec = { curve: THREE.Curve<THREE.Vector3>; kind: "bill" | "net"; speed: number; phase: number; radius: number };

function Payments({ reduce }: { reduce: boolean }) {
  const arcs = useMemo<ArcSpec[]>(() => {
    const bills = BILLS.map(([a, b, amt], i) => ({
      curve: arcCurve(a, b, a < b ? 0.05 : -0.05),
      kind: "bill" as const,
      speed: 0.22 + (i % 5) * 0.03,
      phase: (i * 0.137) % 1,
      radius: 0.0028 + amt * 0.00014,
    }));
    const nets = FLOWS.map(([a, b], i) => ({
      curve: arcCurve(a, b, 0),
      kind: "net" as const,
      speed: 0.3,
      phase: i * 0.33,
      radius: 0.0055,
    }));
    return [...bills, ...nets];
  }, []);
  const mats = useRef<(THREE.ShaderMaterial | null)[]>([]);
  const time = useRef(0);

  useFrame((_, dt) => {
    time.current += reduce ? 0 : dt;
    const p = heroProgress.current;
    const billsOut = 1 - smooth(0.32, 0.62, p);
    const netsIn = smooth(0.5, 0.78, p);
    arcs.forEach((arc, i) => {
      const m = mats.current[i];
      if (!m) return;
      m.uniforms.uHead!.value = reduce ? 0.85 : ((time.current * arc.speed + arc.phase) % 1.35);
      m.uniforms.uOpacity!.value = arc.kind === "bill" ? 0.9 * billsOut : netsIn;
    });
  });

  return (
    <>
      {arcs.map((arc, i) => (
        <mesh key={i}>
          <tubeGeometry args={[arc.curve, 64, arc.radius, 6, false]} />
          <shaderMaterial
            ref={(m) => {
              mats.current[i] = m;
            }}
            vertexShader={arcVertex}
            fragmentShader={arcFragment}
            uniforms={{
              uColor: { value: arc.kind === "net" ? ACCENT : ICE },
              uHead: { value: 0 },
              uOpacity: { value: arc.kind === "net" ? 0 : 0.9 },
              uBase: { value: arc.kind === "net" ? 0.35 : 0.2 },
            }}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </>
  );
}

// --------------------------------------------------------------------- cities

/** Soft radial glow texture for city halos and the settlement ripple. */
function useGlowTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.25, "rgba(255,255,255,0.45)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

function Cities() {
  const glow = useGlowTexture();
  const halos = useRef<(THREE.Sprite | null)[]>([]);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const points = useMemo(() => CITIES.map((c) => toVec(c.lat, c.lon, 1.006)), []);

  useFrame((state) => {
    const p = heroProgress.current;
    // The settlement pulse: one ripple out of every city as the cycle clears.
    const pulse = smooth(0.38, 0.5, p) * (1 - smooth(0.6, 0.75, p));
    const settled = smooth(0.55, 0.8, p);
    CITIES.forEach((_, i) => {
      const involved = NETS[i] !== 0;
      const h = halos.current[i];
      if (h) {
        const base = involved ? 0.11 + 0.05 * settled : 0.09 * (1 - settled * 0.5);
        h.scale.setScalar(base + 0.015 * Math.sin(state.clock.elapsedTime * 2 + i));
        (h.material as THREE.SpriteMaterial).opacity = involved ? 0.7 + 0.3 * settled : 0.7 - 0.35 * settled;
      }
      const r = rings.current[i];
      if (r) {
        r.scale.setScalar(0.015 + pulse * 0.09);
        (r.material as THREE.MeshBasicMaterial).opacity = pulse * (1 - pulse * 0.6);
      }
    });
  });

  return (
    <>
      {points.map((v, i) => {
        const involved = NETS[i] !== 0;
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), v.clone().normalize());
        return (
          <group key={i} position={v}>
            <mesh>
              <sphereGeometry args={[0.009, 12, 12]} />
              <meshBasicMaterial color={involved ? ACCENT : ICE} />
            </mesh>
            <sprite
              ref={(s) => {
                halos.current[i] = s;
              }}
            >
              <spriteMaterial map={glow} color={involved ? ACCENT : ICE} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
            </sprite>
            <mesh
              quaternion={q}
              ref={(m) => {
                rings.current[i] = m;
              }}
            >
              <ringGeometry args={[0.88, 1, 64]} />
              <meshBasicMaterial color={ACCENT} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------- globe

const atmosphere = {
  uniforms: { uColor: { value: ACCENT } },
  vertexShader: /* glsl */ `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    varying vec3 vNormal;
    void main() {
      float rim = pow(clamp(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 2.4);
      gl_FragColor = vec4(uColor, 1.0) * rim * 0.75;
    }`,
};

// Subtle inner shading so the sphere reads as a ball, not a disc.
const ocean = {
  vertexShader: /* glsl */ `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    varying vec3 vNormal;
    void main() {
      float f = dot(vNormal, normalize(vec3(-0.4, 0.5, 1.0)));
      vec3 deep = vec3(0.020, 0.035, 0.075);
      vec3 lit = vec3(0.045, 0.085, 0.17);
      gl_FragColor = vec4(mix(deep, lit, clamp(f, 0.0, 1.0)), 1.0);
    }`,
};

function Globe({ reduce }: { reduce: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame((state, dt) => {
    if (!group.current) return;
    if (!reduce) group.current.rotation.y += dt * 0.045;
    const tx = 0.38 + state.pointer.y * 0.05;
    group.current.rotation.x += (tx - group.current.rotation.x) * 0.04;
  });
  return (
    // Start facing Europe/Africa/Asia, where most of the bills are.
    <group ref={group} rotation={[0.38, -2.25, 0]}>
      <mesh>
        <sphereGeometry args={[0.995, 96, 96]} />
        <shaderMaterial {...ocean} />
      </mesh>
      <Continents />
      <Cities />
      <Payments reduce={reduce} />
      <mesh scale={1.12}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial args={[atmosphere]} side={THREE.BackSide} blending={THREE.AdditiveBlending} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

export default function GlobeCanvas() {
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting));
    if (box.current) io.observe(box.current);
    return () => {
      mq.removeEventListener("change", sync);
      io.disconnect();
    };
  }, []);

  return (
    <div ref={box} className="h-full w-full" aria-hidden>
      <Canvas
        frameloop={visible ? "always" : "never"}
        dpr={[1, 2]}
        camera={{ position: [0, 0, 3.95], fov: 40 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <Globe reduce={reduce} />
      </Canvas>
    </div>
  );
}
