"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  useTexture,
  useGLTF,
  Lightformer,
} from "@react-three/drei";
import { flavorTextures } from "@/utils/data";
import { useState, useRef, useCallback, useEffect } from "react";
import * as THREE from "three";

useGLTF.preload("/Soda-can.gltf");

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// ─── Electron API bridge type (only present when running as desktop app) ─────
interface ElectronAPI {
  savePng: (dataUrl: string, defaultName: string) => Promise<{ success: boolean; filePath?: string }>;
  openImage: (target: "label" | "sticker") => Promise<{ dataUrl: string; target: "label" | "sticker" } | null>;
  openImagesBatch: () => Promise<{ dataUrl: string; name: string }[]>;
  savePngsBatch: (items: { dataUrl: string; name: string }[]) => Promise<{ success: boolean; saved?: number }>;
  getHistory: () => Promise<{ images: string[]; stickers: string[] }>;
  setHistory: (data: { images: string[]; stickers: string[] }) => Promise<boolean>;
}
declare global { interface Window { electronAPI?: ElectronAPI } }

type CanSize = "355ml" | "475ml";
type MaterialPreset = "matte" | "satin" | "glossy" | "chrome" | "custom";

interface CanSizeSpec {
  scale: [number, number, number];
  labelSizeText: string;
}

interface LightingSettings {
  exposure: number;
  envIntensity: number;
  ambientIntensity: number;
  fillLightIntensity: number;
  fillLightPosition: [number, number, number];
  rimLightIntensity: number;
  rimLightPosition: [number, number, number];
  directionalIntensity: number;
  directionalPosition: [number, number, number];
  otherRotation: number;
  otherStrength: number;
}

interface BarSettings {
  enabled: boolean;
  color: string;
  intensity: number;
  width: number;
  height: number;
  distance: number;
  rotation: number;
  y: number;
}

interface MetalPartSettings {
  color: string;
  brightness: number;
  roughness: number;
  emissiveIntensity: number;
  castShadow: boolean;
  receiveShadow: boolean;
  envMapIntensity: number;
}
interface MetalSettings {
  top: MetalPartSettings;
  bottom: MetalPartSettings;
}

const canSizeSpecs: Record<CanSize, CanSizeSpec> = {
  "355ml": {
    scale: [2.5, 2.5, 2.5],
    labelSizeText: "414 × 220 mm",
  },
  "475ml": {
    scale: [2.6, 3.0, 2.6],
    labelSizeText: "414 × 280 mm",
  },
};

// ─── Fit-mode texture hook ─────────────────────────────────────────────────────

// 8× 스케일로 캔버스 텍스처 해상도를 충분히 확보
const LABEL_SCALE = 8;
const LABEL_DIMS: Record<CanSize, { w: number; h: number }> = {
  "355ml": { w: 414 * LABEL_SCALE, h: 220 * LABEL_SCALE },
  "475ml": { w: 414 * LABEL_SCALE, h: 280 * LABEL_SCALE },
};

function useFitTexture(
  customSrc: string | undefined,
  defaultSrc: string,
  canSize: CanSize,
  imageScale: number,
  imageOffsetX: number,
  imageOffsetY: number,
  bgColor: string,
  imageRotation: number,
  imageInvert: boolean,
): THREE.Texture {
  const { w: labelW, h: labelH } = LABEL_DIMS[canSize];
  const [canvasTexture, setCanvasTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!customSrc) {
      setCanvasTexture(prev => { prev?.dispose(); return null; });
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = labelW;
      canvas.height = labelH;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, labelW, labelH);
      const scale = Math.min(labelW / img.naturalWidth, labelH / img.naturalHeight) * imageScale;
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;
      const drawX = (labelW - drawW) / 2 + imageOffsetX * labelW;
      const drawY = (labelH - drawH) / 2 + imageOffsetY * labelH;
      if (imageInvert) ctx.filter = "invert(1)";
      if (imageRotation !== 0) {
        ctx.save();
        ctx.translate(drawX + drawW / 2, drawY + drawH / 2);
        ctx.rotate((imageRotation * Math.PI) / 180);
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
      } else {
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
      }
      ctx.filter = "none";
      const tex = new THREE.CanvasTexture(canvas);
      tex.flipY = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      setCanvasTexture(prev => { prev?.dispose(); return tex; });
    };
    img.src = customSrc;
    return () => { cancelled = true; };
  }, [customSrc, labelW, labelH, imageScale, imageOffsetX, imageOffsetY, bgColor, imageRotation, imageInvert]);

  const fallback = useTexture(customSrc || defaultSrc);
  fallback.flipY = false;
  return (customSrc && canvasTexture) ? canvasTexture : fallback;
}

// ─── Sticker texture hook (transparent bg, preserves alpha) ───────────────────

function useStickerTexture(
  stickerSrc: string | undefined,
  canSize: CanSize,
  stickerScale: number,
  stickerOffsetX: number,
  stickerOffsetY: number,
  shadowIntensity: number,
  stickerRotation: number,
): THREE.Texture | null {
  const { w: labelW, h: labelH } = LABEL_DIMS[canSize];
  const [canvasTexture, setCanvasTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!stickerSrc) {
      setCanvasTexture(prev => { prev?.dispose(); return null; });
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = labelW;
      canvas.height = labelH;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, labelW, labelH);
      const scale = Math.min(labelW / img.naturalWidth, labelH / img.naturalHeight) * stickerScale;
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;
      const drawX = (labelW - drawW) / 2 + stickerOffsetX * labelW;
      const drawY = (labelH - drawH) / 2 + stickerOffsetY * labelH;
      if (shadowIntensity > 0) {
        ctx.shadowColor = `rgba(0,0,0,${Math.min(shadowIntensity * 0.75, 0.85)})`;
        ctx.shadowBlur = shadowIntensity * labelW * 0.028;
        ctx.shadowOffsetX = shadowIntensity * labelW * 0.006;
        ctx.shadowOffsetY = shadowIntensity * labelH * 0.01;
      }
      if (stickerRotation !== 0) {
        ctx.save();
        ctx.translate(drawX + drawW / 2, drawY + drawH / 2);
        ctx.rotate((stickerRotation * Math.PI) / 180);
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
      } else {
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
      }
      ctx.shadowColor = "transparent";
      const tex = new THREE.CanvasTexture(canvas);
      tex.flipY = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      setCanvasTexture(prev => { prev?.dispose(); return tex; });
    };
    img.src = stickerSrc;
    return () => { cancelled = true; };
  }, [stickerSrc, labelW, labelH, stickerScale, stickerOffsetX, stickerOffsetY, shadowIntensity, stickerRotation]);

  return canvasTexture;
}

// ─── 3D Components ─────────────────────────────────────────────────────────────

// Module-level reusable objects for clip-plane updates — avoids GC pressure each frame
const _cpNormMat = new THREE.Matrix3();
const _cpVec = new THREE.Vector3();
const _cpNorm = new THREE.Vector3();

