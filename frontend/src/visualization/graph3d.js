import ForceGraph3D from '3d-force-graph';
import * as THREE from 'three';
import { createNodeObject, getLinkColor, applyNodeStyle, setNodeStyle } from './node-renderer.js';

let graph = null;
let baseLinkDistance = 80;
let baseCharge = -120;

// Node type visibility filter
let hiddenNodeTypes = new Set();
let unfilteredData = { nodes: [], links: [] };

// --- Tag-based spatial clustering ---

function getNodeClusterKey(node) {
  const tags = node.tags || [];
  // Priority: first domain: tag, then intent: tag, then node_type
  for (const t of tags) {
    if (t.startsWith('domain:')) return t;
  }
  for (const t of tags) {
    if (t.startsWith('intent:')) return t;
  }
  // Fall back to month cluster for conversations
  for (const t of tags) {
    if (t.startsWith('month:')) return t;
  }
  return `type:${node.node_type || 'Unknown'}`;
}

// Fibonacci sphere: distributes N points evenly on a sphere of given radius
function fibonacciSphere(index, total, radius) {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (index / (total - 1 || 1)) * 2; // -1 to 1
  const r = Math.sqrt(1 - y * y);
  const theta = goldenAngle * index;
  return {
    x: Math.cos(theta) * r * radius,
    y: y * radius,
    z: Math.sin(theta) * r * radius,
  };
}

function computeClusterCenters(nodes, radius) {
  // Collect unique cluster keys
  const keys = new Set();
  for (const n of nodes) keys.add(getNodeClusterKey(n));
  const keyArr = [...keys].sort();
  const centers = new Map();
  const total = keyArr.length;
  for (let i = 0; i < total; i++) {
    centers.set(keyArr[i], fibonacciSphere(i, total, radius));
  }
  return centers;
}

// --- Position persistence via localStorage ---
const POSITIONS_KEY = 'vv_node_positions';

