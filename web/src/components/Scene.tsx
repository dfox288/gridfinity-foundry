import { Canvas } from "@react-three/fiber";
import { CameraControls, ContactShadows, Environment, Grid, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { type ReactNode, type RefObject } from "react";

// Our models are Z-up (OpenSCAD); the camera and the controls follow
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

export type Controls = CameraControls;

export function fitView(c: Controls | null, box: THREE.Box3, view: "iso" | "top" | "front" = "iso", smooth = true) {
  if (!c || box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  // far enough that the box's bounding sphere fits the (vertical) field of view of 32 deg, with some margin
  const radius = Math.max(size.length() / 2, 40);
  const dist = (radius / Math.sin(THREE.MathUtils.degToRad(16))) * (view === "top" ? 1.0 : 0.95);
  const dir = view === "top" ? new THREE.Vector3(0, -0.0001, 1) : view === "front" ? new THREE.Vector3(0, -1, 0.3) : new THREE.Vector3(0.45, -1, 0.95);
  const pos = center.clone().add(dir.normalize().multiplyScalar(dist));
  c.setLookAt(pos.x, pos.y, pos.z, center.x, center.y, center.z, smooth);
}

export function Scene({
  children,
  theme,
  controlsRef,
  onPointerMissed,
  floorZ = 0,
}: {
  children: ReactNode;
  theme: "dark" | "light";
  controlsRef: RefObject<Controls>;
  onPointerMissed?: () => void;
  floorZ?: number;
}) {
  const dark = theme === "dark";
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 32, near: 1, far: 20000, position: [250, -500, 450] }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onPointerMissed={onPointerMissed}
    >
      <color attach="background" args={[dark ? "#0d1117" : "#eef1f5"]} />
      <fog attach="fog" args={[dark ? "#0d1117" : "#eef1f5", 1400, 4200]} />
      <hemisphereLight args={[dark ? "#c7d2fe" : "#ffffff", dark ? "#111827" : "#cbd5e1", dark ? 0.55 : 0.8]} />
      <directionalLight
        position={[300, -400, 700]}
        intensity={dark ? 1.6 : 1.9}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-600}
        shadow-camera-right={600}
        shadow-camera-top={600}
        shadow-camera-bottom={-600}
        shadow-camera-far={3000}
        shadow-bias={-0.0004}
      />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[0, 0, 600]} scale={[900, 900, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#bfdbfe" position={[-700, -300, 300]} rotation-y={Math.PI / 2} scale={[600, 300, 1]} />
        <Lightformer form="rect" intensity={1.0} color="#fde68a" position={[700, 300, 300]} rotation-y={-Math.PI / 2} scale={[600, 300, 1]} />
        <Lightformer form="ring" intensity={1.5} position={[0, -800, 200]} scale={300} />
      </Environment>
      <Grid
        position={[0, 0, floorZ - 0.05]}
        rotation={[Math.PI / 2, 0, 0]}
        args={[10, 10]}
        cellSize={10}
        sectionSize={42}
        cellThickness={0.5}
        sectionThickness={1}
        cellColor={dark ? "#1f2937" : "#d5dbe3"}
        sectionColor={dark ? "#334155" : "#b6c0cc"}
        fadeDistance={2600}
        fadeStrength={1.6}
        infiniteGrid
      />
      <ContactShadows position={[0, 0, floorZ - 0.02]} rotation={[Math.PI / 2, 0, 0]} scale={1600} blur={2.6} far={60} opacity={dark ? 0.55 : 0.35} resolution={1024} />
      <CameraControls ref={controlsRef} makeDefault smoothTime={0.28} maxDistance={6000} minDistance={30} />
      {children}
    </Canvas>
  );
}
