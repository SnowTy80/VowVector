import * as THREE from 'three';
import { getNodeColor } from '../utils/colorSchemes.js';

// Cache materials to avoid creating new ones per frame
const materialCache = new Map();
const baseColorCache = new Map();
const rimMaterialCache = new Map();

let baseScale = 4;
let projectScale = 6;
let glowIntensity = 1.2;
let glowOpacity = 0.95;
let glowTint = new THREE.Color('#00ff9d');
let glowMix = 0.35;
let haloScale = 2.4;
let rimPower = 2.5;
let rimStrength = 0.9;

const haloTexture = (() => {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 4,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.12)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
})();

// --- Fresnel neon-rim ShaderMaterial ---

const rimVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const rimFragmentShader = `
  uniform vec3 rimColor;
  uniform float rimPower;
  uniform float rimStrength;
  uniform float opacity;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    float fresnel = pow(1.0 - max(dot(vViewDir, vNormal), 0.0), rimPower);
    vec3 color = rimColor * fresnel * rimStrength;
    float alpha = fresnel * rimStrength * opacity;
    gl_FragColor = vec4(color, alpha);
  }
`;

function resolveNodeColor(node) {
  const metaColor = node?.metadata?.node_color || node?.metadata?.project_color;
  return metaColor || getNodeColor(node.node_type);
}

function computeCtxScale(node) {
  // Manual per-node scale override from metadata
  const manualScale = node?.metadata?.node_scale;
  if (typeof manualScale === 'number' && manualScale > 0) {
    return baseScale * manualScale;
  }

  const ctxSize = node?.metadata?.ctx_size;
  if (node?.node_type === 'Project') {
    const override = node?.metadata?.project_scale;
    return projectScale * (typeof override === 'number' ? override : 1.5);
  }
  const size = typeof ctxSize === 'number' ? ctxSize : (node?.content?.length || 0);
  if (!size) return baseScale;
  const factor = 0.6 + Math.log10(size + 10) * 0.3;
  const clamped = Math.min(2.0, Math.max(0.8, factor));
  return baseScale * clamped;
}

