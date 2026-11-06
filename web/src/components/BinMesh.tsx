import { useEffect, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { geometry, parseStl } from "../lib/stl";

const cache = new Map<string, Promise<THREE.BufferGeometry>>();

export function loadBin(file: string): Promise<THREE.BufferGeometry> {
  let p = cache.get(file);
  if (!p) {
    p = fetch(`/files/bins/${file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${file}: ${r.status}`);
        return r.arrayBuffer();
      })
      .then((b) => geometry(parseStl(b)));
    cache.set(file, p);
  }
  return p;
}

export function useBinGeometry(file: string | null) {
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null);
  useEffect(() => {
    let live = true;
    setGeo(null);
    if (file) loadBin(file).then((g) => live && setGeo(g)).catch(() => {});
    return () => {
      live = false;
    };
  }, [file]);
  return geo;
}

// A bin standing on the plate. `at` is its centre on the plate top; it drops in when it first appears.
export function BinMesh({ file, at, rot, color, selected, hovered, ghost, valid = true, onPointerDown, onClick, onDoubleClick, onPointerOver, onPointerOut, onContextMenu }: {
  file: string;
  at: THREE.Vector3;
  rot: 0 | 1;
  color: string;
  selected?: boolean;
  hovered?: boolean;
  ghost?: boolean;
  valid?: boolean;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  onDoubleClick?: (e: ThreeEvent<MouseEvent>) => void;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
  onContextMenu?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const geo = useBinGeometry(file);
  const ref = useRef<THREE.Group>(null);
  const pos = useRef(at.clone().add(new THREE.Vector3(0, 0, ghost ? 0 : 60)));
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * (ghost ? 30 : 9));
    pos.current.lerp(at, k);
    ref.current?.position.copy(pos.current);
  });
  const c = ghost ? (valid ? "#4ade80" : "#f87171") : color;
  return (
    <group ref={ref} rotation={[0, 0, rot ? Math.PI / 2 : 0]} onPointerDown={onPointerDown} onClick={onClick} onDoubleClick={onDoubleClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} onContextMenu={onContextMenu}>
      {geo ? (
        <mesh geometry={geo} castShadow={!ghost} receiveShadow={!ghost}>
          <meshStandardMaterial
            color={c}
            roughness={0.5}
            metalness={0.04}
            transparent={ghost}
            opacity={ghost ? 0.45 : 1}
            depthWrite={!ghost}
            emissive={selected || hovered ? "#ffffff" : c}
            emissiveIntensity={selected ? 0.18 : hovered ? 0.09 : ghost ? 0.35 : 0}
          />
        </mesh>
      ) : null}
    </group>
  );
}
