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
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      const tex = new THREE.CanvasTexture(canvas);
      tex.flipY = false;
      // 비-POT 캔버스에서 mipmap 아티팩트 방지 — LinearFilter만 사용
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      setCanvasTexture(prev => { prev?.dispose(); return tex; });
    };
    img.src = customSrc;
    return () => { cancelled = true; };
  }, [customSrc, labelW, labelH, imageScale, imageOffsetX, imageOffsetY, bgColor]);

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
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
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
  }, [stickerSrc, labelW, labelH, stickerScale, stickerOffsetX, stickerOffsetY, shadowIntensity]);

  return canvasTexture;
}

// ─── 3D Components ─────────────────────────────────────────────────────────────

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
  bgColor,
  stickerImage,
  stickerScale,
  stickerOffsetX,
  stickerOffsetY,
  stickerRoughness,
  stickerMetalness,
  stickerShadowIntensity,
  rotationSpeed,
  rotationResetRef,
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
  bgColor: string;
  stickerImage?: string;
  stickerScale: number;
  stickerOffsetX: number;
  stickerOffsetY: number;
  stickerRoughness: number;
  stickerMetalness: number;
  stickerShadowIntensity: number;
  rotationSpeed: number;
  rotationResetRef: React.MutableRefObject<boolean>;
}) {
  const { nodes } = useGLTF("/Soda-can.gltf");

  const defaultBySize =
    canSize === "475ml" ? `${BASE}/labels/475d.png` : `${BASE}/labels/355d.png`;
  const texture = useFitTexture(customTexture, defaultBySize, canSize, imageScale, imageOffsetX, imageOffsetY, bgColor);
  const stickerTexture = useStickerTexture(stickerImage, canSize, stickerScale, stickerOffsetX, stickerOffsetY, stickerShadowIntensity);

  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    if (rotationResetRef.current) {
      groupRef.current.rotation.y = 0;
      rotationResetRef.current = false;
    }
    if (isRecording) {
      groupRef.current.rotation.y = (recordingProgress / 100) * Math.PI * 2;
    } else if (isAutoRotating) {
      groupRef.current.rotation.y += delta * 0.5 * rotationSpeed;
    } else {
      groupRef.current.rotation.set(...rotation);
    }
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
        <meshStandardMaterial roughness={labelRoughness} metalness={0.7} map={texture} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      {stickerTexture && (
        <mesh castShadow receiveShadow geometry={labelGeo} scale={[1, sy, 1]}>
          <meshStandardMaterial roughness={stickerRoughness} metalness={stickerMetalness} map={stickerTexture} transparent alphaTest={0.01} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
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
  const [isInteracting, setIsInteracting] = useState(false);
  useFrame(() => {
    if (!isInteracting && controlsRef.current) {
      const currentPolar = controlsRef.current.getPolarAngle();
      const targetPolar = Math.PI / 2;
      const diff = targetPolar - currentPolar;
      if (Math.abs(diff) > 0.01) {
        controlsRef.current.setPolarAngle(currentPolar + diff * 0.1);
        controlsRef.current.update();
      }
    }
  });
  return (
    <OrbitControls ref={controlsRef} enablePan={false} enableZoom enableRotate minDistance={2} maxDistance={12} minPolarAngle={Math.PI / 6} maxPolarAngle={(Math.PI * 5) / 6} onStart={() => setIsInteracting(true)} onEnd={() => setIsInteracting(false)} enableDamping dampingFactor={0.05} />
  );
}

// ─── Canvas Exporter ──────────────────────────────────────────────────────────
// Uses the main canvas (same pipeline as what the user sees) to guarantee
// identical tone mapping, lighting, and color space. We temporarily resize
// the canvas buffer to 2000×2000 without touching CSS (no visible flash).

function CanvasExporter({ captureRef, canSize }: {
  captureRef: React.MutableRefObject<(() => void) | null>;
  canSize: string;
}) {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    captureRef.current = () => {
      const exportSize = 2000;

      // ── Save state ──────────────────────────────────────────────────────────
      const savedPixelRatio = gl.getPixelRatio();
      const savedCssW = gl.domElement.width / savedPixelRatio;
      const savedCssH = gl.domElement.height / savedPixelRatio;

      const persp = camera as THREE.PerspectiveCamera;
      const savedFov = persp.fov;
      const savedAspect = persp.aspect;
      const savedPos = persp.position.clone();
      const savedQuat = persp.quaternion.clone();

      // ── Set up export camera (front-facing, square, tight FOV) ─────────────
      const exportFov = 20;
      const exportZ = (4 * Math.tan(THREE.MathUtils.degToRad(25 / 2))) /
                          Math.tan(THREE.MathUtils.degToRad(exportFov / 2));
      persp.aspect = 1;
      persp.fov = exportFov;
      persp.position.set(0, 0, exportZ);
      persp.lookAt(0, 0, 0);
      persp.updateProjectionMatrix();

      // ── Resize buffer only — false = don't touch CSS style ─────────────────
      gl.setPixelRatio(1);
      gl.setSize(exportSize, exportSize, false);

      // ── Render via the exact same pipeline the user sees ───────────────────
      gl.render(scene, camera);
      const dataUrl = gl.domElement.toDataURL("image/png");

      // ── Restore immediately ─────────────────────────────────────────────────
      gl.setPixelRatio(savedPixelRatio);
      gl.setSize(savedCssW, savedCssH, false);
      persp.fov = savedFov;
      persp.aspect = savedAspect;
      persp.position.copy(savedPos);
      persp.quaternion.copy(savedQuat);
      persp.updateProjectionMatrix();

      // ── Crop + scale async (after restore so UI is unblocked) ──────────────
      const img = new Image();
      img.onload = () => {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = exportSize;
        tempCanvas.height = exportSize;
        const ctx = tempCanvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const pixels = ctx.getImageData(0, 0, exportSize, exportSize).data;

        let minX = exportSize, maxX = 0, minY = exportSize, maxY = 0;
        for (let y = 0; y < exportSize; y++) {
          for (let x = 0; x < exportSize; x++) {
            if (pixels[(y * exportSize + x) * 4 + 3] > 10) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX <= minX || maxY <= minY) return;

        const contentW = maxX - minX + 1;
        const contentH = maxY - minY + 1;
        const pad = Math.round(Math.max(contentW, contentH) * 0.07);
        const croppedW = contentW + pad * 2;
        const croppedH = contentH + pad * 2;
        const targetH = 1200;
        const targetW = Math.round(croppedW * (targetH / croppedH));

        const outCanvas = document.createElement("canvas");
        outCanvas.width = targetW;
        outCanvas.height = targetH;
        outCanvas.getContext("2d")!.drawImage(
          tempCanvas, minX - pad, minY - pad, croppedW, croppedH,
          0, 0, targetW, targetH
        );

        const a = document.createElement("a");
        a.download = `can-${canSize}.png`;
        a.href = outCanvas.toDataURL("image/png");
        a.click();
      };
      img.src = dataUrl;
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
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <span className="sr-label font-mono text-[11px]">{label}</span>
        <span className="sr-value font-mono text-[11px] tabular-nums">{display(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} className="w-full" />
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

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
  const [bgColor, setBgColor] = useState("#c6c6c8");

  const [isPreparingRecord, setIsPreparingRecord] = useState(false);

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
            reader.onload = (ev) => { if (ev.target?.result) setStickerImage(ev.target.result as string); };
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

  const handleResetView = () => { rotationResetRef.current = true; setRotation([0, 0, 0]); };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFileAsImage(file);
  };

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

  const toggleAutoRotation = () => setIsAutoRotating((v) => !v);

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
    reader.onload = (ev) => { if (ev.target?.result) setStickerImage(ev.target.result as string); };
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
  const chevronCls = `text-[10px] ${d ? "text-white/20" : "text-black/25"}`;
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
    <div className="h-screen flex overflow-hidden" style={{ background: d ? "#000" : "#f0f0f0" }}>

      {/* ── 3D Canvas ── */}
      <div
        className="flex-1 relative"
        style={{ background: d ? "#000" : "#ebebeb" }}
        onDragOver={handleCanvasDragOver}
        onDragLeave={handleCanvasDragLeave}
        onDrop={handleCanvasDrop}
      >
        {isCanvasDragOver && (
          <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center" style={{ background: "rgba(74,158,255,0.06)", border: "2px dashed rgba(74,158,255,0.35)" }}>
            <span className="font-mono text-[12px] text-blue-400/70 uppercase tracking-widest">Drop image</span>
          </div>
        )}
        <Canvas camera={{ position: [0, 0, 4], fov: 25 }} shadows style={{ background: "transparent" }} gl={{ preserveDrawingBuffer: true, alpha: true, localClippingEnabled: true }}>
          <SceneExposure exposure={lightingSettings.exposure} />
          <CameraPerspective fov={cameraFov} />
          <CustomLighting settings={lightingSettings} />
          <EditableSodaCan customTexture={appliedTexture} rotation={rotation} isAutoRotating={isAutoRotating} isRecording={isRecording} recordingProgress={recordingProgress} canSize={canSize} labelRoughness={labelRoughness} metalSettings={metalSettings} imageScale={imageScale} imageOffsetX={imageOffsetX} imageOffsetY={imageOffsetY} bgColor={bgColor} stickerImage={stickerImage || undefined} stickerScale={stickerScale} stickerOffsetX={stickerOffsetX} stickerOffsetY={stickerOffsetY} stickerRoughness={stickerRoughness} stickerMetalness={stickerMetalness} stickerShadowIntensity={stickerShadowIntensity} rotationSpeed={rotationSpeed} rotationResetRef={rotationResetRef} />
          <CustomOrbitControls controlsRef={controlsRef} />
          <RotatingEnvironment barRotation={bar.rotation} otherRotation={lightingSettings.otherRotation} intensity={lightingSettings.envIntensity} bar={bar} />
          <CanvasExporter captureRef={captureRef} canSize={canSize} />
        </Canvas>

        {/* ── Bottom Center HUD ── */}
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-3 py-2 rounded-2xl"
          style={{ background: d ? "rgba(12,12,12,0.82)" : "rgba(238,238,238,0.90)", border: d ? "1px solid rgba(255,255,255,0.13)" : "1px solid rgba(0,0,0,0.13)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}>
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
        className="flex-shrink-0 h-screen overflow-y-auto flex flex-col"
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
                onClick={() => fileInputRef.current?.click()}
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
                  <div className="flex items-center justify-between">
                    <span className={subLabelSm}>BG Color</span>
                    <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} className="w-8 h-6 rounded cursor-pointer border-0 bg-transparent p-0" />
                  </div>
                  <button onClick={() => { setCustomImage(""); setImageScale(1.0); setImageOffsetX(0); setImageOffsetY(0); }} className={removeBtn}>Remove Image</button>
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
                onClick={() => stickerInputRef.current?.click()}
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
                  <SliderRow label="Shadow" value={stickerShadowIntensity} min={0} max={1} step={0.01} onChange={setStickerShadowIntensity} display={v => `${Math.round(v * 100)}%`} />
                  <div className={`pt-1 ${subLabelSm}`}>Material</div>
                  <SliderRow label="Roughness" value={stickerRoughness} min={0} max={1} step={0.01} onChange={setStickerRoughness} display={v => v.toFixed(2)} />
                  <SliderRow label="Metalness" value={stickerMetalness} min={0} max={1} step={0.01} onChange={setStickerMetalness} display={v => v.toFixed(2)} />
                  <button onClick={() => { setStickerImage(""); setStickerScale(1.0); setStickerOffsetX(0); setStickerOffsetY(0); setStickerShadowIntensity(0.3); }} className={removeBtn}>Remove Sticker</button>
                </>
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
