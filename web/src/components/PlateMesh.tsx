import { useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { geometry, type Segment } from "../lib/stl";

const GAP = 10;   // GridFlock's _segment_gap
const PALETTE = ["#60a5fa", "#f5a524", "#34d399", "#f472b6", "#a78bfa", "#fb7185", "#22d3ee", "#facc15", "#4ade80", "#c084fc"];

export interface PlateLayout {
  box: THREE.Box3;              // the assembled plate
  offset: THREE.Vector3;        // added to every part so that the assembled plate sits where wanted
}

// Where the parts go: assembled (GridFlock's gaps removed), moved so that the assembled plate's corner is at `minAt`
// (or centred), plus an exploded spacing
export function plateLayout(segs: Segment[], minAt: [number, number] | null): PlateLayout {
  const box = new THREE.Box3();
  for (const s of segs) {
    const d = new THREE.Vector3(-s.col * GAP, -s.row * GAP, 0);
    box.union(new THREE.Box3(s.min.clone().add(d), s.max.clone().add(d)));
  }
  const offset = box.isEmpty()
    ? new THREE.Vector3()
    : minAt
      ? new THREE.Vector3(minAt[0] - box.min.x, minAt[1] - box.min.y, -box.min.z)
      : new THREE.Vector3(-(box.min.x + box.max.x) / 2, -(box.min.y + box.max.y) / 2, -box.min.z);
  return { box: box.clone().translate(offset), offset };
}

function Part({ seg, color, target, labels, dim, onHover, hovered }: {
  seg: Segment;
  color: string;
  target: THREE.Vector3;
  labels: boolean;
  dim: boolean;
  onHover: (i: number | null) => void;
  hovered: boolean;
}) {
  const geo = useMemo(() => geometry(seg.pos), [seg]);
  const [pos] = useState(() => target.clone());
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    pos.lerp(target, 1 - Math.exp(-dt * 10));
    ref.current?.position.copy(pos);
  });
  const w = seg.max.x - seg.min.x, d = seg.max.y - seg.min.y;
  return (
    <mesh
      ref={ref}
      geometry={geo}
      position={pos}
      castShadow
      receiveShadow
      onPointerOver={(e) => (e.stopPropagation(), onHover(seg.index))}
      onPointerOut={() => onHover(null)}
    >
      <meshStandardMaterial
        color={color}
        roughness={0.55}
        metalness={0.05}
        emissive={hovered ? color : "#000000"}
        emissiveIntensity={hovered ? 0.25 : 0}
        transparent={dim}
        opacity={dim ? 0.55 : 1}
      />
      {(labels || hovered) && (
        <Html position={[(seg.min.x + seg.max.x) / 2, (seg.min.y + seg.max.y) / 2, seg.max.z + 2]} center zIndexRange={[20, 0]}>
          <div className={`seg-label ${hovered ? "hot" : ""}`}>
            <b>{seg.index + 1}</b>
            {hovered && <span>{w.toFixed(1)} × {d.toFixed(1)} mm</span>}
          </div>
        </Html>
      )}
    </mesh>
  );
}

export function PlateMesh({ segments, layout, explode = 0, colorParts = true, labels = false, baseColor, dim = false, hover: hoverable = true }: {
  segments: Segment[];
  layout: PlateLayout;
  explode?: number;
  colorParts?: boolean;
  labels?: boolean;
  baseColor: string;
  dim?: boolean;
  hover?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const onHover = (i: number | null) => hoverable && setHover(i);
  return (
    <group>
      {segments.map((s) => {
        const t = new THREE.Vector3(
          -s.col * GAP + s.col * explode * 28,
          -s.row * GAP + s.row * explode * 28,
          explode * 6 * ((s.col + s.row) % 2),
        ).add(layout.offset);
        return (
          <Part
            key={`${s.index}-${s.pos.length}`}
            seg={s}
            target={t}
            color={colorParts ? PALETTE[s.index % PALETTE.length] : baseColor}
            labels={labels}
            dim={dim}
            hovered={hover === s.index}
            onHover={onHover}
          />
        );
      })}
    </group>
  );
}
