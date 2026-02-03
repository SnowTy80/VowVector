import { healthCheck, getGraphData, deleteNode, updateNode, createNode, createLink, deleteLink, bulkDeleteNodes, bulkTagNodes } from './api.js';
import {
  initGraph,
  updateGraphData,
  setNodeClickHandler,
  focusOnNode,
  setGraphSpread,
  setBreathing,
  setAutoOrbit,
  setOrbitSpeed,
  setBreathingSettings,
  setNodeStyleSettings,
  setStaticMode,
  getRenderer,
  getCamera,
  getGraphNodes,
  highlightNodes,
  setSelectionMode,
  setNodeTypeVisible,
  reclusterByTags,
} from './visualization/graph3d.js';
import { createUploadModal } from './components/UploadModal.js';
import { createNodePanel } from './components/NodePanel.js';
import { createNodeModal } from './components/CreateNodeModal.js';
import { createManualConnectModal } from './components/ManualConnectModal.js';
import { initGroupSelect } from './components/GroupSelectTool.js';

const statusEl = document.getElementById('status');
const container = document.getElementById('graph-container');
const nodeCountEl = document.getElementById('node-count');
const uploadBtn = document.getElementById('upload-btn');
const addNodeBtn = document.getElementById('add-node-btn');
const connectBtn = document.getElementById('connect-btn');
const spreadSlider = document.getElementById('spread-slider');
const spreadInput = document.getElementById('spread-input');
const breatheToggle = document.getElementById('breathe-toggle');
const orbitToggle = document.getElementById('orbit-toggle');
const orbitSpeed = document.getElementById('orbit-speed');
const breatheAmp = document.getElementById('breathe-amp');
const breatheSpeed = document.getElementById('breathe-speed');
const nodeSize = document.getElementById('node-size-slider');
const nodeSizeInput = document.getElementById('node-size-input');
const glowIntensity = document.getElementById('glow-intensity');
const glowColor = document.getElementById('glow-color');
const staticToggle = document.getElementById('static-toggle');
const motionPanel = document.getElementById('motion-panel');
const motionToggle = document.getElementById('motion-toggle');
const spreadValue = null;
const nodeSizeValue = null;
const glowValue = document.getElementById('glow-value');
const breatheAmpValue = document.getElementById('breathe-amp-value');
const breatheSpeedValue = document.getElementById('breathe-speed-value');
const orbitSpeedValue = document.getElementById('orbit-speed-value');

let graph = null;
let latestNodes = [];
let latestLinks = [];
let lastGraphSignature = '';

async function checkHealth() {
  try {
    await healthCheck();
    statusEl.innerHTML = '<span class="online">VowVector Online</span>';
  } catch {
    statusEl.innerHTML = '<span class="offline">Backend: offline</span>';
  }
}

async function loadGraph() {
  try {
    const data = await getGraphData();
    const nodeCount = data.nodes.length;
    const linkCount = data.links.length;
    const latestUpdated = data.nodes.reduce(
      (max, n) => (n.updated_at && n.updated_at > max ? n.updated_at : max),
      ''
    );
    const signature = `${nodeCount}:${linkCount}:${latestUpdated}`;
    if (signature === lastGraphSignature) {
      return;
    }
    lastGraphSignature = signature;

    updateGraphData(data);
    latestNodes = data.nodes || [];
    latestLinks = data.links || [];
    if (nodeCountEl) {
      nodeCountEl.textContent = `Nodes: ${data.nodes.length} | Links: ${data.links.length}`;
    }
  } catch (err) {
    console.error('Failed to load graph:', err);
  }
}

