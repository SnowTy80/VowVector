/**
 * Simple node details panel with delete support.
 */
import { getNodeColor } from '../utils/colorSchemes.js';

const VECTOR_COLLECTION_BY_TYPE = {
  Note: 'notes',
  Code: 'code',
  Research: 'research',
  AIInteraction: 'ai_interactions',
  Concept: 'notes',
  Project: 'notes',
  Tag: null,
  Topic: null,
};

const FILE_TYPE_TAGS = new Set([
  'txt',
  'md',
  'py',
  'js',
  'ts',
  'jsx',
  'tsx',
  'rs',
  'go',
  'java',
  'c',
  'cpp',
  'h',
  'sh',
  'yaml',
  'yml',
  'toml',
  'json',
  'html',
  'css',
]);

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function computeContextBucket(charCount) {
  if (charCount <= 3000) return 'small';
  if (charCount <= 9000) return 'medium';
  return 'large';
}

function estimateChunkCount(charCount) {
  const chunkSize = 3000;
  return Math.max(1, Math.ceil(charCount / chunkSize));
}

function deriveAutoTags(node, meta, ctxBucket, estChunks) {
  const tags = [];
  if (meta.source) tags.push(`source:${meta.source}`);
  if (meta.month) tags.push(`month:${meta.month}`);
  if (ctxBucket) tags.push(`ctx:${ctxBucket}`);
  if (typeof estChunks === 'number') tags.push(`chunks:${estChunks}`);
  if (typeof meta.message_count === 'number') tags.push(`messages:${meta.message_count}`);
  if (typeof meta.audio_file_count === 'number') tags.push(`audio:${meta.audio_file_count}`);
  if (typeof meta.image_count === 'number') tags.push(`images:${meta.image_count}`);
  if (typeof meta.asset_count === 'number') tags.push(`assets:${meta.asset_count}`);
  if (meta.source_file) tags.push(`file:${meta.source_file}`);
  if (meta.model) tags.push(`model:${meta.model}`);
  if (meta.language) tags.push(`lang:${meta.language}`);
  if (node?.node_type) tags.push(`type:${String(node.node_type).toLowerCase()}`);
  return tags;
}

function filterNewTags(tags = [], existing = []) {
  const existingSet = new Set(existing.map((t) => String(t).toLowerCase()));
  return tags.filter((t) => !existingSet.has(String(t).toLowerCase()));
}

function groupTags(tags = []) {
  const normalized = tags.map((t) => String(t).trim()).filter(Boolean);
  const fileTypes = [];
  const systemTags = [];
  const userTags = [];

  for (const tag of normalized) {
    const lower = tag.toLowerCase();
    if (FILE_TYPE_TAGS.has(lower)) {
      fileTypes.push(tag);
    } else if (lower === 'uploaded' || lower === 'raw-entry' || lower === 'raw-text' || lower === 'raw-code') {
      systemTags.push(tag);
    } else if (lower.startsWith('ctx:') || lower.startsWith('chunk:') || lower.startsWith('chunks:')) {
      systemTags.push(tag);
    } else {
      userTags.push(tag);
    }
  }

  return { fileTypes, systemTags, userTags };
}

function renderTagChips(tags = [], variant = 'auto') {
  if (!tags.length) {
    return '<span class="tag-empty">—</span>';
  }
  return tags
    .map((tag) => `<span class="tag-chip tag-chip--${variant}">${escapeHtml(tag)}</span>`)
    .join('');
}

function renderTagGroup(label, tags, variant) {
  return `
    <div class="tag-group">
      <div class="tag-group-label">${escapeHtml(label)}</div>
      <div class="tag-group-body">${renderTagChips(tags, variant)}</div>
    </div>
  `;
}

function parseConversation(content) {
  if (!content) return null;
  const parts = content.split('\n\n---\n\n').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const messages = [];
  for (const part of parts) {
    const lines = part.split('\n');
    const header = lines.shift()?.trim();
    if (!header) return null;
    const match = header.match(/^\[(.+?)\]\s*(?:\((.*?)\))?$/);
    if (!match) return null;
    const role = match[1];
    const time = match[2] || '';
    const text = lines.join('\n').trim();
    messages.push({ role, time, text });
  }
  return messages.length ? messages : null;
}

function roleToClass(role) {
  const lower = String(role || '').toLowerCase();
  if (lower.includes('user') || lower.includes('human')) return 'user';
  if (lower.includes('assistant') || lower.includes('gpt') || lower.includes('model')) return 'assistant';
  if (lower.includes('system')) return 'system';
  return 'other';
}

