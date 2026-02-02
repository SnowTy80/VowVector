/**
 * Manual node creation modal.
 */

const NODE_TYPES = [
  'Note',
  'Code',
  'AIInteraction',
  'Research',
  'Project',
  'Concept',
];

function splitTags(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function createNodeModal(onCreateSuccess) {
  const overlay = document.createElement('div');
  overlay.id = 'create-node-overlay';
  overlay.innerHTML = `
    <div id="create-node-modal">
      <div class="modal-header">
        <span class="modal-title">CREATE NODE</span>
        <button id="create-node-close">&times;</button>
      </div>
      <div class="create-node-fields">
        <label>Type</label>
        <select id="create-node-type"></select>
        <label>Title</label>
        <input id="create-node-title" type="text" placeholder="Title" />
        <label>Tags</label>
        <input id="create-node-tags" type="text" placeholder="comma, separated, tags" />
        <label>Content</label>
        <textarea id="create-node-content" placeholder="Write content here..."></textarea>
      </div>
      <div id="create-node-status"></div>
      <div class="create-node-actions">
        <button id="create-node-cancel" class="ghost">CANCEL</button>
        <button id="create-node-save" class="confirm">CREATE</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector('#create-node-close');
  const cancelBtn = overlay.querySelector('#create-node-cancel');
  const saveBtn = overlay.querySelector('#create-node-save');
  const typeSelect = overlay.querySelector('#create-node-type');
  const titleInput = overlay.querySelector('#create-node-title');
  const tagsInput = overlay.querySelector('#create-node-tags');
  const contentInput = overlay.querySelector('#create-node-content');
  const statusEl = overlay.querySelector('#create-node-status');

  let isOpen = false;

  function open() {
    overlay.classList.add('visible');
    isOpen = true;
  }

  function close() {
    overlay.classList.remove('visible');
    isOpen = false;
    statusEl.textContent = '';
    titleInput.value = '';
    tagsInput.value = '';
    contentInput.value = '';
  }

  function populateTypes() {
    typeSelect.innerHTML = NODE_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('');
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) close();
  });

  saveBtn.addEventListener('click', async () => {
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    if (!title || !content) {
      statusEl.textContent = 'Title and content are required.';
      return;
    }
    const payload = {
      title,
      content,
      node_type: typeSelect.value,
      tags: splitTags(tagsInput.value),
      metadata: { source: 'manual' },
    };
    statusEl.textContent = 'Creating...';
    try {
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        statusEl.textContent = `Failed: ${err.detail}`;
        return;
      }
      const node = await res.json();
      statusEl.textContent = 'Created.';
      if (onCreateSuccess) onCreateSuccess(node);
      close();
    } catch (err) {
      statusEl.textContent = `Failed: ${err.message}`;
    }
  });

  populateTypes();

  return { open, close };
}
