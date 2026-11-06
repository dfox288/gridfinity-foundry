// Small pieces of the layout's 3D scene: the pointer-to-plate bridge, the grid lines and a frame around a bin
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { PITCH, type Grid } from "../lib/grid";

// Registers a function that turns screen coordinates into a point on the plate's top plane
export function PointerBridge({ z, onReady }: { z: number; onReady: (f: (x: number, y: number) => THREE.Vector3 | null) => void }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -z);
    onReady((cx, cy) => {
      const r = gl.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
      return ray.ray.intersectPlane(plane, new THREE.Vector3());
    });
  }, [camera, gl, z, onReady]);
  return null;
}

export function GridLines({ g, z, dark }: { g: Grid; z: number; dark: boolean }) {
  const geo = useMemo(() => {
    const pts: number[] = [];
    const xs = [0], ys = [0];
    g.traceX.forEach((t) => xs.push(xs[xs.length - 1] + t));
    g.traceY.forEach((t) => ys.push(ys[ys.length - 1] + t));
    for (const x of xs) pts.push(x * PITCH, 0, z, x * PITCH, ys[ys.length - 1] * PITCH, z);
    for (const y of ys) pts.push(0, y * PITCH, z, xs[xs.length - 1] * PITCH, y * PITCH, z);
    const b = new THREE.BufferGeometry();
    b.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return b;
  }, [g, z]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={dark ? "#64748b" : "#475569"} transparent opacity={0.35} />
    </lineSegments>
  );
}

export function SelectionFrame({ x, y, w, d, z, h, color = "#ffffff" }: { x: number; y: number; w: number; d: number; z: number; h: number; color?: string }) {
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w * PITCH + 2, d * PITCH + 2, h + 2)), [w, d, h]);
  return (
    <lineSegments geometry={geo} position={[(x + w / 2) * PITCH, (y + d / 2) * PITCH, z + h / 2]}>
      <lineBasicMaterial color={color} transparent opacity={0.9} />
    </lineSegments>
  );
}