function EditableSodaCan({
  customTexture,
  rotation,
  isAutoRotating,
  isRecording,
  recordingProgress,
  canSize,
  labelRoughness,
  metalSettings,
  imageScale,
  imageOffsetX,
  imageOffsetY,
  imageRotation,
  imageInvert,
  bgColor,
  stickerImage,
  stickerScale,
  stickerOffsetX,
  stickerOffsetY,
  stickerRotation,
  stickerRoughness,
  stickerMetalness,
  stickerShadowIntensity,
  rotationSpeed,
  rotationResetRef,
  canDragRef,
}: {
  customTexture?: string;
  rotation: [number, number, number];
  isAutoRotating: boolean;
  isRecording: boolean;
  recordingProgress: number;
  canSize: CanSize;
  labelRoughness: number;
  metalSettings: MetalSettings;
  imageScale: number;
  imageOffsetX: number;
  imageOffsetY: number;
  imageRotation: number;
  imageInvert: boolean;
  bgColor: string;
  stickerImage?: string;
  stickerScale: number;
  stickerOffsetX: number;
  stickerOffsetY: number;
  stickerRotation: number;
  stickerRoughness: number;
  stickerMetalness: number;
  stickerShadowIntensity: number;
  rotationSpeed: number;
  rotationResetRef: React.MutableRefObject<boolean>;
  canDragRef: React.MutableRefObject<{ y: number; x: number }>;
}) {
  const { nodes } = useGLTF("/Soda-can.gltf");

  const defaultBySize =
    canSize === "475ml" ? `${BASE}/labels/475d.png` : `${BASE}/labels/355d.png`;
  const texture = useFitTexture(customTexture, defaultBySize, canSize, imageScale, imageOffsetX, imageOffsetY, bgColor, imageRotation, imageInvert);
  const stickerTexture = useStickerTexture(stickerImage, canSize, stickerScale, stickerOffsetX, stickerOffsetY, stickerShadowIntensity, stickerRotation);

  const groupRef = useRef<THREE.Group>(null);
  // Stable plane objects mutated each frame to follow the can's world rotation
  const labelClipTop = useRef(new THREE.Plane());
  const labelClipBottom = useRef(new THREE.Plane());
  const labelClipPlanes = useRef([labelClipTop.current, labelClipBottom.current]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    if (rotationResetRef.current) {
      groupRef.current.rotation.set(0, 0, 0);
      canDragRef.current = { y: 0, x: 0 };
      rotationResetRef.current = false;
    }
    if (isRecording) {
      groupRef.current.rotation.y = (recordingProgress / 100) * Math.PI * 2;
    } else if (isAutoRotating) {
      groupRef.current.rotation.y += delta * 0.5 * rotationSpeed;
    } else {
      // Drag rotation + slider offset — camera stays fixed so lighting stays fixed
      groupRef.current.rotation.y = canDragRef.current.y + rotation[1];
      groupRef.current.rotation.x = canDragRef.current.x + rotation[0];
      groupRef.current.rotation.z = rotation[2];
    }
    // Update label clip planes to follow the can's current world rotation.
    // updateWorldMatrix ensures matrixWorld reflects the rotation just set above.
    groupRef.current.updateWorldMatrix(true, false);
    const wm = groupRef.current.matrixWorld;
    _cpNormMat.getNormalMatrix(wm);
    labelClipTop.current.setFromNormalAndCoplanarPoint(
      _cpNorm.set(0, -1, 0).applyMatrix3(_cpNormMat).normalize(),
      _cpVec.set(0, bodyMaxY * sy, 0).applyMatrix4(wm)
    );
    labelClipBottom.current.setFromNormalAndCoplanarPoint(
      _cpNorm.set(0, 1, 0).applyMatrix3(_cpNormMat).normalize(),
      _cpVec.set(0, bodyMinY * sy, 0).applyMatrix4(wm)
    );
  });

  const metalGeo = (nodes.cylinder as THREE.Mesh).geometry as THREE.BufferGeometry;
  const labelGeo = (nodes.cylinder_1 as THREE.Mesh).geometry as THREE.BufferGeometry;

  if (!labelGeo.boundingBox) labelGeo.computeBoundingBox();
  const bodyMinY = labelGeo.boundingBox!.min.y;
  const bodyMaxY = labelGeo.boundingBox!.max.y;
  const bodyHeight = bodyMaxY - bodyMinY;

  const uniformScale = 2.0;
  // sy: 475ml body는 label 비율(280/220)로만 늘림 — 림/뚜껑은 스케일 없이 위치만 이동
  const sy = canSize === "475ml" ? 280 / 220 : 1.0;

  // 정확한 오프셋: bodyMaxY / |bodyMinY| 직접 사용 (비대칭 지오메트리 대응)
  const SEAM = bodyHeight * 0.0001;
  const topOffsetLocal = bodyMaxY * (sy - 1);
  const bottomOffsetLocal = (-bodyMinY) * (sy - 1);

  const bodyMinWorld = bodyMinY * sy * uniformScale;
  const bodyMaxWorld = bodyMaxY * sy * uniformScale;
  const seamWorld = SEAM * uniformScale;

  const planeKeepYGreaterEq = (y: number) =>
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
  const planeKeepYLessEq = (y: number) =>
    new THREE.Plane(new THREE.Vector3(0, -1, 0), y);

  const topPlane = planeKeepYGreaterEq(bodyMaxWorld - seamWorld);
  const bottomPlane = planeKeepYLessEq(bodyMinWorld + seamWorld);
  const bodyPlanes = [
    planeKeepYGreaterEq(bodyMinWorld - seamWorld),
    planeKeepYLessEq(bodyMaxWorld + seamWorld),
  ];

  const colorWithBrightness = (hex: string, b: number) => {
    const c = new THREE.Color(hex);
    c.multiplyScalar(b);
    return c;
  };
  const makeMetalMat = (planes: THREE.Plane[], part: "top" | "bottom" | "body") => {
    const cfg =
      part === "top"
        ? metalSettings.top
        : part === "bottom"
        ? metalSettings.bottom
        : {
            color: "#bbbbbb",
            brightness: (metalSettings.top.brightness + metalSettings.bottom.brightness) / 2,
            roughness: (metalSettings.top.roughness + metalSettings.bottom.roughness) / 2,
            emissiveIntensity: (metalSettings.top.emissiveIntensity + metalSettings.bottom.emissiveIntensity) / 2,
            castShadow: false,
            receiveShadow: true,
            envMapIntensity: (metalSettings.top.envMapIntensity + metalSettings.bottom.envMapIntensity) / 2,
          };
    return new THREE.MeshStandardMaterial({
      roughness: cfg.roughness,
      metalness: 1,
      color: colorWithBrightness(cfg.color, cfg.brightness),
      emissive: new THREE.Color("#ffffff"),
      emissiveIntensity: cfg.emissiveIntensity,
      envMapIntensity: cfg.envMapIntensity,
      clippingPlanes: planes,
      clipShadows: true,
    });
  };

  const topMetalMat = makeMetalMat([topPlane], "top");
  const bodyMetalMat = makeMetalMat(bodyPlanes, "body");
  const bottomMetalMat = makeMetalMat([bottomPlane], "bottom");

  return (
    <group ref={groupRef} dispose={null} scale={[uniformScale, uniformScale, uniformScale]}>
      <mesh castShadow={metalSettings.top.castShadow} receiveShadow={metalSettings.top.receiveShadow} geometry={metalGeo} material={topMetalMat} position-y={topOffsetLocal} />
      <mesh castShadow receiveShadow geometry={metalGeo} material={bodyMetalMat} scale={[1, sy, 1]} />
      <mesh castShadow={metalSettings.bottom.castShadow} receiveShadow={metalSettings.bottom.receiveShadow} geometry={metalGeo} material={bottomMetalMat} position-y={-bottomOffsetLocal} />
      <mesh castShadow receiveShadow geometry={labelGeo} scale={[1, sy, 1]}>
        <meshStandardMaterial roughness={labelRoughness} metalness={0.7} map={texture} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} clippingPlanes={labelClipPlanes.current} clipShadows />
      </mesh>
      {stickerTexture && (
        <mesh castShadow receiveShadow geometry={labelGeo} scale={[1, sy, 1]}>
          <meshStandardMaterial roughness={stickerRoughness} metalness={stickerMetalness} map={stickerTexture} transparent alphaTest={0.01} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} clippingPlanes={labelClipPlanes.current} clipShadows />
        </mesh>
      )}
      <mesh castShadow receiveShadow geometry={(nodes.Tab as THREE.Mesh).geometry} position-y={topOffsetLocal}>
        <meshStandardMaterial roughness={metalSettings.top.roughness} metalness={1} color={colorWithBrightness(metalSettings.top.color, metalSettings.top.brightness)} emissive={"#ffffff"} emissiveIntensity={metalSettings.top.emissiveIntensity} envMapIntensity={metalSettings.top.envMapIntensity} />
      </mesh>
    </group>
  );
}

function CustomLighting({ settings }: { settings: LightingSettings }) {
  const k = settings.otherStrength;
  return (
    <group rotation-y={settings.otherRotation}>
      <ambientLight intensity={settings.ambientIntensity * k} />
      <directionalLight position={settings.directionalPosition} intensity={settings.directionalIntensity * k} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-bias={-0.0005} shadow-normalBias={0.02} shadow-radius={4} />
      <pointLight position={settings.fillLightPosition} intensity={settings.fillLightIntensity * k} color="#ffffff" />
      <pointLight position={settings.rimLightPosition} intensity={settings.rimLightIntensity * k} color="#ffffff" />
    </group>
  );
}

function SceneExposure({ exposure }: { exposure: number }) {
  const { gl } = useThree();
  useFrame(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = exposure;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
  });
  return null;
}

function CameraPerspective({ fov }: { fov: number }) {
  const { camera } = useThree();
  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    const baseFov = 25;
    const baseZ = 4;
    const z = (baseZ * Math.tan(THREE.MathUtils.degToRad(baseFov / 2))) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
    persp.fov = fov;
    persp.position.set(0, 0, z);
    persp.updateProjectionMatrix();
  }, [camera, fov]);
  return null;
}

function RotatingEnvironment({ barRotation, otherRotation, bar }: { barRotation: number; otherRotation: number; intensity?: number; bar: BarSettings }) {
  if (bar.enabled) {
    return (
      <Environment resolution={1024}>
        <group rotation-y={barRotation}>
          <Lightformer color={bar.color} intensity={bar.intensity} position={[0, bar.y, bar.distance]} scale={[bar.width, bar.height, 1]} />
        </group>
      </Environment>
    );
  }
  return (
    <group rotation={[0, otherRotation, 0]}>
      <Environment preset="studio" />
    </group>
  );
}

function CustomOrbitControls({ controlsRef }: { controlsRef: React.RefObject<any> }) {
  // Rotation disabled — can rotates instead of camera, so lighting stays fixed
  return (
    <OrbitControls ref={controlsRef} enablePan={false} enableZoom enableRotate={false} minDistance={2} maxDistance={12} />
  );
}

// Rotates the CAN via pointer drag so the camera (and lights) stay fixed.
// Includes inertia (smooth spin-down) and optional LEVEL spring (x returns to 0).
function CanDragRotator({
  canDragRef,
  dragVelocityRef,
  relightModeRef,
  levelRef,
}: {
  canDragRef: React.MutableRefObject<{ y: number; x: number }>;
  dragVelocityRef: React.MutableRefObject<{ y: number; x: number }>;
  relightModeRef: React.MutableRefObject<boolean>;
  levelRef: React.MutableRefObject<boolean>;
}) {
  const { gl } = useThree();
  const pointerRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const el = gl.domElement;
    const onDown = (e: PointerEvent) => {
      if (relightModeRef.current) return;
      pointerRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      isDraggingRef.current = true;
      dragVelocityRef.current = { y: 0, x: 0 };
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!pointerRef.current || relightModeRef.current) return;
      const now = performance.now();
      const dt = Math.max((now - pointerRef.current.t) / 1000, 0.001); // seconds
      const dx = e.clientX - pointerRef.current.x;
      const dy = e.clientY - pointerRef.current.y;
      // Velocity in rad/sec, capped to avoid runaway spin
      const MAX_VY = 1.8; // horizontal spin cap
      const MAX_VX = 1.2; // vertical tilt cap
      dragVelocityRef.current.y = Math.max(-MAX_VY, Math.min(MAX_VY, (dx * 0.01) / dt));
      dragVelocityRef.current.x = Math.max(-MAX_VX, Math.min(MAX_VX, (dy * 0.008) / dt));
      canDragRef.current.y += dx * 0.01;
      canDragRef.current.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, canDragRef.current.x + dy * 0.008));
      pointerRef.current = { x: e.clientX, y: e.clientY, t: now };
    };
    const onUp = () => { pointerRef.current = null; isDraggingRef.current = false; };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerleave", onUp);
    };
  }, [gl.domElement, canDragRef, dragVelocityRef, relightModeRef]);

  useFrame((_, delta) => {
    if (isDraggingRef.current) return;

    // Inertia: velocity decays to ~5% over 1 second
    const decay = Math.pow(0.05, delta);
    dragVelocityRef.current.y *= decay;
    dragVelocityRef.current.x *= decay;

    // Apply horizontal inertia (Y rotation)
    if (Math.abs(dragVelocityRef.current.y) > 0.004) {
      canDragRef.current.y += dragVelocityRef.current.y * delta;
    } else {
      dragVelocityRef.current.y = 0;
    }

    // Vertical: LEVEL spring or inertia
    if (levelRef.current) {
      // Spring back to 0 over ~1 second
      dragVelocityRef.current.x = 0;
      canDragRef.current.x *= Math.pow(0.002, delta);
      if (Math.abs(canDragRef.current.x) < 0.002) canDragRef.current.x = 0;
    } else {
      if (Math.abs(dragVelocityRef.current.x) > 0.004) {
        canDragRef.current.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, canDragRef.current.x + dragVelocityRef.current.x * delta));
      } else {
        dragVelocityRef.current.x = 0;
      }
    }
  });

  return null;
}

