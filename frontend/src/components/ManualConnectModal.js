/**
 * Manual connection modal for creating/removing links.
 */

const RELATIONSHIPS = [
  'RELATES_TO',
  'IMPLEMENTS',
  'GENERATED',
  'SUPPORTS',
  'BELONGS_TO',
  'HAS_TAG',
  'INSPIRED_BY',
  'REVISION_OF'
];

function shortId(value) {
  if (!value) return '';
  const parts = value.split('_');
  if (parts.length > 1) return parts[parts.length - 1].slice(-8);
  return value.slice(-8);
}

export function createManualConnectModal(onCreate, onRemove) {
  const overlay = document.createElement('div');
  overlay.id = 'manual-connect-overlay';
  overlay.innerHTML = `
    <div id="manual-connect-modal">
      <div class="modal-header">
        <span class="modal-title">MANUAL CONNECT</span>
        <button id="manual-connect-close">&times;</button>
      </div>
      <div class="manual-connect-fields">
        <label>Source Node</label>
        <select id="manual-source"></select>
        <label>Target Node</label>
        <select id="manual-target"></select>
        <label>Relationship</label>
        <select id="manual-relationship"></select>
      </div>
      <div id="manual-connect-status"></div>
      <div class="manual-connect-actions">
        <button id="manual-connect-remove" class="danger">REMOVE LINK</button>
        <button id="manual-connect-create" class="confirm">CREATE LINK</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector('#manual-connect-close');
  const sourceSelect = overlay.querySelector('#manual-source');
  const targetSelect = overlay.querySelector('#manual-target');
  const relationshipSelect = overlay.querySelector('#manual-relationship');
  const statusEl = overlay.querySelector('#manual-connect-status');
  const createBtn = overlay.querySelector('#manual-connect-create');
  const removeBtn = overlay.querySelector('#manual-connect-remove');

  let isOpen = false;

  function open(nodes) {
    populateNodes(nodes);
    overlay.classList.add('visible');
    isOpen = true;
  }

  function close() {
    overlay.classList.remove('visible');
    isOpen = false;
    statusEl.textContent = '';
  }

  function populateNodes(nodes = []) {
    const options = nodes.map((n, idx) => {
      const label = `${idx + 1}. ${n.title} (${n.node_type}) [${shortId(n.id)}]`;
      return `<option value="${n.id}">${label}</option>`;
    });
    sourceSelect.innerHTML = options.join('');
    targetSelect.innerHTML = options.join('');
  }

  function populateRelationships() {
    relationshipSelect.innerHTML = RELATIONSHIPS.map((r) => `<option value="${r}">${r}</option>`).join('');
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  closeBtn.addEventListener('click', close);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) close();
  });

  createBtn.addEventListener('click', async () => {
    const sourceId = sourceSelect.value;
    const targetId = targetSelect.value;
    const relationship = relationshipSelect.value;
    if (!sourceId || !targetId || sourceId === targetId) {
      statusEl.textContent = 'Select two different nodes.';
      return;
    }
    statusEl.textContent = 'Creating...';
    const ok = await onCreate(sourceId, targetId, relationship);
    statusEl.textContent = ok ? 'Link created.' : 'Failed to create.';
  });

  removeBtn.addEventListener('click', async () => {
    const sourceId = sourceSelect.value;
    const targetId = targetSelect.value;
    const relationship = relationshipSelect.value;
    if (!sourceId || !targetId || sourceId === targetId) {
      statusEl.textContent = 'Select two different nodes.';
      return;
    }
    statusEl.textContent = 'Removing...';
    const ok = await onRemove(sourceId, targetId, relationship);
    statusEl.textContent = ok ? 'Link removed.' : 'Failed to remove.';
  });

  populateRelationships();

  return { open, close };
}