function getRimMaterial(color) {
  if (rimMaterialCache.has(color)) {
    const mat = rimMaterialCache.get(color);
    applyRimSettings(mat, color);
    return mat;
  }

  const rimColor = new THREE.Color(color).lerp(glowTint.clone(), 0.5);
  const mat = new THREE.ShaderMaterial({
    vertexShader: rimVertexShader,
    fragmentShader: rimFragmentShader,
    uniforms: {
      rimColor: { value: rimColor },
      rimPower: { value: rimPower },
      rimStrength: { value: rimStrength * glowIntensity },
      opacity: { value: 1.0 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });

  rimMaterialCache.set(color, mat);
  return mat;
}

function applyRimSettings(mat, color) {
  const rimColor = new THREE.Color(color).lerp(glowTint.clone(), 0.5);
  mat.uniforms.rimColor.value.copy(rimColor);
  mat.uniforms.rimPower.value = rimPower;
  mat.uniforms.rimStrength.value = rimStrength * glowIntensity;
}

// --- Phong glow material ---

function applyMaterialSettings(mat, baseColor) {
  const emissiveColor = baseColor.clone().lerp(glowTint, glowMix);
  mat.color.copy(baseColor);
  mat.emissive.copy(emissiveColor);
  mat.emissiveIntensity = glowIntensity;
  mat.opacity = glowOpacity;
  mat.shininess = 60;
}

function getGlowMaterial(color) {
  if (materialCache.has(color)) {
    const mat = materialCache.get(color);
    const baseColor = baseColorCache.get(color);
    if (baseColor) applyMaterialSettings(mat, baseColor);
    return mat;
  }

  const baseColor = new THREE.Color(color);
  const mat = new THREE.MeshPhongMaterial({
    color: baseColor,
    emissive: baseColor,
    emissiveIntensity: glowIntensity,
    transparent: true,
    opacity: glowOpacity,
    shininess: 60,
    specular: new THREE.Color(0x444444),
  });
  applyMaterialSettings(mat, baseColor);
  materialCache.set(color, mat);
  baseColorCache.set(color, baseColor);
  return mat;
}

// Shared geometry
const sphereGeo = new THREE.SphereGeometry(1, 16, 12);
// Slightly larger sphere for the rim shell
const rimGeo = new THREE.SphereGeometry(1, 16, 12);

/**
 * Render a node as a glowing sphere with Fresnel neon rim.
 */
export function createNodeObject(node) {
  const color = resolveNodeColor(node);
  const mat = getGlowMaterial(color);
  const mesh = new THREE.Mesh(sphereGeo, mat);

  // Fresnel rim shell (replaces old back-face outline)
  const rimMat = getRimMaterial(color);
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);

  const haloMat = new THREE.SpriteMaterial({
    map: haloTexture,
    color: new THREE.Color(color).lerp(glowTint, 0.6),
    transparent: true,
    blending: THREE.AdditiveBlending,
    opacity: 0.85,
    depthWrite: false,
  });
  const halo = new THREE.Sprite(haloMat);

  const scale = computeCtxScale(node);
  mesh.scale.set(scale, scale, scale);
  rimMesh.scale.set(scale * 1.18, scale * 1.18, scale * 1.18);
  halo.scale.set(scale * haloScale, scale * haloScale, 1);

  const group = new THREE.Group();
  group.add(halo);
  group.add(rimMesh);
  group.add(mesh);
  group.userData = { mesh, rimMesh, halo };
  return group;
}

export function applyNodeStyle(obj, node) {
  if (!obj) return;
  const color = resolveNodeColor(node);
  const mat = getGlowMaterial(color);
  const group = obj.type === 'Group' ? obj : null;
  const targetMesh = group?.userData?.mesh || obj;
  const rimMesh = group?.userData?.rimMesh;
  const halo = group?.userData?.halo;

  targetMesh.material = mat;

  if (rimMesh) {
    const rimMat = getRimMaterial(color);
    rimMesh.material = rimMat;
  }

  if (halo) {
    halo.material.color.copy(new THREE.Color(color).lerp(glowTint, 0.6));
    halo.material.opacity = Math.min(1, 0.7 + glowIntensity * 0.25);
  }

  const scale = computeCtxScale(node);
  targetMesh.scale.set(scale, scale, scale);
  if (rimMesh) rimMesh.scale.set(scale * 1.18, scale * 1.18, scale * 1.18);
  if (halo) halo.scale.set(scale * haloScale, scale * haloScale, 1);
}

export function setNodeStyle(options = {}) {
  if (typeof options.baseScale === 'number') baseScale = options.baseScale;
  if (typeof options.projectScale === 'number') projectScale = options.projectScale;
  if (typeof options.glowIntensity === 'number') glowIntensity = options.glowIntensity;
  if (typeof options.glowOpacity === 'number') glowOpacity = options.glowOpacity;
  if (typeof options.glowMix === 'number') glowMix = options.glowMix;
  if (typeof options.glowTint === 'string') glowTint = new THREE.Color(options.glowTint);
  if (typeof options.haloScale === 'number') haloScale = options.haloScale;

  for (const [color, mat] of materialCache.entries()) {
    const baseColor = baseColorCache.get(color);
    if (baseColor) applyMaterialSettings(mat, baseColor);
  }
  for (const [color, mat] of rimMaterialCache.entries()) {
    applyRimSettings(mat, color);
  }
}

/**
 * Return link color based on relationship type.
 */
export function getLinkColor(link) {
  const colors = {
    RELATES_TO:  '#00ff9d40',
    IMPLEMENTS:  '#FF00FF40',
    GENERATED:   '#00FF0040',
    SUPPORTS:    '#FFD70040',
    BELONGS_TO:  '#1E90FF40',
    HAS_TAG:     '#FF450040',
    INSPIRED_BY: '#8A2BE240',
  };
  return colors[link.relationship] || '#ffffff20';
}