// ─── Canvas Exporter ──────────────────────────────────────────────────────────
// Captures exactly what the user sees: same camera, same rotation, same FOV.
// Just scales the buffer up to exportH=2000 at the same viewport aspect ratio,
// renders once via the normal pipeline, then crops + scales to 1200px height.

function CanvasExporter({ captureRef, canSize }: {
  captureRef: React.MutableRefObject<(() => void) | null>;
  canSize: string;
}) {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    captureRef.current = () => {
      // ── 1920×1920 square, zoom-independent (reset to canonical camera pos) ──
      const OUT = 1920;

      const savedPixelRatio = gl.getPixelRatio();
      const savedCssW = gl.domElement.width / savedPixelRatio;
      const savedCssH = gl.domElement.height / savedPixelRatio;

      const persp = camera as THREE.PerspectiveCamera;
      const savedAspect = persp.aspect;
      const savedPos = persp.position.clone();

      // Reset zoom: put camera at the canonical distance for this FOV
      const baseFov = 25, baseZ = 4;
      const canonZ = (baseZ * Math.tan(THREE.MathUtils.degToRad(baseFov / 2))) /
                     Math.tan(THREE.MathUtils.degToRad(persp.fov / 2));
      persp.position.set(0, 0, canonZ);
      persp.aspect = 1; // square
      persp.updateProjectionMatrix();

      gl.setPixelRatio(1);
      gl.setSize(OUT, OUT, false);
      gl.render(scene, camera);
      const dataUrl = gl.domElement.toDataURL("image/png");

      // ── Restore ─────────────────────────────────────────────────────────────
      gl.setPixelRatio(savedPixelRatio);
      gl.setSize(savedCssW, savedCssH, false);
      persp.aspect = savedAspect;
      persp.position.copy(savedPos);
      persp.updateProjectionMatrix();

      // ── Download (native dialog in Electron, browser download on web) ───────
      if (window.electronAPI) {
        window.electronAPI.savePng(dataUrl, `can-${canSize}.png`);
      } else {
        const a = document.createElement("a");
        a.download = `can-${canSize}.png`;
        a.href = dataUrl;
        a.click();
      }
    };
    return () => { captureRef.current = null; };
  }, [gl, scene, camera, canSize, captureRef]);

  return null;
}

// ─── UI Helper ────────────────────────────────────────────────────────────────