function loadSavedPositions() {
  try {
    const raw = localStorage.getItem(POSITIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePositions() {
  if (!graph) return;
  const nodes = graph.graphData().nodes || [];
  const positions = {};
  for (const n of nodes) {
    if (n.id && n.x !== undefined) {
      positions[n.id] = { x: n.x, y: n.y, z: n.z };
    }
  }
  try {
    localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
  } catch { /* quota exceeded — ignore */ }
}

// Breathing state
let breathing = false;
let breatheStart = null;
let breatheAmp = 12;
let breathePeriodMs = 6000;
let breatheBaseDistance = null;
let breatheLoopActive = false;
let userInteracting = false;

// Orbit state
let orbiting = false;
let orbitSpeed = 0.35;
let orbitLoopActive = false;
let orbitLastTime = null;

// Static mode — pauses both orbit and breathing
let staticMode = false;

// Unified animation loop (drives both orbit + breathing in one rAF)
let animLoopActive = false;

function startAnimLoop() {
  if (animLoopActive) return;
  animLoopActive = true;
  orbitLastTime = performance.now();

  const tick = (now) => {
    if (!graph || (!breathing && !orbiting)) {
      animLoopActive = false;
      breatheLoopActive = false;
      orbitLoopActive = false;
      return;
    }

    const camera = graph.camera();
    const controls = graph.controls();
    if (!camera || !controls) {
      animLoopActive = false;
      return;
    }

    const dt = (now - (orbitLastTime || now)) / 1000;
    orbitLastTime = now;

    // --- Orbit: manually rotate camera around controls.target in XZ plane ---
    if (orbiting && !staticMode && !userInteracting) {
      const offset = camera.position.clone().sub(controls.target);
      const radius = Math.sqrt(offset.x * offset.x + offset.z * offset.z);
      const angle = Math.atan2(offset.z, offset.x);
      const newAngle = angle + orbitSpeed * dt * 0.5;
      offset.x = radius * Math.cos(newAngle);
      offset.z = radius * Math.sin(newAngle);
      camera.position.copy(controls.target.clone().add(offset));
      camera.lookAt(controls.target);
    }

    // --- Breathing: oscillate camera distance ---
    if (breathing && !staticMode && !userInteracting) {
      const t = (now - breatheStart) / breathePeriodMs;
      const wave = Math.sin(t * Math.PI * 2);
      const baseDist = breatheBaseDistance ?? camera.position.distanceTo(controls.target);
      const targetDist = baseDist + wave * breatheAmp;
      const dir = camera.position.clone().sub(controls.target).normalize();
      camera.position.copy(controls.target.clone().add(dir.multiplyScalar(targetDist)));
    }

    controls.update();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function recaptureBreathBase() {
  if (!graph) return;
  const camera = graph.camera();
  const controls = graph.controls();
  if (camera && controls) {
    breatheBaseDistance = camera.position.distanceTo(controls.target);
  }
}

/**
 * Initialize the 3D force graph in the given container element.
 */
export function initGraph(container) {
  graph = ForceGraph3D()(container)
    .backgroundColor('#0a0a0f')
    .nodeThreeObject(createNodeObject)
    .nodeLabel((n) => `${n.title} [${n.node_type}]`)
    .linkSource('source_id')
    .linkTarget('target_id')
    .linkColor(getLinkColor)
    .linkWidth(0.5)
    .linkOpacity(0.4)
    .linkDirectionalParticles(2)
    .linkDirectionalParticleWidth(1.5)
    .linkDirectionalParticleColor(getLinkColor);

  // Force tuning
  graph.d3Force('charge').strength(baseCharge);
  graph.d3Force('link').distance(baseLinkDistance);
  graph.enableNodeDrag(true);
  graph.onNodeDragEnd((node) => {
    node.fx = node.x;
    node.fy = node.y;
    node.fz = node.z;
    savePositions();
  });

  // Enhanced lighting — "sun" effect
  const scene = graph.scene();
  scene.add(new THREE.AmbientLight(0x404040, 1.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(100, 80, 60);
  scene.add(dirLight);
  // Hemisphere light for sky/ground contrast
  scene.add(new THREE.HemisphereLight(0x00ff9d, 0x080820, 0.4));

  // User interaction listeners — allow zoom override during breathing
  const el = graph.renderer().domElement;
  el.addEventListener('wheel', () => {
    // After user scrolls, recapture the base distance on next frame
    requestAnimationFrame(recaptureBreathBase);
  }, { passive: true });
  el.addEventListener('pointerdown', () => { userInteracting = true; });
  el.addEventListener('pointerup', () => {
    userInteracting = false;
    recaptureBreathBase();
  });

  return graph;
}

export function setNodeClickHandler(handler) {
  if (!graph) return;
  graph.onNodeClick(handler);
}

/**
 * Load graph data (nodes + links) into the visualization.
 */
export function updateGraphData(data) {
  if (!graph) return;

  // Store unfiltered data for type filtering
  unfilteredData = { nodes: data.nodes || [], links: data.links || [] };

  // Apply node type filter
  const filteredData = applyTypeFilter(unfilteredData);

  // Auto-scale forces for large graphs
  const nodeCount = filteredData.nodes.length;
  if (nodeCount > 100) {
    const scaleFactor = Math.sqrt(nodeCount / 50);
    const autoDistance = Math.max(baseLinkDistance, 80 * scaleFactor);
    const autoCharge = -120 * scaleFactor;
    graph.d3Force('link').distance(autoDistance);
    graph.d3Force('charge').strength(autoCharge);
  }

  const camera = graph.camera();
  const controls = graph.controls();
  const cameraPos = camera?.position?.clone();
  const cameraQuat = camera?.quaternion?.clone();
  const controlsTarget = controls?.target?.clone();

  const prev = graph.graphData();
  const prevMap = new Map((prev?.nodes || []).map((n) => [n.id, n]));
  const saved = loadSavedPositions();

  // Compute cluster centers for tag-based spatial grouping
  const clusterRadius = Math.max(120, baseLinkDistance * 2, Math.sqrt(nodeCount) * 20);
  const clusterCenters = computeClusterCenters(filteredData.nodes, clusterRadius);

  const nodes = filteredData.nodes.map((n) => {
    // 1. Prefer in-memory position (current session)
    const prevNode = prevMap.get(n.id);
    if (prevNode && prevNode.x !== undefined) {
      return {
        ...n,
        x: prevNode.x,
        y: prevNode.y,
        z: prevNode.z,
        fx: prevNode.x,
        fy: prevNode.y,
        fz: prevNode.z,
      };
    }
    // 2. Restore from localStorage (previous session)
    const s = saved[n.id];
    if (s) {
      return { ...n, x: s.x, y: s.y, z: s.z, fx: s.x, fy: s.y, fz: s.z };
    }
    // 3. New node — position near cluster center based on tags
    const clusterKey = getNodeClusterKey(n);
    const center = clusterCenters.get(clusterKey) || { x: 0, y: 0, z: 0 };
    const jitterRange = Math.max(30, clusterRadius * 0.25);
    const jitter = () => (Math.random() - 0.5) * jitterRange;
    const x = center.x + jitter();
    const y = center.y + jitter();
    const z = center.z + jitter();
    return { ...n, x, y, z, fx: x, fy: y, fz: z };
  });
  // Persist positions (captures restored + new nodes)
  // Deferred so graph.graphData() reflects the new data
  requestAnimationFrame(savePositions);
  const links = filteredData.links.map((l) => ({ ...l }));

  graph.graphData({ nodes, links });

  // Re-apply styles to all nodes so ctx_size scaling, per-node colors,
  // and manual overrides take effect (3d-force-graph reuses THREE objects
  // for existing node IDs and won't re-call nodeThreeObject)
  requestAnimationFrame(() => {
    const currentNodes = graph.graphData().nodes || [];
    currentNodes.forEach((node) => {
      if (node.__threeObj) {
        applyNodeStyle(node.__threeObj, node);
      }
    });
  });

  const restoreView = () => {
    if (cameraPos) camera.position.copy(cameraPos);
    if (cameraQuat) camera.quaternion.copy(cameraQuat);
    if (controlsTarget) {
      controls.target.copy(controlsTarget);
      controls.update();
    }
    if (cameraPos && controlsTarget) {
      graph.cameraPosition(
        { x: cameraPos.x, y: cameraPos.y, z: cameraPos.z },
        { x: controlsTarget.x, y: controlsTarget.y, z: controlsTarget.z },
        0
      );
    }
  };
  requestAnimationFrame(restoreView);
  requestAnimationFrame(restoreView);
}

/**
 * Focus camera on a specific node.
 */
export function focusOnNode(nodeId) {
  if (!graph) return;
  const node = graph.graphData().nodes.find((n) => n.id === nodeId);
  if (node) {
    const dist = 150;
    graph.cameraPosition(
      { x: node.x + dist, y: node.y + dist, z: node.z + dist },
      { x: node.x, y: node.y, z: node.z },
      1500
    );
  }
}

export function getGraphInstance() {
  return graph;
}

export function setGraphSpread(spread) {
  if (!graph) return;
  const oldSpread = baseLinkDistance;
  baseLinkDistance = spread;
  graph.d3Force('link').distance(baseLinkDistance);
  graph.d3Force('charge').strength(baseCharge * (baseLinkDistance / 80));

  // Directly scale all node positions from centroid
  const nodes = graph.graphData().nodes || [];
  if (nodes.length && oldSpread > 0) {
    const ratio = spread / oldSpread;
    // Compute centroid
    let cx = 0, cy = 0, cz = 0;
    for (const n of nodes) { cx += n.x || 0; cy += n.y || 0; cz += n.z || 0; }
    cx /= nodes.length; cy /= nodes.length; cz /= nodes.length;
    // Scale positions outward from centroid
    for (const n of nodes) {
      n.x = cx + (n.x - cx) * ratio;
      n.y = cy + (n.y - cy) * ratio;
      n.z = cz + (n.z - cz) * ratio;
      n.fx = n.x;
      n.fy = n.y;
      n.fz = n.z;
    }
    requestAnimationFrame(savePositions);
  }
  graph.refresh();
}

/**
 * Re-cluster all nodes by their tags. Clears saved positions and
 * repositions everything using tag-based spatial grouping.
 */
export function reclusterByTags() {
  if (!graph) return;
  // Clear saved positions so all nodes get fresh cluster placement
  try { localStorage.removeItem(POSITIONS_KEY); } catch { /* ignore */ }

  const data = graph.graphData();
  const nodes = data.nodes || [];
  const nodeCount = nodes.length;
  const clusterRadius = Math.max(120, baseLinkDistance * 2, Math.sqrt(nodeCount) * 20);
  const clusterCenters = computeClusterCenters(nodes, clusterRadius);

  for (const n of nodes) {
    const clusterKey = getNodeClusterKey(n);
    const center = clusterCenters.get(clusterKey) || { x: 0, y: 0, z: 0 };
    const jitterRange = Math.max(30, clusterRadius * 0.25);
    const jitter = () => (Math.random() - 0.5) * jitterRange;
    n.x = center.x + jitter();
    n.y = center.y + jitter();
    n.z = center.z + jitter();
    n.fx = n.x;
    n.fy = n.y;
    n.fz = n.z;
  }

  graph.graphData({ nodes, links: data.links });
  requestAnimationFrame(savePositions);
  graph.refresh();
}

// --- Breathing ---

export function setBreathing(enabled, options = {}) {
  breathing = enabled;
  if (options.amplitude !== undefined) breatheAmp = options.amplitude;
  if (options.periodMs !== undefined) breathePeriodMs = options.periodMs;
  if (!enabled) {
    breatheLoopActive = false;
    if (graph) graph.refresh();
    return;
  }
  breatheStart = performance.now();
  recaptureBreathBase();
  startAnimLoop();
}

export function setBreathingSettings({ amplitude, periodMs } = {}) {
  if (typeof amplitude === 'number') breatheAmp = amplitude;
  if (typeof periodMs === 'number') breathePeriodMs = periodMs;
}

// --- Orbit ---

export function setAutoOrbit(enabled) {
  orbiting = enabled;
  if (!enabled) {
    orbitLoopActive = false;
    return;
  }
  startAnimLoop();
}

export function setOrbitSpeed(speed) {
  orbitSpeed = speed;
}

// --- Static mode ---

export function setStaticMode(enabled) {
  staticMode = enabled;
  // If turning off static, restart the anim loop if orbit or breathing are active
  if (!enabled && (orbiting || breathing)) {
    startAnimLoop();
  }
}

// --- Node style passthrough ---

export function setNodeStyleSettings(options = {}) {
  setNodeStyle(options);
  if (!graph) return;
  const nodes = graph.graphData().nodes || [];
  nodes.forEach((node) => {
    if (node.__threeObj) {
      applyNodeStyle(node.__threeObj, node);
    }
  });
  graph.refresh();
}

// --- Selection mode helpers ---

export function getRenderer() {
  return graph ? graph.renderer() : null;
}

export function getCamera() {
  return graph ? graph.camera() : null;
}

export function getControls() {
  return graph ? graph.controls() : null;
}

export function getGraphNodes() {
  return graph ? graph.graphData().nodes || [] : [];
}

const HIGHLIGHT_COLOR = new THREE.Color('#ffffff');
const HIGHLIGHT_EMISSIVE = 2.5;
const highlightOriginals = new Map();

export function highlightNodes(nodeIds, highlight) {
  const ids = new Set(nodeIds);
  const nodes = graph ? graph.graphData().nodes || [] : [];
  for (const node of nodes) {
    if (!ids.has(node.id)) continue;
    const grp = node.__threeObj;
    if (!grp || grp.type !== 'Group') continue;
    const mesh = grp.userData?.mesh;
    if (!mesh) continue;

    if (highlight) {
      if (!highlightOriginals.has(node.id)) {
        highlightOriginals.set(node.id, {
          emissive: mesh.material.emissive?.clone(),
          emissiveIntensity: mesh.material.emissiveIntensity,
        });
      }
      mesh.material.emissive?.copy(HIGHLIGHT_COLOR);
      mesh.material.emissiveIntensity = HIGHLIGHT_EMISSIVE;
    } else {
      const orig = highlightOriginals.get(node.id);
      if (orig) {
        if (orig.emissive) mesh.material.emissive.copy(orig.emissive);
        mesh.material.emissiveIntensity = orig.emissiveIntensity;
        highlightOriginals.delete(node.id);
      }
    }
  }
  if (graph) graph.refresh();
}

export function setSelectionMode(enabled) {
  if (!graph) return;
  graph.enableNodeDrag(!enabled);
  const controls = graph.controls();
  if (controls) controls.enabled = !enabled;
}

// --- Node type filtering ---

function applyTypeFilter(data) {
  if (hiddenNodeTypes.size === 0) return data;
  const visibleNodes = data.nodes.filter((n) => !hiddenNodeTypes.has(n.node_type));
  const visibleIds = new Set(visibleNodes.map((n) => n.id));
  const visibleLinks = data.links.filter(
    (l) => visibleIds.has(l.source_id) && visibleIds.has(l.target_id)
  );
  return { nodes: visibleNodes, links: visibleLinks };
}

export function setNodeTypeVisible(nodeType, visible) {
  if (visible) {
    hiddenNodeTypes.delete(nodeType);
  } else {
    hiddenNodeTypes.add(nodeType);
  }
  // Re-apply filter on stored unfiltered data
  if (unfilteredData.nodes.length) {
    updateGraphData(unfilteredData);
  }
}

export function getHiddenNodeTypes() {
  return new Set(hiddenNodeTypes);
}