function renderConversation(messages = []) {
  return `
    <div class="node-chat">
      ${messages
        .map((msg) => {
          const roleClass = roleToClass(msg.role);
          const roleLabel = escapeHtml(msg.role || 'message');
          const time = msg.time ? `<span class="chat-time">${escapeHtml(msg.time)}</span>` : '';
          const text = escapeHtml(msg.text || '(no content)');
          return `
            <div class="node-chat-message ${roleClass}">
              <div class="chat-meta">
                <span class="chat-role">${roleLabel}</span>
                ${time}
              </div>
              <div class="chat-text">${text}</div>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function isCodeNode(node, groupedTags) {
  if (!node) return false;
  if (node.node_type === 'Code') return true;
  const tags = (node.tags || []).map((t) => String(t).toLowerCase());
  if (tags.includes('code')) return true;
  return (groupedTags?.fileTypes || []).length > 0;
}

function buildConnections(nodeId, nodes = [], links = []) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const connections = [];

  for (const link of links) {
    if (link.source_id === nodeId) {
      const target = nodeMap.get(link.target_id);
      if (target) {
        connections.push({
          relationship: link.relationship,
          sourceId: link.source_id,
          targetId: link.target_id,
          nodeId: target.id,
          title: target.title,
          direction: 'out',
        });
      }
    } else if (link.target_id === nodeId) {
      const source = nodeMap.get(link.source_id);
      if (source) {
        connections.push({
          relationship: link.relationship,
          sourceId: link.source_id,
          targetId: link.target_id,
          nodeId: source.id,
          title: source.title,
          direction: 'in',
        });
      }
    }
  }

  return connections;
}

