/**
 * Group selection tool for VowVector 3D graph.
 * Press G to enter selection mode, drag rectangle to select nodes,
 * right-click for context menu with bulk operations.
 */
import * as THREE from 'three';

let active = false;
let selectedIds = new Set();
let dragging = false;
let dragStart = null;
let rectEl = null;
let menuEl = null;
let badgeEl = null;
let callbacks = {};
let graphRef = null;

function projectToScreen(node, camera, renderer) {
  const vec = new THREE.Vector3(node.x, node.y, node.z);
  vec.project(camera);
  const w = renderer.domElement.clientWidth;
  const h = renderer.domElement.clientHeight;
  return {
    x: (vec.x * 0.5 + 0.5) * w,
    y: (-vec.y * 0.5 + 0.5) * h,
  };
}

function showBadge() {
  if (!badgeEl) {
    badgeEl = document.createElement('div');
    badgeEl.id = 'selection-badge';
    badgeEl.textContent = 'SELECT MODE (G)';
    document.body.appendChild(badgeEl);
  }
  badgeEl.style.display = 'block';
}

function hideBadge() {
  if (badgeEl) badgeEl.style.display = 'none';
}

function closeMenu() {
  if (menuEl) {
    menuEl.remove();
    menuEl = null;
  }
}

function clearSelection() {
  if (selectedIds.size && graphRef?.highlightNodes) {
    graphRef.highlightNodes([...selectedIds], false);
  }
  selectedIds.clear();
  closeMenu();
}

function enterSelectionMode() {
  if (active) return;
  active = true;
  graphRef.setSelectionMode(true);
  showBadge();
  const el = graphRef.getRenderer()?.domElement;
  if (el) el.style.cursor = 'crosshair';
}

function exitSelectionMode() {
  if (!active) return;
  active = false;
  clearSelection();
  graphRef.setSelectionMode(false);
  hideBadge();
  const el = graphRef.getRenderer()?.domElement;
  if (el) el.style.cursor = '';
}

function onKeyDown(e) {
  // Don't activate when typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  if (e.key === 'g' || e.key === 'G') {
    if (active) {
      exitSelectionMode();
    } else {
      enterSelectionMode();
    }
    return;
  }
  if (e.key === 'Escape' && active) {
    exitSelectionMode();
  }
}

function onPointerDown(e) {
  if (!active) return;
  if (e.button !== 0) return; // left click only for drag
  closeMenu();
  dragging = true;
  const rect = e.target.getBoundingClientRect();
  dragStart = { x: e.clientX - rect.left, y: e.clientY - rect.top, cx: e.clientX, cy: e.clientY };

  rectEl = document.createElement('div');
  rectEl.className = 'selection-rect';
  rectEl.style.left = `${e.clientX}px`;
  rectEl.style.top = `${e.clientY}px`;
  rectEl.style.width = '0px';
  rectEl.style.height = '0px';
  document.body.appendChild(rectEl);

  e.preventDefault();
  e.stopPropagation();
}

function onPointerMove(e) {
  if (!dragging || !rectEl || !dragStart) return;
  const x = Math.min(dragStart.cx, e.clientX);
  const y = Math.min(dragStart.cy, e.clientY);
  const w = Math.abs(e.clientX - dragStart.cx);
  const h = Math.abs(e.clientY - dragStart.cy);
  rectEl.style.left = `${x}px`;
  rectEl.style.top = `${y}px`;
  rectEl.style.width = `${w}px`;
  rectEl.style.height = `${h}px`;
}

function onPointerUp(e) {
  if (!dragging || !dragStart) return;
  dragging = false;

  const renderer = graphRef.getRenderer();
  const camera = graphRef.getCamera();
  const nodes = graphRef.getGraphNodes();

  if (!renderer || !camera || !nodes.length) {
    if (rectEl) { rectEl.remove(); rectEl = null; }
    return;
  }

  // Compute selection rectangle in canvas-relative coords
  const canvasRect = renderer.domElement.getBoundingClientRect();
  const x1 = Math.min(dragStart.cx, e.clientX) - canvasRect.left;
  const y1 = Math.min(dragStart.cy, e.clientY) - canvasRect.top;
  const x2 = Math.max(dragStart.cx, e.clientX) - canvasRect.left;
  const y2 = Math.max(dragStart.cy, e.clientY) - canvasRect.top;

  // Min drag distance to count as a rectangle (vs a click)
  const isRect = (x2 - x1) > 5 && (y2 - y1) > 5;

  // Unhighlight previous selection
  if (selectedIds.size) {
    graphRef.highlightNodes([...selectedIds], false);
  }
  selectedIds.clear();

  if (isRect) {
    for (const node of nodes) {
      if (node.x === undefined) continue;
      const screen = projectToScreen(node, camera, renderer);
      if (screen.x >= x1 && screen.x <= x2 && screen.y >= y1 && screen.y <= y2) {
        selectedIds.add(node.id);
      }
    }
  }

  if (selectedIds.size) {
    graphRef.highlightNodes([...selectedIds], true);
  }

  if (rectEl) { rectEl.remove(); rectEl = null; }
  dragStart = null;
}

