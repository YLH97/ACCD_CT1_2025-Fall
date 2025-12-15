import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// === PERFORMANCE SETTINGS ===
const EDIT_MODE = false; // Set to true for simplified shader (better performance while editing)

// === 基本場景 ===
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x050010, 15, 150);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1); // Fixed low resolution for better performance
renderer.setClearColor(0x050010);
document.body.appendChild(renderer.domElement);

// === NON-PHOTOREALISTIC LIGHTING SYSTEM ===
// Lights are disabled/minimal - surfaces are self-illuminated
// Colors function as data signals, not physically lit surfaces
const ambient = new THREE.AmbientLight(0xffffff, 1.5); // Full ambient - no shadows
scene.add(ambient);
// No directional light - surfaces emit their own color

// === SUBTLE FORM CUE LIGHTING (for GLB clarity only) ===
// Very weak lights to reveal object form without breaking neon aesthetic

// Soft sky / ground contrast
const hemi = new THREE.HemisphereLight(
  0x88aaff, // sky tint
  0x220022, // ground tint
  0.9    // intensity (very low)
);
scene.add(hemi);

// Gentle key light to reveal edges
const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
keyLight.position.set(6, 10, 4);
scene.add(keyLight);


const groundGeo = new THREE.PlaneGeometry(200, 200, 1, 1);
const groundMat = new THREE.MeshBasicMaterial({
  color: 0x000000,
  opacity: 0.8,
  transparent: true
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -6;
scene.add(ground);

// === Shader 材質 ===
const uniforms = {
  uTime:       { value: 0.0 }, // 用來讓顏色 & 噪點流動
  uColorState: { value: 0.0 }, // 你原本用來記錄 scroll / 顏色狀態的變數
  uSection:    { value: 0.0 }, // 現在是第幾個房間
  uEditMode:   { value: EDIT_MODE ? 1.0 : 0.0 }, // Edit mode toggle for simplified shader
  uSkipFloorColor: { value: 0.0 } // Skip floor color mixing for random geometry
};

const vertexShader = /* glsl */`
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  void main() {
    // 把頂點從物件座標轉成世界座標
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    
    // Pass normal to fragment shader for depth cues
    vNormal = normalize(normalMatrix * normal);
    
        // World-space normal for stable floor/orientation cues
    vWorldNormal = normalize(mat3(modelMatrix) * normal);

// Calculate view direction for rim lighting
    vec4 viewPos = viewMatrix * worldPos;
    vViewDir = normalize(-viewPos.xyz);

    // 再丟進相機矩陣
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;
const fragmentShader = /* glsl */`
  uniform float uTime;
  uniform float uColorState;
  uniform float uSection;
  uniform float uEditMode;
  uniform float uSkipFloorColor;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  // ===== hash / noise 工具函式 =====
  float hash(vec3 p) {
    p = vec3(
      dot(p, vec3(127.1, 311.7, 74.7)),
      dot(p, vec3(269.5, 183.3, 246.1)),
      dot(p, vec3(113.5, 271.9, 124.6))
    );
    return fract(sin(p.x + p.y + p.z) * 43758.5453123);
  }

  // 簡單的平滑 3D noise
  float smoothNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // smoothstep

    float a = hash(i);
    float b = hash(i + vec3(1.0, 0.0, 0.0));
    float c = hash(i + vec3(0.0, 1.0, 0.0));
    float d = hash(i + vec3(1.0, 1.0, 0.0));
    float e = hash(i + vec3(0.0, 0.0, 1.0));
    float f_val = hash(i + vec3(1.0, 0.0, 1.0));
    float g = hash(i + vec3(0.0, 1.0, 1.0));
    float h = hash(i + vec3(1.0, 1.0, 1.0));

    float ab = mix(a, b, f.x);
    float cd = mix(c, d, f.x);
    float ef = mix(e, f_val, f.x);
    float gh = mix(g, h, f.x);

    float abcd = mix(ab, cd, f.y);
    float efgh = mix(ef, gh, f.y);

    return mix(abcd, efgh, f.z);
  }

  // Fractal Brownian Motion：多層 noise 疊加出比較有機的流動
  float fbm(vec3 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    float maxValue = 0.0;

    // 最多 3 層，避免太卡
    for (int i = 0; i < 3; i++) {
      if (i >= octaves) break;
      value     += amplitude * smoothNoise(p * frequency);
      maxValue  += amplitude;
      amplitude *= 0.5;
      frequency *= 2.0;
    }
    return value / maxValue;
  }

  void main() {
    // === EDIT MODE: Simple self-illuminated gradient with depth cues ===
    if (uEditMode > 0.5) {
      // Simple gradient based on world position for fast editing
      // Self-illuminated - no lighting calculations
      // Section-based color differentiation
      float sectionHueBase = uSection * 0.15;
      float colorSeed = uColorState * 0.3 + sectionHueBase;
      float hueOffset = colorSeed * 0.5;
      
      vec3 p = vWorldPos * 0.1;
      float r = 0.5 + 0.5 * sin(hueOffset + p.x + p.y);
      float g = 0.5 + 0.5 * sin(hueOffset * 1.3 + p.y + p.z + 2.0);
      float b = 0.5 + 0.5 * sin(hueOffset * 1.7 + p.z + p.x + 4.0);
      
      vec3 color = vec3(r, g, b);
      
      // === SUBTLE DEPTH CUES (non-photorealistic) ===
      // Rim lighting: edges facing away from camera get subtle brightness boost
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(vViewDir);
      float rimFactor = 1.0 - dot(normal, viewDir);
      rimFactor = pow(rimFactor, 2.0); // Soft rim
      float rimBrightness = 1.0 + rimFactor * 0.3; // Subtle edge emphasis
      
      // Surface orientation: gentle brightness variation (not realistic lighting)
      // Surfaces facing up/down get slightly different brightness
      vec3 worldNormal2 = normalize(vWorldNormal);
      float orientationFactor = abs(worldNormal2.y) * 0.15; // Subtle variation
      float orientationBrightness = 1.0 + (orientationFactor - 0.075);
      
      // Apply depth cues
      color *= rimBrightness * orientationBrightness;
      
      // Ensure minimum brightness (self-illuminated)
      float minBrightness = 0.3;
      color = max(color, vec3(minBrightness));
      
      color = pow(color, vec3(1.5));
      color = clamp(color, vec3(minBrightness), vec3(1.0));
      color *= 1.2; // Boost intensity
      color = clamp(color, 0.0, 1.0);
      
      // Floor detection and complementary colors (stable: world-space, floor only)
      // Skip this for random geometry (uSkipFloorColor > 0.5)
      if (uSkipFloorColor < 0.5) {
        vec3 worldNormal = normalize(vWorldNormal);
        float isFloor = step(0.85, worldNormal.y);
        
        if (isFloor > 0.5) {
          // Simple complementary color for floors
          vec3 complementary = vec3(color.b, color.r, color.g); // Rotate RGB for complementary feel
          complementary *= 0.85;
          complementary = max(complementary, vec3(minBrightness * 0.8));
          color = mix(color, complementary, isFloor);
        }
      }
      
      gl_FragColor = vec4(color, 1.0);
      return;
    }
    
    // === FULL SHADER: Section-differentiated color system with inferred depth ===
    // Each section (0-6) has a distinct but related color palette
    // Colors function as data signals, maintaining harmony across sections
    // Depth is inferred through rim emphasis and surface response, not realistic lighting
    
    // === SECTION-BASED COLOR PALETTES ===
    // Each section gets a base hue that creates subtle differentiation
    // Sections are related but distinct for legible boundaries
    float sectionHueBase = uSection * 0.85; // Base hue per section (0-6)
    float stateVariation = uColorState * 0.3; // Variation within section
    float baseHue = sectionHueBase + stateVariation;
    float hueOffset = baseHue * 0.1;

    // 慢慢流動的位移（控制動態速度）
    float flowSpeed = 0.2;
    vec3 flowOffset = vec3(
      sin(uTime * flowSpeed) * 0.5,
      cos(uTime * flowSpeed * 0.7) * 0.3,
      sin(uTime * flowSpeed * 0.5) * 0.4
    );

    // 控制圖案大小：值越小 → 漸層越大塊
    float flowScale = 0.15;
    vec3 p = vWorldPos * flowScale + flowOffset;

    // 兩組 warp，讓圖案更像液體
    vec3 warp1 = vec3(
      fbm(p + vec3(0.0, 0.0, 0.0), 3),
      fbm(p + vec3(4.2, 1.3, 0.0), 3),
      fbm(p + vec3(0.0, 4.2, 1.3), 3)
    );

    vec3 warp2 = vec3(
      fbm(p * 1.7 + vec3(3.7, 2.1, 4.3), 2),
      fbm(p * 1.7 + vec3(1.9, 5.2, 2.8), 2),
      fbm(p * 1.7 + vec3(4.1, 0.5, 5.7), 2)
    );

    vec3 warped = mix(warp1, warp2, 0.45);

    // 用 warped 值來拆成 RGB 流線
    float rFlow = warped.x * 2.0 + warped.y * 1.5;
    float gFlow = warped.y * 2.0 + warped.z * 1.5;
    float bFlow = warped.z * 2.0 + warped.x * 1.5;

    // === SELF-ILLUMINATED DATA SIGNAL COLORS ===
    // Colors function as signals, not physically lit surfaces
    // High-saturation, always bright - no shadow darkening
    float r = 0.5 + 0.5 * sin(hueOffset        + rFlow * 3.14159);
    float g = 0.5 + 0.5 * sin(hueOffset * 1.3 + gFlow * 3.14159 + 2.0);
    float b = 0.5 + 0.5 * sin(hueOffset * 1.7 + bFlow * 3.14159 + 4.0);

    vec3 color = vec3(r, g, b);

    // ===== 噪點 + 閃爍 (data signal noise) =====
    float noiseIntensity = 0.25; // 噪點強度
    float grainScale     = 0.4;  // 顆粒大小（越大越細）

    float grainNoise = hash(vWorldPos * grainScale + uTime * 2.0);
    float grain      = (grainNoise - 0.5) * noiseIntensity;

    float flickerNoise = hash(vWorldPos * 0.7 + uTime * 3.0);
    float flicker      = (flickerNoise - 0.5) * noiseIntensity * 0.7;

    color += grain + flicker;

    // === ENHANCE SATURATION & BRIGHTNESS ===
    // Boost saturation for data-visualization feel
    float luminance = dot(color, vec3(0.299, 0.587, 0.114));
    vec3 saturated = mix(vec3(luminance), color, 1.4); // Increase saturation
    
    // Ensure minimum brightness - no darkening (self-illuminated)
    float minBrightness = 0.3; // Minimum brightness level
    saturated = max(saturated, vec3(minBrightness));
    
    // Apply neon gamma but keep colors bright
    saturated = pow(saturated, vec3(1.5)); // Slightly less gamma for brighter colors
    
    // Final clamp with higher minimum to prevent dark areas
    saturated = clamp(saturated, vec3(minBrightness), vec3(1.0));
    
    // Boost overall intensity for self-illuminated feel
    saturated *= 1.2;
    saturated = clamp(saturated, 0.0, 1.0);
    
    // === INFERRED DEPTH CUES (non-photorealistic) ===
    // Add subtle spatial depth without realistic lighting
    // All effects are gentle and maintain the emissive, data-like aesthetic
    
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewDir);
    
    // === RIM LIGHTING (Fresnel-like edge emphasis) ===
    // Edges facing away from camera get subtle brightness boost
    // Creates form definition without realistic lighting
    float rimFactor = 1.0 - dot(normal, viewDir);
    rimFactor = pow(rimFactor, 1.8); // Soft rim falloff
    float rimBrightness = 1.0 + rimFactor * 0.25; // Subtle edge emphasis (25% boost)
    
    // === SURFACE ORIENTATION RESPONSE ===
    // Gentle brightness variation based on surface orientation
    // Surfaces facing different directions get subtle brightness differences
    // This suggests form without using realistic lighting
    vec3 worldNormal3 = normalize(vWorldNormal);
    float orientationVariation = abs(worldNormal3.y) * 0.12 + abs(worldNormal3.x) * 0.06 + abs(worldNormal3.z) * 0.06;
    float orientationBrightness = 1.0 + (orientationVariation - 0.08); // Subtle variation
    
    // === APPLY DEPTH CUES ===
    // Multiply by depth factors to create inferred spatial depth
    saturated *= rimBrightness * orientationBrightness;
    
    // Ensure minimum brightness is maintained (self-illuminated)
    saturated = max(saturated, vec3(minBrightness));
    saturated = clamp(saturated, 0.0, 1.0);
    
    // === FLOOR DETECTION & COMPLEMENTARY COLORS ===
    // Detect floors by checking if normal is pointing up (within threshold)
    // Floors use complementary colors within the section's color family
    // Skip this for random geometry (uSkipFloorColor > 0.5)
    if (uSkipFloorColor < 0.5) {
      vec3 worldNormal = normalize(vWorldNormal);
      float isFloor = step(0.85, worldNormal.y); // Threshold: normal.y > 0.85 means it's a floor
      
      if (isFloor > 0.5) {
      // === COMPLEMENTARY COLOR FOR FLOORS ===
      // Convert RGB to HSV, shift hue by 180 degrees (complementary), convert back
      // This creates visual distinction while staying in the same color family
      
      // Convert RGB to HSV
      float maxVal = max(max(saturated.r, saturated.g), saturated.b);
      float minVal = min(min(saturated.r, saturated.g), saturated.b);
      float delta = maxVal - minVal;
      
      float hue = 0.0;
      if (delta > 0.001) {
        if (maxVal == saturated.r) {
          hue = mod((saturated.g - saturated.b) / delta + (saturated.g < saturated.b ? 6.0 : 0.0), 6.0) / 6.0;
        } else if (maxVal == saturated.g) {
          hue = ((saturated.b - saturated.r) / delta + 2.0) / 6.0;
        } else {
          hue = ((saturated.r - saturated.g) / delta + 4.0) / 6.0;
        }
      }
      
      float saturation = maxVal > 0.001 ? delta / maxVal : 0.0;
      float value = maxVal;
      
      // Shift hue by 180 degrees (0.5) for complementary color
      float complementaryHue = mod(hue + 0.5, 1.0);
      
      // Convert HSV back to RGB (complementary color)
      float c = value * saturation;
      float x = c * (1.0 - abs(mod(complementaryHue * 6.0, 2.0) - 1.0));
      float m = value - c;
      
      vec3 complementaryRGB;
      if (complementaryHue < 1.0/6.0) {
        complementaryRGB = vec3(c, x, 0.0);
      } else if (complementaryHue < 2.0/6.0) {
        complementaryRGB = vec3(x, c, 0.0);
      } else if (complementaryHue < 3.0/6.0) {
        complementaryRGB = vec3(0.0, c, x);
      } else if (complementaryHue < 4.0/6.0) {
        complementaryRGB = vec3(0.0, x, c);
      } else if (complementaryHue < 5.0/6.0) {
        complementaryRGB = vec3(x, 0.0, c);
      } else {
        complementaryRGB = vec3(c, 0.0, x);
      }
      
      complementaryRGB += m;
      
      // Slightly reduce brightness for floors (but keep self-illuminated)
      // Apply same depth cues to floor color
      complementaryRGB *= rimBrightness * orientationBrightness;
      complementaryRGB *= 0.85;
      complementaryRGB = max(complementaryRGB, vec3(minBrightness * 0.8));
      
      // Mix between wall color and complementary floor color
      saturated = mix(saturated, complementaryRGB, isFloor);
      }
    }

    gl_FragColor = vec4(saturated, 1.0);
  }