async function init() {
  await checkHealth();
  graph = initGraph(container);
  await loadGraph();

  // Upload modal
  const modal = createUploadModal(() => {
    // Reload graph when a file is uploaded
    loadGraph();
  });
  uploadBtn.addEventListener('click', () => modal.open());

  // Node panel + delete
  const nodePanel = createNodePanel(async (node) => {
    await deleteNode(node.id);
    await loadGraph();
  }, async (node, update) => {
    const updated = await updateNode(node.id, update);
    await loadGraph();
    return updated;
  }, (targetId) => {
    focusOnNode(targetId);
  }, async (sourceId, targetId, relationship) => {
    try {
      await deleteLink(sourceId, targetId, relationship);
      await loadGraph();
      return true;
    } catch (err) {
      console.error('Failed to delete link:', err);
      return false;
    }
  });
  setNodeClickHandler((node) => nodePanel.open(node, latestNodes, latestLinks));

  // Create node modal
  const createModal = createNodeModal(async () => {
    await loadGraph();
  });
  addNodeBtn.addEventListener('click', () => createModal.open());

  // Manual connect modal
  const connectModal = createManualConnectModal(
    async (sourceId, targetId, relationship) => {
      try {
        await createLink(sourceId, { target_id: targetId, relationship });
        await loadGraph();
        return true;
      } catch (err) {
        console.error('Failed to create link:', err);
        return false;
      }
    },
    async (sourceId, targetId, relationship) => {
      try {
        await deleteLink(sourceId, targetId, relationship);
        await loadGraph();
        return true;
      } catch (err) {
        console.error('Failed to delete link:', err);
        return false;
      }
    }
  );
  connectBtn.addEventListener('click', () => connectModal.open(latestNodes));

  // Group selection tool (G key)
  initGroupSelect(
    { getRenderer, getCamera, getGraphNodes, highlightNodes, setSelectionMode },
    {
      onDelete: async (ids) => {
        await bulkDeleteNodes(ids);
        lastGraphSignature = '';
        await loadGraph();
      },
      onReparent: async (ids, targetId) => {
        for (const id of ids) {
          await createLink(id, { target_id: targetId, relationship: 'BELONGS_TO' });
        }
        lastGraphSignature = '';
        await loadGraph();
      },
      onBulkTag: async (ids, tags) => {
        await bulkTagNodes(ids, tags);
        lastGraphSignature = '';
        await loadGraph();
      },
      onCreateGroup: async (ids, groupName) => {
        const group = await createNode({
          title: groupName,
          content: `Group: ${groupName}`,
          node_type: 'Project',
          tags: ['group', `group:${groupName}`],
          metadata: { source: 'group-select', group_name: groupName },
        });
        for (const id of ids) {
          await createLink(id, { target_id: group.id, relationship: 'BELONGS_TO' });
        }
        lastGraphSignature = '';
        await loadGraph();
      },
      getNodes: () => latestNodes,
    }
  );

  // Motion controls
  if (motionToggle && motionPanel) {
    motionToggle.addEventListener('click', () => {
      motionPanel.classList.toggle('collapsed');
      motionToggle.textContent = motionPanel.classList.contains('collapsed') ? '▸' : '▾';
    });
  }

  if (spreadSlider) {
    setGraphSpread(Number(spreadSlider.value));
    if (spreadInput) spreadInput.value = spreadSlider.value;
    spreadSlider.addEventListener('input', () => {
      if (spreadInput) spreadInput.value = spreadSlider.value;
    });
    spreadSlider.addEventListener('change', () => {
      setGraphSpread(Number(spreadSlider.value));
      if (spreadInput) spreadInput.value = spreadSlider.value;
    });
  }
  if (spreadInput) {
    spreadInput.addEventListener('change', () => {
      const value = Number(spreadInput.value);
      if (!Number.isNaN(value) && value > 0) {
        setGraphSpread(value);
      }
    });
  }
  if (nodeSize) {
    const baseSize = Number(nodeSize.value);
    if (nodeSizeInput) nodeSizeInput.value = baseSize.toString();
    setNodeStyleSettings({ baseScale: baseSize, projectScale: baseSize * 1.5 });
    nodeSize.addEventListener('input', () => {
      if (nodeSizeInput) nodeSizeInput.value = nodeSize.value;
    });
    nodeSize.addEventListener('change', () => {
      const size = Number(nodeSize.value);
      setNodeStyleSettings({ baseScale: size, projectScale: size * 1.5 });
    });
  }
  if (nodeSizeInput) {
    nodeSizeInput.addEventListener('change', () => {
      const value = Number(nodeSizeInput.value);
      if (!Number.isNaN(value) && value > 0) {
        setNodeStyleSettings({ baseScale: value, projectScale: value * 1.5 });
      }
    });
  }
  if (glowIntensity) {
    if (glowValue) glowValue.textContent = glowIntensity.value;
    setNodeStyleSettings({
      glowIntensity: Number(glowIntensity.value),
      glowTint: glowColor?.value,
      glowMix: 0.55,
      glowOpacity: 0.98,
      haloScale: 2.6,
    });
    glowIntensity.addEventListener('input', () => {
      if (glowValue) glowValue.textContent = glowIntensity.value;
    });
    glowIntensity.addEventListener('change', () => {
      setNodeStyleSettings({
        glowIntensity: Number(glowIntensity.value),
        glowTint: glowColor?.value,
        glowMix: 0.55,
        glowOpacity: 0.98,
        haloScale: 2.6,
      });
    });
  }
  if (glowColor) {
    glowColor.addEventListener('change', () => {
      setNodeStyleSettings({ glowTint: glowColor.value, glowMix: 0.55 });
    });
  }
  if (breatheAmp) {
    if (breatheAmpValue) breatheAmpValue.textContent = breatheAmp.value;
    breatheAmp.addEventListener('input', () => {
      if (breatheAmpValue) breatheAmpValue.textContent = breatheAmp.value;
    });
    breatheAmp.addEventListener('change', () => {
      setBreathingSettings({ amplitude: Number(breatheAmp.value) });
      if (breatheToggle?.checked) setBreathing(true, { amplitude: Number(breatheAmp.value) });
    });
  }
  if (breatheSpeed) {
    if (breatheSpeedValue) breatheSpeedValue.textContent = `${breatheSpeed.value}s`;
    breatheSpeed.addEventListener('input', () => {
      if (breatheSpeedValue) breatheSpeedValue.textContent = `${breatheSpeed.value}s`;
    });
    breatheSpeed.addEventListener('change', () => {
      setBreathingSettings({ periodMs: Number(breatheSpeed.value) * 1000 });
      if (breatheToggle?.checked) setBreathing(true, { periodMs: Number(breatheSpeed.value) * 1000 });
    });
  }
  if (breatheToggle) {
    breatheToggle.addEventListener('change', () => {
      setBreathing(breatheToggle.checked, {
        amplitude: Number(breatheAmp?.value || 12),
        periodMs: Number(breatheSpeed?.value || 6) * 1000,
      });
    });
  }
  if (orbitSpeed) {
    if (orbitSpeedValue) orbitSpeedValue.textContent = orbitSpeed.value;
    setOrbitSpeed(Number(orbitSpeed.value));
    orbitSpeed.addEventListener('input', () => {
      if (orbitSpeedValue) orbitSpeedValue.textContent = orbitSpeed.value;
    });
    orbitSpeed.addEventListener('change', () => {
      setOrbitSpeed(Number(orbitSpeed.value));
      if (orbitToggle?.checked) setAutoOrbit(true);
    });
  }
  if (orbitToggle) {
    orbitToggle.addEventListener('change', () => {
      setAutoOrbit(orbitToggle.checked);
    });
  }
  if (staticToggle) {
    staticToggle.addEventListener('change', () => {
      setStaticMode(staticToggle.checked);
    });
  }

  // Filter panel — toggle node type visibility
  const filterPanel = document.getElementById('filter-panel');
  const filterToggle = document.getElementById('filter-toggle');
  if (filterToggle && filterPanel) {
    filterToggle.addEventListener('click', () => {
      filterPanel.classList.toggle('collapsed');
      filterToggle.textContent = filterPanel.classList.contains('collapsed') ? '▸' : '▾';
    });
  }
  const filterCheckboxes = document.querySelectorAll('#filter-body input[data-node-type]');
  filterCheckboxes.forEach((cb) => {
    cb.addEventListener('change', () => {
      setNodeTypeVisible(cb.dataset.nodeType, cb.checked);
    });
  });

  // Recluster button
  const reclusterBtn = document.getElementById('recluster-btn');
  if (reclusterBtn) {
    reclusterBtn.addEventListener('click', () => {
      reclusterByTags();
    });
  }

  setInterval(loadGraph, 10000);
  setInterval(checkHealth, 15000);
}

init();