function onContextMenu(e) {
  if (!active || selectedIds.size === 0) return;
  e.preventDefault();
  e.stopPropagation();
  showContextMenu(e.clientX, e.clientY);
}

function showContextMenu(x, y) {
  closeMenu();
  menuEl = document.createElement('div');
  menuEl.id = 'group-context-menu';

  const count = selectedIds.size;
  const header = document.createElement('div');
  header.className = 'ctx-header';
  header.textContent = `${count} node${count > 1 ? 's' : ''} selected`;
  menuEl.appendChild(header);

  const actions = [
    { label: 'Delete Selected', icon: '\u2716', action: handleDelete },
    { label: 'Re-group / Re-parent', icon: '\u2192', action: handleReparent },
    { label: 'Bulk Tag', icon: '\u2605', action: handleBulkTag },
    { label: 'Create Group', icon: '\u2726', action: handleCreateGroup },
  ];

  for (const a of actions) {
    const btn = document.createElement('div');
    btn.className = 'ctx-item';
    btn.innerHTML = `<span class="ctx-icon">${a.icon}</span> ${a.label}`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      a.action();
    });
    menuEl.appendChild(btn);
  }

  // Position: ensure it doesn't overflow viewport
  menuEl.style.left = `${Math.min(x, window.innerWidth - 240)}px`;
  menuEl.style.top = `${Math.min(y, window.innerHeight - 220)}px`;
  document.body.appendChild(menuEl);

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', closeMenuOnOutside, { once: true });
  }, 50);
}

function closeMenuOnOutside(e) {
  if (menuEl && !menuEl.contains(e.target)) {
    closeMenu();
  }
}

// --- Action handlers ---

async function handleDelete() {
  const ids = [...selectedIds];
  if (!confirm(`Delete ${ids.length} selected node(s)? This cannot be undone.`)) return;
  closeMenu();
  try {
    await callbacks.onDelete(ids);
  } catch (err) {
    console.error('Bulk delete failed:', err);
  }
  clearSelection();
}

async function handleReparent() {
  closeMenu();
  // Show sub-menu with available parent nodes (Project + Topic)
  const allNodes = callbacks.getNodes ? callbacks.getNodes() : [];
  const parents = allNodes.filter((n) =>
    n.node_type === 'Project' || n.node_type === 'Topic'
  );

  if (!parents.length) {
    alert('No Project or Topic nodes available to re-parent to.');
    return;
  }

  const subMenu = document.createElement('div');
  subMenu.id = 'group-context-menu';
  subMenu.className = 'reparent-submenu';

  const hdr = document.createElement('div');
  hdr.className = 'ctx-header';
  hdr.textContent = 'Select new parent';
  subMenu.appendChild(hdr);

  for (const p of parents.slice(0, 30)) {
    const item = document.createElement('div');
    item.className = 'ctx-item';
    const typeTag = p.node_type === 'Project' ? '[P]' : '[T]';
    item.textContent = `${typeTag} ${p.title}`;
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      subMenu.remove();
      try {
        await callbacks.onReparent([...selectedIds], p.id);
      } catch (err) {
        console.error('Re-parent failed:', err);
      }
      clearSelection();
    });
    subMenu.appendChild(item);
  }

  const cancelBtn = document.createElement('div');
  cancelBtn.className = 'ctx-item ctx-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    subMenu.remove();
  });
  subMenu.appendChild(cancelBtn);

  // Center on screen
  subMenu.style.left = `${window.innerWidth / 2 - 120}px`;
  subMenu.style.top = `${window.innerHeight / 2 - 100}px`;
  document.body.appendChild(subMenu);
}

async function handleBulkTag() {
  closeMenu();
  const input = prompt('Enter tags to add (comma-separated):');
  if (!input) return;
  const tags = input.split(',').map((t) => t.trim()).filter(Boolean);
  if (!tags.length) return;
  try {
    await callbacks.onBulkTag([...selectedIds], tags);
  } catch (err) {
    console.error('Bulk tag failed:', err);
  }
  clearSelection();
}

async function handleCreateGroup() {
  closeMenu();
  const name = prompt('Group name:');
  if (!name) return;
  try {
    await callbacks.onCreateGroup([...selectedIds], name.trim());
  } catch (err) {
    console.error('Create group failed:', err);
  }
  clearSelection();
}

// --- Public API ---

export function initGroupSelect(graphApi, cbs) {
  graphRef = graphApi;
  callbacks = cbs;

  document.addEventListener('keydown', onKeyDown);

  const el = graphRef.getRenderer()?.domElement;
  if (el) {
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('contextmenu', onContextMenu);
  }
}