`;

const neonShaderMat = new THREE.ShaderMaterial({
  uniforms,
  vertexShader,
  fragmentShader
});

// Separate material for random geometry (skips floor color mixing)
const randomGeometryUniforms = {
  uTime:       { value: 0.0 },
  uColorState: { value: 0.0 },
  uSection:    { value: 0.0 },
  uEditMode:   { value: EDIT_MODE ? 1.0 : 0.0 },
  uSkipFloorColor: { value: 1.0 } // Skip floor color mixing for random geometry
};

const randomGeometryMat = new THREE.ShaderMaterial({
  uniforms: randomGeometryUniforms,
  vertexShader,
  fragmentShader
});


// === SECTION UNIFORM BINDING (per-mesh, stable palettes across visible sections) ===
// ShaderMaterial uniforms are shared across all meshes. To keep each section's neon meshes
// in their own related palette (even when multiple sections are visible), we set uSection
// right before each mesh renders.
function bindSectionUniform(root, sectionIndex) {
  root.traverse((obj) => {
    if (obj && obj.isMesh) {
      if (obj.material === neonShaderMat) {
        obj.userData.sectionIndex = sectionIndex;
        obj.onBeforeRender = () => {
          uniforms.uSection.value = obj.userData.sectionIndex ?? 0.0;
        };
      } else if (obj.material === randomGeometryMat) {
        obj.userData.sectionIndex = sectionIndex;
        obj.onBeforeRender = () => {
          randomGeometryUniforms.uSection.value = obj.userData.sectionIndex ?? 0.0;
        };
      }
    }
  });
}

// === COLOR STATE MANAGEMENT ===
// Track last view to detect changes
let lastViewKey = null;

// Function to update color state when view changes
function updateColorState(section, step) {
  // Create a unique key for this view (section + step)
  const viewKey = `${section}-${step}`;
  
  // Only update if view actually changed
  if (viewKey !== lastViewKey) {
    // Generate a new color state based on section and step
    // This ensures each view has a unique, stable color
    const newColorState = section * 10.0 + step;
    uniforms.uColorState.value = newColorState;
    randomGeometryUniforms.uColorState.value = newColorState; // Sync to random geometry material
    lastViewKey = viewKey;
  }
}

const SECTION_COUNT = 6;
const SECTION_DISTANCE = 30;   // 每個層級沿著 Z 軸的間距
const ACTIVE_RANGE = 1;        // How many adjacent sections to show (0 = only current, 1 = current + prev/next)
const sections = [];

// Objects that should slowly rotate over time (random geometry)
const rotatingObjects = [];
// Floating props (plates, cups, bottles) with drift velocities
const floatingItems = [];

// === HELPER FUNCTIONS FOR ROOM CREATION ===

/**
 * Creates a standard room shell (floor, ceiling, walls, door opening)
 * with the same dimensions as Section 0 and Section 1
 */
function createRoomShell(group, neonShaderMat) {
  const roomSize = 25;
  const roomHeight = 9;
  const wallThickness = 0.3;
  const wallHeight = roomHeight;
  const floorY = -3;
  
  // Floor
  const floorGeo = new THREE.PlaneGeometry(roomSize, roomSize, 4, 4);
  const floor = new THREE.Mesh(floorGeo, neonShaderMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = floorY;
  group.add(floor);
  
  // Ceiling
  const ceilingGeo = new THREE.PlaneGeometry(roomSize, roomSize, 4, 4);
  const ceiling = new THREE.Mesh(ceilingGeo, neonShaderMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = roomHeight - 3;
  group.add(ceiling);
  
  // Back wall (along negative Z side)
  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(roomSize, wallHeight, wallThickness, 4, 4, 2),
    neonShaderMat
  );
  backWall.position.set(0, (wallHeight / 2) - 3, -roomSize / 2);
  group.add(backWall);
  
  // Front wall (with door opening) - split into left and right
  const frontWallLeft = new THREE.Mesh(
    new THREE.BoxGeometry(roomSize / 2 - 2, wallHeight, wallThickness, 4, 4, 2),
    neonShaderMat
  );
  frontWallLeft.position.set(-roomSize / 4 - 1, (wallHeight / 2) - 3, roomSize / 2);
  group.add(frontWallLeft);
  
  const frontWallRight = new THREE.Mesh(
    new THREE.BoxGeometry(roomSize / 2 - 2, wallHeight, wallThickness, 4, 4, 2),
    neonShaderMat
  );
  frontWallRight.position.set(roomSize / 4 + 1, (wallHeight / 2) - 3, roomSize / 2);
  group.add(frontWallRight);
  
  // Door frame (top part above door opening)
  const doorFrameTop = new THREE.Mesh(
    new THREE.BoxGeometry(4, 2, wallThickness, 2, 2, 2),
    neonShaderMat
  );
  doorFrameTop.position.set(0, 4, roomSize / 2);
  group.add(doorFrameTop);
  
  // Left wall (at -roomSize/2)
  const leftWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, wallHeight, roomSize, 2, 4, 4),
    neonShaderMat
  );
  leftWall.position.set(-roomSize / 2, (wallHeight / 2) - 3, 0);
  group.add(leftWall);
  
  // Right wall (at +roomSize/2)
  const rightWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, wallHeight, roomSize, 2, 4, 4),
    neonShaderMat
  );
  rightWall.position.set(roomSize / 2, (wallHeight / 2) - 3, 0);
  group.add(rightWall);
}

/**
 * Adds random abstract geometry to a room for visual interest
 * Matches the exact same types and style as Section 0's random geometry
 * Ensures shapes are spaced apart to avoid clustering/overlap
 */
function addRandomRoomGeometry(group, sectionIndex, neonShaderMat) {
  const placed = []; // store positions to enforce spacing
  const minDist = 3.0;
  const maxAttempts = 30;

  function isFarEnough(p) {
    for (let i = 0; i < placed.length; i++) {
      if (p.distanceTo(placed[i]) < minDist) return false;
    }
    return true;
  }

  function placeWithRetries(makePos) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const p = makePos();
      if (isFarEnough(p)) {
        placed.push(p);
        return p;
      }
    }
    return null; // give up for this item
  }

  // === RANDOM GEOMETRY: torus rings + irregular polyhedra (no spheres) ===
  const shapes = ['torus', 'icosahedron']; // rings + irregular
  const totalObjects = 15;
  for (let idx = 0; idx < totalObjects; idx++) {
    const pos = placeWithRetries(() => new THREE.Vector3(
      (Math.random() - 0.5) * 15,      // spread across room
      -2 + Math.random() * 6,          // slightly below to above mid-height
      (Math.random() - 0.5) * 16
    ));
    if (!pos) continue;

    const pick = shapes[Math.floor(Math.random() * shapes.length)];
    let geo;
    if (pick === 'torus') {
      const radius = 1.0 + Math.random() * 0.2; // more variation in ring size
      const tube = 0.2 + Math.random() * 0.1;   // thicker/thinner tubes
      geo = new THREE.TorusGeometry(radius, tube, 12, 22);
    } else if (pick === 'icosahedron') {
      const r = 0.9 + Math.random() * 0.01;
      const detail = Math.floor(Math.random() * 2); // 0 or 1
      geo = new THREE.IcosahedronGeometry(r, detail);
    }

    const mesh = new THREE.Mesh(geo, randomGeometryMat);
    mesh.position.copy(pos);
    mesh.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    mesh.visible = true;
    if (mesh.material) {
      mesh.material.visible = true;
      mesh.material.transparent = false;
      mesh.material.opacity = 1.0;
    }
    group.add(mesh);
    rotatingObjects.push(mesh);
  }
}

const baseGeo = new THREE.TorusKnotGeometry(2.0, 0.6, 260, 40);
const sphereGeo = new THREE.SphereGeometry(1.3, 32, 32);
const boxGeo = new THREE.BoxGeometry(2.5, 2.5, 2.5, 4, 4, 4);

// === SECTION 0 WATCHER BALLS (single white sphere + inner visual unit) ===
// Adjustable sizes, colors, and count

const BODY_RADIUS = 0.43;           // Outer white sphere radius (remains unchanged, no blink)
const IRIS_RADIUS = 0.30;          // Outer colored circle radius (inner visual unit)
const PUPIL_RADIUS = 0.1;         // Inner black circle radius (inner visual unit)
let WATCHER_BODY_COLOR = 0xffffff; // Outer sphere color
let WATCHER_IRIS_COLOR = 0x6b4f3a; // Iris color
let WATCHER_PUPIL_COLOR = 0x111111; // Pupil color (black/dark)
let WATCHER_COUNT = 12; // adjustable number of watchers
// Box spawn volume (keeps them inside the room and visible)
const WATCHER_BOX = {
  xMin: -10, xMax: 10,
  yMin: -2,  yMax: 4,
  zMin: -10, zMax: 10
};
const WATCHER_MAX_ATTEMPTS = 100; // max placement attempts per watcher
const MIN_SEPARATION = BODY_RADIUS * 2.8; // avoid overlap

// === WATCHER BALLS (single big sphere + front iris/pupil marker, multiple instances) ===
// Adjustable sizes, colors, and count (shared across sections)

const watcherBalls = [];          // all watcher instances (across all sections)
const watcherGroups = [];         // one group per section
const _watcherForward = new THREE.Vector3(0, 0, 1);
const _watcherDir = new THREE.Vector3();
const _watcherPos = new THREE.Vector3();
const _watcherQuat = new THREE.Quaternion();
const WATCHER_TRACK_SPEED = 0.12; // base tracking speed (scaled by delta)

// --- BLINK SETTINGS ---
const WATCHER_BLINK_MIN = 2.2;    // seconds (min interval between blinks)
const WATCHER_BLINK_MAX = 5.0;    // seconds (max interval between blinks)
const WATCHER_BLINK_CLOSE = 0.08; // seconds to close
const WATCHER_BLINK_HOLD  = 0.05; // seconds fully closed
const WATCHER_BLINK_OPEN  = 0.10; // seconds to open

// Iris gradient texture (soft edge, more eye-like)
// (use the IRIS_RADIUS and WATCHER_IRIS_COLOR defined above)

function makeIrisTexture(hexColor, size = 150) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Convert hex to rgb
  const r = (hexColor >> 16) & 255;
  const g = (hexColor >> 8) & 255;
  const b = hexColor & 255;

  const cx = size / 2;
  const cy = size / 2;
  const rad = size / 2;

  // Radial gradient: opaque center -> soft transparent edge (no hard ring)
  const grad = ctx.createRadialGradient(cx, cy, rad * 0.15, cx, cy, rad * 0.95);
  grad.addColorStop(0.0, `rgba(${r},${g},${b},1.0)`);
  grad.addColorStop(0.55, `rgba(${r},${g},${b},0.85)`);
  grad.addColorStop(0.80, `rgba(${r},${g},${b},0.35)`);
  grad.addColorStop(1.0, `rgba(${r},${g},${b},0.0)`);

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, rad * 0.98, 0, Math.PI * 2);
  ctx.fill();

  // Soft white outer rim: use shadowBlur + semi-transparent stroke for a gentle glow
  ctx.save();
  ctx.lineWidth = Math.max(2, size * 0.35);
  ctx.shadowBlur = Math.max(4, size * 0.1);
  ctx.shadowColor = 'rgba(255,255,255,0.9)';
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  // Offset the ring inwards by half the line width so the stroke sits on the edge
  ctx.arc(cx, cy, rad * 0.98 - ctx.lineWidth * 0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

let _irisTexture = makeIrisTexture(WATCHER_IRIS_COLOR);

function createWatcherBall() {
  const group = new THREE.Group();

  // Body (big sphere)
  const bodyRadius = BODY_RADIUS;
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(bodyRadius, 32, 32),
    new THREE.MeshBasicMaterial({
      color: WATCHER_BODY_COLOR,
      emissive: WATCHER_BODY_COLOR,
      emissiveIntensity: 1.0
    })
  );
  group.add(body);

  // Iris (soft gradient disc) sits on surface (no extra geometry complexity)
  // Generate a neon-like random color for each watcher (hues near scene neon palette)
  function neonRandomColor() {
    const baseHues = [190/360, 210/360, 260/360, 330/360]; // cyan, blue, purple, magenta
    const h = baseHues[Math.floor(Math.random() * baseHues.length)];
    const hueJitter = (Math.random() - 0.5) * 0.06; // small jitter
    const finalH = (h + hueJitter + 1.0) % 1.0;
    const s = 0.6 + Math.random() * 0.35;
    const v = 0.7 + Math.random() * 0.3;

    // HSV -> RGB
    const i = Math.floor(finalH * 6);
    const f = finalH * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    let r = 1, g = 1, b = 1;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    const R = Math.round(r * 255);
    const G = Math.round(g * 255);
    const B = Math.round(b * 255);
    return (R << 16) + (G << 8) + B;
  }

  const perIrisColor = neonRandomColor();
  const perIrisTexture = makeIrisTexture(perIrisColor, 150);
  const iris = new THREE.Mesh(
    new THREE.CircleGeometry(IRIS_RADIUS, 48),
    new THREE.MeshBasicMaterial({
      map: perIrisTexture,
      transparent: true,
      depthWrite: false
    })
  );
  iris.position.set(0, 0, bodyRadius + 0.001); // slightly above surface
  group.add(iris);

  // Pupil (small sphere) fixed on surface, centered in iris
  const pupilRadius = PUPIL_RADIUS;
  const pupil = new THREE.Mesh(
    new THREE.SphereGeometry(pupilRadius, 24, 24),
    new THREE.MeshBasicMaterial({
      color: WATCHER_PUPIL_COLOR,
      emissive: WATCHER_PUPIL_COLOR,
      emissiveIntensity: 1.0
    })
  );
  pupil.position.set(0, 0, bodyRadius + pupilRadius * 0.1); // sits on surface
  group.add(pupil);

  // Store parts for blink animation
  group.userData.blinkTargets = [iris, pupil];

  // Blink state
  group.userData.blink = {
    phase: 'idle', // 'idle' | 'closing' | 'closed' | 'opening'
    t: 0,
    next: WATCHER_BLINK_MIN + Math.random() * (WATCHER_BLINK_MAX - WATCHER_BLINK_MIN)
  };

  // Track current orientation for smooth slerp
  group.userData.currentQuat = new THREE.Quaternion();
  return group;
}

function updateWatcherBlink(group, delta) {
  const targets = group.userData.blinkTargets;
  const blink = group.userData.blink;
  if (!targets || !blink) return;

  // Countdown to next blink
  if (blink.phase === 'idle') {
    blink.next -= delta;
    if (blink.next <= 0) {
      blink.phase = 'closing';
      blink.t = 0;
    }
  }

  // Animate blink by squashing the iris+pupil vertically (quick eyelid)
  let yScale = 1;

  if (blink.phase === 'closing') {
    blink.t += delta;
    const k = Math.min(1, blink.t / WATCHER_BLINK_CLOSE);
    yScale = Math.max(0.02, 1 - k);
    if (k >= 1) {
      blink.phase = 'closed';
      blink.t = 0;
    }
  } else if (blink.phase === 'closed') {
    blink.t += delta;
    yScale = 0.02;
    if (blink.t >= WATCHER_BLINK_HOLD) {
      blink.phase = 'opening';
      blink.t = 0;
    }
  } else if (blink.phase === 'opening') {
    blink.t += delta;
    const k = Math.min(1, blink.t / WATCHER_BLINK_OPEN);
    yScale = Math.max(0.02, k);
    if (k >= 1) {
      blink.phase = 'idle';
      blink.t = 0;
      blink.next = WATCHER_BLINK_MIN + Math.random() * (WATCHER_BLINK_MAX - WATCHER_BLINK_MIN);
    }
  }

  // Apply squash to iris + pupil together
  for (const t of targets) {
    if (t) t.scale.set(1, yScale, 1);
  }
}

// Generate non-overlapping positions using simple rejection sampling in a box
function generateWatcherPositions(count) {
  const positions = [];
  const tmp = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < WATCHER_MAX_ATTEMPTS && !placed; attempt++) {
      tmp.set(
        WATCHER_BOX.xMin + Math.random() * (WATCHER_BOX.xMax - WATCHER_BOX.xMin),
        WATCHER_BOX.yMin + Math.random() * (WATCHER_BOX.yMax - WATCHER_BOX.yMin),
        WATCHER_BOX.zMin + Math.random() * (WATCHER_BOX.zMax - WATCHER_BOX.zMin)
      );

      let ok = true;
      for (const p of positions) {
        if (p.distanceTo(tmp) < MIN_SEPARATION) {
          ok = false;
          break;
        }
      }

      if (ok) {
        positions.push(tmp.clone());
        placed = true;
      }
    }
  }
  return positions;
}

function clearAllWatcherBalls() {
  watcherBalls.forEach((wb) => {
    if (wb.parent) wb.parent.remove(wb);
  });
  watcherBalls.length = 0;
}

function populateWatcherBalls(parentGroup, count) {
  if (!parentGroup) return;
  const positions = generateWatcherPositions(count);
  positions.forEach((pos) => {
    const ball = createWatcherBall();
    ball.position.copy(pos);
    parentGroup.add(ball);
    watcherBalls.push(ball);
  });
}

function populateAllWatchers() {
  clearAllWatcherBalls();
  watcherGroups.forEach((g) => populateWatcherBalls(g, WATCHER_COUNT));
}

// Create (or reuse) a watcher sub-group for a section
function ensureWatchersInSection(sectionGroup) {
  if (!sectionGroup) return;
  if (!sectionGroup.userData.watchersGroup) {
    const g = new THREE.Group();
    sectionGroup.add(g);
    sectionGroup.userData.watchersGroup = g;
    watcherGroups.push(g);
  }
}

// Public setter to adjust watcher count and regenerate (all sections)
function setWatcherCount(newCount) {
  const clamped = Math.max(1, Math.floor(newCount || 1));
  WATCHER_COUNT = clamped;
  populateAllWatchers();
}

// Public setter to adjust watcher colors (body / pupil / iris)
function setWatcherColors(bodyColor, pupilColor, irisColor) {
  if (bodyColor !== undefined) WATCHER_BODY_COLOR = bodyColor;
  if (pupilColor !== undefined) WATCHER_PUPIL_COLOR = pupilColor;
  if (irisColor !== undefined) WATCHER_IRIS_COLOR = irisColor;

  // Rebuild iris texture if needed
  if (irisColor !== undefined) {
    _irisTexture = makeIrisTexture(WATCHER_IRIS_COLOR);
  }

  // Update existing materials
  watcherBalls.forEach((wb) => {
    wb.traverse((child) => {
      if (!child.isMesh || !child.material) return;

      // Body: SphereGeometry with BODY_RADIUS
      const radius = child.geometry?.parameters?.radius;
      const isBody = radius === BODY_RADIUS;
  const isPupil = radius === PUPIL_RADIUS;

      if (isBody) {
        child.material.color.setHex(WATCHER_BODY_COLOR);
        if (child.material.emissive) child.material.emissive.setHex(WATCHER_BODY_COLOR);
      } else if (isPupil) {
        child.material.color.setHex(WATCHER_PUPIL_COLOR);
        if (child.material.emissive) child.material.emissive.setHex(WATCHER_PUPIL_COLOR);
      } else if (child.geometry && child.geometry.type === 'CircleGeometry') {
        // Iris disc
        child.material.map = _irisTexture;
        child.material.needsUpdate = true;
      }
    });
  });
}

function updateWatcherBall(group, camera, delta) {
  if (!group) return;

  // Visibility check up the parent chain
  let parent = group.parent;
  let isVisible = true;
  while (parent) {
    if (parent.visible === false) {
      isVisible = false;
      break;
    }
    parent = parent.parent;
  }
  if (!isVisible) return;

  // Direction from watcher to camera
  group.getWorldPosition(_watcherPos);
  _watcherDir.subVectors(camera.position, _watcherPos);
  if (_watcherDir.lengthSq() < 1e-6) return;
  _watcherDir.normalize();

  // Target rotation: +Z points toward camera
  _watcherQuat.setFromUnitVectors(_watcherForward, _watcherDir);

  const currentQuat = group.userData.currentQuat || new THREE.Quaternion();
  const step = Math.min(1.0, WATCHER_TRACK_SPEED * (delta * 60)); // frame-rate friendly
  currentQuat.slerp(_watcherQuat, step);
  group.quaternion.copy(currentQuat);
  group.userData.currentQuat = currentQuat;

  // Blink animation (iris+pupil squashes briefly)
  updateWatcherBlink(group, delta);
}

for (let i = 0; i < SECTION_COUNT; i++) {
const group = new THREE.Group();
  group.userData.sectionIndex = i;
  group.position.z = -i * SECTION_DISTANCE;
scene.add(group);
  sections.push(group);

  if (i === 0) {
    // === SECTION 0: ENCLOSED CYBERPUNK LIVING ROOM ===
    
    // === ROOM STRUCTURE: Floor, Ceiling, Walls ===
    const roomSize = 25;
    const roomHeight = 8;
    
    // Floor
    const floorGeo = new THREE.PlaneGeometry(roomSize, roomSize, 4, 4);
    const floor = new THREE.Mesh(floorGeo, neonShaderMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3;
    group.add(floor);
    
    // Ceiling
    const ceilingGeo = new THREE.PlaneGeometry(roomSize, roomSize, 4, 4);
    const ceiling = new THREE.Mesh(ceilingGeo, neonShaderMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = roomHeight - 3;
    group.add(ceiling);
    
    // Walls (4 walls using boxes)
    const wallThickness = 0.3;
    const wallHeight = roomHeight;
    
    // Back wall (behind sofa)
    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(roomSize, wallHeight, wallThickness, 4, 4, 2),
      neonShaderMat
    );
    backWall.position.set(0, (wallHeight / 2) - 3, -roomSize / 2);
    group.add(backWall);
    
    // Front wall (with door opening)
    const frontWallLeft = new THREE.Mesh(
      new THREE.BoxGeometry(roomSize / 2 - 2, wallHeight, wallThickness, 4, 4, 2),
      neonShaderMat
    );
    frontWallLeft.position.set(-roomSize / 4 - 1, (wallHeight / 2) - 3, roomSize / 2);
    group.add(frontWallLeft);
    
    const frontWallRight = new THREE.Mesh(
      new THREE.BoxGeometry(roomSize / 2 - 2, wallHeight, wallThickness, 4, 4, 2),
      neonShaderMat
    );
    frontWallRight.position.set(roomSize / 4 + 1, (wallHeight / 2) - 3, roomSize / 2);
    group.add(frontWallRight);
    
    // Door frame (top part above door)
    const doorFrameTop = new THREE.Mesh(
      new THREE.BoxGeometry(4, 2, wallThickness, 2, 2, 2),
      neonShaderMat
    );
    doorFrameTop.position.set(0, 4, roomSize / 2);
    group.add(doorFrameTop);
    
    // Left wall
    const leftWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallThickness, wallHeight, roomSize, 2, 4, 4),
      neonShaderMat
    );
    leftWall.position.set(-roomSize / 2, (wallHeight / 2) - 3, 0);
    group.add(leftWall);
    
    // Right wall
    const rightWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallThickness, wallHeight, roomSize, 2, 4, 4),
      neonShaderMat
    );
    rightWall.position.set(roomSize / 2, (wallHeight / 2) - 3, 0);
    group.add(rightWall);
    
    // === SOFA: Load Blender GLB Model (Preserve Original Materials) ===
    const loader = new GLTFLoader();
    
    loader.load(
      'models/1_Sofa.glb',
      (gltf) => {
        console.log('Sofa model loaded successfully');
        const sofaModel = gltf.scene;
        
        sofaModel.traverse((child) => {
          if (child.isMesh) {
            // ① 保留原本材質，只開啟陰影
            child.castShadow = true;
            child.receiveShadow = true;
    
            // ② 在這裡處理貼圖縮放 👇👇
            const mat = child.material;
            const materials = Array.isArray(mat) ? mat : [mat];
    
            materials.forEach((m) => {
              if (m && m.map) {
                m.map.wrapS = THREE.RepeatWrapping;
                m.map.wrapT = THREE.RepeatWrapping;
    
                // 數字越大，紋路越細緻
                m.map.repeat.set(7, 7); // 可以試 2、4、8 換看看效果
    
                m.map.needsUpdate = true;
              }
            });
          }
        });
        
        // === 以下保持你的原本邏輯不動 ===
        const box = new THREE.Box3().setFromObject(sofaModel);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        console.log('Sofa model size:', size);
        console.log('Sofa model center:', center);
        
        const targetWidth = 8;
        const scaleFactor = size.x > 0 ? targetWidth / size.x : 1;
        sofaModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
        
        sofaModel.position.set(2, 0, 0);
        sofaModel.position.sub(center.clone().multiplyScalar(scaleFactor));
        
        sofaModel.rotation.y = Math.PI * 1.5;
        
        const scaledBox = new THREE.Box3().setFromObject(sofaModel);
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        sofaModel.position.y = scaledSize.y / 2 - 3; // Floor is at y = -3
        
        group.add(sofaModel);
        console.log('Sofa added to scene with original materials preserved');
        console.log('Final position:', sofaModel.position);
        console.log('Final scale:', sofaModel.scale);
      },
      (progress) => {
        if (progress.lengthComputable) {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log('Loading sofa:', percentComplete.toFixed(2) + '%');
        }
      },
      (error) => {
        console.error('Error loading sofa model:', error);
        console.error('Make sure models/1_Sofa.glb exists');
      }
    );    

    // === FLOOR LAMP: Load Blender GLB Model (Preserve Original Materials) ===
    const floorLampLoader = new GLTFLoader();
    
    floorLampLoader.load(
      'models/1_flamp.glb',
      (gltf) => {
        console.log('Floor lamp model loaded successfully');
        const floorLampModel = gltf.scene;
        
        // Preserve all original materials and textures from Blender
        floorLampModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.visible = true;
            // Disable frustum culling for thin objects to ensure they render
            child.frustumCulled = false;
            
            // Ensure materials are visible and not transparent
            const mat = child.material;
            const materials = Array.isArray(mat) ? mat : [mat];
            materials.forEach((m) => {
              if (m) {
                m.visible = true;
                // If material is transparent, ensure it's set up correctly
                if (m.transparent) {
                  m.opacity = Math.max(0.1, m.opacity || 1.0);
                }
              }
            });
          }
        });
        
        // Calculate bounding box to understand model size
        const box = new THREE.Box3().setFromObject(floorLampModel);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        console.log('Floor lamp model size:', size);
        console.log('Floor lamp model center:', center);
        
        // Auto-scale to appropriate size (target height ~5 units)
        const targetHeight = 5;
        const scaleFactor = size.y > 0 ? targetHeight / size.y : 1;
        floorLampModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
        
        // Position on the left of the sofa (sofa is at x=2, z=0)
        const scaledBox = new THREE.Box3().setFromObject(floorLampModel);
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        
        // Position floor lamp on the left of the sofa
        floorLampModel.position.set(3, 0, -5.5);
        floorLampModel.position.sub(scaledCenter.clone().multiplyScalar(scaleFactor));
        floorLampModel.position.y = scaledSize.y / 2 - 5; // Sit on floor (y = -3)
        
        // Rotate to face appropriate direction
        floorLampModel.rotation.y = Math.PI / 4; // Slight angle
        
        // Ensure the entire model is visible
        floorLampModel.visible = true;
        
        group.add(floorLampModel);
        console.log('Floor lamp added to scene with original materials preserved');
        console.log('Final position:', floorLampModel.position);
        console.log('Final scale:', floorLampModel.scale);
      },
      (progress) => {
        if (progress.lengthComputable) {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log('Loading floor lamp:', percentComplete.toFixed(2) + '%');
        }
      },
      (error) => {
        console.error('Error loading floor lamp model:', error);
        console.error('Make sure models/1_flamp.glb exists');
      }
    );

    // === COFFEE TABLE: Box tabletop + four legs ===
    const tableTopGeo = new THREE.BoxGeometry(5, 0.3, 3, 4, 2, 2);
    const tableLegGeo = new THREE.BoxGeometry(0.3, 1.5, 0.3, 2, 2, 2);
    
    // Create a table group so everything rotates together
    const tableGroup = new THREE.Group();
    tableGroup.position.set(-3, -1, 0); // Position in front of sofa (sofa faces left, so front is -X)
    tableGroup.rotation.y = Math.PI/2; // Rotate entire table: 0 = forward, Math.PI/2 = 90°, Math.PI = 180°, -Math.PI/2 = -90°
    
    // Tabletop (relative to table group center)
    const tableTop = new THREE.Mesh(tableTopGeo, neonShaderMat);
    tableTop.position.set(0, 0.75, 0); // Relative to table group (height 0.75 above floor)
    tableGroup.add(tableTop);
    
    // Four legs (relative to table group center)
    const legPositions = [
      [-2.1, -0.3, -0.9],  // Front-left leg
      [2.1, -0.3, -0.9],   // Front-right leg
      [-2.1, -0.3, 0.9],   // Back-left leg
      [2.1, -0.3, 0.9]     // Back-right leg
    ];
    legPositions.forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(tableLegGeo, neonShaderMat);
      leg.position.set(x, y, z); // Relative to table group
      tableGroup.add(leg);
    });
    
    group.add(tableGroup);

    // === CARPET: Load Blender GLB Model (Preserve Original Materials) ===
    const carpetLoader = new GLTFLoader();
    
    carpetLoader.load(
      'models/1_carpet.glb',
      (gltf) => {
        console.log('Carpet model loaded successfully');
        const carpetModel = gltf.scene;
        
        // Preserve all original materials and textures from Blender
        carpetModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.visible = true;
            // Disable frustum culling for thin objects to ensure they render
            child.frustumCulled = false;
            
            // Ensure materials are visible and not transparent
            const mat = child.material;
            const materials = Array.isArray(mat) ? mat : [mat];
            materials.forEach((m) => {
              if (m) {
                m.visible = true;
                // If material is transparent, ensure it's set up correctly
                if (m.transparent) {
                  m.opacity = Math.max(0.1, m.opacity || 1.0);
                }
              }
            });
          }
        });
        
        // Calculate bounding box to understand model size
        const box = new THREE.Box3().setFromObject(carpetModel);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        console.log('Carpet model size:', size);
        console.log('Carpet model center:', center);
        
        // Auto-scale to fit under table (target width ~7 units)
        const targetWidth = 7;
        const scaleFactor = size.x > 0 ? targetWidth / size.x : 1;
        carpetModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
        
        // Position on floor, under the table
        const scaledBox = new THREE.Box3().setFromObject(carpetModel);
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        
        // Position carpet under the table
        carpetModel.position.set(-3, 0, 0);
        carpetModel.position.sub(scaledCenter.clone().multiplyScalar(scaleFactor));
        
        // For very thin carpets, ensure they're visible above the floor
        if (scaledSize.y < 0.1) {
          // Very thin carpet - position slightly above floor to ensure visibility
          carpetModel.position.y = -2; // Slightly above floor (y = -3)
        } else {
          // Normal thickness - use calculated position
          carpetModel.position.y = scaledSize.y / 2 - 5;
        }
        
        // Rotate to match table rotation
        carpetModel.rotation.y = Math.PI / 2;
        
        // Ensure the entire model is visible
        carpetModel.visible = true;
        
        group.add(carpetModel);
        console.log('Carpet added to scene with original materials preserved');
        console.log('Final position:', carpetModel.position);
        console.log('Final scale:', carpetModel.scale);
        console.log('Carpet scaled size:', scaledSize);
        console.log('Carpet visible:', carpetModel.visible);
      },
      (progress) => {
        if (progress.lengthComputable) {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log('Loading carpet:', percentComplete.toFixed(2) + '%');
        }
      },
      (error) => {
        console.error('Error loading carpet model:', error);
        console.error('Make sure models/1_carpet.glb exists');
      }
    );

    // === TV: Load Blender GLB Model (Preserve Original Materials) ===
    const tvGroup = new THREE.Group();
    const tvLoader = new GLTFLoader();
    
    tvLoader.load(
      'models/1_tv.glb',
      (gltf) => {
        console.log('TV model loaded successfully');
        const tvModel = gltf.scene;
        
        // Preserve all original materials and textures from Blender
        tvModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        
        // Calculate bounding box to understand model size
        const box = new THREE.Box3().setFromObject(tvModel);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        console.log('TV model size:', size);
        console.log('TV model center:', center);
        
        // Auto-scale to appropriate size (target width - increase to make TV bigger)
        const targetWidth = 10; // Increased from 5.5 to make TV bigger
        const scaleFactor = size.x > 0 ? targetWidth / size.x : 1;
        tvModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
        
        // Position TV on the floor (relative to tvGroup)
        const scaledBox = new THREE.Box3().setFromObject(tvModel);
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        
        // Position TV on the floor (y = -3 is floor level)
        tvModel.position.set(0, 0, 0);
        tvModel.position.sub(scaledCenter.clone().multiplyScalar(scaleFactor));
        tvModel.position.y = scaledSize.y / 2 - 5.5; // Sit on floor
        
        // Rotate to face sofa
        tvModel.rotation.y = 0; // Will inherit tvGroup's rotation
        
        tvGroup.add(tvModel);
        console.log('TV added to scene with original materials preserved');
        console.log('Final position:', tvModel.position);
        console.log('Final scale:', tvModel.scale);
      },
      (progress) => {
        if (progress.lengthComputable) {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log('Loading TV:', percentComplete.toFixed(2) + '%');
        }
      },
      (error) => {
        console.error('Error loading TV model:', error);
        console.error('Make sure models/1_tv.glb exists');
      }
    );
    
    // Position and rotate the TV group
    tvGroup.position.set(-10, 0, 0);
    tvGroup.rotation.y = Math.PI / 2; // Face toward sofa
    
    group.add(tvGroup);

    // === BOOKCASE: Abstract neon-style bookcase near TV ===
    const bookcaseGroup = new THREE.Group();
    
    // Bookcase frame/back panel
    const bookcaseBackGeo = new THREE.BoxGeometry(0.2, 5, 3, 2, 4, 2);
    const bookcaseBack = new THREE.Mesh(bookcaseBackGeo, neonShaderMat);
    bookcaseBack.position.set(0, 2.5, -1.5); // Relative to group center
    bookcaseGroup.add(bookcaseBack);
    
    // Side panels
    const sidePanelGeo = new THREE.BoxGeometry(0.2, 5, 0.2, 2, 4, 2);
    const leftSide = new THREE.Mesh(sidePanelGeo, neonShaderMat);
    leftSide.position.set(-1.4, 2.5, 0); // Relative to group center
    bookcaseGroup.add(leftSide);
    
    const rightSide = new THREE.Mesh(sidePanelGeo, neonShaderMat);
    rightSide.position.set(1.4, 2.5, 0); // Relative to group center
    bookcaseGroup.add(rightSide);
    
    // Shelves (4 horizontal shelves)
    const shelfGeo = new THREE.BoxGeometry(2.8, 0.1, 3, 2, 2, 2);
    const shelfPositions = [1.0, 2.2, 3.4, 4.6]; // Y positions for shelves
    
    shelfPositions.forEach((yPos) => {
      const shelf = new THREE.Mesh(shelfGeo, neonShaderMat);
      shelf.position.set(0, yPos, 0); // Relative to group center
      bookcaseGroup.add(shelf);
    });
    
    // Books (abstract boxes on shelves)
    const bookPositions = [
      // Bottom shelf
      [-1.0, 0.5, -0.8], [-0.3, 0.5, -0.8], [0.4, 0.5, -0.8], [1.1, 0.5, -0.8],
      // Second shelf
      [-1.0, 1.7, -0.8], [-0.3, 1.7, -0.8], [0.4, 1.7, -0.8],
      // Third shelf
      [-1.0, 2.9, -0.8], [-0.3, 2.9, -0.8], [0.4, 2.9, -0.8], [1.1, 2.9, -0.8],
      // Top shelf
      [-1.0, 4.1, -0.8], [-0.3, 4.1, -0.8], [0.4, 4.1, -0.8]
    ];
    
    bookPositions.forEach(([x, y, z]) => {
      const bookWidth = 0.5 + Math.random() * 0.3;
      const bookHeight = 0.3 + Math.random() * 0.2;
      const bookDepth = 0.4 + Math.random() * 0.2;
      const bookGeo = new THREE.BoxGeometry(bookWidth, bookHeight, bookDepth, 2, 2, 2);
      const book = new THREE.Mesh(bookGeo, neonShaderMat);
      book.position.set(x, y, z); // Relative to group center
      book.rotation.y = (Math.random() - 0.5) * 0.2; // Slight random rotation
      bookcaseGroup.add(book);
    });
    
    // Position bookcase to the right of TV (TV is at x=-10, z=0)
    bookcaseGroup.position.set(-10, -3, -7); // To the right of TV (positive z)
    bookcaseGroup.rotation.y = Math.PI / 2; // Face same direction as TV
    
    group.add(bookcaseGroup);

    // === RANDOM GEOMETRY (shared system) ===
    addRandomRoomGeometry(group, 0, neonShaderMat);
    // === WATCHER BALLS (shared across sections) ===
    ensureWatchersInSection(group);
    // === FLOATING OBJECTS (cup, remote, boo, vas) ===
    const floatingLoader = new GLTFLoader();
    const floatingModels = [
      { path: 'models/1_cup.glb', min: 4, max: 5 },
      { path: 'models/1_remote.glb', min: 4, max: 5 },
      { path: 'models/1_pain.glb', min: 4, max: 5 },
      { path: 'models/1_boo.glb', min: 4, max: 5 },
      { path: 'models/1_vas.glb', min: 4, max: 5 }
    ];
    
    // Size multipliers for each model (adjust these to control sizes)
    const floatingModelSizes = {
      'models/1_cup.glb': 0.9,      
      'models/1_remote.glb': 0.8,     // 80% of base size
      'models/1_pain.glb': 1.1,     // added pain model size multiplier
      'models/1_boo.glb': 1.1,      // 100% of base size
      'models/1_vas.glb': 1.9       // 100% of base size
    };

    floatingModels.forEach(({ path, min, max }) => {
      floatingLoader.load(
        path,
        (gltf) => {
          console.log(`Floating model loaded: ${path}`);
          const base = gltf.scene;

          // Ensure materials/shadows
          base.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.visible = true;
              child.frustumCulled = false;
            }
          });

          // Compute base scale to a modest size (~1.2 max dimension)
          const bbox = new THREE.Box3().setFromObject(base);
          const size = bbox.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const targetMax = 1.2;
          const baseScaleFactor = maxDim > 0 ? targetMax / maxDim : 1;

          const count = Math.floor(Math.random() * (max - min + 1)) + min;
          // Get size multiplier for this model (default to 1.0 if not specified)
          const sizeMultiplier = floatingModelSizes[path] || 1.0;
          
          for (let idx = 0; idx < count; idx++) {
            const model = base.clone(true);
            // Apply controlled size multiplier
            const scaleFactor = baseScaleFactor * sizeMultiplier;
            model.scale.setScalar(scaleFactor);

            // Random position within the living room (relative to Section 0)
            // Room boundaries: x: -12.5 to +12.5, z: -12.5 to +12.5, y: -3 to 5
            model.position.set(
              (Math.random() - 0.5) * 24,     // x: -12 to +12 (within room)
              -2 + Math.random() * 6,         // y: -2 to 4 (within room height)
              (Math.random() - 0.5) * 24      // z: -12 to +12 (within room)
            );

            // Small random rotation start
            model.rotation.set(
              Math.random() * Math.PI,
              Math.random() * Math.PI,
              Math.random() * Math.PI
            );

            // Random drift velocity
            const velocity = new THREE.Vector3(
              (Math.random() - 0.5) * 0.4,  // x drift
              (Math.random() - 0.2) * 0.2,  // y drift (slightly upward bias)
              (Math.random() - 0.5) * 0.4   // z drift
            );

            // Full room boundaries (roomSize = 25, so -12.5 to +12.5)
            const bounds = {
              xMin: -12.5,
              xMax: 12.5,
              yMin: -3,
              yMax: 5,
              zMin: -12.5,
              zMax: 12.5
            };

            group.add(model);
            rotatingObjects.push(model);
            floatingItems.push({ mesh: model, velocity, bounds });
          }
        },
        (progress) => {
          if (progress.lengthComputable) {
            const percentComplete = (progress.loaded / progress.total) * 100;
            console.log(`Loading ${path}:`, percentComplete.toFixed(2) + '%');
          }
        },
        (error) => {
          console.error(`Error loading floating model ${path}:`, error);
        }
      );
    });
  } else if (i === 1) {
    // === SECTION 1: KITCHEN ROOM SHELL ===
    
    // === ROOM STRUCTURE: Floor, Ceiling, Walls ===
    const roomSize = 25;
    const roomHeight = 8;
    
    // Floor
    const floorGeo = new THREE.PlaneGeometry(roomSize, roomSize, 4, 4);
    const floor = new THREE.Mesh(floorGeo, neonShaderMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3;
    group.add(floor);
    
    // Ceiling
    const ceilingGeo = new THREE.PlaneGeometry(roomSize, roomSize, 4, 4);
    const ceiling = new THREE.Mesh(ceilingGeo, neonShaderMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = roomHeight - 3;
    group.add(ceiling);
    
    // Walls (4 walls using boxes)
    const wallThickness = 0.3;
    const wallHeight = roomHeight;
    
    // Back wall (along negative Z side)
    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(roomSize, wallHeight, wallThickness, 4, 4, 2),
      neonShaderMat
    );
    backWall.position.set(0, (wallHeight / 2) - 3, -roomSize / 2);
    group.add(backWall);
    
    // Front wall (with door opening) - split into left and right
    const frontWallLeft = new THREE.Mesh(
      new THREE.BoxGeometry(roomSize / 2 - 2, wallHeight, wallThickness, 4, 4, 2),
      neonShaderMat
    );
    frontWallLeft.position.set(-roomSize / 4 - 1, (wallHeight / 2) - 3, roomSize / 2);
    group.add(frontWallLeft);
    
    const frontWallRight = new THREE.Mesh(
      new THREE.BoxGeometry(roomSize / 2 - 2, wallHeight, wallThickness, 4, 4, 2),
      neonShaderMat
    );
    frontWallRight.position.set(roomSize / 4 + 1, (wallHeight / 2) - 3, roomSize / 2);
    group.add(frontWallRight);
    
    // Door frame (top part above door opening)
    const doorFrameTop = new THREE.Mesh(
      new THREE.BoxGeometry(4, 2, wallThickness, 2, 2, 2),
      neonShaderMat
    );
    doorFrameTop.position.set(0, 4, roomSize / 2);
    group.add(doorFrameTop);
    
    // Left wall (at -roomSize/2)
    const leftWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallThickness, wallHeight, roomSize, 2, 4, 4),
      neonShaderMat
    );
    leftWall.position.set(-roomSize / 2, (wallHeight / 2) - 3, 0);
    group.add(leftWall);
    
    // Right wall (at +roomSize/2)
    const rightWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallThickness, wallHeight, roomSize, 2, 4, 4),
      neonShaderMat
    );
    rightWall.position.set(roomSize / 2, (wallHeight / 2) - 3, 0);
    group.add(rightWall);
    
    // === FURNITURE: Fridge and Countertop ===
    const floorY = -3;
    
    // === (1) FRIDGE: Load Blender GLB Model (Preserve Original Materials) ===
    const fridgeLoader = new GLTFLoader();
    
    fridgeLoader.load(
      'models/2_frige.glb',
      (gltf) => {
        console.log('Fridge model loaded successfully');
        const fridgeModel = gltf.scene;
        
        // Preserve all original materials and textures from Blender
        fridgeModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.visible = true;
            child.frustumCulled = false;
            
            const mat = child.material;
            const materials = Array.isArray(mat) ? mat : [mat];
            materials.forEach((m) => {
              if (m) {
                m.visible = true;
                if (m.transparent) {
                  m.opacity = Math.max(0.1, m.opacity || 1.0);
                }
                if (m && m.map) {
                  m.map.wrapS = THREE.RepeatWrapping;
                  m.map.wrapT = THREE.RepeatWrapping;
                  m.map.repeat.set(1, 1);
                  m.map.needsUpdate = true;
                }
              }
            });
          }
        });
        
        // Calculate bounding box to understand model size
        const box = new THREE.Box3().setFromObject(fridgeModel);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        console.log('Fridge model size:', size);
        console.log('Fridge model center:', center);
        
        // Scale to target width of 2 units
        const targetWidth = 4.8;
        const scaleFactor = size.x > 0 ? targetWidth / size.x : 2;
        fridgeModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
        
        // Position relative to center
        fridgeModel.position.set(0, 0, 0);
        fridgeModel.position.sub(center.clone().multiplyScalar(scaleFactor));
        
        // Set rotation
        fridgeModel.rotation.y = Math.PI/2;
        
        // Position on floor
        const scaledBox = new THREE.Box3().setFromObject(fridgeModel);
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        fridgeModel.position.y = scaledSize.y / 2 - 3; // Floor is at y = -3
        
        // Create group and position it
        const fridgeGroup = new THREE.Group();
        fridgeGroup.add(fridgeModel);
        fridgeGroup.position.set(roomSize / 2 - 23, -3, -5);
        
        group.add(fridgeGroup);
        console.log('Fridge added to scene with original materials preserved');
        console.log('Final position:', fridgeGroup.position);
        console.log('Final scale:', fridgeModel.scale);
      },
      (progress) => {
        if (progress.lengthComputable) {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log('Loading fridge:', percentComplete.toFixed(2) + '%');
        }
      },
      (error) => {
        console.error('Error loading fridge model:', error);
        console.error('Make sure models/2_frige.glb exists');
      }
    );
    
    // === (2) KITCHEN COUNTERTOP: Load Blender GLB Model (Preserve Original Materials) ===
    const counterLoader = new GLTFLoader();
    
    counterLoader.load(
      'models/2_counter.glb',
      (gltf) => {
        console.log('Counter model loaded successfully');
        const counterModel = gltf.scene;
        
        // Preserve all original materials and textures from Blender
        counterModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.visible = true;
            child.frustumCulled = false;
            
            const mat = child.material;
            const materials = Array.isArray(mat) ? mat : [mat];
            materials.forEach((m) => {
              if (m) {
                m.visible = true;
                if (m.transparent) {
                  m.opacity = Math.max(0.1, m.opacity || 1.0);
                }
                if (m && m.map) {
                  m.map.wrapS = THREE.RepeatWrapping;
                  m.map.wrapT = THREE.RepeatWrapping;
                  m.map.repeat.set(1, 1);
                  m.map.needsUpdate = true;
                }
              }
            });
          }
        });
        
        // Calculate bounding box to understand model size
        const box = new THREE.Box3().setFromObject(counterModel);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        console.log('Counter model size:', size);
        console.log('Counter model center:', center);
        
        // Scale to target length of 10 units (matching original counter length)
        const targetLength = 2.5;
        const scaleFactor = size.z > 0 ? targetLength / size.z : 5;
        counterModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
        
        // Position relative to center
        counterModel.position.set(0, 0, 0);
        counterModel.position.sub(center.clone().multiplyScalar(scaleFactor));
        
        // Set rotation
        counterModel.rotation.y = Math.PI / 2;
        
        // Position on floor
        const scaledBox = new THREE.Box3().setFromObject(counterModel);
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        counterModel.position.y = scaledSize.y / 2 - 4.5; // Floor is at y = -3
        
        // Create group and position it
        const counterGroup = new THREE.Group();
        counterGroup.add(counterModel);
        counterGroup.position.set(roomSize / 2 - 23, -3, 2);
        
        group.add(counterGroup);
        console.log('Counter added to scene with original materials preserved');
        console.log('Final position:', counterGroup.position);
        console.log('Final scale:', counterModel.scale);
      },
      (progress) => {
        if (progress.lengthComputable) {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log('Loading counter:', percentComplete.toFixed(2) + '%');
        }
      },
      (error) => {
        console.error('Error loading counter model:', error);
        console.error('Make sure models/2_counter.glb exists');
      }
    );

    // === (2.5) KITCHEN CABINETS beside counter ===
    const cabinetGroup = new THREE.Group();
    const cabinetWidth = 2.8;
    const cabinetDepth = 2.2;
    const cabinetHeight = 3.2;
    const cabinetTopThickness = 0.2;
    
    // Cabinet base (lower cabinet)
    const cabinetBaseGeo = new THREE.BoxGeometry(cabinetWidth, cabinetHeight, cabinetDepth, 6, 3, 3);
    const cabinetBase = new THREE.Mesh(cabinetBaseGeo, neonShaderMat);
    cabinetBase.position.set(0, cabinetHeight / 2, 0);
    cabinetGroup.add(cabinetBase);
    
    // Cabinet top slab
    const cabinetTopGeo = new THREE.BoxGeometry(cabinetWidth, cabinetTopThickness, cabinetDepth, 4, 2, 2);
    const cabinetTop = new THREE.Mesh(cabinetTopGeo, neonShaderMat);
    cabinetTop.position.set(0, cabinetHeight + cabinetTopThickness / 2, 0);
    cabinetGroup.add(cabinetTop);
    
    // Upper cabinet (wall cabinet)
    const upperCabinetHeight = 2.4;
    const upperCabinetGeo = new THREE.BoxGeometry(cabinetWidth, upperCabinetHeight, cabinetDepth * 0.7, 4, 2, 2);
    const upperCabinet = new THREE.Mesh(upperCabinetGeo, neonShaderMat);
    upperCabinet.position.set(0, 4.5, 0);
    cabinetGroup.add(upperCabinet);
    
    // Simple doors/handles on lower cabinet (two doors)
    const doorThickness = 0.05;
    const doorInset = 0.02;
    const handleOffsetY = 0.8;
    const handleOffsetZ = cabinetDepth / 2 + 0.05;
    const doorGeo = new THREE.BoxGeometry(cabinetWidth / 2 - doorInset, cabinetHeight - 0.4, doorThickness);
    const doorLeft = new THREE.Mesh(doorGeo, neonShaderMat);
    doorLeft.position.set(-cabinetWidth / 4, cabinetHeight / 2 - 0.1, cabinetDepth / 2 + doorThickness / 2);
    cabinetGroup.add(doorLeft);
    const doorRight = new THREE.Mesh(doorGeo, neonShaderMat);
    doorRight.position.set(cabinetWidth / 4, cabinetHeight / 2 - 0.1, cabinetDepth / 2 + doorThickness / 2);
    cabinetGroup.add(doorRight);
    
    // Handles (small vertical bars)
    const handleGeo = new THREE.BoxGeometry(0.05, 0.6, 0.05);
    const handleLeft = new THREE.Mesh(handleGeo, neonShaderMat);
    handleLeft.position.set(-cabinetWidth / 4 + 0.35, handleOffsetY, handleOffsetZ);
    cabinetGroup.add(handleLeft);
    const handleRight = new THREE.Mesh(handleGeo, neonShaderMat);
    handleRight.position.set(cabinetWidth / 4 - 0.35, handleOffsetY, handleOffsetZ);
    cabinetGroup.add(handleRight);
    
    // Toe kick / base plinth
    const kickGeo = new THREE.BoxGeometry(cabinetWidth, 0.25, cabinetDepth * 0.9, 2, 1, 2);
    const kick = new THREE.Mesh(kickGeo, neonShaderMat);
    kick.position.set(0, 0.125, -0.05);
    cabinetGroup.add(kick);
    
    // Position cabinets beside the counter (counter is at x = roomSize/2 - 23, z = 2)
    // Place cabinets to the left of the counter (more negative z)
    cabinetGroup.position.set(roomSize / 2 - 23, -3, 2 - cabinetDepth + 9);
    cabinetGroup.rotation.y = Math.PI / 2; // Match counter rotation
    group.add(cabinetGroup);
    
    // === (3) KITCHEN ISLAND (simple neon geometry) ===
    const islandGroup = new THREE.Group();
    const islandLength = 6.5;
    const islandDepth = 3;
    const islandHeight = 3;
    const islandTopThickness = 0.18;

    // Island base
    const islandBaseGeo = new THREE.BoxGeometry(islandLength, islandHeight, islandDepth, 4, 2, 2);
    const islandBase = new THREE.Mesh(islandBaseGeo, neonShaderMat);
    islandBase.position.set(0, islandHeight / 2, 0);
    islandGroup.add(islandBase);

    // Island top
    const islandTopGeo = new THREE.BoxGeometry(islandLength, islandTopThickness, islandDepth, 4, 2, 2);
    const islandTop = new THREE.Mesh(islandTopGeo, neonShaderMat);
    islandTop.position.set(0, islandHeight + islandTopThickness / 2, 0);
    islandGroup.add(islandTop);

    // Position island in front of the counter
    islandGroup.position.set(roomSize / 2 - 15, -3, 2);
    islandGroup.rotation.y = Math.PI / 2;
    group.add(islandGroup);
    
    // === BAR STOOLS (GLB model) ===
    const stoolLoader = new GLTFLoader();
    const islandZ = 2;
    const islandX = roomSize / 2 - 15;
    const stoolZ = islandZ + (islandDepth / 2) -1.5; // in front of island
    const stoolSpacingZ = 1.8;
    const stoolPositions = [
      { x: islandX, z: stoolZ - stoolSpacingZ }, // front-most
      { x: islandX, z: stoolZ },                 // middle
      { x: islandX, z: stoolZ + stoolSpacingZ }  // back-most
    ];
    
    stoolLoader.load(
      'models/2_stools.glb',
      (gltf) => {
        console.log('Stool model loaded successfully');
        const baseModel = gltf.scene;
        
        // Preserve materials and shadow settings
        baseModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.visible = true;
            child.frustumCulled = false;
          }
        });
        
        // Compute size for scaling
        const box = new THREE.Box3().setFromObject(baseModel);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        // Target stool height ~2.5 units
        const targetHeight = 3.5;
        const scaleFactor = size.y > 0 ? targetHeight / size.y : 2;
        
        stoolPositions.forEach(({ x: stoolX, z: stoolZPos }) => {
          const stoolModel = baseModel.clone(true);
          
          // Apply scaling
          stoolModel.scale.set(scaleFactor, scaleFactor, scaleFactor);

          // Rotate stool to face the counter (adjust as needed)
          stoolModel.rotation.y = Math.PI*1.5;
          
          // Recompute bounding box after scale to place on floor
          const scaledBox = new THREE.Box3().setFromObject(stoolModel);
          const scaledSize = scaledBox.getSize(new THREE.Vector3());
          const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
          
          // Center and place on floor at y = -3
          stoolModel.position.copy(scaledCenter).multiplyScalar(-1);
          stoolModel.position.y += scaledSize.y / 2 - 3;
          
          const stoolGroup = new THREE.Group();
          stoolGroup.add(stoolModel);
          stoolGroup.position.set(0, 0, stoolZPos);
          
          group.add(stoolGroup);
        });
        
        console.log('Stools added with GLB model');
      },
      (progress) => {
        if (progress.lengthComputable) {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log('Loading stools:', percentComplete.toFixed(2) + '%');
        }
      },
      (error) => {
        console.error('Error loading stool model:', error);
        console.error('Make sure models/2_stools.glb exists');
      }
    );

    // === FLOATING TABLEWARE (plates, cups, bottles) ===
    const tablewareLoader = new GLTFLoader();
    const tablewareModels = [
      { path: 'models/2_plate.glb', min: 4, max: 5 },
      { path: 'models/2_knife.glb', min: 4, max: 5 },
      { path: 'models/2_bottle.glb', min: 4, max: 5 },
      { path: 'models/2_spoon.glb', min: 4, max: 5 },
      { path: 'models/2_chip.glb', min: 4, max: 5 },
    ];
    
    // Size multipliers for each model (adjust these to control sizes)
    const tablewareModelSizes = {
      'models/2_plate.glb': 1.2,    // 100% of base size
      'models/2_knife.glb': 1.2,    // 90% of base size
      'models/2_bottle.glb': 1.2,   // 110% of base size
      'models/2_spoon.glb': 1.2,    // 80% of base size
      'models/2_chip.glb': 1.2,    // 80% of base size
    };

    tablewareModels.forEach(({ path, min, max }) => {
      tablewareLoader.load(
        path,
        (gltf) => {
          console.log(`Tableware model loaded: ${path}`);
          const base = gltf.scene;

          // Ensure materials/shadows
          base.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.visible = true;
              child.frustumCulled = false;
            }
          });

          // Compute base scale to a modest size (~1.2 max dimension)
          const bbox = new THREE.Box3().setFromObject(base);
          const size = bbox.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const targetMax = 1.2;
          const baseScaleFactor = maxDim > 0 ? targetMax / maxDim : 1;

          const count = Math.floor(Math.random() * (max - min + 1)) + min;
          // Get size multiplier for this model (default to 1.0 if not specified)
          const sizeMultiplier = tablewareModelSizes[path] || 1.0;
          
          for (let idx = 0; idx < count; idx++) {
            const model = base.clone(true);
            // Apply controlled size multiplier
            const scaleFactor = baseScaleFactor * sizeMultiplier;
            model.scale.setScalar(scaleFactor);

            // Random position within the kitchen room (relative to Section 1)
            // Room boundaries: x: -12.5 to +12.5, z: -12.5 to +12.5, y: -3 to 5
            model.position.set(
              (Math.random() - 0.5) * 24,     // x: -12 to +12 (within room)
              -2 + Math.random() * 6,         // y: -2 to 4 (within room height)
              (Math.random() - 0.5) * 24      // z: -12 to +12 (within room)
            );

            // Small random rotation start
            model.rotation.set(
              Math.random() * Math.PI,
              Math.random() * Math.PI,
              Math.random() * Math.PI
            );

            // Random drift velocity
            const velocity = new THREE.Vector3(
              (Math.random() - 0.5) * 0.4,  // x drift
              (Math.random() - 0.2) * 0.2,  // y drift (slightly upward bias)
              (Math.random() - 0.5) * 0.4   // z drift
            );

            // Full room boundaries (roomSize = 25, so -12.5 to +12.5)
            const bounds = {
              xMin: -12.5,
              xMax: 12.5,
              yMin: -3,
              yMax: 5,
              zMin: -12.5,
              zMax: 12.5
            };

            group.add(model);
            rotatingObjects.push(model);
            floatingItems.push({ mesh: model, velocity, bounds });
          }
        },
        (progress) => {
          if (progress.lengthComputable) {
            const percentComplete = (progress.loaded / progress.total) * 100;
            console.log(`Loading ${path}:`, percentComplete.toFixed(2) + '%');
          }
        },
        (error) => {
          console.error(`Error loading tableware model ${path}:`, error);
        }
      );
    });
    
    // === RANDOM GEOMETRY (same as Section 0) ===
    addRandomRoomGeometry(group, 1, neonShaderMat);
  } else if (i === 2) {
    // === SECTION 2: BEDROOM (Queen bed + wardrobe) ===
    createRoomShell(group, neonShaderMat);
    const floorY = -3;

    // --- Queen-size bed (GLB) ---
    const bedLoader = new GLTFLoader();
    bedLoader.load(
      'models/3_bed.glb',
      (gltf) => {
        const bedModel = gltf.scene;

        // Preserve materials and enable shadows
        bedModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
          }
        });

        // Scale to target width ~6 units
        const bbox = new THREE.Box3().setFromObject(bedModel);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());
        const targetWidth = 8.5;
        const scaleFactor = size.x > 0 ? targetWidth / size.x : 1.0;
        bedModel.scale.setScalar(scaleFactor);

        // Re-center and place on local floor (y = 0 for group)
        const scaledBox = new THREE.Box3().setFromObject(bedModel);
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        bedModel.position.copy(scaledCenter).multiplyScalar(-1);
        bedModel.position.y += scaledSize.y / 2;

        // Group for positioning in the room
        const bedGroup = new THREE.Group();
        bedGroup.add(bedModel);
        bedGroup.position.set(2.5, floorY, -6);
        bedGroup.rotation.y = Math.PI*2; // headboard toward back wall (negative Z)
        group.add(bedGroup);

        console.log('Bed model (3_bed.glb) loaded and placed in Section 2.');
      },
      (progress) => {
        if (progress.lengthComputable) {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log('Loading bed model:', percentComplete.toFixed(2) + '%');
        }
      },
      (error) => {
        console.error('Error loading bed model (3_bed.glb):', error);
      }
    );

    // --- Bed End Bench ---
    const benchGroup = new THREE.Group();
    const benchWidth = 6.0;
    const benchDepth = 1.7;
    const benchHeight = 1.2;
    const benchTopThickness = 1;
    const benchLegThickness = 0.08;

    // Bench top
    const benchTopGeo = new THREE.BoxGeometry(benchWidth, benchTopThickness, benchDepth, 4, 1, 2);
    const benchTop = new THREE.Mesh(benchTopGeo, neonShaderMat);
    benchTop.position.set(0, benchHeight, 0);
    benchGroup.add(benchTop);

    // Bench legs (4 legs)
    const benchLegGeo = new THREE.BoxGeometry(benchLegThickness, benchHeight, benchLegThickness, 1, 1, 1);
    const benchLegPositions = [
      [-benchWidth / 2 + benchLegThickness / 2, benchHeight / 2, -benchDepth / 2 + benchLegThickness / 2],
      [benchWidth / 2 - benchLegThickness / 2, benchHeight / 2, -benchDepth / 2 + benchLegThickness / 2],
      [-benchWidth / 2 + benchLegThickness / 2, benchHeight / 2, benchDepth / 2 - benchLegThickness / 2],
      [benchWidth / 2 - benchLegThickness / 2, benchHeight / 2, benchDepth / 2 - benchLegThickness / 2]
    ];
    benchLegPositions.forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(benchLegGeo, neonShaderMat);
      leg.position.set(x, y, z);
      benchGroup.add(leg);
    });

    // Position bench at foot of bed (bed is at x=2.5, z=-6, headboard toward negative Z)
    benchGroup.position.set(2.5, floorY, -0.5); // Position at foot of bed
    group.add(benchGroup);

    // --- Left Bedside Table ---
    const leftTableGroup = new THREE.Group();
    const leftTableWidth = 1.8;
    const leftTableDepth = 1.5;
    const leftTableHeight = 2.4;
    const leftTableTopThickness = 0.15;
    const leftLegThickness = 0.12;

    // Table top
    const leftTableTopGeo = new THREE.BoxGeometry(leftTableWidth, leftTableTopThickness, leftTableDepth, 2, 1, 2);
    const leftTableTop = new THREE.Mesh(leftTableTopGeo, neonShaderMat);
    leftTableTop.position.set(0, leftTableHeight, 0);
    leftTableGroup.add(leftTableTop);

    // Table legs (4 legs)
    const leftLegGeo = new THREE.BoxGeometry(leftLegThickness, leftTableHeight, leftLegThickness, 1, 1, 1);
    const leftLegPositions = [
      [-leftTableWidth / 2 + leftLegThickness / 2, leftTableHeight / 2, -leftTableDepth / 2 + leftLegThickness / 2],
      [leftTableWidth / 2 - leftLegThickness / 2, leftTableHeight / 2, -leftTableDepth / 2 + leftLegThickness / 2],
      [-leftTableWidth / 2 + leftLegThickness / 2, leftTableHeight / 2, leftTableDepth / 2 - leftLegThickness / 2],
      [leftTableWidth / 2 - leftLegThickness / 2, leftTableHeight / 2, leftTableDepth / 2 - leftLegThickness / 2]
    ];
    leftLegPositions.forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(leftLegGeo, neonShaderMat);
      leg.position.set(x, y, z);
      leftTableGroup.add(leg);
    });

    // Optional drawer front
    const leftDrawerGeo = new THREE.BoxGeometry(leftTableWidth * 0.9, leftTableHeight * 0.4, 0.05, 2, 1, 1);
    const leftDrawer = new THREE.Mesh(leftDrawerGeo, neonShaderMat);
    leftDrawer.position.set(0, leftTableHeight * 0.3, -leftTableDepth / 2 + 0.025);
    leftTableGroup.add(leftDrawer);

    // Position left table (bed is at x=2.5, z=-6)
    leftTableGroup.position.set(-2.2, floorY, -10);
    group.add(leftTableGroup);

    // --- Cabinet next to Left Bedside Table (GLB) ---
    const leftCabinetLoader = new GLTFLoader();
    leftCabinetLoader.load(
      'models/3_cabi.glb',
      (gltf) => {
        const leftCabinetModel = gltf.scene;

        // Preserve materials and enable shadows
        leftCabinetModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
            child.visible = true;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m) => {
              if (m) {
                m.visible = true;
                if (m.transparent) {
                  m.opacity = Math.max(0.1, m.opacity || 1.0);
                }
              }
            });
          }
        });

        // Scale to appropriate size
        const bbox = new THREE.Box3().setFromObject(leftCabinetModel);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());
        const targetWidth = 8;
        const scaleFactor = size.x > 0 ? targetWidth / size.x : 1.0;
        leftCabinetModel.scale.setScalar(scaleFactor);

        // Re-center and position on floor
        const scaledBox = new THREE.Box3().setFromObject(leftCabinetModel);
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        leftCabinetModel.position.copy(scaledCenter).multiplyScalar(-1);
        leftCabinetModel.position.y += scaledSize.y / 2;

        // Position cabinet next to left bedside table (left table is at x=-2.2, z=-10)
        const leftCabinetGroup = new THREE.Group();
        leftCabinetGroup.add(leftCabinetModel);
        leftCabinetGroup.position.set(-8.5, -3.2, -10);
        group.add(leftCabinetGroup);

        console.log('Cabinet model (3_cabi.glb) loaded and placed next to left bedside table in Section 2.');
      },
      (progress) => {
        if (progress.lengthComputable) {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log('Loading cabinet model:', percentComplete.toFixed(2) + '%');
        }
      },
      (error) => {
        console.error('Error loading cabinet model (3_cabi.glb):', error);
      }
    );

    // --- Right Bedside Table ---
    const rightTableGroup = new THREE.Group();
    const rightTableWidth = 1.8;
    const rightTableDepth = 1.5;
    const rightTableHeight = 2.4;
    const rightTableTopThickness = 0.15;
    const rightLegThickness = 0.12;

    // Table top
    const rightTableTopGeo = new THREE.BoxGeometry(rightTableWidth, rightTableTopThickness, rightTableDepth, 2, 1, 2);
    const rightTableTop = new THREE.Mesh(rightTableTopGeo, neonShaderMat);
    rightTableTop.position.set(0, rightTableHeight, 0);
    rightTableGroup.add(rightTableTop);

    // Table legs (4 legs)
    const rightLegGeo = new THREE.BoxGeometry(rightLegThickness, rightTableHeight, rightLegThickness, 1, 1, 1);
    const rightLegPositions = [
      [-rightTableWidth / 2 + rightLegThickness / 2, rightTableHeight / 2, -rightTableDepth / 2 + rightLegThickness / 2],
      [rightTableWidth / 2 - rightLegThickness / 2, rightTableHeight / 2, -rightTableDepth / 2 + rightLegThickness / 2],
      [-rightTableWidth / 2 + rightLegThickness / 2, rightTableHeight / 2, rightTableDepth / 2 - rightLegThickness / 2],
      [rightTableWidth / 2 - rightLegThickness / 2, rightTableHeight / 2, rightTableDepth / 2 - rightLegThickness / 2]
    ];
    rightLegPositions.forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(rightLegGeo, neonShaderMat);
      leg.position.set(x, y, z);
      rightTableGroup.add(leg);
    });

    // Optional drawer front
    const rightDrawerGeo = new THREE.BoxGeometry(rightTableWidth * 0.9, rightTableHeight * 0.4, 0.05, 2, 1, 1);
    const rightDrawer = new THREE.Mesh(rightDrawerGeo, neonShaderMat);
    rightDrawer.position.set(0, rightTableHeight * 0.3, -rightTableDepth / 2 + 0.025);
    rightTableGroup.add(rightDrawer);

    // Position right table (bed is at x=2.5, z=-6)
    rightTableGroup.position.set(7, floorY, -10);
    group.add(rightTableGroup);

    // --- Wardrobe (GLB) ---
    const wardrobeLoader = new GLTFLoader();
    wardrobeLoader.load(
      'models/3_war.glb',
      (gltf) => {
        const wardrobeModel = gltf.scene;

        // Ensure visibility and shadows
        wardrobeModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
            child.visible = true;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m) => {
              if (m) {
                m.visible = true;
                m.transparent = false;
                m.opacity = 1.0;
              }
            });
          }
        });

        // Scale to target width ~5 units
        const bbox = new THREE.Box3().setFromObject(wardrobeModel);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());
        const targetWidth = 7.0;
        const scaleFactor = size.x > 0 ? targetWidth / size.x : 1.0;
        wardrobeModel.scale.setScalar(scaleFactor);

        // Recenter to origin
        const scaledBox = new THREE.Box3().setFromObject(wardrobeModel);
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        wardrobeModel.position.copy(scaledCenter).multiplyScalar(-1);
        wardrobeModel.position.y += scaledSize.y / 2;

        // Place in room
        const wardrobeGroup = new THREE.Group();
        wardrobeGroup.add(wardrobeModel);
        wardrobeGroup.position.set(10.5, floorY, -8.5);
        wardrobeGroup.rotation.y = Math.PI*1.5; // face into room
        group.add(wardrobeGroup);

        console.log('Wardrobe model (3_war.glb) loaded and placed in Section 2.');
      },
      (progress) => {
        if (progress.lengthComputable) {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log('Loading wardrobe model:', percentComplete.toFixed(2) + '%');
        }
      },
      (error) => {
        console.error('Error loading wardrobe model (3_war.glb):', error);
      }
    );

    // --- Second Wardrobe (GLB) ---
    const wardrobeLoader2 = new GLTFLoader();
    wardrobeLoader2.load(
      'models/3_war.glb',
      (gltf) => {
        const wardrobeModel2 = gltf.scene;

        // Ensure visibility and shadows
        wardrobeModel2.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
            child.visible = true;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m) => {
              if (m) {
                m.visible = true;
                m.transparent = false;
                m.opacity = 1.0;
              }
            });
          }
        });

        // Scale to target width ~5 units
        const bbox = new THREE.Box3().setFromObject(wardrobeModel2);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());
        const targetWidth = 7.0;
        const scaleFactor = size.x > 0 ? targetWidth / size.x : 1.0;
        wardrobeModel2.scale.setScalar(scaleFactor);

        // Recenter to origin
        const scaledBox = new THREE.Box3().setFromObject(wardrobeModel2);
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        wardrobeModel2.position.copy(scaledCenter).multiplyScalar(-1);
        wardrobeModel2.position.y += scaledSize.y / 2;

        // Place in room next to first wardrobe (first wardrobe is at x=10.5, z=-8.5)
        const wardrobeGroup2 = new THREE.Group();
        wardrobeGroup2.add(wardrobeModel2);
        wardrobeGroup2.position.set(10.5, floorY, -1.5); // Position next to first wardrobe
        wardrobeGroup2.rotation.y = Math.PI*1.5; // face into room
        group.add(wardrobeGroup2);

        console.log('Second wardrobe model (3_war.glb) loaded and placed in Section 2.');
      },
      (progress) => {
        if (progress.lengthComputable) {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log('Loading second wardrobe model:', percentComplete.toFixed(2) + '%');
        }
      },
      (error) => {
        console.error('Error loading second wardrobe model (3_war.glb):', error);
      }
    );

    // === CURTAINS ON LEFT WALL (GLB) ===
    const curtainLoader = new GLTFLoader();
    curtainLoader.load(
      'models/3_curt.glb',
      (gltf) => {
        const curtainModel = gltf.scene;

        // Preserve materials and enable shadows
        curtainModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
            child.visible = true;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m) => {
              if (m) {
                m.visible = true;
                if (m.transparent) {
                  m.opacity = Math.max(0.1, m.opacity || 1.0);
                }
              }
            });
          }
        });

        // Scale to appropriate size
        const bbox = new THREE.Box3().setFromObject(curtainModel);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());
        const targetWidth = 10.5; // Adjust to fit wall width
        const scaleFactor = size.x > 0 ? targetWidth / size.x : 1.0;
        curtainModel.scale.setScalar(scaleFactor);

        // Re-center and position on left wall
        const scaledBox = new THREE.Box3().setFromObject(curtainModel);
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        curtainModel.position.copy(scaledCenter).multiplyScalar(-1);
        curtainModel.position.y += scaledSize.y / 2;

        // Position on left wall (negative X-axis)
        const roomSize = 25;
        const wallThickness = 0.3;
        const leftWallX = -roomSize / 2;
        const curtainGroup = new THREE.Group();
        curtainGroup.add(curtainModel);
        curtainGroup.position.set(-11.5 + wallThickness / 2, floorY, 0);
        curtainGroup.rotation.y = Math.PI / 2; // Rotate 90 degrees
        group.add(curtainGroup);

        console.log('Curtain model (3_curt.glb) loaded and placed on left wall in Section 2.');
      },
      (progress) => {
        if (progress.lengthComputable) {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log('Loading curtain model:', percentComplete.toFixed(2) + '%');
        }
      },
      (error) => {
        console.error('Error loading curtain model (3_curt.glb):', error);
      }
    );

    // === CARPET: Load Blender GLB Model (Preserve Original Materials) ===
    const carpetLoader2 = new GLTFLoader();
    
    carpetLoader2.load(
      'models/3_car.glb',
      (gltf) => {
        console.log('Carpet model loaded successfully in Section 2');
        const carpetModel = gltf.scene;
        
        // Preserve all original materials and textures from Blender
        carpetModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.visible = true;
            // Disable frustum culling for thin objects to ensure they render
            child.frustumCulled = false;
            
            // Ensure materials are visible and not transparent
            const mat = child.material;
            const materials = Array.isArray(mat) ? mat : [mat];
            materials.forEach((m) => {
              if (m) {
                m.visible = true;
                // If material is transparent, ensure it's set up correctly
                if (m.transparent) {
                  m.opacity = Math.max(0.1, m.opacity || 1.0);
                }
              }
            });
          }
        });
        
        // Calculate bounding box to understand model size
        const box = new THREE.Box3().setFromObject(carpetModel);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        console.log('Carpet model size:', size);
        console.log('Carpet model center:', center);
        
        // Auto-scale to appropriate size for bedroom
        const targetWidth = 10;
        const scaleFactor = size.x > 0 ? targetWidth / size.x : 1;
        carpetModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
        
        // Position on floor in bedroom (center of room)
        const scaledBox = new THREE.Box3().setFromObject(carpetModel);
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        
        // Position carpet in center of bedroom
        carpetModel.position.set(1.5, 0, -2);
        carpetModel.position.sub(scaledCenter.clone().multiplyScalar(scaleFactor));
        
        // For very thin carpets, ensure they're visible above the floor
        if (scaledSize.y < 0.1) {
          // Very thin carpet - position slightly above floor to ensure visibility
          carpetModel.position.y = -2.72; // Slightly above floor (y = -3)
        } else {
          // Normal thickness - use calculated position
          carpetModel.position.y = scaledSize.y / 2 - 5;
        }
        
        // Ensure the entire model is visible
        carpetModel.visible = true;
        
        group.add(carpetModel);
        console.log('Carpet added to Section 2 with original materials preserved');
        console.log('Final position:', carpetModel.position);
        console.log('Final scale:', carpetModel.scale);
      },
      (progress) => {
        if (progress.lengthComputable) {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log('Loading carpet:', percentComplete.toFixed(2) + '%');
        }
      },
      (error) => {
        console.error('Error loading carpet model:', error);
        console.error('Make sure models/3_car.glb exists');
      }
    );

    // === FLOATING OBJECTS (pill, pill2, han) ===
    const floatingLoader2 = new GLTFLoader();
    const floatingModels2 = [
      { path: 'models/3_pill.glb', min: 4, max: 6 },
      { path: 'models/3_pill2.glb', min: 4, max: 6 },
      { path: 'models/3_han.glb', min: 4, max: 7 }
    ];
    
    // Size multipliers for each model (adjust these to control sizes)
    const floatingModelSizes2 = {
      'models/3_pill.glb': 2.7,
      'models/3_pill2.glb': 2.7,
      'models/3_han.glb': 1.5
    };

    floatingModels2.forEach(({ path, min, max }) => {
      floatingLoader2.load(
        path,
        (gltf) => {
          console.log(`Floating model loaded in Section 2: ${path}`);
          const base = gltf.scene;

          // Ensure materials/shadows
          base.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.visible = true;
              child.frustumCulled = false;
            }
          });

          // Compute base scale to a modest size (~1.2 max dimension)
          const bbox = new THREE.Box3().setFromObject(base);
          const size = bbox.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const targetMax = 1.2;
          const baseScaleFactor = maxDim > 0 ? targetMax / maxDim : 1;

          const count = Math.floor(Math.random() * (max - min + 1)) + min;
          // Get size multiplier for this model (default to 1.0 if not specified)
          const sizeMultiplier = floatingModelSizes2[path] || 1.0;
          
          for (let idx = 0; idx < count; idx++) {
            const model = base.clone(true);
            // Apply controlled size multiplier
            const scaleFactor = baseScaleFactor * sizeMultiplier;
            model.scale.setScalar(scaleFactor);

            // Random position within the bedroom (relative to Section 2)
            // Room boundaries: x: -12.5 to +12.5, z: -12.5 to +12.5, y: -3 to 5
            model.position.set(
              (Math.random() - 0.5) * 24,     // x: -12 to +12 (within room)
              -2 + Math.random() * 6,         // y: -2 to 4 (within room height)
              (Math.random() - 0.5) * 24      // z: -12 to +12 (within room)
            );

            // Small random rotation start
            model.rotation.set(
              Math.random() * Math.PI,
              Math.random() * Math.PI,
              Math.random() * Math.PI
            );

            // Random drift velocity
            const velocity = new THREE.Vector3(
              (Math.random() - 0.5) * 0.4,  // x drift
              (Math.random() - 0.2) * 0.2,  // y drift (slightly upward bias)
              (Math.random() - 0.5) * 0.4   // z drift
            );

            // Full room boundaries (roomSize = 25, so -12.5 to +12.5)
            const bounds = {
              xMin: -12.5,
              xMax: 12.5,
              yMin: -3,
              yMax: 5,
              zMin: -12.5,
              zMax: 12.5
            };

            group.add(model);
            rotatingObjects.push(model);
            floatingItems.push({ mesh: model, velocity, bounds });
          }
        },
        (progress) => {
          if (progress.lengthComputable) {
            const percentComplete = (progress.loaded / progress.total) * 100;
            console.log(`Loading ${path}:`, percentComplete.toFixed(2) + '%');
          }
        },
        (error) => {
          console.error(`Error loading floating model ${path}:`, error);
        }
      );
    });

    // Keep some ambient abstract geometry for consistency
    addRandomRoomGeometry(group, i, neonShaderMat);
  } else if (i === 3) {
    // === SECTION 3: BATHROOM (Shower + Bathtub) ===
    createRoomShell(group, neonShaderMat);
    const floorY = -3;

    // --- Bathtub (GLB) ---
    const bathtubLoader = new GLTFLoader();
    bathtubLoader.load(
      'models/4_bathtub.glb',
      (gltf) => {
        const bathtubModel = gltf.scene;

        // Preserve materials and enable shadows
        bathtubModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
            child.visible = true;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m) => {
              if (m) {
                m.visible = true;
                if (m.transparent) {
                  m.opacity = Math.max(0.1, m.opacity || 1.0);
                }
              }
            });
          }
        });

        // Scale to appropriate size
        const bbox = new THREE.Box3().setFromObject(bathtubModel);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());
        const targetLength = 4.0;
        const scaleFactor = size.z > 0 ? targetLength / size.z : 1.0;
        bathtubModel.scale.setScalar(scaleFactor);

        // Re-center and position on floor
        const scaledBox = new THREE.Box3().setFromObject(bathtubModel);
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        bathtubModel.position.copy(scaledCenter).multiplyScalar(-1);
        bathtubModel.position.y += scaledSize.y / 2;

        // Position bathtub
        const bathtubGroup = new THREE.Group();
        bathtubGroup.add(bathtubModel);
        bathtubGroup.position.set(0, floorY, -10);
        group.add(bathtubGroup);

        console.log('Bathtub model (4_bathtub.glb) loaded and placed in Section 3.');
      },
      (progress) => {
        if (progress.lengthComputable) {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log('Loading bathtub model:', percentComplete.toFixed(2) + '%');
        }
      },
      (error) => {
        console.error('Error loading bathtub model (4_bathtub.glb):', error);
      }
    );

    // --- Shower (GLB) ---
    const showerLoader = new GLTFLoader();
    showerLoader.load(
      'models/4_shower.glb',
      (gltf) => {
        const showerModel = gltf.scene;

        // Preserve materials and enable shadows
        showerModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
            child.visible = true;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m) => {
              if (m) {
                m.visible = true;
                if (m.transparent) {
                  m.opacity = Math.max(0.1, m.opacity || 1.0);
                }
              }
            });
          }
        });

        // Scale to appropriate size
        const bbox = new THREE.Box3().setFromObject(showerModel);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());
        const targetWidth = 4.5;
        const scaleFactor = size.x > 0 ? targetWidth / size.x : 1.0;
        showerModel.scale.setScalar(scaleFactor);

        // Re-center and position on floor
        const scaledBox = new THREE.Box3().setFromObject(showerModel);
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        showerModel.position.copy(scaledCenter).multiplyScalar(-1);
        showerModel.position.y += scaledSize.y / 2;

        // Position shower
        const showerGroup = new THREE.Group();
        showerGroup.add(showerModel);
        showerGroup.position.set(9.5, floorY, -10);
        showerGroup.rotation.y = Math.PI*1.5; // Rotate 90 degrees
        group.add(showerGroup);

        console.log('Shower model (4_shower.glb) loaded and placed in Section 3.');
      },
      (progress) => {
        if (progress.lengthComputable) {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log('Loading shower model:', percentComplete.toFixed(2) + '%');
        }
      },
      (error) => {
        console.error('Error loading shower model (4_shower.glb):', error);
      }
    );

    // --- Washbasin/Sink (GLB) ---
    const sinkLoader = new GLTFLoader();
    sinkLoader.load(
      'models/4_sink.glb',
      (gltf) => {
        const sinkModel = gltf.scene;

        // Preserve materials and enable shadows
        sinkModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
            child.visible = true;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m) => {
              if (m) {
                m.visible = true;
                if (m.transparent) {
                  m.opacity = Math.max(0.1, m.opacity || 1.0);
                }
              }
            });
          }
        });

        // Scale to appropriate size
        const bbox = new THREE.Box3().setFromObject(sinkModel);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());
        const targetWidth = 5;
        const scaleFactor = size.x > 0 ? targetWidth / size.x : 1.0;
        sinkModel.scale.setScalar(scaleFactor);

        // Re-center and position on floor
        const scaledBox = new THREE.Box3().setFromObject(sinkModel);
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        sinkModel.position.copy(scaledCenter).multiplyScalar(-1);
        sinkModel.position.y += scaledSize.y / 2;

        // Position sink
        const sinkGroup = new THREE.Group();
        sinkGroup.add(sinkModel);
        sinkGroup.position.set(11, -2.5, -1);
        sinkGroup.rotation.y = -Math.PI / 2; // Face into room
        group.add(sinkGroup);

        console.log('Sink model (4_sink.glb) loaded and placed in Section 3.');
      },
      (progress) => {
        if (progress.lengthComputable) {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log('Loading sink model:', percentComplete.toFixed(2) + '%');
        }
      },
      (error) => {
        console.error('Error loading sink model (4_sink.glb):', error);
      }
    );

    // --- Toilet next to Sink (GLB) ---
    const toiletLoader = new GLTFLoader();
    toiletLoader.load(
      'models/4_toi.glb',
      (gltf) => {
        const toiletModel = gltf.scene;

        // Preserve materials and enable shadows
        toiletModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
            child.visible = true;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m) => {
              if (m) {
                m.visible = true;
                if (m.transparent) {
                  m.opacity = Math.max(0.1, m.opacity || 1.0);
                }
              }
            });
          }
        });

        // Scale to appropriate size
        const bbox = new THREE.Box3().setFromObject(toiletModel);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());
        const targetWidth = 1.8;
        const scaleFactor = size.x > 0 ? targetWidth / size.x : 1.0;
        toiletModel.scale.setScalar(scaleFactor);

        // Re-center and position on floor
        const scaledBox = new THREE.Box3().setFromObject(toiletModel);
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        toiletModel.position.copy(scaledCenter).multiplyScalar(-1);
        toiletModel.position.y += scaledSize.y / 2;

        // Position toilet next to sink (sink is at x=11.5, z=1)
        const toiletGroup = new THREE.Group();
        toiletGroup.add(toiletModel);
        toiletGroup.position.set(10.6, -3.2, -5);
        toiletGroup.rotation.y = Math.PI * 1.5; // Face into room
        group.add(toiletGroup);

        console.log('Toilet model (4_toi.glb) loaded and placed in Section 3.');
      },
      (progress) => {
        if (progress.lengthComputable) {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log('Loading toilet model:', percentComplete.toFixed(2) + '%');
        }
      },
      (error) => {
        console.error('Error loading toilet model (4_toi.glb):', error);
      }
    );

    // --- Bathroom Cabinet ---
    const bathroomCabinetGroup = new THREE.Group();
    const cabinetWidth = 3.0;
    const cabinetDepth = 1.2;
    const cabinetHeight = 4.0; // Increased height
    const cabinetTopThickness = 0.15;
    const cabinetDoorWidth = 1.4;
    const cabinetDoorHeight = 3.5; // Increased to match new cabinet height
    const cabinetDoorThickness = 0.05;
    const legHeight = 0.3;
    const legThickness = 0.08;

    // Four legs at corners
    const legGeo = new THREE.BoxGeometry(legThickness, legHeight, legThickness, 1, 1, 1);
    
    const leg1 = new THREE.Mesh(legGeo, neonShaderMat);
    leg1.position.set(-cabinetWidth / 2 + legThickness / 2, legHeight / 2, -cabinetDepth / 2 + legThickness / 2);
    bathroomCabinetGroup.add(leg1);
    
    const leg2 = new THREE.Mesh(legGeo, neonShaderMat);
    leg2.position.set(cabinetWidth / 2 - legThickness / 2, legHeight / 2, -cabinetDepth / 2 + legThickness / 2);
    bathroomCabinetGroup.add(leg2);
    
    const leg3 = new THREE.Mesh(legGeo, neonShaderMat);
    leg3.position.set(-cabinetWidth / 2 + legThickness / 2, legHeight / 2, cabinetDepth / 2 - legThickness / 2);
    bathroomCabinetGroup.add(leg3);
    
    const leg4 = new THREE.Mesh(legGeo, neonShaderMat);
    leg4.position.set(cabinetWidth / 2 - legThickness / 2, legHeight / 2, cabinetDepth / 2 - legThickness / 2);
    bathroomCabinetGroup.add(leg4);

    // Cabinet base (positioned on top of legs)
    const cabinetBaseGeo = new THREE.BoxGeometry(cabinetWidth, cabinetHeight, cabinetDepth, 3, 3, 2);
    const cabinetBase = new THREE.Mesh(cabinetBaseGeo, neonShaderMat);
    cabinetBase.position.set(0, legHeight + cabinetHeight / 2, 0);
    bathroomCabinetGroup.add(cabinetBase);

    // Cabinet top
    const cabinetTopGeo = new THREE.BoxGeometry(cabinetWidth, cabinetTopThickness, cabinetDepth, 3, 1, 2);
    const cabinetTop = new THREE.Mesh(cabinetTopGeo, neonShaderMat);
    cabinetTop.position.set(0, legHeight + cabinetHeight + cabinetTopThickness / 2, 0);
    bathroomCabinetGroup.add(cabinetTop);

    // Cabinet doors (two doors)
    const leftDoorGeo = new THREE.BoxGeometry(cabinetDoorWidth, cabinetDoorHeight, cabinetDoorThickness, 2, 2, 1);
    const leftDoor = new THREE.Mesh(leftDoorGeo, neonShaderMat);
    leftDoor.position.set(-cabinetWidth / 4, legHeight + cabinetDoorHeight / 2, cabinetDepth / 2 + cabinetDoorThickness / 2);
    bathroomCabinetGroup.add(leftDoor);

    const rightDoorGeo = new THREE.BoxGeometry(cabinetDoorWidth, cabinetDoorHeight, cabinetDoorThickness, 2, 2, 1);
    const rightDoor = new THREE.Mesh(rightDoorGeo, neonShaderMat);
    rightDoor.position.set(cabinetWidth / 4, legHeight + cabinetDoorHeight / 2, cabinetDepth / 2 + cabinetDoorThickness / 2);
    bathroomCabinetGroup.add(rightDoor);

    // --- Towel on top of Cabinet (GLB) ---
    const towelLoader = new GLTFLoader();
    
    towelLoader.load(
      'models/4_tow.glb',
      (gltf) => {
        const towel = gltf.scene;
        
        // Preserve materials and enable shadows
        towel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
            child.visible = true;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m) => {
              if (m) {
                m.visible = true;
                if (m.transparent) {
                  m.opacity = Math.max(0.1, m.opacity || 1.0);
                }
              }
            });
          }
        });

        // Compute base scale
        const bbox = new THREE.Box3().setFromObject(towel);
        const size = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const targetMax = 1.2; // Target size for towel
        const scaleFactor = maxDim > 0 ? targetMax / maxDim : 1;
        towel.scale.setScalar(scaleFactor);

        // Re-center towel
        const scaledBox = new THREE.Box3().setFromObject(towel);
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        towel.position.copy(scaledCenter).multiplyScalar(-1);
        towel.position.y += scaledSize.y / 2;

        // Calculate cabinet top position and position towel on top
        const cabinetTopY = legHeight + cabinetHeight + cabinetTopThickness;
        towel.position.y += cabinetTopY;
        towel.position.x = 0; // Centered
        towel.position.z = 0; // Centered in depth
        
        bathroomCabinetGroup.add(towel);

        console.log('Towel model (4_tow.glb) loaded and placed on top of cabinet in Section 3.');
      },
      (progress) => {
        if (progress.lengthComputable) {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log('Loading towel model:', percentComplete.toFixed(2) + '%');
        }
      },
      (error) => {
        console.error('Error loading towel model (4_tow.glb):', error);
      }
    );

    // Position cabinet (on the wall opposite the sink/toilet area)
    bathroomCabinetGroup.position.set(11, floorY, 4);
    bathroomCabinetGroup.rotation.y = Math.PI * 1.5; // Face into room
    group.add(bathroomCabinetGroup);

    // --- Small Thick Slab on Ground (GLB) ---
    const slabLoader = new GLTFLoader();
    slabLoader.load(
      'models/4_car.glb',
      (gltf) => {
        const slabModel = gltf.scene;

        // Preserve materials and enable shadows
        slabModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
            child.visible = true;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m) => {
              if (m) {
                m.visible = true;
                if (m.transparent) {
                  m.opacity = Math.max(0.1, m.opacity || 1.0);
                }
              }
            });
          }
        });

        // Scale to appropriate size
        const bbox = new THREE.Box3().setFromObject(slabModel);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());
        const targetWidth = 2.5;
        const scaleFactor = size.x > 0 ? targetWidth / size.x : 1.0;
        slabModel.scale.setScalar(scaleFactor);

        // Re-center and position on floor
        const scaledBox = new THREE.Box3().setFromObject(slabModel);
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        slabModel.position.copy(scaledCenter).multiplyScalar(-1);
        slabModel.position.y += scaledSize.y / 2;

        // Position slab on ground
        slabModel.position.x += 9;
        slabModel.position.z += -1;
        slabModel.position.y = -2.7;

        group.add(slabModel);
        console.log('Slab model (4_car.glb) loaded and placed in Section 3.');
      },
      (progress) => {
        if (progress.lengthComputable) {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log('Loading slab model:', percentComplete.toFixed(2) + '%');
        }
      },
      (error) => {
        console.error('Error loading slab model (4_car.glb):', error);
      }
    );

    // === FLOATING OBJECTS (duc, pape, sop, tooth) ===
    const floatingLoader3 = new GLTFLoader();
    const floatingModels3 = [
      { path: 'models/4_duc.glb', min: 4, max: 6 },
      { path: 'models/4_pape.glb', min: 4, max: 6 },
      { path: 'models/4_sop.glb', min: 4, max: 6 },
      { path: 'models/4_tooth.glb', min: 4, max: 6 }
    ];
    
    // Size multipliers for each model (adjust these to control sizes)
    const floatingModelSizes3 = {
      'models/4_duc.glb': 0.9,
      'models/4_pape.glb': 1.2,
      'models/4_sop.glb': 1.2,
      'models/4_tooth.glb': 1.2
    };

    floatingModels3.forEach(({ path, min, max }) => {
      floatingLoader3.load(
        path,
        (gltf) => {
          console.log(`Floating model loaded in Section 3: ${path}`);
          const base = gltf.scene;

          // Ensure materials/shadows
          base.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.visible = true;
              child.frustumCulled = false;
            }
          });

          // Compute base scale to a modest size (~1.2 max dimension)
          const bbox = new THREE.Box3().setFromObject(base);
          const size = bbox.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const targetMax = 1.2;
          const baseScaleFactor = maxDim > 0 ? targetMax / maxDim : 1;

          const count = Math.floor(Math.random() * (max - min + 1)) + min;
          // Get size multiplier for this model (default to 1.0 if not specified)
          const sizeMultiplier = floatingModelSizes3[path] || 1.0;
          
          for (let idx = 0; idx < count; idx++) {
            const model = base.clone(true);
            // Apply controlled size multiplier
            const scaleFactor = baseScaleFactor * sizeMultiplier;
            model.scale.setScalar(scaleFactor);

            // Random position within the bathroom (relative to Section 3)
            // Room boundaries: x: -12.5 to +12.5, z: -12.5 to +12.5, y: -3 to 5
            model.position.set(
              (Math.random() - 0.5) * 24,     // x: -12 to +12 (within room)
              -2 + Math.random() * 6,         // y: -2 to 4 (within room height)
              (Math.random() - 0.5) * 24      // z: -12 to +12 (within room)
            );

            // Small random rotation start
            model.rotation.set(
              Math.random() * Math.PI,
              Math.random() * Math.PI,
              Math.random() * Math.PI
            );

            // Random drift velocity
            const velocity = new THREE.Vector3(
              (Math.random() - 0.5) * 0.4,  // x drift
              (Math.random() - 0.2) * 0.2,  // y drift (slightly upward bias)
              (Math.random() - 0.5) * 0.4   // z drift
            );

            // Full room boundaries (roomSize = 25, so -12.5 to +12.5)
            const bounds = {
              xMin: -12.5,
              xMax: 12.5,
              yMin: -3,
              yMax: 5,
              zMin: -12.5,
              zMax: 12.5
            };

            group.add(model);
            rotatingObjects.push(model);
            floatingItems.push({ mesh: model, velocity, bounds });
          }
        },
        (progress) => {
          if (progress.lengthComputable) {
            const percentComplete = (progress.loaded / progress.total) * 100;
            console.log(`Loading ${path}:`, percentComplete.toFixed(2) + '%');
          }
        },
        (error) => {
          console.error(`Error loading floating model ${path}:`, error);
        }
      );
    });

    // Keep some ambient abstract geometry for consistency
    addRandomRoomGeometry(group, i, neonShaderMat);
  } else if (i === 4) {
    // === SECTION 4: OFFICE ===
    createRoomShell(group, neonShaderMat);
    const floorY = -3;

    // --- Office Desk (GLB) ---
    const deskLoader = new GLTFLoader();
    deskLoader.load(
      'models/5_desk.glb',
      (gltf) => {
        const deskModel = gltf.scene;

        // Preserve materials and enable shadows
        deskModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
            child.visible = true;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m) => {
              if (m) {
                m.visible = true;
                if (m.transparent) {
                  m.opacity = Math.max(0.1, m.opacity || 1.0);
                }
              }
            });
          }
        });

        // Scale to appropriate size
        const bbox = new THREE.Box3().setFromObject(deskModel);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());
        const targetWidth = 12.0;
        const scaleFactor = size.x > 0 ? targetWidth / size.x : 1.0;
        deskModel.scale.setScalar(scaleFactor);

        // Re-center and position on floor
        const scaledBox = new THREE.Box3().setFromObject(deskModel);
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        deskModel.position.copy(scaledCenter).multiplyScalar(-1);
        deskModel.position.y += scaledSize.y / 2;

        // Position desk in center of office
        const deskGroup = new THREE.Group();
        deskGroup.add(deskModel);
        deskGroup.position.set(0, floorY, -6);
        deskGroup.rotation.y = Math.PI / 2; // Face into room
        group.add(deskGroup);

        console.log('Desk model (5_desk.glb) loaded and placed in Section 4.');
      },
      (progress) => {
        if (progress.lengthComputable) {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log('Loading desk model:', percentComplete.toFixed(2) + '%');
        }
      },
      (error) => {
        console.error('Error loading desk model (5_desk.glb):', error);
      }
    );

    // --- Desk and Chair Group (Procedural) ---
    // Group position and size - adjust these to move/resize the entire desk+chair set
    const deskChairGroupX = 8; // X position in room
    const deskChairGroupY = floorY; // Y position (floor level)
    const deskChairGroupZ = -6; // Z position in room
    const deskChairGroupRotation = Math.PI / 2; // Rotation (face into room)
    const deskChairScale = 1.0; // Scale multiplier (1.0 = normal size)

    // Create parent group for desk and chair
    const deskChairGroup = new THREE.Group();
    deskChairGroup.scale.setScalar(deskChairScale);

    // --- Desk (Procedural) ---
    const deskGroup2 = new THREE.Group();
    const deskWidth2 = 4.0;
    const deskDepth2 = 1.7;
    const deskHeight2 = 1.9;
    const deskTopThickness2 = 0.15;
    const deskLegThickness2 = 0.1;

    // Desk top
    const deskTopGeo2 = new THREE.BoxGeometry(deskWidth2, deskTopThickness2, deskDepth2, 3, 1, 2);
    const deskTop2 = new THREE.Mesh(deskTopGeo2, neonShaderMat);
    deskTop2.position.set(0, deskHeight2 + deskTopThickness2 / 2, 0);
    deskGroup2.add(deskTop2);

    // Desk legs (4 legs)
    const legGeo2 = new THREE.BoxGeometry(deskLegThickness2, deskHeight2, deskLegThickness2, 1, 1, 1);
    const legPositions2 = [
      [-deskWidth2 / 2 + deskLegThickness2 / 2, deskHeight2 / 2, -deskDepth2 / 2 + deskLegThickness2 / 2],
      [deskWidth2 / 2 - deskLegThickness2 / 2, deskHeight2 / 2, -deskDepth2 / 2 + deskLegThickness2 / 2],
      [-deskWidth2 / 2 + deskLegThickness2 / 2, deskHeight2 / 2, deskDepth2 / 2 - deskLegThickness2 / 2],
      [deskWidth2 / 2 - deskLegThickness2 / 2, deskHeight2 / 2, deskDepth2 / 2 - deskLegThickness2 / 2]
    ];

    legPositions2.forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(legGeo2, neonShaderMat);
      leg.position.set(x, y, z);
      deskGroup2.add(leg);
    });

    // Desk drawer (on one side)
    const drawerGeo2 = new THREE.BoxGeometry(deskWidth2 * 0.4, deskHeight2 * 0.6, deskDepth2 * 0.3, 2, 2, 1);
    const drawer2 = new THREE.Mesh(drawerGeo2, neonShaderMat);
    drawer2.position.set(-deskWidth2 / 4, deskHeight2 * 0.3, -deskDepth2 / 2 - deskDepth2 * 0.15);
    deskGroup2.add(drawer2);

    // Position desk at origin of group (0, 0, 0)
    deskGroup2.position.set(0, 0, 0);
    deskGroup2.rotation.y = 0; // Will be rotated by parent group
    deskChairGroup.add(deskGroup2);

    // --- Computer on Desk ---
    const computerGroup = new THREE.Group();
    const deskTopY = deskHeight2 + deskTopThickness2 / 2;
    
    // Monitor
    const monitorWidth = 1.3;
    const monitorHeight = 1;
    const monitorDepth = 0.1;
    const monitorStandHeight = 0.15;
    const monitorStandWidth = 0.3;
    
    // Monitor screen
    const monitorGeo = new THREE.BoxGeometry(monitorWidth, monitorHeight, monitorDepth, 2, 2, 1);
    const monitor = new THREE.Mesh(monitorGeo, neonShaderMat);
    monitor.position.set(0, deskTopY + monitorStandHeight + monitorHeight / 2, 0);
    computerGroup.add(monitor);
    
    // Monitor stand/base
    const standGeo = new THREE.BoxGeometry(monitorStandWidth, monitorStandHeight, monitorStandWidth, 1, 1, 1);
    const stand = new THREE.Mesh(standGeo, neonShaderMat);
    stand.position.set(0, deskTopY + monitorStandHeight / 2, 0);
    computerGroup.add(stand);
    
    // Position computer on desk (centered on desk top)
    computerGroup.position.set(0, 0, 0);
    computerGroup.rotation.y = 0; // Will be rotated by parent group
    deskChairGroup.add(computerGroup);

    // --- Office Chair (Procedural) ---
    const chairGroup = new THREE.Group();
    const chairSeatHeight = 1;
    const chairSeatWidth = 0.7;
    const chairSeatDepth = 0.7;
    const chairBackHeight = 1.0;
    const chairBackWidth = 0.6;

    // Chair seat
    const seatGeo = new THREE.BoxGeometry(chairSeatWidth, 0.12, chairSeatDepth, 2, 1, 2);
    const seat = new THREE.Mesh(seatGeo, neonShaderMat);
    seat.position.set(0, chairSeatHeight, 0);
    chairGroup.add(seat);

    // Chair back
    const backGeo = new THREE.BoxGeometry(chairBackWidth, chairBackHeight, 0.12, 2, 2, 1);
    const back = new THREE.Mesh(backGeo, neonShaderMat);
    back.position.set(0, chairSeatHeight + chairBackHeight / 2, -chairSeatDepth / 2);
    back.rotation.x = -0.15; // Slight tilt for comfort
    chairGroup.add(back);

    // Chair legs (4 legs at corners supporting the seat)
    const chairLegHeight = chairSeatHeight; // Legs go from floor to seat
    const chairLegThickness = 0.08;
    const legGeo = new THREE.BoxGeometry(chairLegThickness, chairLegHeight, chairLegThickness, 1, 1, 1);
    const legPositions = [
      [-chairSeatWidth / 2 + chairLegThickness / 2, chairLegHeight / 2, -chairSeatDepth / 2 + chairLegThickness / 2],
      [chairSeatWidth / 2 - chairLegThickness / 2, chairLegHeight / 2, -chairSeatDepth / 2 + chairLegThickness / 2],
      [-chairSeatWidth / 2 + chairLegThickness / 2, chairLegHeight / 2, chairSeatDepth / 2 - chairLegThickness / 2],
      [chairSeatWidth / 2 - chairLegThickness / 2, chairLegHeight / 2, chairSeatDepth / 2 - chairLegThickness / 2]
    ];

    legPositions.forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(legGeo, neonShaderMat);
      leg.position.set(x, y, z);
      chairGroup.add(leg);
    });

    // Scale chair to 1.5x size
    chairGroup.scale.setScalar(1.5);

    // Position chair closer to desk (in front, relative to group origin)
    const chairOffsetFromDesk = 1.2; // Distance from desk front edge
    chairGroup.position.set(0, 0, chairOffsetFromDesk); // In front of desk
    chairGroup.rotation.y = Math.PI; // Rotated 180 degrees
    deskChairGroup.add(chairGroup);

    // Position and rotate the entire group
    deskChairGroup.position.set(-3.7, deskChairGroupY, deskChairGroupZ);
    deskChairGroup.rotation.y = deskChairGroupRotation;
    group.add(deskChairGroup);

    // === FLOATING OBJECTS (5_pen, 5_mou, 5_tra, 5_cof) ===
    const floatingLoader4 = new GLTFLoader();
    const floatingModels4 = [
      { path: 'models/5_pen.glb', min: 4, max: 5 },
      { path: 'models/5_mou.glb', min: 4, max: 5 },
      { path: 'models/5_tra.glb', min: 4, max: 5 },
      { path: 'models/5_cof.glb', min: 4, max: 5 },
      { path: 'models/5_note.glb', min: 4, max: 5 }
    ];
    
    // Size multipliers for each model (adjust these to control sizes)
    const floatingModelSizes4 = {
      'models/5_pen.glb': 0.9,
      'models/5_mou.glb': 0.9,
      'models/5_tra.glb': 1.4,
      'models/5_cof.glb': 0.5,
      'models/5_note.glb': 0.7
    };

    floatingModels4.forEach(({ path, min, max }) => {
      floatingLoader4.load(
        path,
        (gltf) => {
          console.log(`Floating model loaded in Section 4: ${path}`);
          const base = gltf.scene;

          // Ensure materials/shadows
          base.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.visible = true;
              child.frustumCulled = false;
            }
          });

          // Compute base scale to a modest size (~1.2 max dimension)
          const bbox = new THREE.Box3().setFromObject(base);
          const size = bbox.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const targetMax = 1.2;
          const baseScaleFactor = maxDim > 0 ? targetMax / maxDim : 1;

          const count = Math.floor(Math.random() * (max - min + 1)) + min;
          // Get size multiplier for this model (default to 1.0 if not specified)
          const sizeMultiplier = floatingModelSizes4[path] || 1.0;
          
          for (let idx = 0; idx < count; idx++) {
            const model = base.clone(true);
            // Apply controlled size multiplier
            const scaleFactor = baseScaleFactor * sizeMultiplier;
            model.scale.setScalar(scaleFactor);

            // Random position within the room (relative to Section 4)
            // Room boundaries: x: -12.5 to +12.5, z: -12.5 to +12.5, y: -3 to 5
            model.position.set(
              (Math.random() - 0.5) * 24,     // x: -12 to +12 (within room)
              -2 + Math.random() * 6,         // y: -2 to 4 (within room height)
              (Math.random() - 0.5) * 24      // z: -12 to +12 (within room)
            );

            // Small random rotation start
            model.rotation.set(
              Math.random() * Math.PI,
              Math.random() * Math.PI,
              Math.random() * Math.PI
            );

            // Random drift velocity
            const velocity = new THREE.Vector3(
              (Math.random() - 0.5) * 0.4,  // x drift
              (Math.random() - 0.2) * 0.2,  // y drift (slightly upward bias)
              (Math.random() - 0.5) * 0.4   // z drift
            );

            // Full room boundaries (roomSize = 25, so -12.5 to +12.5)
            const bounds = {
              xMin: -12.5,
              xMax: 12.5,
              yMin: -3,
              yMax: 5,
              zMin: -12.5,
              zMax: 12.5
            };

            group.add(model);
            rotatingObjects.push(model);
            floatingItems.push({ mesh: model, velocity, bounds });
          }
        },
        (progress) => {
          if (progress.lengthComputable) {
            const percentComplete = (progress.loaded / progress.total) * 100;
            console.log(`Loading ${path}:`, percentComplete.toFixed(2) + '%');
          }
        },
        (error) => {
          console.error(`Error loading floating model ${path}:`, error);
        }
      );
    });

    // Keep some ambient abstract geometry for consistency
    addRandomRoomGeometry(group, i, neonShaderMat);
  } else if (i === 5) {
    // === SECTION 5: Court (GLB Model) ===
    createRoomShell(group, neonShaderMat);
    const floorY = -3;
    
    // Load court GLB model
    const courtLoader = new GLTFLoader();
    courtLoader.load(
      'models/6_cour.glb',
      (gltf) => {
        const courtModel = gltf.scene;
        
        // Enable shadows for all meshes
        courtModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        
        // Calculate bounding box for scaling and positioning
        const box = new THREE.Box3().setFromObject(courtModel);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        console.log('Court model (6_cour.glb) loaded. Size:', size, 'Center:', center);
        
        // Scale the court to make it bigger (1.5x scale)
        const scaleFactor = 1.4;
        courtModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
        
        // Position in the center of the room, on the floor
        courtModel.position.set(11, -0.3, 0);
        courtModel.position.sub(center.clone().multiplyScalar(scaleFactor));
        
        // Rotate 90 degrees around Y axis
        courtModel.rotation.y = Math.PI / 2;
        
        group.add(courtModel);
        console.log('Court model (6_cour.glb) placed in Section 5.');
      },
      (progress) => {
        if (progress.lengthComputable) {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log('Loading court model:', percentComplete.toFixed(2) + '%');
        }
      },
      (error) => {
        console.error('Error loading court model (6_cour.glb):', error);
      }
    );
    
    // === FLOATING OBJECTS (6_bas, 6_bottle, 6_sho) ===
    const floatingLoader5 = new GLTFLoader();
    const floatingModels5 = [
      { path: 'models/6_bas.glb', min: 8, max: 10 },
      { path: 'models/6_bottle.glb', min: 8 , max: 10 },
      { path: 'models/6_sho.glb', min: 8, max: 10 }
    ];
    
    // Size multipliers for each model (adjust these to control sizes)
    const floatingModelSizes5 = {
      'models/6_bas.glb': 1.1,
      'models/6_bottle.glb': 0.9,
      'models/6_sho.glb': 1.1
    };

    floatingModels5.forEach(({ path, min, max }) => {
      floatingLoader5.load(
        path,
        (gltf) => {
          console.log(`Floating model loaded in Section 5: ${path}`);
          const base = gltf.scene;

          // Ensure materials/shadows
          base.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.visible = true;
              child.frustumCulled = false;
            }
          });

          // Compute base scale to a modest size (~1.2 max dimension)
          const bbox = new THREE.Box3().setFromObject(base);
          const size = bbox.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const targetMax = 1.2;
          const baseScaleFactor = maxDim > 0 ? targetMax / maxDim : 1;

          const count = Math.floor(Math.random() * (max - min + 1)) + min;
          // Get size multiplier for this model (default to 1.0 if not specified)
          const sizeMultiplier = floatingModelSizes5[path] || 1.0;
          
          for (let idx = 0; idx < count; idx++) {
            const model = base.clone(true);
            // Apply controlled size multiplier
            const scaleFactor = baseScaleFactor * sizeMultiplier;
            model.scale.setScalar(scaleFactor);

            // Random position within the room (relative to Section 5)
            // Room boundaries: x: -12.5 to +12.5, z: -12.5 to +12.5, y: -3 to 5
            model.position.set(
              (Math.random() - 0.5) * 24,     // x: -12 to +12 (within room)
              -2 + Math.random() * 6,         // y: -2 to 4 (within room height)
              (Math.random() - 0.5) * 24      // z: -12 to +12 (within room)
            );

            // Small random rotation start
            model.rotation.set(
              Math.random() * Math.PI,
              Math.random() * Math.PI,
              Math.random() * Math.PI
            );

            // Random drift velocity
            const velocity = new THREE.Vector3(
              (Math.random() - 0.5) * 0.4,  // x drift
              (Math.random() - 0.2) * 0.2,  // y drift (slightly upward bias)
              (Math.random() - 0.5) * 0.4   // z drift
            );

            // Full room boundaries (roomSize = 25, so -12.5 to +12.5)
            const bounds = {
              xMin: -12.5,
              xMax: 12.5,
              yMin: -3,
              yMax: 5,
              zMin: -12.5,
              zMax: 12.5
            };

            group.add(model);
            rotatingObjects.push(model);
            floatingItems.push({ mesh: model, velocity, bounds });
          }
        },
        (progress) => {
          if (progress.lengthComputable) {
            const percentComplete = (progress.loaded / progress.total) * 100;
            console.log(`Loading ${path}:`, percentComplete.toFixed(2) + '%');
          }
        },
        (error) => {
          console.error(`Error loading floating model ${path}:`, error);
        }
      );
    });
    
    // Keep some ambient abstract geometry for consistency
    addRandomRoomGeometry(group, i, neonShaderMat);
  } else {
    // === SECTIONS 6-7: Full room shells with random geometry ===
    createRoomShell(group, neonShaderMat);
    addRandomRoomGeometry(group, i, neonShaderMat);
  }
  // === WATCHER BALLS (shared across sections) ===
  ensureWatchersInSection(group);

  // Bind per-mesh section uniform for stable palettes
  bindSectionUniform(group, i);
}

// Populate watchers now that all sections exist
populateAllWatchers();

// === PERFORMANCE OPTIMIZATION: Section Visibility Management ===
/**
 * Updates visibility and opacity of all sections based on continuous currentSection.
 * Sections fade in/out smoothly based on distance from currentSection.
 * This creates smooth, continuous transitions that feel like state recalculation.
 */
function updateSectionVisibility() {
  for (let i = 0; i < sections.length; i++) {
    const distance = Math.abs(i - currentSection);
    
    // Calculate opacity based on distance (smooth fade)
    let opacity = 1.0;
    if (distance > ACTIVE_RANGE) {
      // Fade out beyond active range
      const fadeStart = ACTIVE_RANGE;
      const fadeEnd = ACTIVE_RANGE + SECTION_FADE_DISTANCE;
      if (distance < fadeEnd) {
        opacity = 1.0 - (distance - fadeStart) / (fadeEnd - fadeStart);
        opacity = Math.max(0.0, opacity);
      } else {
        opacity = 0.0;
      }
    }
    
    // Set visibility and opacity
    if (opacity > 0.01) {
      sections[i].visible = true;
      // Apply opacity to all meshes in the section
      sections[i].traverse((obj) => {
        if (obj.isMesh && obj.material) {
          // Only modify opacity if material supports it
          if (obj.material.transparent !== undefined) {
            obj.material.transparent = opacity < 1.0;
          }
          if (obj.material.opacity !== undefined) {
            obj.material.opacity = opacity;
          }
        }
      });
    } else {
      sections[i].visible = false;
    }
  }
}

// === 相機設定 ===
const cameraBaseZ = 20;         // 初始在第一層前面一點
let currentSection = 0.0;       // Continuous section value (float) for smooth transitions
let targetSection = 0.0;        // Target section (can be fractional during transitions)
let targetCamZ = cameraBaseZ - 0 * SECTION_DISTANCE;

// === SMOOTH SECTION TRANSITION SETTINGS ===
const SECTION_TRANSITION_SPEED = 0.2;  // Speed of section interpolation (increased for smoother transitions)
const SECTION_FADE_DISTANCE = 5.0;      // Increased fade distance for smoother crossfades

// Internal waypoint movement speed (within a section)
const CAMERA_WAYPOINT_SPEED = 0.01;  // Lower = slower (default: 0.04, was 0.08)
// Section transition speed (between sections) - this controls the main transition feel
const CAMERA_TRANSITION_SPEED = 0.08;  // Lower = slower (default: 0.02, was 0.08)
// LookAt interpolation speed
const CAMERA_LOOKAT_SPEED = 0.7;  // Lower = slower lookAt changes (default: 0.05)

// === GEOMETRY ROTATION SPEED CONTROLS (Adjustable) ===
// 
// HOW TO ADJUST:
// - Lower values = slower rotation
// - Higher values = faster rotation
// - Recommended range: 0.01 (very slow) to 0.5 (very fast)
//
// X-axis rotation speed (vertical spin)
const GEOMETRY_ROTATION_X_SPEED = 0.2;  // Current: 0.05
// Y-axis rotation speed (horizontal spin)
const GEOMETRY_ROTATION_Y_SPEED = 0.2;   // Current: 0.1

// Easing function for smooth acceleration/deceleration (ease-in-out cubic)
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Smooth lerp with easing
function smoothLerp(start, end, speed, useEasing = false) {
  const diff = end - start;
  if (Math.abs(diff) < 0.001) return end; // Snap when very close
  
  if (useEasing) {
    // Calculate progress (0 to 1)
    const totalDistance = Math.abs(end - start);
    const currentDistance = Math.abs(diff);
    const progress = 1 - (currentDistance / totalDistance);
    const easedProgress = easeInOutCubic(progress);
    return start + diff * (1 - easedProgress) * speed;
  } else {
    return start + diff * speed;
  }
}

// Smooth lookAt interpolation helper (optimized - reuses vectors to avoid allocations)
const _lookAtCurrentForward = new THREE.Vector3();
const _lookAtCurrentPoint = new THREE.Vector3();
const _lookAtSmoothPoint = new THREE.Vector3();
let _lastLookAtTarget = new THREE.Vector3();
let _lastLookAtPoint = new THREE.Vector3();
let _lookAtInitialized = false;

function smoothLookAt(camera, targetLookAt, speed) {
  // Check if target has changed significantly (to detect waypoint changes)
  // Use a larger threshold to catch waypoint changes but ignore minor drift
  const targetChanged = !_lookAtInitialized ||
    Math.abs(_lastLookAtTarget.x - targetLookAt.x) > 0.5 ||
    Math.abs(_lastLookAtTarget.y - targetLookAt.y) > 0.5 ||
    Math.abs(_lastLookAtTarget.z - targetLookAt.z) > 0.5;
  
  if (targetChanged) {
    // Target changed (new waypoint) - recalculate current lookAt point from camera direction
    // This ensures smooth transition when waypoint changes
    camera.getWorldDirection(_lookAtCurrentForward);
    _lookAtCurrentPoint.copy(camera.position).add(_lookAtCurrentForward.multiplyScalar(10));
    _lastLookAtPoint.copy(_lookAtCurrentPoint);
    _lastLookAtTarget.set(targetLookAt.x, targetLookAt.y, targetLookAt.z);
    _lookAtInitialized = true;
  } else {
    // Target unchanged - use cached lookAt point for smooth continuation
    // This prevents drift and ensures smooth interpolation within the same waypoint
    _lookAtCurrentPoint.copy(_lastLookAtPoint);
  }
  
  // Interpolate lookAt point (reuse vectors to avoid allocations)
  _lookAtSmoothPoint.x = smoothLerp(_lookAtCurrentPoint.x, targetLookAt.x, speed);
  _lookAtSmoothPoint.y = smoothLerp(_lookAtCurrentPoint.y, targetLookAt.y, speed);
  _lookAtSmoothPoint.z = smoothLerp(_lookAtCurrentPoint.z, targetLookAt.z, speed);
  
  // Update cached point for next frame
  _lastLookAtPoint.copy(_lookAtSmoothPoint);
  
  camera.lookAt(_lookAtSmoothPoint);
}

// Initialize color state for starting view (Section 0, Step 0)
updateColorState(0, 0);

// Initialize section visibility for performance optimization
updateSectionVisibility();

// === SECTION 0 INTERNAL WAYPOINTS ===
let section0Step = 0; // 0 = A, 1 = B, 2 = C, 3 = exit to Section 1
const section0Waypoints = [     // Waypoint A: Starting position
  { x: 0, y: 4.5, z: 9, lookAt: { x: -3, y: 0.5, z: 2.5 } },    // Waypoint B: Deeper in room  // Waypoint C: In front of door
  { x: 6, y: 5, z: 0, lookAt: { x: 0, y: 1, z: 0 } },   
  { x: 3, y: 7.5, z: -5, lookAt: { x: -3, y: 0, z: 0 } },   
  { x: 0, y: -35, z: -15, lookAt: { x: 0, y: -1, z: -15 } }   // Waypoint D: Exit through door
];
let targetWaypoint = section0Waypoints[0];

// === SECTION 1 INTERNAL WAYPOINTS ===
// Section 1 room is at z = -30 (sections[1].position.z = -30)
let section1Step = 0; // 0, 1, 2 for internal views, 3 = exit to Section 2
const section1Waypoints = [
  // Step 0 → viewpoint A: front view toward the kitchen interior (entering room)
  { x: 1.5, y: 4.5, z: -21, lookAt: { x: -7.5, y: -2.5, z: -30 } },
  // Step 1 → viewpoint B: side view of counters/stove wall (at room center)
  { x: 4, y: 3.3, z: -30, lookAt: { x: 1, y: 2, z: -30 } },
  // Step 2 → viewpoint C: high-angle / top view (at room center, elevated)
  { x: -1, y: 7, z: -33.5, lookAt: { x: -7.7, y: -1.3, z: -30 } },
  // Step 3 → exit: move toward back doorway and transition to Section 2
  { x: -9, y: -35, z: -45, lookAt: { x: -6, y: -1, z: -45 } }
];
let targetWaypoint1 = section1Waypoints[0];

// === SECTION 2-7 INTERNAL WAYPOINTS ===
let section2Step = 0;
const section2Waypoints = [
  { x: 3, y: 4.5, z: -55, lookAt: { x: 0, y: 1, z: -60 } },
  { x: -3, y: 6, z: -60, lookAt: { x: 2.5, y: 0, z: -65 } },
  { x: 4, y: 4.8, z: -62, lookAt: { x: -1, y: 0.6, z: -65 } },
  { x: 0, y: -20, z: -75, lookAt: { x: 0, y: -1, z: -75 } }
];
let targetWaypoint2 = section2Waypoints[0];

let section3Step = 0;
const section3Waypoints = [
  { x: -3, y: 5, z: -92, lookAt: { x: -1, y: 3.5, z: -93 } },
  { x: 1, y: 4, z: -94, lookAt: { x: 4.5, y: 2, z: -94 } },
  { x: 6, y: 4.5, z: -90, lookAt: { x: 11.5, y: -3.5, z: -95 } },
  { x: -15, y: -20, z: -105, lookAt: { x: -13, y: -1, z: -105 } }
];
let targetWaypoint3 = section3Waypoints[0];

let section4Step = 0;
const section4Waypoints = [
  { x: 2, y: 4, z: -116, lookAt: { x: 0, y: -1, z: -125 } },
  { x: 4, y: 4, z: -121, lookAt: { x: 1, y: 1, z: -123 } },
  { x: 1, y: 2, z: -124, lookAt: { x: -1, y: 1, z: -125 } },
  { x: 0, y: -20, z: -135, lookAt: { x: 0, y: -1, z: -135 } }
];
let targetWaypoint4 = section4Waypoints[0];

let section5Step = 0;
const section5Waypoints = [
  { x: 1, y: 3.5, z: -146, lookAt: { x: -2, y: 0.5, z: -150 } },
  { x: 3, y: 4, z: -150, lookAt: { x: 0.5, y: 2.5, z: -150 } },
  { x: -2.5, y: -1, z: -152, lookAt: { x: -6.5, y: 1.3, z: -150 } },
  { x: 0, y: -20, z: -165, lookAt: { x: 0, y: -1, z: -165 } }
];
let targetWaypoint5 = section5Waypoints[0];

let section6Step = 0;
const section6Waypoints = [
  { x: -9, y: 4, z: -169, lookAt: { x: -8, y: 2, z: -180 } },
  { x: 6, y: 4, z: -180, lookAt: { x: 0, y: 2, z: -180 } },
  { x: 0, y: 6, z: -182, lookAt: { x: 0, y: 2, z: -180 } },
  { x: 0, y: -35, z: -195, lookAt: { x: 0, y: -1, z: -195 } }
];
let targetWaypoint6 = section6Waypoints[0];


// === UNIFIED SECTION DATA HELPERS ===
// Helper function to get section step, waypoints, and target waypoint
function getSectionData(sectionNum) {
  switch(sectionNum) {
    case 0: return { step: section0Step, waypoints: section0Waypoints, targetWaypoint: targetWaypoint };
    case 1: return { step: section1Step, waypoints: section1Waypoints, targetWaypoint: targetWaypoint1 };
    case 2: return { step: section2Step, waypoints: section2Waypoints, targetWaypoint: targetWaypoint2 };
    case 3: return { step: section3Step, waypoints: section3Waypoints, targetWaypoint: targetWaypoint3 };
    case 4: return { step: section4Step, waypoints: section4Waypoints, targetWaypoint: targetWaypoint4 };
    case 5: return { step: section5Step, waypoints: section5Waypoints, targetWaypoint: targetWaypoint5 };
    case 6: return { step: section6Step, waypoints: section6Waypoints, targetWaypoint: targetWaypoint6 };
    default: return null;
  }
}

// Helper function to set section step and target waypoint
function setSectionStep(sectionNum, step, waypoint) {
  switch(sectionNum) {
    case 0: section0Step = step; targetWaypoint = waypoint; break;
    case 1: section1Step = step; targetWaypoint1 = waypoint; break;
    case 2: section2Step = step; targetWaypoint2 = waypoint; break;
    case 3: section3Step = step; targetWaypoint3 = waypoint; break;
    case 4: section4Step = step; targetWaypoint4 = waypoint; break;
    case 5: section5Step = step; targetWaypoint5 = waypoint; break;
    case 6: section6Step = step; targetWaypoint6 = waypoint; break;
  }
}

// Helper function to get transition threshold for section transitions
// All sections now use smooth distance-based transitions for consistency
function getSectionTransitionThreshold(fromSection, toSection) {
  // All sections use the same smooth distance-based transition
  // This ensures consistent, smooth transitions across all sections
  return { zThreshold: null, checkZ: false };
}

camera.position.set(section0Waypoints[0].x, section0Waypoints[0].y, section0Waypoints[0].z);
camera.lookAt(section0Waypoints[0].lookAt.x, section0Waypoints[0].lookAt.y, section0Waypoints[0].lookAt.z);

// UI 顯示目前層級
const levelSpan = document.getElementById('level');
function updateLevelUI() {
  // Display rounded section number for UI
  levelSpan.textContent = String(Math.round(currentSection));
}
updateLevelUI();

// === 滾輪控制層級 ===
let scrollLocked = false;
let lastScrollTime = 0;
const SCROLL_COOLDOWN = 800; // ms，避免觸控板一次滾太多
const SCROLL_THRESHOLD = 10; // Minimum deltaY to register a scroll

window.addEventListener('wheel', (event) => {
  event.preventDefault();

  // Ignore very small scroll movements
  if (Math.abs(event.deltaY) < SCROLL_THRESHOLD) return;

  // Check cooldown - only process one scroll per cooldown period
  const now = Date.now();
  if (scrollLocked || (now - lastScrollTime) < SCROLL_COOLDOWN) {
    return;
  }

  // Lock scrolling and set cooldown
  scrollLocked = true;
  lastScrollTime = now;
  setTimeout(() => { scrollLocked = false; }, SCROLL_COOLDOWN);

      // === UNIFIED SECTION NAVIGATION (Sections 0-7) ===
      // Use integer section index for waypoint navigation
      const currentSectionInt = Math.round(currentSection);
      if (currentSectionInt >= 0 && currentSectionInt < SECTION_COUNT) {
        const sectionData = getSectionData(currentSectionInt);
        if (!sectionData) return;
        
        let currentStep = sectionData.step;
        const waypoints = sectionData.waypoints;
        
        if (event.deltaY > 0) {
          // 往下滾 → 下一內部步驟
          if (currentStep < 3) {
            currentStep = currentStep + 1;
            setSectionStep(currentSectionInt, currentStep, waypoints[currentStep]);
            
            // Update color state for new step (will be blended in animate loop)
            updateColorState(currentSectionInt, currentStep);
            
            // If step 3 (exit), transition to next section (smooth continuous transition)
            if (currentStep === 3) {
              targetSection = currentSectionInt + 1;
              if (targetSection < SECTION_COUNT) {
                targetCamZ = cameraBaseZ - targetSection * SECTION_DISTANCE;
                // Initialize next section's step
                const nextData = getSectionData(targetSection);
                if (nextData) {
                  setSectionStep(targetSection, 0, nextData.waypoints[0]);
                }
              }
            }
          }
        } else if (event.deltaY < 0) {
          // 往上滾 → 上一內部步驟
          if (currentStep > 0) {
            currentStep = currentStep - 1;
            setSectionStep(currentSectionInt, currentStep, waypoints[currentStep]);
            // Cancel next section transition if going back
            targetSection = currentSectionInt;
            // Update color state for new step
            updateColorState(currentSectionInt, currentStep);
          } else if (currentStep === 0) {
            // At step 0, scroll up goes back to previous section (smooth continuous transition)
            targetSection = currentSectionInt - 1;
            if (targetSection >= 0) {
              targetCamZ = cameraBaseZ - targetSection * SECTION_DISTANCE;
              
              // Reset previous section's step using unified system
              const prevData = getSectionData(targetSection);
              if (prevData) {
                setSectionStep(targetSection, 0, prevData.waypoints[0]);
              }
            }
          }
        }
      } else {
        // === FALLBACK: NORMAL SECTION NAVIGATION (for edge cases) ===
        if (event.deltaY > 0) {
          targetSection = Math.min(SECTION_COUNT - 1, targetSection + 1);
        } else if (event.deltaY < 0) {
          targetSection = Math.max(0, targetSection - 1);
        }
        targetCamZ = cameraBaseZ - targetSection * SECTION_DISTANCE;
        // Initialize section step
        const sectionData = getSectionData(Math.round(targetSection));
        if (sectionData) {
          setSectionStep(Math.round(targetSection), 0, sectionData.waypoints[0]);
        }
      }
}, { passive: false });

// === 動畫迴圈 ===
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const t = clock.elapsedTime;
  
  // === SMOOTH SECTION INTERPOLATION ===
  // Interpolate currentSection towards targetSection for continuous transitions
  const sectionDiff = targetSection - currentSection;
  if (Math.abs(sectionDiff) > 0.001) {
    // Smooth interpolation - feels like state recalculation
    currentSection += sectionDiff * SECTION_TRANSITION_SPEED;
    
    // Snap to target when very close (prevents infinite micro-adjustments)
    if (Math.abs(sectionDiff) < 0.01) {
      currentSection = targetSection;
    }
  }
  
  // Clamp to valid section range
  currentSection = Math.max(0, Math.min(SECTION_COUNT - 1, currentSection));
  
  // Update time uniform for flickering noise
  uniforms.uTime.value = t;
  
  // Update section uniform with continuous value for smooth color transitions
  uniforms.uSection.value = currentSection;
  
  // Sync random geometry uniforms (same values, but separate material)
  randomGeometryUniforms.uTime.value = t;
  randomGeometryUniforms.uSection.value = currentSection;
  
  // === SMOOTH COLOR STATE BLENDING ===
  // Blend color states between sections for continuous transitions
  const sectionFloor = Math.floor(currentSection);
  const sectionCeil = Math.min(SECTION_COUNT - 1, Math.ceil(currentSection));
  const sectionFrac = currentSection - sectionFloor;
  
  // Get color states for adjacent sections
  const floorData = getSectionData(sectionFloor);
  const ceilData = sectionCeil !== sectionFloor ? getSectionData(sectionCeil) : floorData;
  
  if (floorData && ceilData) {
    const floorStep = floorData.step || 0;
    const ceilStep = ceilData.step || 0;
    
    // Blend between section color states
    const floorColorState = sectionFloor * 10.0 + floorStep;
    const ceilColorState = sectionCeil * 10.0 + ceilStep;
    const blendedColorState = floorColorState * (1.0 - sectionFrac) + ceilColorState * sectionFrac;
    
    uniforms.uColorState.value = blendedColorState;
    randomGeometryUniforms.uColorState.value = blendedColorState;
  }

  // Slow rotation for random geometry (only for visible sections)
  rotatingObjects.forEach((obj) => {
    // Check if object is in a visible section
    let parent = obj.parent;
    let isVisible = true;
    while (parent) {
      if (parent.visible === false) {
        isVisible = false;
        break;
      }
      parent = parent.parent;
    }
    
    // Skip animation if not visible
    if (!isVisible) return;
    
    obj.rotation.x += GEOMETRY_ROTATION_X_SPEED * delta;
    obj.rotation.y += GEOMETRY_ROTATION_Y_SPEED * delta;
  });

  // Floating items drift with bounds bounce - solid wall boundaries (only for visible sections)
  floatingItems.forEach((item) => {
    const { mesh, velocity, bounds } = item;
    
    // Check if mesh is in a visible section
    let parent = mesh.parent;
    let isVisible = true;
    while (parent) {
      if (parent.visible === false) {
        isVisible = false;
        break;
      }
      parent = parent.parent;
    }
    
    // Skip animation if not visible
    if (!isVisible) return;
    
    mesh.position.addScaledVector(velocity, delta);

    // Handle x bounds - clamp to boundaries and bounce
    if (bounds.xMin !== undefined && bounds.xMax !== undefined) {
      if (mesh.position.x > bounds.xMax) {
        mesh.position.x = bounds.xMax;
        velocity.x *= -1;
      } else if (mesh.position.x < bounds.xMin) {
        mesh.position.x = bounds.xMin;
        velocity.x *= -1;
      }
    } else if (bounds.x !== undefined) {
      // Old format: symmetric range
      if (mesh.position.x > bounds.x) {
        mesh.position.x = bounds.x;
        velocity.x *= -1;
      } else if (mesh.position.x < -bounds.x) {
        mesh.position.x = -bounds.x;
        velocity.x *= -1;
      }
    }

    // Handle z bounds - clamp to boundaries and bounce
    if (bounds.zMin !== undefined && bounds.zMax !== undefined) {
      if (mesh.position.z > bounds.zMax) {
        mesh.position.z = bounds.zMax;
        velocity.z *= -1;
      } else if (mesh.position.z < bounds.zMin) {
        mesh.position.z = bounds.zMin;
        velocity.z *= -1;
      }
    } else if (bounds.z !== undefined) {
      // Old format: symmetric range
      if (mesh.position.z > bounds.z) {
        mesh.position.z = bounds.z;
        velocity.z *= -1;
      } else if (mesh.position.z < -bounds.z) {
        mesh.position.z = -bounds.z;
        velocity.z *= -1;
      }
    }

    // Handle y bounds - clamp to boundaries and bounce
    if (bounds.yMin !== undefined && bounds.yMax !== undefined) {
      if (mesh.position.y > bounds.yMax) {
        mesh.position.y = bounds.yMax;
        velocity.y *= -1;
      } else if (mesh.position.y < bounds.yMin) {
        mesh.position.y = bounds.yMin;
        velocity.y *= -1;
      }
    }
  });

  // === SECTION 0 WATCHER BALL TRACKING ===
  watcherBalls.forEach((wb) => updateWatcherBall(wb, camera, delta));

  // === UNIFIED CAMERA MOVEMENT (Sections 0-7) ===
  // Use integer section index for waypoint navigation, but continuous value for transitions
  const currentSectionInt = Math.round(currentSection);
  if (currentSectionInt >= 0 && currentSectionInt < SECTION_COUNT) {
    // Check if we should transition to this section (from previous section)
    // Use continuous comparison for smooth transitions
    if (Math.abs(targetSection - currentSection) < 0.1) {
      const sectionData = getSectionData(currentSectionInt);
      if (sectionData && sectionData.step === undefined) {
        setSectionStep(currentSectionInt, 0, sectionData.waypoints[0]);
      }
    }
    
    // Check if we should transition back to previous section
    if (targetSection < currentSection && targetSection >= 0) {
      const targetSectionInt = Math.round(targetSection);
      const prevData = getSectionData(targetSectionInt);
      if (!prevData) return;
      
      // Get previous section's first waypoint (reuse cached waypoint data)
      const waypoint = prevData.waypoints[0];
      
      // Section transition - slower speed (smooth continuous movement)
      camera.position.x = smoothLerp(camera.position.x, waypoint.x, CAMERA_TRANSITION_SPEED);
      camera.position.y = smoothLerp(camera.position.y, waypoint.y, CAMERA_TRANSITION_SPEED);
      camera.position.z = smoothLerp(camera.position.z, waypoint.z, CAMERA_TRANSITION_SPEED);
      
      // Smooth lookAt to waypoint target (reuse lookAt object)
      smoothLookAt(camera, waypoint.lookAt, CAMERA_LOOKAT_SPEED);
      
      // Transition is handled by continuous section interpolation in animate loop
      // No need to snap currentSection here - it will smoothly interpolate
    } else {
      // Normal internal movement within current section
      const sectionData = getSectionData(currentSectionInt);
      if (!sectionData) return;
      
      // Check if we should be in this section (for transitions from other sections)
      if (targetSection === currentSection) {
        // Already in correct section, continue with waypoint movement
      }
      
      if (sectionData.step < 3) {
        // Smooth interpolation to waypoint (steps 0, 1, 2) - internal movement
        const waypoint = sectionData.targetWaypoint;
        camera.position.x = smoothLerp(camera.position.x, waypoint.x, CAMERA_WAYPOINT_SPEED);
        camera.position.y = smoothLerp(camera.position.y, waypoint.y, CAMERA_WAYPOINT_SPEED);
        camera.position.z = smoothLerp(camera.position.z, waypoint.z, CAMERA_WAYPOINT_SPEED);
        
        // Smooth lookAt to waypoint target (reuse lookAt object)
        smoothLookAt(camera, waypoint.lookAt, CAMERA_LOOKAT_SPEED);
      } else {
        // Step 3: Transitioning through door to next section (section transition - slower)
        const waypoint = sectionData.targetWaypoint;
        camera.position.x = smoothLerp(camera.position.x, waypoint.x, CAMERA_TRANSITION_SPEED);
        camera.position.y = smoothLerp(camera.position.y, waypoint.y, CAMERA_TRANSITION_SPEED);
        camera.position.z = smoothLerp(camera.position.z, waypoint.z, CAMERA_TRANSITION_SPEED);
        
        // Smooth lookAt to waypoint target (reuse lookAt object)
        smoothLookAt(camera, waypoint.lookAt, CAMERA_LOOKAT_SPEED);
        
        // When targetSection is next section, check if we should transition
        // Use integer comparison for section boundaries, but allow continuous interpolation
        const targetSectionInt = Math.round(targetSection);
        if (targetSectionInt === currentSectionInt + 1 && targetSectionInt < SECTION_COUNT) {
          // Optimized: use squared distance to avoid sqrt calculation
          const dx = camera.position.x - waypoint.x;
          const dy = camera.position.y - waypoint.y;
          const dz = camera.position.z - waypoint.z;
          const distSq = dx * dx + dy * dy + dz * dz;
          
          const nextSectionZ = sections[targetSectionInt].position.z;
          
          // Smooth distance-based transition for all sections
          // Use generous thresholds to trigger transitions earlier for smoother interpolation
          // This allows the continuous section interpolation to work more smoothly
          // Increased thresholds help sections 1-3 transition as smoothly as later sections
          const zDistance = Math.abs(camera.position.z - nextSectionZ);
          const shouldTransition = zDistance < 15 || distSq < 4.0;
          
          // Transition is handled by continuous section interpolation in animate loop
          // Initialize next section early to allow smooth blending
          if (shouldTransition) {
            targetCamZ = cameraBaseZ - targetSectionInt * SECTION_DISTANCE;
            
            // Initialize next section's step using unified system
            const nextData = getSectionData(targetSectionInt);
            if (nextData) {
              setSectionStep(targetSectionInt, 0, nextData.waypoints[0]);
            }
          }
        }
      }
    }
  } else {
    // === FALLBACK: NORMAL SECTION CAMERA MOVEMENT ===
    const approxSection = Math.round((cameraBaseZ - camera.position.z) / SECTION_DISTANCE);
    currentSection = THREE.MathUtils.clamp(approxSection, 0, SECTION_COUNT - 1);

    // 相機平滑移動到目標 Z (section transition - slower)
    camera.position.z = smoothLerp(camera.position.z, targetCamZ, CAMERA_TRANSITION_SPEED);

    // 輕微上下浮動（原本被截斷）
    camera.position.y = 4 + Math.sin(t * 0.6) * 1.2;

    // 讓相機看向前方（可依你想看的中心調）
    camera.lookAt(0, 1.5, camera.position.z - 10);
  }

  // 每幀更新 UI / 可見範圍
  updateLevelUI();
  updateSectionVisibility();

  renderer.render(scene, camera);
}
animate();

// === 視窗尺寸變化 ===
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