function SliderRow({ label, value, min, max, step, onChange, display }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: (v: number) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState("");

  const commit = (raw: string) => {
    const n = parseFloat(raw);
    if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <span className="sr-label font-mono text-[11px]">{label}</span>
        {editing ? (
          <input
            type="number" autoFocus
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={e => commit(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") commit(editVal); if (e.key === "Escape") setEditing(false); }}
            className="sr-value font-mono text-[11px] tabular-nums bg-transparent outline-none border-b border-white/25 w-16 text-right"
            style={{ MozAppearance: "textfield" } as React.CSSProperties}
          />
        ) : (
          <span
            className="sr-value font-mono text-[11px] tabular-nums cursor-text select-none"
            title="Click to edit"
            onClick={() => { setEditVal(String(value)); setEditing(true); }}
          >{display(value)}</span>
        )}
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} className="w-full" />
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

interface HistoryState {
  customImage: string; imageScale: number; imageOffsetX: number; imageOffsetY: number;
  imageRotation: number; imageInvert: boolean; bgColor: string;
  stickerImage: string; stickerScale: number; stickerOffsetX: number; stickerOffsetY: number;
  stickerRotation: number; stickerShadowIntensity: number; stickerRoughness: number; stickerMetalness: number;
  canSize: CanSize; labelRoughness: number; materialPreset: MaterialPreset; metalSettings: MetalSettings;
  rotation: [number, number, number]; cameraFov: number; lightingSettings: LightingSettings; bar: BarSettings;
}

const DEFAULT_METAL: MetalSettings = {
  top: { color: "#c7c7c7", brightness: 1.35, roughness: 0.48, emissiveIntensity: 0.01, castShadow: false, receiveShadow: true, envMapIntensity: 1.4 },
  bottom: { color: "#b8b8b8", brightness: 1.4, roughness: 0.46, emissiveIntensity: 0.01, castShadow: false, receiveShadow: true, envMapIntensity: 1.5 },
};
const DEFAULT_LIGHTING: LightingSettings = {
  exposure: 1.43, envIntensity: 2.32, ambientIntensity: 2.7,
  fillLightIntensity: 4.3, fillLightPosition: [5, 0, 5],
  rimLightIntensity: 5.6, rimLightPosition: [-5, 0, 5],
  directionalIntensity: 4.2, directionalPosition: [1000, 500, 500],
  otherRotation: (130 * Math.PI) / 180, otherStrength: 1.61,
};
const DEFAULT_BAR: BarSettings = {
  enabled: true, color: "#fafafa", intensity: 1.1,
  width: 10.1, height: 11.1, distance: 3.6,
  rotation: Math.PI * 2, y: -1.91,
};

export default function Page() {
  const [selectedFlavor, setSelectedFlavor] = useState<"none" | keyof typeof flavorTextures>("none");
  const [rotation, setRotation] = useState<[number, number, number]>([0, 0, 0]);
  const [customImage, setCustomImage] = useState<string>("");
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [canSize, setCanSize] = useState<CanSize>("355ml");
  const [labelRoughness, setLabelRoughness] = useState<number>(0.21);
  const [metalSettings, setMetalSettings] = useState<MetalSettings>(DEFAULT_METAL);
  const [lightingSettings, setLightingSettings] = useState<LightingSettings>(DEFAULT_LIGHTING);
  const [bar, setBar] = useState<BarSettings>(DEFAULT_BAR);
  const [cameraFov, setCameraFov] = useState<number>(10);

  // New state
  const [materialPreset, setMaterialPreset] = useState<MaterialPreset>("satin");
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCanvasDragOver, setIsCanvasDragOver] = useState(false);
  const [lightingAdvancedOpen, setLightingAdvancedOpen] = useState(false);
  const [openSections, setOpenSections] = useState({ can: true, image: true, sticker: true, material: true, lighting: true, controls: true });
  const [stickerImage, setStickerImage] = useState<string>("");
  const [stickerScale, setStickerScale] = useState(1.0);
  const [stickerOffsetX, setStickerOffsetX] = useState(0);
  const [stickerOffsetY, setStickerOffsetY] = useState(0);
  const [stickerRoughness, setStickerRoughness] = useState(0.8);
  const [stickerMetalness, setStickerMetalness] = useState(0.0);
  const [stickerShadowIntensity, setStickerShadowIntensity] = useState(0.3);
  const [rotationSpeed, setRotationSpeed] = useState(1.0);
  const [pasteTarget, setPasteTarget] = useState<"label" | "sticker">("label");
  const [recentImages, setRecentImages] = useState<string[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [imageScale, setImageScale] = useState(1.0);
  const [imageOffsetX, setImageOffsetX] = useState(0);
  const [imageOffsetY, setImageOffsetY] = useState(0);
  const [imageRotation, setImageRotation] = useState(0);
  const [imageInvert, setImageInvert] = useState(false);
  const [bgColor, setBgColor] = useState("#c6c6c8");
  const [stickerRotation, setStickerRotation] = useState(0);
  const [recentStickers, setRecentStickers] = useState<string[]>([]);
  const canDragRef = useRef({ y: 0, x: 0 });
  const dragVelocityRef = useRef({ y: 0, x: 0 });
  const relightModeRef = useRef(false);
  const [levelEnabled, setLevelEnabled] = useState(true);
  const levelRef = useRef(true);

  const [isPreparingRecord, setIsPreparingRecord] = useState(false);
  const [relightMode, setRelightMode] = useState(false);
  const [isRelightDragging, setIsRelightDragging] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const presetInputRef = useRef<HTMLInputElement>(null);
  const controlsRef = useRef<any>(null);
  const captureRef = useRef<(() => void) | null>(null);
  const rotationResetRef = useRef(false);
  const recordingAbortRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // ── Load persistent history from Electron on first mount ──────────────────
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.getHistory().then((hist) => {
      if (hist.images.length > 0) setRecentImages(hist.images);
      if (hist.stickers.length > 0) setRecentStickers(hist.stickers);
    });
  }, []); // eslint-disable-line

  // ── Sync history to Electron whenever it changes ───────────────────────────
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.setHistory({ images: recentImages, stickers: recentStickers });
  }, [recentImages, recentStickers]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const addImage = useCallback((dataUrl: string) => {
    setCustomImage(dataUrl);
    setRecentImages(prev => {
      const filtered = prev.filter(img => img !== dataUrl);
      return [dataUrl, ...filtered].slice(0, 6);
    });
  }, []);

  const readFileAsImage = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (ev) => { if (ev.target?.result) addImage(ev.target.result as string); };
    reader.readAsDataURL(file);
  }, [addImage]);

  // Paste support — routes to label or sticker based on pasteTarget
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) break;
          if (pasteTarget === "sticker") {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const src = ev.target?.result as string;
              if (!src) return;
              setStickerImage(src);
              setRecentStickers(prev => [src, ...prev.filter(s => s !== src)].slice(0, 6));
            };
            reader.readAsDataURL(file);
          } else {
            readFileAsImage(file);
          }
          break;
        }
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [readFileAsImage, pasteTarget]);

  const handleResetView = () => { rotationResetRef.current = true; setRotation([0, 0, 0]); canDragRef.current = { y: 0, x: 0 }; dragVelocityRef.current = { y: 0, x: 0 }; };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFileAsImage(file);
  };

  // Electron-aware upload trigger (uses native dialog when available)
  const handleUploadLabelClick = useCallback(() => {
    if (window.electronAPI) {
      window.electronAPI.openImage("label").then((result) => {
        if (result) addImage(result.dataUrl);
      });
    } else {
      fileInputRef.current?.click();
    }
  }, [addImage]);

  const handleUploadStickerClick = useCallback(() => {
    if (window.electronAPI) {
      window.electronAPI.openImage("sticker").then((result) => {
        if (result) {
          setStickerImage(result.dataUrl);
          setRecentStickers(prev => [result.dataUrl, ...prev.filter(s => s !== result.dataUrl)].slice(0, 6));
        }
      });
    } else {
      stickerInputRef.current?.click();
    }
  }, []);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFileAsImage(file);
  };

  const handleCanvasDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsCanvasDragOver(true); };
  const handleCanvasDragLeave = () => setIsCanvasDragOver(false);
  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsCanvasDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFileAsImage(file);
  };

  const handleRelightMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isRelightDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const dx = e.clientX - rect.left - cx;
    const dy = e.clientY - rect.top - cy;
    const angle = ((Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2));
    const normY = (e.clientY - rect.top - cy) / (cy * 0.75);
    setBar(prev => ({
      ...prev,
      enabled: true,
      rotation: angle,
      y: Math.max(-3, Math.min(3, normY * 2.5)),
    }));
  }, [isRelightDragging]);

  const updateLightingSetting = (key: keyof LightingSettings, value: any) => {
    setLightingSettings((prev) => ({ ...prev, [key]: value }));
  };

  const updateMetalSetting = (part: "top" | "bottom", key: keyof MetalPartSettings, value: string | number | boolean) => {
    setMetalSettings((prev) => ({ ...prev, [part]: { ...prev[part], [key]: value as any } }));
  };

  const metalPresetValues: Record<Exclude<MaterialPreset, "custom">, Partial<MetalPartSettings>> = {
    matte:  { roughness: 0.85, brightness: 1.1,  emissiveIntensity: 0.0,  envMapIntensity: 0.8 },
    satin:  { roughness: 0.48, brightness: 1.35, emissiveIntensity: 0.01, envMapIntensity: 1.4 },
    glossy: { roughness: 0.15, brightness: 1.6,  emissiveIntensity: 0.02, envMapIntensity: 2.2 },
    chrome: { roughness: 0.04, brightness: 1.9,  emissiveIntensity: 0.05, envMapIntensity: 3.0 },
  };
  const labelRoughnessPresets: Record<Exclude<MaterialPreset, "custom">, number> = {
    matte: 0.85, satin: 0.21, glossy: 0.05, chrome: 0.02,
  };

  const applyMetalPreset = (preset: MaterialPreset) => {
    setMaterialPreset(preset);
    if (preset === "custom") return;
    const p = metalPresetValues[preset];
    setMetalSettings(prev => ({ top: { ...prev.top, ...p }, bottom: { ...prev.bottom, ...p } }));
    setLabelRoughness(labelRoughnessPresets[preset]);
  };

  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  const resetToDefault = () => {
    setCustomImage("");
    setRotation([0, 0, 0]);
    setIsAutoRotating(true);
    setIsRecording(false);
    setRecordingProgress(0);
    setLabelRoughness(0.21);
    setCanSize("355ml");
    setMetalSettings(DEFAULT_METAL);
    setLightingSettings(DEFAULT_LIGHTING);
    setBar(DEFAULT_BAR);
    controlsRef.current?.reset();
    setCameraFov(10);
    setSelectedFlavor("none");
    setMaterialPreset("satin");
  };

  // Keep relightModeRef in sync so CanDragRotator sees latest value without stale closure
  useEffect(() => { relightModeRef.current = relightMode; }, [relightMode, relightModeRef]);
  useEffect(() => { levelRef.current = levelEnabled; }, [levelEnabled]);

  // ── Undo / Redo ──────────────────────────────────────────────────────────────
  const historyRef = useRef<HistoryState[]>([]);
  const historyIdxRef = useRef(-1);
  const skipHistoryRef = useRef(false);
  const historyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const buildSnapshot = (): HistoryState => ({
    customImage, imageScale, imageOffsetX, imageOffsetY, imageRotation, imageInvert, bgColor,
    stickerImage, stickerScale, stickerOffsetX, stickerOffsetY, stickerRotation,
    stickerShadowIntensity, stickerRoughness, stickerMetalness,
    canSize, labelRoughness, materialPreset, metalSettings,
    rotation, cameraFov, lightingSettings, bar,
  });

  const applySnapshot = useCallback((s: HistoryState) => {
    skipHistoryRef.current = true;
    setCustomImage(s.customImage); setImageScale(s.imageScale); setImageOffsetX(s.imageOffsetX);
    setImageOffsetY(s.imageOffsetY); setImageRotation(s.imageRotation); setImageInvert(s.imageInvert);
    setBgColor(s.bgColor); setStickerImage(s.stickerImage); setStickerScale(s.stickerScale);
    setStickerOffsetX(s.stickerOffsetX); setStickerOffsetY(s.stickerOffsetY); setStickerRotation(s.stickerRotation);
    setStickerShadowIntensity(s.stickerShadowIntensity); setStickerRoughness(s.stickerRoughness);
    setStickerMetalness(s.stickerMetalness); setCanSize(s.canSize); setLabelRoughness(s.labelRoughness);
    setMaterialPreset(s.materialPreset); setMetalSettings(s.metalSettings); setRotation(s.rotation);
    setCameraFov(s.cameraFov); setLightingSettings(s.lightingSettings); setBar(s.bar);
  }, []); // eslint-disable-line

  // Capture initial snapshot on mount
  useEffect(() => {
    const initial = buildSnapshot();
    historyRef.current = [initial];
    historyIdxRef.current = 0;
  }, []); // eslint-disable-line

  // Debounced snapshot: fires 400ms after the last state change
  useEffect(() => {
    if (historyIdxRef.current < 0) return; // not yet initialized
    const snapshot = buildSnapshot(); // capture at THIS render's values
    if (historyDebounceRef.current) clearTimeout(historyDebounceRef.current);
    historyDebounceRef.current = setTimeout(() => {
      if (skipHistoryRef.current) { skipHistoryRef.current = false; return; }
      const trimmed = historyRef.current.slice(0, historyIdxRef.current + 1);
      const next = [...trimmed, snapshot].slice(-50);
      historyRef.current = next;
      historyIdxRef.current = next.length - 1;
      setCanUndo(historyIdxRef.current > 0);
      setCanRedo(false);
    }, 400);
  }, [customImage, imageScale, imageOffsetX, imageOffsetY, imageRotation, imageInvert, bgColor, // eslint-disable-line
      stickerImage, stickerScale, stickerOffsetX, stickerOffsetY, stickerRotation,
      stickerShadowIntensity, stickerRoughness, stickerMetalness,
      canSize, labelRoughness, materialPreset, metalSettings, rotation, cameraFov, lightingSettings, bar]);

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    applySnapshot(historyRef.current[historyIdxRef.current]);
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(true);
  }, [applySnapshot]);

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    applySnapshot(historyRef.current[historyIdxRef.current]);
    setCanUndo(true);
    setCanRedo(historyIdxRef.current < historyRef.current.length - 1);
  }, [applySnapshot]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== "z") return;
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  // ── Remove background (flood-fill from corners) ─────────────────────────────
  const removeBackground = useCallback((src: string, target: "image" | "sticker") => {
    const img = new Image();
    img.onload = () => {
      const W = img.width, H = img.height;
      const cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const imd = ctx.getImageData(0, 0, W, H);
      const d = imd.data;
      const bg = [d[0], d[1], d[2]];
      const tol = 40;
      const dist = (i: number) => {
        const dr = d[i] - bg[0], dg = d[i + 1] - bg[1], db = d[i + 2] - bg[2];
        return Math.sqrt(dr * dr + dg * dg + db * db);
      };
      const visited = new Uint8Array(W * H);
      const q: number[] = [0, W - 1, (H - 1) * W, (H - 1) * W + W - 1];
      while (q.length) {
        const p = q.pop()!;
        if (visited[p]) continue;
        visited[p] = 1;
        if (dist(p * 4) > tol) continue;
        d[p * 4 + 3] = 0;
        const x = p % W, y = Math.floor(p / W);
        if (x > 0) q.push(p - 1);
        if (x < W - 1) q.push(p + 1);
        if (y > 0) q.push(p - W);
        if (y < H - 1) q.push(p + W);
      }
      ctx.putImageData(imd, 0, 0);
      const result = cv.toDataURL("image/png");
      if (target === "sticker") {
        setStickerImage(result);
        setRecentStickers(prev => [result, ...prev.filter(s => s !== result)].slice(0, 6));
      } else {
        addImage(result);
      }
    };
    img.src = src;
  }, [addImage]);

  // ── Preset JSON ────────────────────────────────────────────────────────────
  type AppSettings = {
    version: 1;
    canSize: CanSize;
    labelRoughness: number;
    cameraFov: number;
    metalSettings: MetalSettings;
    lightingSettings: LightingSettings;
    bar: BarSettings;
    rotation: [number, number, number];
    isAutoRotating: boolean;
  };

  const buildSettings = (): AppSettings => ({ version: 1 as const, canSize, labelRoughness, cameraFov, metalSettings, lightingSettings, bar, rotation, isAutoRotating });

  const saveSettingsToJson = () => {
    const blob = new Blob([JSON.stringify(buildSettings(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `can-editor-preset.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const applySettings = (s: Partial<AppSettings>) => {
    if (s.canSize) setCanSize(s.canSize);
    if (typeof s.labelRoughness === "number") setLabelRoughness(s.labelRoughness);
    if (typeof s.cameraFov === "number") setCameraFov(s.cameraFov);
    if (s.rotation && Array.isArray(s.rotation) && s.rotation.length === 3)
      setRotation([Number(s.rotation[0]), Number(s.rotation[1]), Number(s.rotation[2])] as [number, number, number]);
    if (typeof s.isAutoRotating === "boolean") setIsAutoRotating(s.isAutoRotating);
    if (s.metalSettings) setMetalSettings(prev => ({ top: { ...prev.top, ...(s.metalSettings as MetalSettings).top }, bottom: { ...prev.bottom, ...(s.metalSettings as MetalSettings).bottom } }));
    if (s.lightingSettings) setLightingSettings(prev => ({ ...prev, ...(s.lightingSettings as LightingSettings) }));
    if (s.bar) setBar(prev => ({ ...prev, ...(s.bar as BarSettings) }));
  };


  const onLoadPresetClick = () => presetInputRef.current?.click();
  const onPresetFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result || "{}"));
        if (json && (json.version === 1 || json.version === undefined)) {
          applySettings(json);
        }
      } catch (err) { console.error(err); }
      finally { e.target.value = ""; }
    };
    reader.readAsText(file);
  };

  const saveToPNG = () => { captureRef.current?.(); };

  const handleStickerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      if (!src) return;
      setStickerImage(src);
      setRecentStickers(prev => [src, ...prev.filter(s => s !== src)].slice(0, 6));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const cancelRecording = useCallback(() => {
    recordingAbortRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
    setIsPreparingRecord(false);
    setRecordingProgress(0);
  }, []);

  const startVideoRecording = useCallback(() => {
    const src = document.querySelector("canvas") as HTMLCanvasElement | null;
    if (!src) return;

    // Step 1: snap to front, stop auto-rotation
    setIsAutoRotating(false);
    setRotation([0, 0, 0]);
    setIsPreparingRecord(true);
    recordingAbortRef.current = false;

    // Step 2: short delay so the snap renders, then start recording
    setTimeout(() => {
      if (recordingAbortRef.current) {
        setIsPreparingRecord(false);
        return;
      }

      setIsPreparingRecord(false);
      setIsRecording(true);
      setRecordingProgress(0);

      const stream = src.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
      mediaRecorderRef.current = recorder;
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (ev) => { if (ev.data.size > 0) chunks.push(ev.data); };
      recorder.onstop = () => {
        if (recordingAbortRef.current) return; // cancelled — skip download
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `can-rotation-${canSize}.webm`; a.click();
        URL.revokeObjectURL(url);
        setIsRecording(false);
        setRecordingProgress(0);
        mediaRecorderRef.current = null;
      };

      recorder.start();
      const duration = 6000;
      const start = performance.now();
      const tick = () => {
        if (recordingAbortRef.current) return;
        const elapsed = performance.now() - start;
        const progress = Math.min(elapsed / duration, 1);
        setRecordingProgress(progress * 100);
        if (progress < 1) { requestAnimationFrame(tick); }
        else { recorder.stop(); }
      };
      requestAnimationFrame(tick);
    }, 350);
  }, [canSize]);

  // ── Shared style tokens ────────────────────────────────────────────────────
  const d = isDarkMode;
  const pillBase = "px-3 py-1.5 rounded-full font-mono text-[10px] uppercase tracking-wider border transition-all duration-150 cursor-pointer";
  const pillInactive = d ? "border-white/[0.15] text-white/45 hover:border-white/30 hover:text-white/70" : "border-black/[0.15] text-black/50 hover:border-black/30 hover:text-black/70";
  const pillActive = "border-blue-400/70 bg-blue-400/[0.18] text-white";
  const inputBase = d
    ? "bg-white/[0.05] border border-white/[0.1] rounded text-white/70 font-mono text-[11px] px-2 py-1 outline-none focus:border-white/25 transition-colors w-full"
    : "bg-black/[0.05] border border-black/[0.1] rounded text-black/65 font-mono text-[11px] px-2 py-1 outline-none focus:border-black/25 transition-colors w-full";
  const sectionBtn = `w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${d ? "hover:bg-white/[0.025]" : "hover:bg-black/[0.025]"}`;
  const sectionTitle = `font-mono text-[10px] uppercase tracking-[0.18em] ${d ? "text-white/40" : "text-black/40"}`;
  const chevronCls = `text-[14px] leading-none ${d ? "text-white/30" : "text-black/35"}`;
  const divider = <div className={`mx-4 border-t ${d ? "border-white/[0.07]" : "border-black/[0.07]"}`} />;
  const subLabel = `font-mono text-[10px] ${d ? "text-white/25" : "text-black/30"} uppercase tracking-wider`;
  const subLabelSm = `font-mono text-[9px] ${d ? "text-white/25" : "text-black/30"} uppercase tracking-wider`;
  const infoCard = `flex items-center justify-between px-3 py-2 rounded-lg ${d ? "bg-white/[0.03] border border-white/[0.06]" : "bg-black/[0.03] border border-black/[0.06]"}`;
  const dropZoneIdle = d ? "border-white/[0.12] hover:border-white/25 bg-white/[0.02] hover:bg-white/[0.035]" : "border-black/[0.12] hover:border-black/25 bg-black/[0.02] hover:bg-black/[0.035]";
  const removeBtn = d
    ? "w-full py-1.5 font-mono text-[10px] text-white/25 uppercase tracking-wider border border-white/[0.07] rounded-lg hover:text-white/45 hover:border-white/[0.18] transition-all"
    : "w-full py-1.5 font-mono text-[10px] text-black/30 uppercase tracking-wider border border-black/[0.07] rounded-lg hover:text-black/50 hover:border-black/[0.18] transition-all";
  const resetBtnCls = d
    ? "w-full py-2 font-mono text-[10px] uppercase tracking-wider border border-white/[0.08] text-white/20 hover:text-red-400/60 hover:border-red-400/25 transition-all duration-150"
    : "w-full py-2 font-mono text-[10px] uppercase tracking-wider border border-black/[0.08] text-black/25 hover:text-red-500/60 hover:border-red-500/25 transition-all duration-150";

  // ── Canvas texture ─────────────────────────────────────────────────────────
  const selectedTexture = selectedFlavor === "none" ? undefined : flavorTextures[selectedFlavor];
  const defaultBySize = canSize === "475ml" ? `${BASE}/labels/475d.png` : `${BASE}/labels/355d.png`;
  const appliedTexture = customImage || selectedTexture || defaultBySize;

  return (
    <div className="h-screen relative overflow-hidden" style={{ background: d ? "#000" : "#f0f0f0" }}>

      {/* ── Desktop App Download Banner (web only) ── */}
      {typeof window !== "undefined" && !window.electronAPI && (
        <div className="absolute top-3 left-3 z-50 flex items-center gap-2">
          <a
            href="https://github.com/frognation/CanEditor_Original/releases/latest/download/Spirit-Can-Editor-arm64.dmg"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-mono uppercase tracking-wider transition-opacity hover:opacity-75"
            style={{ background: d ? "rgba(20,20,20,0.85)" : "rgba(240,240,240,0.92)", color: d ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)", border: d ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.12)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", textDecoration: "none" }}
          >
            ↓ Desktop App
          </a>
          <a
            href="https://github.com/frognation/CanEditor_Original/releases/latest/download/Spirit-Can-Editor-x64.dmg"
            className="flex items-center px-2 py-1.5 rounded-xl text-[10px] font-mono uppercase tracking-wider transition-opacity hover:opacity-75"
            style={{ background: d ? "rgba(20,20,20,0.70)" : "rgba(240,240,240,0.75)", color: d ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)", border: d ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", textDecoration: "none" }}
          >
            Intel
          </a>
        </div>
      )}

      {/* ── 3D Canvas ── */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ right: "272px", background: d ? "#000" : "#ebebeb" }}
        onDragOver={handleCanvasDragOver}
        onDragLeave={handleCanvasDragLeave}
        onDrop={handleCanvasDrop}
      >
        {/* ── Relight overlay — intercepts mouse when relightMode is active ── */}
        {relightMode && (
          <div
            className="absolute inset-0 z-10"
            style={{ cursor: isRelightDragging ? "grabbing" : "crosshair" }}
            onMouseDown={() => setIsRelightDragging(true)}
            onMouseUp={() => setIsRelightDragging(false)}
            onMouseLeave={() => setIsRelightDragging(false)}
            onMouseMove={handleRelightMove}
          >
            {/* Light position indicator */}
            <div
              className="absolute pointer-events-none rounded-full"
              style={{
                left: `calc(50% + ${Math.sin(bar.rotation) * 90}px - 8px)`,
                top: `calc(50% - ${Math.cos(bar.rotation) * 55}px + ${bar.y * 15}px - 8px)`,
                width: 16, height: 16,
                background: bar.color || "#fafafa",
                border: "2px solid rgba(255,255,255,0.6)",
                boxShadow: "0 0 14px 5px rgba(255,255,255,0.18)",
              }}
            />
            <div
              className="absolute bottom-20 left-1/2 -translate-x-1/2 pointer-events-none font-mono text-[10px] uppercase tracking-widest px-4 py-1.5 rounded-full"
              style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.09)" }}
            >
              drag to relight
            </div>
          </div>
        )}

        {isCanvasDragOver && (
          <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center" style={{ background: "rgba(74,158,255,0.06)", border: "2px dashed rgba(74,158,255,0.35)" }}>
            <span className="font-mono text-[12px] text-blue-400/70 uppercase tracking-widest">Drop image</span>
          </div>
        )}
        <Canvas camera={{ position: [0, 0, 4], fov: 25 }} shadows style={{ background: "transparent" }} gl={{ preserveDrawingBuffer: true, alpha: true, localClippingEnabled: true }}>
          <SceneExposure exposure={lightingSettings.exposure} />
          <CameraPerspective fov={cameraFov} />
          <CustomLighting settings={lightingSettings} />
          <EditableSodaCan
            customTexture={appliedTexture} rotation={rotation}
            isAutoRotating={isAutoRotating} isRecording={isRecording} recordingProgress={recordingProgress}
            canSize={canSize} labelRoughness={labelRoughness} metalSettings={metalSettings}
            imageScale={imageScale} imageOffsetX={imageOffsetX} imageOffsetY={imageOffsetY}
            imageRotation={imageRotation} imageInvert={imageInvert} bgColor={bgColor}
            stickerImage={stickerImage || undefined}
            stickerScale={stickerScale} stickerOffsetX={stickerOffsetX} stickerOffsetY={stickerOffsetY}
            stickerRotation={stickerRotation}
            stickerRoughness={stickerRoughness} stickerMetalness={stickerMetalness} stickerShadowIntensity={stickerShadowIntensity}
            rotationSpeed={rotationSpeed} rotationResetRef={rotationResetRef} canDragRef={canDragRef}
          />
          <CustomOrbitControls controlsRef={controlsRef} />
          <CanDragRotator canDragRef={canDragRef} dragVelocityRef={dragVelocityRef} relightModeRef={relightModeRef} levelRef={levelRef} />
          <RotatingEnvironment barRotation={bar.rotation} otherRotation={lightingSettings.otherRotation} intensity={lightingSettings.envIntensity} bar={bar} />
          <CanvasExporter captureRef={captureRef} canSize={canSize} />
        </Canvas>

        {/* ── Bottom Center HUD ── */}
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-3 py-2 rounded-2xl"
          style={{ background: d ? "rgba(12,12,12,0.82)" : "rgba(238,238,238,0.90)", border: d ? "1px solid rgba(255,255,255,0.13)" : "1px solid rgba(0,0,0,0.13)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}>
          {/* Undo */}
          <button onClick={undo} disabled={!canUndo || isRecording} title="Undo (⌘Z)"
            className={`w-7 h-7 rounded-lg flex items-center justify-center text-[15px] transition-all duration-150 ${!canUndo || isRecording ? "opacity-20 cursor-not-allowed" : "hover:opacity-80"}`}
            style={{ color: d ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)" }}>↺</button>
          {/* Redo */}
          <button onClick={redo} disabled={!canRedo || isRecording} title="Redo (⌘⇧Z)"
            className={`w-7 h-7 rounded-lg flex items-center justify-center text-[15px] transition-all duration-150 ${!canRedo || isRecording ? "opacity-20 cursor-not-allowed" : "hover:opacity-80"}`}
            style={{ color: d ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)" }}>↻</button>
          <div className="w-px h-5 mx-0.5" style={{ background: d ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }} />
          {/* Reset view */}
          <button onClick={handleResetView} title="Reset to front" disabled={isRecording}
            className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-[13px] transition-all duration-150 ${isRecording ? "opacity-30 cursor-not-allowed" : ""}`}
            style={{ color: d ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)" }}>⟳</button>
          {/* Play / Pause */}
          <button onClick={() => setIsAutoRotating(v => !v)} disabled={isRecording}
            className={`px-2.5 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-wider border transition-all duration-150 ${isRecording ? "opacity-30 cursor-not-allowed" : ""} ${isAutoRotating && !isRecording ? "border-blue-400/50 bg-blue-400/[0.14] text-blue-300/80" : ""}`}
            style={!isAutoRotating && !isRecording ? { border: d ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(0,0,0,0.14)", color: d ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)" } : {}}>
            {isAutoRotating ? "⏸" : "▶"}
          </button>
          {/* Speed slider */}
          <div className="flex items-center gap-1.5 px-1">
            <input type="range" min={0.2} max={3} step={0.1} value={rotationSpeed} onChange={e => setRotationSpeed(parseFloat(e.target.value))} className="w-16 h-0.5 accent-blue-400" />
            <span className="font-mono text-[9px] w-7 tabular-nums" style={{ color: d ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.35)" }}>{rotationSpeed.toFixed(1)}×</span>
          </div>
          {/* Divider */}
          <div className="w-px h-5 mx-0.5" style={{ background: d ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }} />
          {/* Level — spring return to vertical center */}
          <button
            onClick={() => setLevelEnabled(v => !v)}
            title="Level — auto-returns can to upright after vertical tilt"
            className={`px-2.5 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-wider border transition-all duration-150 ${levelEnabled ? "border-emerald-400/55 bg-emerald-400/[0.10] text-emerald-300/85" : ""}`}
            style={!levelEnabled ? { border: d ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(0,0,0,0.14)", color: d ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)" } : {}}
          >Level</button>
          {/* Divider */}
          <div className="w-px h-5 mx-0.5" style={{ background: d ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }} />
          {/* Relight mode */}
          <button
            onClick={() => setRelightMode(v => !v)}
            disabled={isRecording}
            title="Relight — drag on canvas to move light"
            className={`px-2.5 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-wider border transition-all duration-150 ${isRecording ? "opacity-30 cursor-not-allowed" : ""} ${relightMode ? "border-amber-400/55 bg-amber-400/[0.12] text-amber-300/85" : ""}`}
            style={!relightMode ? { border: d ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(0,0,0,0.14)", color: d ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)" } : {}}
          >◉</button>
          {/* PNG export */}
          <button onClick={saveToPNG} disabled={isRecording || isPreparingRecord}
            className={`px-2.5 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-wider border transition-all duration-150 ${isRecording || isPreparingRecord ? "opacity-30 cursor-not-allowed" : ""}`}
            style={{ border: d ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(0,0,0,0.14)", color: d ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)" }}>
            PNG
          </button>
          {/* Video recording */}
          {!isRecording && !isPreparingRecord ? (
            <button onClick={startVideoRecording}
              className="px-2.5 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-wider border transition-all duration-150"
              style={{ border: d ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(0,0,0,0.14)", color: d ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)" }}>
              360°
            </button>
          ) : (
            <button onClick={cancelRecording}
              className="px-2.5 py-1.5 rounded-lg font-mono text-[10px] tracking-wider border transition-all duration-150"
              style={{ border: "1px solid rgba(168,85,247,0.45)", background: "rgba(168,85,247,0.1)", color: "rgba(192,132,252,0.85)" }}>
              {isPreparingRecord ? "…  ✕" : `${Math.round(recordingProgress)}%  ✕`}
            </button>
          )}
        </div>
      </div>

      {/* ── Right Sidebar ── */}
      <div
        className="absolute top-0 right-0 h-full overflow-y-auto flex flex-col"
        style={{ width: "272px", background: d ? "rgba(7,7,7,0.97)" : "rgba(242,242,242,0.98)", borderLeft: d ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.08)" }}
      >
        {/* Header */}
        <div className="px-4 pt-5 pb-4">
          <div className={`font-mono text-[12px] uppercase tracking-[0.22em] ${d ? "text-white" : "text-black/75"}`}>Spirit Can Editor</div>
          <div className={`font-mono text-[10px] tracking-[0.12em] mt-1 ${d ? "text-white/25" : "text-black/30"}`}>2.0</div>
        </div>

        {divider}

        {/* ── CAN ── */}
        <div>
          <button className={sectionBtn} onClick={() => toggleSection("can")}>
            <span className={sectionTitle}>Can</span>
            <span className={chevronCls}>{openSections.can ? "▾" : "▸"}</span>
          </button>
          {openSections.can && (
            <div className="px-4 pb-4">
              <div className="flex gap-1.5">
                {(["355ml", "475ml"] as CanSize[]).map((size) => (
                  <button key={size} onClick={() => setCanSize(size)} className={`flex-1 py-2.5 px-2 rounded-lg border transition-all duration-150 text-left font-mono ${canSize === size ? pillActive : pillInactive}`} style={{ borderRadius: "8px" }}>
                    <div className="text-[11px] uppercase tracking-wider">{size}</div>
                    <div className="text-[9px] opacity-40 mt-0.5 normal-case tracking-normal font-normal">{canSizeSpecs[size].labelSizeText}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {divider}

        {/* ── IMAGE ── */}
        <div>
          <button className={sectionBtn} onClick={() => { toggleSection("image"); setPasteTarget("label"); }}>
            <div className="flex items-center gap-2">
              <span className={sectionTitle}>Image</span>
              {pasteTarget === "label" && <span className="font-mono text-[8px] px-1.5 py-0.5 rounded" style={{ background: d ? "rgba(74,158,255,0.15)" : "rgba(74,158,255,0.1)", color: "rgba(74,158,255,0.8)", border: "1px solid rgba(74,158,255,0.22)" }}>⌘V</span>}
            </div>
            <span className={chevronCls}>{openSections.image ? "▾" : "▸"}</span>
          </button>
          {openSections.image && (
            <div className="px-4 pb-4 space-y-2">
              <div
                onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                onClick={handleUploadLabelClick}
                className={`flex flex-col items-center justify-center gap-1.5 py-7 rounded-lg border cursor-pointer transition-all duration-150 ${
                  isDragOver ? "border-blue-400/60 bg-blue-400/[0.07]"
                  : customImage ? "border-green-400/40 bg-green-400/[0.05]"
                  : dropZoneIdle
                }`}
              >
                <div className={`font-mono text-[11px] uppercase tracking-wider ${customImage ? "text-green-500/70" : d ? "text-white/35" : "text-black/40"}`}>
                  {isDragOver ? "Drop image" : customImage ? "✓  Image loaded" : "Drop or click to upload"}
                </div>
                <div className={`font-mono text-[9px] uppercase ${d ? "text-white/20" : "text-black/25"}`}>PNG · JPG · Ctrl+V</div>
              </div>
              {/* Optimal size info */}
              <div className={infoCard}>
                <span className={subLabelSm}>Optimal size</span>
                <span className={`font-mono text-[10px] ${d ? "text-white/45" : "text-black/50"}`}>{canSizeSpecs[canSize].labelSizeText}</span>
              </div>
              {customImage && (
                <>
                  <SliderRow label="Scale" value={imageScale} min={0.1} max={1.5} step={0.01} onChange={setImageScale} display={v => `${Math.round(v * 100)}%`} />
                  <SliderRow label="Position X" value={imageOffsetX} min={-0.5} max={0.5} step={0.01} onChange={setImageOffsetX} display={v => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`} />
                  <SliderRow label="Position Y" value={imageOffsetY} min={-0.5} max={0.5} step={0.01} onChange={setImageOffsetY} display={v => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`} />
                  <SliderRow label="Rotation" value={imageRotation} min={-180} max={180} step={1} onChange={setImageRotation} display={v => `${Math.round(v)}°`} />
                  <div className="flex items-center justify-between">
                    <span className={subLabelSm}>BG Color</span>
                    <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} className="w-8 h-6 rounded cursor-pointer border-0 bg-transparent p-0" />
                  </div>
                  <button onClick={() => setImageInvert(v => !v)} className={`${removeBtn} ${imageInvert ? (d ? "border-white/30 text-white/70" : "border-black/30 text-black/70") : ""}`}>
                    {imageInvert ? "Invert: ON" : "Invert Colors"}
                  </button>
                  <button onClick={() => removeBackground(customImage, "image")} className={removeBtn}>Remove Background</button>
                  <button onClick={() => { setCustomImage(""); setImageScale(1.0); setImageOffsetX(0); setImageOffsetY(0); setImageRotation(0); setImageInvert(false); }} className={removeBtn}>Remove Image</button>
                </>
              )}
              {/* Recent images */}
              {recentImages.length > 0 && (
                <div>
                  <div className={`mb-1.5 ${subLabelSm}`}>Recent</div>
                  <div className="flex flex-wrap gap-1.5">
                    {recentImages.map((img, i) => (
                      <button key={i} onClick={() => setCustomImage(img)} title={`Recent image ${i + 1}`}
                        className={`w-11 h-11 rounded overflow-hidden border transition-all duration-150 flex-shrink-0 ${
                          customImage === img ? "border-blue-400/70 ring-1 ring-blue-400/30"
                          : d ? "border-white/[0.14] hover:border-white/35 opacity-70 hover:opacity-100"
                          : "border-black/[0.14] hover:border-black/35 opacity-70 hover:opacity-100"
                        }`}
                      >
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </div>
          )}
        </div>

        {divider}

        {/* ── STICKER ── */}
        <div>
          <button className={sectionBtn} onClick={() => { toggleSection("sticker"); setPasteTarget("sticker"); }}>
            <div className="flex items-center gap-2">
              <span className={sectionTitle}>Sticker</span>
              {pasteTarget === "sticker" && <span className="font-mono text-[8px] px-1.5 py-0.5 rounded" style={{ background: d ? "rgba(168,85,247,0.18)" : "rgba(168,85,247,0.12)", color: "rgba(168,85,247,0.8)", border: "1px solid rgba(168,85,247,0.25)" }}>⌘V</span>}
            </div>
            <span className={chevronCls}>{openSections.sticker ? "▾" : "▸"}</span>
          </button>
          {openSections.sticker && (
            <div className="px-4 pb-4 space-y-2">
              <div
                onClick={handleUploadStickerClick}
                className={`flex flex-col items-center justify-center gap-1.5 py-6 rounded-lg border cursor-pointer transition-all duration-150 ${
                  stickerImage ? "border-purple-400/40 bg-purple-400/[0.05]" : dropZoneIdle
                }`}
              >
                <div className={`font-mono text-[11px] uppercase tracking-wider ${stickerImage ? "text-purple-400/70" : d ? "text-white/35" : "text-black/40"}`}>
                  {stickerImage ? "✓  Sticker loaded" : "Click to upload sticker"}
                </div>
                <div className={`font-mono text-[9px] uppercase ${d ? "text-white/20" : "text-black/25"}`}>PNG · ⌘V to paste</div>
              </div>
              {stickerImage && (
                <>
                  <SliderRow label="Scale" value={stickerScale} min={0.05} max={1.5} step={0.01} onChange={setStickerScale} display={v => `${Math.round(v * 100)}%`} />
                  <SliderRow label="Position X" value={stickerOffsetX} min={-0.5} max={0.5} step={0.01} onChange={setStickerOffsetX} display={v => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`} />
                  <SliderRow label="Position Y" value={stickerOffsetY} min={-0.5} max={0.5} step={0.01} onChange={setStickerOffsetY} display={v => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`} />
                  <SliderRow label="Rotation" value={stickerRotation} min={-180} max={180} step={1} onChange={setStickerRotation} display={v => `${Math.round(v)}°`} />
                  <SliderRow label="Shadow" value={stickerShadowIntensity} min={0} max={1} step={0.01} onChange={setStickerShadowIntensity} display={v => `${Math.round(v * 100)}%`} />
                  <div className={`pt-1 ${subLabelSm}`}>Material</div>
                  <SliderRow label="Roughness" value={stickerRoughness} min={0} max={1} step={0.01} onChange={setStickerRoughness} display={v => v.toFixed(2)} />
                  <SliderRow label="Metalness" value={stickerMetalness} min={0} max={1} step={0.01} onChange={setStickerMetalness} display={v => v.toFixed(2)} />
                  <button onClick={() => removeBackground(stickerImage, "sticker")} className={removeBtn}>Remove Background</button>
                  <button onClick={() => { setStickerImage(""); setStickerScale(1.0); setStickerOffsetX(0); setStickerOffsetY(0); setStickerRotation(0); setStickerShadowIntensity(0.3); }} className={removeBtn}>Remove Sticker</button>
                </>
              )}
              {/* Recent stickers */}
              {recentStickers.length > 0 && (
                <div>
                  <div className={`mb-1.5 ${subLabelSm}`}>Recent</div>
                  <div className="flex flex-wrap gap-1.5">
                    {recentStickers.map((img, i) => (
                      <button key={i} onClick={() => setStickerImage(img)} title={`Recent sticker ${i + 1}`}
                        className={`w-11 h-11 rounded overflow-hidden border transition-all duration-150 flex-shrink-0 ${
                          stickerImage === img ? "border-purple-400/70 ring-1 ring-purple-400/30"
                          : d ? "border-white/[0.14] hover:border-white/35 opacity-70 hover:opacity-100"
                          : "border-black/[0.14] hover:border-black/35 opacity-70 hover:opacity-100"
                        }`}
                      >
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <input ref={stickerInputRef} type="file" accept="image/*" onChange={handleStickerUpload} className="hidden" />
            </div>
          )}
        </div>

        {divider}

        {/* ── MATERIAL ── */}
        <div>
          <button className={sectionBtn} onClick={() => toggleSection("material")}>
            <span className={sectionTitle}>Material</span>
            <span className={chevronCls}>{openSections.material ? "▾" : "▸"}</span>
          </button>
          {openSections.material && (
            <div className="px-4 pb-4 space-y-4">
              <div>
                <div className={`mb-2 ${subLabel}`}>Metal Finish</div>
                <div className="flex flex-wrap gap-1.5">
                  {(["matte", "satin", "glossy", "chrome", "custom"] as MaterialPreset[]).map((p) => (
                    <button key={p} onClick={() => applyMetalPreset(p)} className={`${pillBase} ${materialPreset === p ? pillActive : pillInactive}`}>{p}</button>
                  ))}
                </div>
              </div>
              {materialPreset !== "custom" && (
                <div className={infoCard}>
                  <span className={`font-mono text-[10px] uppercase tracking-wider ${d ? "text-white/35" : "text-black/35"}`}>Label</span>
                  <span className={`font-mono text-[10px] ${d ? "text-white/45" : "text-black/50"}`}>
                    {labelRoughness <= 0.1 ? "Glossy" : labelRoughness <= 0.4 ? "Satin" : "Matte"}
                    <span className={`ml-1.5 ${d ? "text-white/20" : "text-black/25"}`}>{labelRoughness.toFixed(2)}</span>
                  </span>
                </div>
              )}
              {materialPreset === "custom" && (
                <div className="space-y-3">
                  <SliderRow label="Label Roughness" value={labelRoughness} min={0} max={1} step={0.01} onChange={(v) => setLabelRoughness(v)} display={(v) => v.toFixed(2)} />
                  <div className="pt-1">
                    <div className={`mb-2 ${subLabelSm}`}>Top Metal</div>
                    <div className="flex items-center gap-2 mb-2.5">
                      <input type="color" value={metalSettings.top.color} onChange={(e) => updateMetalSetting("top", "color", e.target.value)} className="w-7 h-7 rounded flex-shrink-0" />
                      <input type="text" value={metalSettings.top.color} onChange={(e) => updateMetalSetting("top", "color", e.target.value)} className={inputBase} />
                    </div>
                    <div className="space-y-2.5">
                      <SliderRow label="Roughness" value={metalSettings.top.roughness} min={0} max={1} step={0.01} onChange={(v) => updateMetalSetting("top", "roughness", v)} display={(v) => v.toFixed(2)} />
                      <SliderRow label="Brightness" value={metalSettings.top.brightness} min={0.5} max={2} step={0.05} onChange={(v) => updateMetalSetting("top", "brightness", v)} display={(v) => v.toFixed(2)} />
                      <SliderRow label="Emissive" value={metalSettings.top.emissiveIntensity} min={0} max={2} step={0.01} onChange={(v) => updateMetalSetting("top", "emissiveIntensity", v)} display={(v) => v.toFixed(2)} />
                      <SliderRow label="Env Reflect" value={metalSettings.top.envMapIntensity} min={0} max={4} step={0.1} onChange={(v) => updateMetalSetting("top", "envMapIntensity", v)} display={(v) => v.toFixed(1)} />
                    </div>
                  </div>
                  <div className="pt-1">
                    <div className={`mb-2 ${subLabelSm}`}>Bottom Metal</div>
                    <div className="flex items-center gap-2 mb-2.5">
                      <input type="color" value={metalSettings.bottom.color} onChange={(e) => updateMetalSetting("bottom", "color", e.target.value)} className="w-7 h-7 rounded flex-shrink-0" />
                      <input type="text" value={metalSettings.bottom.color} onChange={(e) => updateMetalSetting("bottom", "color", e.target.value)} className={inputBase} />
                    </div>
                    <div className="space-y-2.5">
                      <SliderRow label="Roughness" value={metalSettings.bottom.roughness} min={0} max={1} step={0.01} onChange={(v) => updateMetalSetting("bottom", "roughness", v)} display={(v) => v.toFixed(2)} />
                      <SliderRow label="Brightness" value={metalSettings.bottom.brightness} min={0.5} max={2} step={0.05} onChange={(v) => updateMetalSetting("bottom", "brightness", v)} display={(v) => v.toFixed(2)} />
                      <SliderRow label="Emissive" value={metalSettings.bottom.emissiveIntensity} min={0} max={2} step={0.01} onChange={(v) => updateMetalSetting("bottom", "emissiveIntensity", v)} display={(v) => v.toFixed(2)} />
                      <SliderRow label="Env Reflect" value={metalSettings.bottom.envMapIntensity} min={0} max={4} step={0.1} onChange={(v) => updateMetalSetting("bottom", "envMapIntensity", v)} display={(v) => v.toFixed(1)} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {divider}

        {/* ── LIGHTING ── */}
        <div>
          <button className={sectionBtn} onClick={() => toggleSection("lighting")}>
            <span className={sectionTitle}>Lighting</span>
            <span className={chevronCls}>{openSections.lighting ? "▾" : "▸"}</span>
          </button>
          {openSections.lighting && (
            <div className="px-4 pb-4 space-y-3">
              <SliderRow label="Brightness" value={lightingSettings.exposure} min={0} max={4} step={0.01} onChange={(v) => updateLightingSetting("exposure", v)} display={(v) => v.toFixed(2)} />
              <div>
                <div className={`mb-2 ${subLabel}`}>Mode</div>
                <div className="flex gap-1.5">
                  {([{ label: "Bar", enabled: true }, { label: "Studio", enabled: false }] as const).map(({ label, enabled }) => (
                    <button key={label} onClick={() => setBar((p) => ({ ...p, enabled }))} className={`flex-1 py-2 font-mono text-[10px] uppercase tracking-wider border transition-all duration-150 ${bar.enabled === enabled ? pillActive : pillInactive}`} style={{ borderRadius: "8px" }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {bar.enabled && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={`${subLabelSm} flex-shrink-0`} style={{ minWidth: 48 }}>Color</span>
                    <input type="color" value={bar.color} onChange={(e) => setBar((p) => ({ ...p, color: e.target.value }))} className="w-7 h-7 rounded flex-shrink-0" />
                    <input type="text" value={bar.color} onChange={(e) => setBar((p) => ({ ...p, color: e.target.value }))} className={inputBase} />
                  </div>
                  <SliderRow label="Intensity" value={bar.intensity} min={0} max={20} step={0.05} onChange={(v) => setBar((p) => ({ ...p, intensity: v }))} display={(v) => v.toFixed(1)} />
                  <SliderRow label="Rotation" value={bar.rotation} min={0} max={Math.PI * 2} step={0.01} onChange={(v) => setBar((p) => ({ ...p, rotation: v }))} display={(v) => `${Math.round((v * 180) / Math.PI)}°`} />
                  <SliderRow label="Height" value={bar.y} min={-3} max={3} step={0.01} onChange={(v) => setBar((p) => ({ ...p, y: v }))} display={(v) => v.toFixed(2)} />
                  <SliderRow label="Distance" value={bar.distance} min={0.5} max={15} step={0.1} onChange={(v) => setBar((p) => ({ ...p, distance: v }))} display={(v) => v.toFixed(1)} />
                </div>
              )}
              <button onClick={() => setLightingAdvancedOpen((p) => !p)} className={`flex items-center gap-1.5 transition-colors pt-1 ${d ? "text-white/25 hover:text-white/45" : "text-black/30 hover:text-black/50"}`}>
                <span className="font-mono text-[10px] uppercase tracking-wider">{lightingAdvancedOpen ? "▾" : "▸"} Advanced</span>
              </button>
              {lightingAdvancedOpen && (
                <div className="space-y-3 pt-1">
                  {!bar.enabled && <SliderRow label="HDRI Intensity" value={lightingSettings.envIntensity} min={0} max={4} step={0.01} onChange={(v) => updateLightingSetting("envIntensity", v)} display={(v) => v.toFixed(2)} />}
                  {bar.enabled && (
                    <>
                      <SliderRow label="Bar Width" value={bar.width} min={0.1} max={12} step={0.1} onChange={(v) => setBar((p) => ({ ...p, width: v }))} display={(v) => v.toFixed(1)} />
                      <SliderRow label="Bar Height" value={bar.height} min={0.1} max={16} step={0.1} onChange={(v) => setBar((p) => ({ ...p, height: v }))} display={(v) => v.toFixed(1)} />
                    </>
                  )}
                  <SliderRow label="Other Strength" value={lightingSettings.otherStrength} min={0} max={3} step={0.01} onChange={(v) => updateLightingSetting("otherStrength", v)} display={(v) => `${v.toFixed(2)}×`} />
                  <SliderRow label="Other Rotation" value={lightingSettings.otherRotation} min={0} max={Math.PI * 2} step={0.01} onChange={(v) => updateLightingSetting("otherRotation", v)} display={(v) => `${Math.round((v * 180) / Math.PI)}°`} />
                  <SliderRow label="Ambient" value={lightingSettings.ambientIntensity} min={0} max={10} step={0.1} onChange={(v) => updateLightingSetting("ambientIntensity", v)} display={(v) => v.toFixed(1)} />
                  <SliderRow label="Fill" value={lightingSettings.fillLightIntensity} min={0} max={10} step={0.1} onChange={(v) => updateLightingSetting("fillLightIntensity", v)} display={(v) => v.toFixed(1)} />
                  <SliderRow label="Rim" value={lightingSettings.rimLightIntensity} min={0} max={10} step={0.1} onChange={(v) => updateLightingSetting("rimLightIntensity", v)} display={(v) => v.toFixed(1)} />
                  <SliderRow label="Directional" value={lightingSettings.directionalIntensity} min={0} max={10} step={0.1} onChange={(v) => updateLightingSetting("directionalIntensity", v)} display={(v) => v.toFixed(1)} />
                  <SliderRow label="FOV" value={cameraFov} min={10} max={60} step={0.1} onChange={(v) => setCameraFov(v)} display={(v) => `${Math.round(v)}°`} />
                  <div>
                    <div className={`mb-1.5 ${subLabelSm}`}>Light Direction (X · Y · Z)</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([0, 1, 2] as const).map((i) => (
                        <input key={i} type="number" value={lightingSettings.directionalPosition[i]}
                          onChange={(e) => { const pos = [...lightingSettings.directionalPosition] as [number, number, number]; pos[i] = parseFloat(e.target.value) || 0; updateLightingSetting("directionalPosition", pos); }}
                          placeholder={["X", "Y", "Z"][i]} className={inputBase + " text-center"} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {divider}

        {/* ── CONTROLS ── */}
        <div>
          <button className={sectionBtn} onClick={() => toggleSection("controls")}>
            <span className={sectionTitle}>Controls</span>
            <span className={chevronCls}>{openSections.controls ? "▾" : "▸"}</span>
          </button>
          {openSections.controls && (
            <div className="px-4 pb-4 space-y-4">
              {!isAutoRotating && (
                <div>
                  <div className={`mb-2 ${subLabel}`}>Manual Rotation</div>
                  <div className="space-y-2.5">
                    <SliderRow label="Y (Horiz)" value={rotation[1]} min={0} max={Math.PI * 2} step={0.01} onChange={(v) => setRotation([rotation[0], v, rotation[2]])} display={(v) => `${Math.round((v * 180) / Math.PI)}°`} />
                    <SliderRow label="X (Vert)" value={rotation[0]} min={-Math.PI / 2} max={Math.PI / 2} step={0.01} onChange={(v) => setRotation([v, rotation[1], rotation[2]])} display={(v) => `${Math.round((v * 180) / Math.PI)}°`} />
                    <SliderRow label="Z (Roll)" value={rotation[2]} min={-Math.PI} max={Math.PI} step={0.01} onChange={(v) => setRotation([rotation[0], rotation[1], v])} display={(v) => `${Math.round((v * 180) / Math.PI)}°`} />
                  </div>
                </div>
              )}
              <div>
                <div className={`mb-2 ${subLabel}`}>Preset</div>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={saveSettingsToJson} className={`${pillBase} ${pillInactive}`}>Save JSON</button>
                  <button onClick={onLoadPresetClick} className={`${pillBase} ${pillInactive}`}>Load JSON</button>
                </div>
                <input ref={presetInputRef} type="file" accept="application/json" onChange={onPresetFileSelected} className="hidden" />
              </div>
              <button onClick={handleResetView} className={resetBtnCls} style={{ borderRadius: "8px" }}>Reset View</button>
              <button onClick={resetToDefault} className={resetBtnCls} style={{ borderRadius: "8px" }}>Reset to Default</button>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-8" />
      </div>

      {/* ── Dark/Light toggle (bottom-left) ── */}
      <button
        onClick={() => setIsDarkMode((v) => !v)}
        title={d ? "Switch to light mode" : "Switch to dark mode"}
        className="fixed bottom-5 left-5 z-50 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200"
        style={{ background: d ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)", border: d ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(0,0,0,0.15)", color: d ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)" }}
      >
        {d ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        )}
      </button>
    </div>
  );
}