export function createNodePanel(onDelete, onUpdate, onFocus, onRemoveLink) {
  const panel = document.createElement('div');
  panel.id = 'node-panel';
  panel.innerHTML = `
    <div class="node-panel-header">
      <div class="node-panel-title">
        <span>NODE DETAILS</span>
        <span id="node-type-pill" class="node-type-pill"></span>
      </div>
      <button id="node-panel-close">&times;</button>
    </div>
    <div id="node-panel-body"></div>
    <div class="node-panel-actions">
      <button id="node-panel-delete" class="danger">DELETE NODE</button>
    </div>
  `;
  document.body.appendChild(panel);

  const bodyEl = panel.querySelector('#node-panel-body');
  const closeBtn = panel.querySelector('#node-panel-close');
  const deleteBtn = panel.querySelector('#node-panel-delete');

  let currentNode = null;
  let expanded = false;
  let isEditing = false;
  let graphNodes = [];
  let graphLinks = [];

  function render() {
    if (!currentNode) return;
    const content = currentNode.content || '';
    const shortContent = content.length > 1200 ? `${content.slice(0, 1200)}…` : content;
    const displayContent = expanded ? content : shortContent;
    const meta = currentNode.metadata || {};
    const charCount = typeof meta.ctx_size === 'number' ? meta.ctx_size : content.length;
    const ctxBucket = meta.ctx_bucket || computeContextBucket(charCount);
    const estChunks = typeof meta.chunk_count === 'number' ? meta.chunk_count : estimateChunkCount(charCount);
    const chunked = meta.chunked !== undefined ? (meta.chunked ? 'yes' : 'no') : estChunks > 1 ? 'yes' : 'no';
    const vectorCollection = VECTOR_COLLECTION_BY_TYPE[currentNode.node_type] || 'none';
    const grouped = groupTags(currentNode.tags || []);
    const autoTags = filterNewTags(deriveAutoTags(currentNode, meta, ctxBucket, estChunks), currentNode.tags || []);

    const typePill = panel.querySelector('#node-type-pill');
    if (typePill) {
      typePill.textContent = currentNode.node_type || 'Unknown';
      typePill.style.setProperty('--node-color', getNodeColor(currentNode.node_type));
    }
    panel.dataset.nodeType = slugify(currentNode.node_type);

    if (isEditing) {
      const tagString = (currentNode.tags || []).join(', ');
      const meta = currentNode.metadata || {};
      const currentColor = meta.node_color || getNodeColor(currentNode.node_type);
      const currentScale = typeof meta.node_scale === 'number' ? meta.node_scale : 0;
      const scaleLabel = currentScale > 0 ? currentScale.toFixed(1) : 'auto';
      bodyEl.innerHTML = `
        <div class="node-section">
          <div class="node-section-title">EDIT NODE</div>
          <div class="node-row"><span>Type</span><b>${escapeHtml(currentNode.node_type)}</b></div>
          <div class="node-edit-row">
            <label>Title</label>
            <input id="node-edit-title" type="text" value="${escapeHtml(currentNode.title)}" />
          </div>
          <div class="node-edit-row">
            <label>Tags</label>
            <input id="node-edit-tags" type="text" value="${escapeHtml(tagString)}" />
          </div>
          <div class="node-edit-row">
            <label>Content</label>
            <textarea id="node-edit-content">${escapeHtml(currentNode.content || '')}</textarea>
          </div>
          <div class="node-edit-row node-edit-visual">
            <label>Node Color</label>
            <div class="node-color-row">
              <input id="node-edit-color" type="color" value="${escapeHtml(currentColor)}" />
              <button id="node-edit-color-reset" class="ghost-small" title="Reset to type default">RESET</button>
            </div>
          </div>
          <div class="node-edit-row node-edit-visual">
            <label>Node Size <span id="node-edit-scale-label" class="scale-label">${scaleLabel}</span></label>
            <div class="node-scale-row">
              <input id="node-edit-scale" type="range" min="0" max="3" step="0.1" value="${currentScale}" />
              <button id="node-edit-scale-reset" class="ghost-small" title="Reset to auto (context-based)">AUTO</button>
            </div>
          </div>
          <div class="node-edit-actions">
            <button id="node-edit-cancel" class="ghost">CANCEL</button>
            <button id="node-edit-save" class="confirm">SAVE</button>
          </div>
        </div>
      `;

      const scaleSlider = bodyEl.querySelector('#node-edit-scale');
      const scaleLabelEl = bodyEl.querySelector('#node-edit-scale-label');
      scaleSlider.addEventListener('input', () => {
        const v = parseFloat(scaleSlider.value);
        scaleLabelEl.textContent = v > 0 ? v.toFixed(1) : 'auto';
      });

      bodyEl.querySelector('#node-edit-color-reset').addEventListener('click', () => {
        bodyEl.querySelector('#node-edit-color').value = getNodeColor(currentNode.node_type);
      });

      bodyEl.querySelector('#node-edit-scale-reset').addEventListener('click', () => {
        scaleSlider.value = '0';
        scaleLabelEl.textContent = 'auto';
      });

      bodyEl.querySelector('#node-edit-cancel').addEventListener('click', () => {
        isEditing = false;
        render();
      });
      bodyEl.querySelector('#node-edit-save').addEventListener('click', async () => {
        if (!onUpdate) return;
        const title = bodyEl.querySelector('#node-edit-title').value.trim();
        const tagsRaw = bodyEl.querySelector('#node-edit-tags').value;
        const content = bodyEl.querySelector('#node-edit-content').value;
        const tags = tagsRaw
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

        const chosenColor = bodyEl.querySelector('#node-edit-color').value;
        const chosenScale = parseFloat(scaleSlider.value);
        const typeDefault = getNodeColor(currentNode.node_type);

        // Build metadata updates for visual overrides
        const metadataUpdate = { ...(currentNode.metadata || {}) };
        if (chosenColor && chosenColor.toLowerCase() !== typeDefault.toLowerCase()) {
          metadataUpdate.node_color = chosenColor;
        } else {
          delete metadataUpdate.node_color;
        }
        if (chosenScale > 0) {
          metadataUpdate.node_scale = chosenScale;
        } else {
          delete metadataUpdate.node_scale;
        }

        const updated = await onUpdate(currentNode, { title, content, tags, metadata: metadataUpdate });
        if (updated) {
          currentNode = updated;
          isEditing = false;
          render();
        }
      });
      return;
    }

    const connections = buildConnections(currentNode.id, graphNodes, graphLinks);
    const connectionsHtml = connections.length
      ? connections
          .map((c) => {
            const title = escapeHtml(c.title || c.nodeId);
            const rel = escapeHtml(c.relationship || 'RELATES_TO');
            return `<div class="connection-row">
              <span>${rel}</span>
              <div class="connection-actions">
                <button class="link-button" data-node-id="${escapeHtml(c.nodeId)}">${title}</button>
                <button class="link-remove" data-source-id="${escapeHtml(c.sourceId)}" data-target-id="${escapeHtml(c.targetId)}" data-rel="${escapeHtml(c.relationship)}">×</button>
              </div>
            </div>`;
          })
          .join('')
      : '<div class="connection-empty">No connections</div>';

    const isCode = isCodeNode(currentNode, grouped);
    const isNote = currentNode.node_type === 'Note';
    const conversation = currentNode.node_type === 'AIInteraction'
      ? parseConversation(displayContent)
      : null;
    const contentClass = [
      'node-content',
      `node-content--${slugify(currentNode.node_type)}`,
      isCode ? 'node-content--code' : '',
      isNote ? 'node-content--note' : '',
      conversation ? 'node-content--chat' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const contentLabel = currentNode.node_type === 'AIInteraction'
      ? 'TRANSCRIPT'
      : isCode
        ? 'CODE'
        : currentNode.node_type === 'Note'
          ? 'NOTES'
          : currentNode.node_type === 'Research'
            ? 'RESEARCH'
            : currentNode.node_type === 'Project'
              ? 'SUMMARY'
              : 'CONTENT';
    const contentInner = conversation
      ? renderConversation(conversation)
      : isCode
        ? `<pre class="node-code-block">${escapeHtml(displayContent || '(no content)')}</pre>`
        : `<div class="node-content-text">${escapeHtml(displayContent || '(no content)')}</div>`;

    bodyEl.innerHTML = `
      <div class="node-section">
        <div class="node-section-title">IDENTITY</div>
        <div class="node-row"><span>Title</span><b>${escapeHtml(currentNode.title)}</b></div>
        <div class="node-row"><span>Type</span><b>${escapeHtml(currentNode.node_type)}</b></div>
        <div class="node-row"><span>ID</span><b>${escapeHtml(currentNode.id)}</b></div>
        <div class="node-row"><span>Created</span><b>${escapeHtml(currentNode.created_at)}</b></div>
        <div class="node-row"><span>Updated</span><b>${escapeHtml(currentNode.updated_at)}</b></div>
      </div>

      <div class="node-section">
        <div class="node-section-title">STORAGE</div>
        <div class="node-row"><span>Vector Collection</span><b>${escapeHtml(vectorCollection)}</b></div>
      </div>

      <div class="node-section">
        <div class="node-section-title">CONTENT</div>
        <div class="node-row"><span>Context Size</span><b>${escapeHtml(ctxBucket)} (${formatNumber(charCount)} chars)</b></div>
        <div class="node-row"><span>Chunked</span><b>${chunked}</b></div>
        <div class="node-row"><span>Chunks</span><b>${formatNumber(estChunks)}</b></div>
      </div>

      <div class="node-section">
        <div class="node-section-title">TAGS</div>
        <div class="tag-stack">
          ${renderTagGroup('Auto', autoTags, 'auto')}
          ${renderTagGroup('File', grouped.fileTypes, 'file')}
          ${renderTagGroup('System', grouped.systemTags, 'system')}
          ${renderTagGroup('User', grouped.userTags, 'user')}
        </div>
      </div>

      <div class="node-section">
        <div class="node-section-title">CONNECTIONS</div>
        ${connectionsHtml}
      </div>

      <div class="node-section node-section--content">
        <div class="node-section-title">${escapeHtml(contentLabel)}</div>
        <div class="${contentClass}">
          ${contentInner}
        </div>
        ${content.length > 1200 ? '<button id="node-panel-toggle" class="ghost">TOGGLE FULL</button>' : ''}
      </div>
    `;
    const toggle = bodyEl.querySelector('#node-panel-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        expanded = !expanded;
        render();
      });
    }
    const connectionButtons = bodyEl.querySelectorAll('.link-button');
    connectionButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-node-id');
        if (targetId && onFocus) {
          onFocus(targetId);
        }
      });
    });
    const removeButtons = bodyEl.querySelectorAll('.link-remove');
    removeButtons.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const sourceId = btn.getAttribute('data-source-id');
        const targetId = btn.getAttribute('data-target-id');
        const rel = btn.getAttribute('data-rel');
        if (!sourceId || !targetId || !onRemoveLink) return;
        await onRemoveLink(sourceId, targetId, rel);
        render();
      });
    });
  }

  function open(node, nodes = [], links = []) {
    currentNode = node;
    expanded = false;
    isEditing = false;
    graphNodes = nodes;
    graphLinks = links;
    render();
    panel.classList.add('visible');
  }

  function close() {
    panel.classList.remove('visible');
    currentNode = null;
  }

  closeBtn.addEventListener('click', close);
  deleteBtn.addEventListener('click', async () => {
    if (!currentNode) return;
    if (!confirm(`Delete "${currentNode.title}"?`)) return;
    await onDelete(currentNode);
    close();
  });

  const editBtn = document.createElement('button');
  editBtn.id = 'node-panel-edit';
  editBtn.className = 'ghost';
  editBtn.textContent = 'MODIFY NODE';
  panel.querySelector('.node-panel-actions').prepend(editBtn);
  editBtn.addEventListener('click', () => {
    if (!currentNode) return;
    isEditing = true;
    render();
  });

  return { open, close };
}
