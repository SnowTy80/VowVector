/**
 * Drag-and-drop file upload modal for VowVector.
 * Opens with the upload button, supports drag-drop or file picker.
 */

const CATEGORY_CONFIG = {
  Notes: {
    nodeType: 'Note',
    collection: 'notes',
    fileTypes: ['.txt', '.md'],
    rawEnabled: true,
    codeLanguage: false,
  },
  Code: {
    nodeType: 'Code',
    collection: 'code',
    fileTypes: ['.py', '.js', '.ts', '.jsx', '.tsx', '.rs', '.go', '.java', '.c', '.cpp', '.h', '.sh', '.yaml', '.yml', '.toml', '.json', '.html', '.css', '.md'],
    rawEnabled: true,
    codeLanguage: true,
  },
  'Conversation Data': {
    nodeType: 'AIInteraction',
    collection: 'ai_interactions',
    fileTypes: ['.json'],
    rawEnabled: false,
    codeLanguage: false,
    conversationImport: true,
  },
  Research: {
    nodeType: 'Research',
    collection: 'research',
    fileTypes: ['.zip'],
    rawEnabled: false,
    codeLanguage: false,
  },
};

const CODE_LANGUAGES = [
  'python',
  'javascript',
  'typescript',
  'json',
  'c',
  'cpp',
  'csharp',
  'go',
  'rust',
  'java',
  'bash',
  'html',
  'css',
  'yaml',
  'toml',
];

function computeCtxBucket(charCount) {
  if (charCount <= 3000) return 'small';
  if (charCount <= 9000) return 'med';
  return 'large';
}

function formatConversationContent(convo) {
  const lines = [];
  if (convo.title) lines.push(`# ${convo.title}\n`);
  if (convo.create_time) {
    const date = new Date(convo.create_time * 1000);
    lines.push(`Date: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}\n`);
  }
  lines.push('---\n');
  for (const msg of convo.messages || []) {
    const role = msg.role === 'user' ? 'USER' : 'ASSISTANT';
    lines.push(`**[${role}]**`);
    lines.push(msg.text || '');
    lines.push('');
  }
  return lines.join('\n');
}

function splitTags(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function createUploadModal(onUploadSuccess) {
  // Overlay
  const overlay = document.createElement('div');
  overlay.id = 'upload-overlay';
  overlay.innerHTML = `
    <div id="upload-modal">
      <div class="modal-header">
        <span class="modal-title">INGEST</span>
        <button id="upload-close">&times;</button>
      </div>
      <div id="upload-config">
        <div class="upload-row">
          <label for="upload-category">Category</label>
          <select id="upload-category">
            <option>Notes</option>
            <option>Code</option>
            <option>Conversation Data</option>
            <option>Research</option>
          </select>
        </div>
        <div class="upload-row" id="upload-mode-row">
          <label for="upload-mode">Mode</label>
          <select id="upload-mode">
            <option value="file">File Upload</option>
            <option value="raw">Raw Entry</option>
          </select>
        </div>
        <div class="upload-row" id="upload-language-row">
          <label for="upload-language">Code Type</label>
          <select id="upload-language"></select>
        </div>
      </div>
      <div id="upload-unsupported" class="upload-warning">
        This category is not enabled yet.
      </div>
      <div id="drop-zone">
        <div class="drop-icon">&#x2B06;</div>
        <div class="drop-text">Drag &amp; drop files here</div>
        <div class="drop-sub">or click to browse</div>
        <div class="drop-types" id="drop-types"></div>
        <input type="file" id="file-input" multiple />
      </div>
      <div id="folder-upload">
        <button id="folder-btn">ADD FOLDER</button>
        <input type="file" id="folder-input" webkitdirectory directory multiple />
        <div class="folder-sub">Upload all files in a folder</div>
      </div>
      <div id="folder-style">
        <label>Group Node Size</label>
        <input id="group-size" type="range" min="1" max="3" step="0.1" value="1.5" />
        <span id="group-size-value">1.5x</span>
        <label>Group Node Color</label>
        <input id="group-color" type="color" value="#FFD700" />
      </div>
      <div id="raw-entry">
        <textarea id="raw-content" placeholder="Paste raw text or code here..."></textarea>
      </div>
      <div id="upload-fields">
        <input type="text" id="upload-title" placeholder="Title (optional — auto-derived from filename)" />
        <input type="text" id="upload-tags" placeholder="Tags (comma-separated, optional)" />
      </div>
      <div id="upload-queue"></div>
      <div id="upload-actions">
        <label class="upload-toggle">
          <input type="checkbox" id="upload-auto" />
          Auto-upload on select
        </label>
        <button id="upload-start">UPLOAD SELECTED</button>
        <button id="purge-conversations" style="display:none;">PURGE CONVERSATIONS</button>
      </div>
      <div id="convo-options" style="display:none;">
        <div class="upload-row">
          <label for="connect-threshold">Connection Threshold</label>
          <input id="connect-threshold" type="range" min="1" max="5" step="1" value="2" />
          <span id="connect-threshold-value">2</span>
        </div>
        <div class="convo-hint">Min shared content tags to auto-connect conversations</div>
      </div>
      <div id="import-progress" style="display:none;">
        <div class="progress-phase" id="progress-phase">PARSING</div>
        <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
        <div class="progress-detail" id="progress-detail"></div>
      </div>
      <div id="upload-status"></div>
      <div id="upload-results"></div>
      <div id="import-summary" style="display:none;"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const modal = overlay.querySelector('#upload-modal');
  const dropZone = overlay.querySelector('#drop-zone');
  const fileInput = overlay.querySelector('#file-input');
  const folderInput = overlay.querySelector('#folder-input');
  const folderBtn = overlay.querySelector('#folder-btn');
  const closeBtn = overlay.querySelector('#upload-close');
  const statusEl = overlay.querySelector('#upload-status');
  const resultsEl = overlay.querySelector('#upload-results');
  const titleInput = overlay.querySelector('#upload-title');
  const tagsInput = overlay.querySelector('#upload-tags');
  const queueEl = overlay.querySelector('#upload-queue');
  const startBtn = overlay.querySelector('#upload-start');
  const autoToggle = overlay.querySelector('#upload-auto');
  const actionsRow = overlay.querySelector('#upload-actions');
  const categorySelect = overlay.querySelector('#upload-category');
  const modeSelect = overlay.querySelector('#upload-mode');
  const languageSelect = overlay.querySelector('#upload-language');
  const modeRow = overlay.querySelector('#upload-mode-row');
  const languageRow = overlay.querySelector('#upload-language-row');
  const dropTypesEl = overlay.querySelector('#drop-types');
  const unsupportedEl = overlay.querySelector('#upload-unsupported');
  const rawEntryEl = overlay.querySelector('#raw-entry');
  const rawContent = overlay.querySelector('#raw-content');
  const groupSize = overlay.querySelector('#group-size');
  const groupSizeValue = overlay.querySelector('#group-size-value');
  const groupColor = overlay.querySelector('#group-color');
  const purgeBtn = overlay.querySelector('#purge-conversations');
  const convoOptions = overlay.querySelector('#convo-options');
  const connectThreshold = overlay.querySelector('#connect-threshold');
  const connectThresholdValue = overlay.querySelector('#connect-threshold-value');
  const importProgress = overlay.querySelector('#import-progress');
  const progressPhase = overlay.querySelector('#progress-phase');
  const progressFill = overlay.querySelector('#progress-fill');
  const progressDetail = overlay.querySelector('#progress-detail');
  const importSummary = overlay.querySelector('#import-summary');

  let isOpen = false;
  let queuedFiles = [];
  let totalToUpload = 0;
  let uploadedCount = 0;
  const groupNodeMap = new Map();

  function open() {
    overlay.classList.add('visible');
    isOpen = true;
  }

  function close() {
    overlay.classList.remove('visible');
    isOpen = false;
    statusEl.textContent = '';
    resultsEl.innerHTML = '';
    queueEl.innerHTML = '';
    queuedFiles = [];
    totalToUpload = 0;
    uploadedCount = 0;
    groupNodeMap.clear();
    groupSize.value = '1.5';
    groupSizeValue.textContent = '1.5x';
    groupColor.value = '#FFD700';
    titleInput.value = '';
    tagsInput.value = '';
    rawContent.value = '';
    autoToggle.checked = false;
    importProgress.style.display = 'none';
    importSummary.style.display = 'none';
    importSummary.innerHTML = '';
    progressFill.style.width = '0%';
    connectThreshold.value = '2';
    connectThresholdValue.textContent = '2';
  }

  // Close on overlay click (not modal)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  closeBtn.addEventListener('click', close);

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) close();
  });

  // Click to browse
  dropZone.addEventListener('click', () => {
    if (modeSelect.value === 'file' && !fileInput.disabled) {
      fileInput.click();
    }
  });

  // Drag events
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
  });

  // File picker
  fileInput.addEventListener('change', () => {
    handleFiles(fileInput.files);
    fileInput.value = '';
  });

  folderBtn.addEventListener('click', () => {
    if (modeSelect.value !== 'file' || folderInput.disabled) return;
    folderInput.click();
  });

  folderInput.addEventListener('change', () => {
    handleFiles(folderInput.files);
    folderInput.value = '';
  });

  if (groupSize && groupSizeValue) {
    groupSize.addEventListener('input', () => {
      groupSizeValue.textContent = `${groupSize.value}x`;
    });
  }

  connectThreshold.addEventListener('input', () => {
    connectThresholdValue.textContent = connectThreshold.value;
  });

  async function handleFiles(fileList) {
    const files = Array.from(fileList);
    if (!files.length) return;

    const items = files.map((file) => {
      const relPath = file.webkitRelativePath || '';
      const groupName = relPath ? relPath.split('/')[0] : null;
      return { file, relPath, groupName };
    });

    queuedFiles = queuedFiles.concat(items);
    renderQueue();
    if (autoToggle.checked) {
      await uploadQueued();
    }
  }

  function renderQueue() {
    if (!queuedFiles.length) {
      queueEl.innerHTML = '<div class="queue-empty">No files selected</div>';
      return;
    }
    queueEl.innerHTML = queuedFiles
      .map((item, i) => {
        const label = item.groupName ? `[${item.groupName}] ${item.file.name}` : item.file.name;
        return `<div class="queue-item">${i + 1}. ${label}</div>`;
      })
      .join('');
  }

  async function uploadQueued() {
    if (modeSelect.value === 'raw') {
      await uploadRawEntry();
      return;
    }

    if (!queuedFiles.length) return;

    const cfg = CATEGORY_CONFIG[categorySelect.value];
    if (cfg.conversationImport) {
      await uploadConversations();
      return;
    }

    totalToUpload = queuedFiles.length;
    uploadedCount = 0;
    statusEl.textContent = `Uploading ${queuedFiles.length} file(s)...`;
    resultsEl.innerHTML = '';

    for (const item of queuedFiles) {
      const file = item.file;
      const autoTags = await buildAutoTagsForFile(file, item);
      const userTags = splitTags(tagsInput.value);
      const allTags = [...autoTags, ...userTags];

      const formData = new FormData();
      formData.append('file', file);
      if (titleInput.value.trim()) {
        formData.append('title', titleInput.value.trim());
      }
      if (allTags.length) {
        formData.append('tags', allTags.join(','));
      }

      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: res.statusText }));
          resultsEl.innerHTML += `<div class="result-fail">${file.name}: ${err.detail}</div>`;
          continue;
        }

        const node = await res.json();
        resultsEl.innerHTML += `<div class="result-ok">${file.name} → ${node.node_type} node created</div>`;

        if (item.groupName) {
          const groupId = await ensureGroupNode(item.groupName);
          if (groupId) {
            await createBelongsToLink(node.id, groupId);
          }
        }

        if (onUploadSuccess) onUploadSuccess(node);
      } catch (err) {
        resultsEl.innerHTML += `<div class="result-fail">${file.name}: ${err.message}</div>`;
      }

      uploadedCount += 1;
      statusEl.textContent = `Uploading ${uploadedCount}/${totalToUpload} file(s)...`;
    }

    statusEl.textContent = 'Done.';
    queuedFiles = [];
    renderQueue();
  }

  function convoMsgScale(msgCount) {
    // Size nodes by message count: 2msgs→0.8, 5→1.2, 10→1.5, 20→1.8, 50+→2.0
    const raw = 0.5 + Math.log2(Math.max(1, msgCount)) * 0.3;
    return Math.min(2.0, Math.max(0.5, raw));
  }

  function convoMonthKey(unixTime) {
    if (!unixTime) return 'undated';
    const d = new Date(unixTime * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  async function ensureMonthNode(monthKey, projectId) {
    const mapKey = `month:${monthKey}`;
    if (groupNodeMap.has(mapKey)) return groupNodeMap.get(mapKey);

    const payload = {
      title: monthKey,
      content: `Conversation history — ${monthKey}`,
      node_type: 'Topic',
      tags: ['month-cluster', 'conversation-history', `month:${monthKey}`],
      metadata: { source: 'month-cluster', month: monthKey },
    };

    try {
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return null;
      const node = await res.json();
      groupNodeMap.set(mapKey, node.id);
      if (projectId) await createBelongsToLink(node.id, projectId);
      return node.id;
    } catch {
      return null;
    }
  }

  async function uploadConversations() {
    const BATCH_SIZE = 50;
    totalToUpload = queuedFiles.length;
    uploadedCount = 0;
    resultsEl.innerHTML = '';
    importSummary.style.display = 'none';
    importSummary.innerHTML = '';
    importProgress.style.display = 'block';

    // --- Phase 1: Parse all JSON files ---
    progressPhase.textContent = 'PHASE 1: PARSING';
    progressFill.style.width = '0%';
    progressDetail.textContent = `0 / ${totalToUpload}`;

    const conversations = [];
    const parseErrors = [];

    for (let i = 0; i < queuedFiles.length; i++) {
      const item = queuedFiles[i];
      const file = item.file;

      if (!file.name.endsWith('.json')) {
        parseErrors.push(file.name + ': not .json');
        continue;
      }

      try {
        const raw = await file.text();
        const convo = JSON.parse(raw);
        conversations.push({
          conversation_id: convo.conversation_id || null,
          title: convo.title || file.name.replace('.json', ''),
          create_time: convo.create_time || null,
          update_time: convo.update_time || null,
          messages: (convo.messages || []).map((m) => ({
            role: m.role || 'user',
            text: m.text || '',
          })),
          original_file: file.name,
        });
      } catch {
        parseErrors.push(file.name + ': invalid JSON');
      }

      const pct = Math.round(((i + 1) / queuedFiles.length) * 100);
      progressFill.style.width = pct + '%';
      progressDetail.textContent = `${i + 1} / ${totalToUpload}`;
    }

    if (parseErrors.length) {
      resultsEl.innerHTML = parseErrors
        .map((e) => `<div class="result-fail">${e}</div>`)
        .join('');
    }

    if (!conversations.length) {
      statusEl.textContent = 'No valid conversations found.';
      importProgress.style.display = 'none';
      queuedFiles = [];
      renderQueue();
      return;
    }

    // --- Phase 2: Import in batches ---
    progressPhase.textContent = 'PHASE 2: IMPORTING';
    progressFill.style.width = '0%';

    const firstGroup = queuedFiles[0]?.groupName || null;
    const userTags = splitTags(tagsInput.value);
    const totalBatches = Math.ceil(conversations.length / BATCH_SIZE);
    let totalImported = 0;
    let totalFailed = 0;
    const allErrors = [];
    const mergedTagSummary = {};

    for (let b = 0; b < totalBatches; b++) {
      const batch = conversations.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
      const batchNum = b + 1;

      progressDetail.textContent = `Batch ${batchNum} / ${totalBatches} — ${totalImported} imported`;
      const pct = Math.round((b / totalBatches) * 100);
      progressFill.style.width = pct + '%';

      const payload = {
        conversations: batch,
        group_name: batchNum === 1 ? firstGroup : null,
        user_tags: userTags,
        group_scale: parseFloat(groupSize?.value || '1.5'),
        group_color: groupColor?.value || '#FFD700',
      };

      try {
        const res = await fetch('/api/conversations/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: res.statusText }));
          allErrors.push(`Batch ${batchNum}: ${err.detail}`);
          totalFailed += batch.length;
          continue;
        }

        const data = await res.json();
        totalImported += data.imported;
        totalFailed += data.failed;
        if (data.errors) allErrors.push(...data.errors);

        // Merge tag summaries
        for (const [tag, count] of Object.entries(data.tag_summary || {})) {
          mergedTagSummary[tag] = (mergedTagSummary[tag] || 0) + count;
        }
      } catch (err) {
        allErrors.push(`Batch ${batchNum}: ${err.message}`);
        totalFailed += batch.length;
      }
    }

    progressFill.style.width = '100%';
    progressDetail.textContent = `${totalImported} imported, ${totalFailed} failed`;

    // --- Phase 3: Build connections ---
    progressPhase.textContent = 'PHASE 3: CONNECTING';
    progressFill.style.width = '50%';
    progressDetail.textContent = 'Building tag-based connections...';

    let connectionsCreated = 0;
    const threshold = parseInt(connectThreshold.value, 10) || 2;

    try {
      const res = await fetch('/api/conversations/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_threshold: threshold,
          max_tag_frequency: 100,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        connectionsCreated = data.connections_created;
      }
    } catch {
      allErrors.push('Connection building failed');
    }

    progressFill.style.width = '100%';
    progressPhase.textContent = 'COMPLETE';
    progressDetail.textContent = '';

    // --- Build import summary ---
    const sortedTags = Object.entries(mergedTagSummary)
      .sort((a, b) => b[1] - a[1]);

    const domainTags = sortedTags.filter(([t]) => t.startsWith('domain:')).slice(0, 5);
    const intentTags = sortedTags.filter(([t]) => t.startsWith('intent:')).slice(0, 5);
    const topicCount = sortedTags.filter(([t]) => t.startsWith('topic:')).length;

    let summaryHtml = `<div class="summary-section">
      <div class="summary-title">IMPORT COMPLETE</div>
      <div class="summary-stat">${totalImported} conversations imported</div>
      ${totalFailed > 0 ? `<div class="summary-stat summary-warn">${totalFailed} failed</div>` : ''}
      ${parseErrors.length > 0 ? `<div class="summary-stat summary-warn">${parseErrors.length} parse errors (skipped)</div>` : ''}
    </div>`;

    summaryHtml += `<div class="summary-section">
      <div class="summary-title">AUTO-TAGS GENERATED</div>
      ${domainTags.length ? `<div class="summary-stat">Top domains: ${domainTags.map(([t, c]) => `${t.replace('domain:', '')} (${c})`).join(', ')}</div>` : ''}
      ${intentTags.length ? `<div class="summary-stat">Intents: ${intentTags.map(([t, c]) => `${t.replace('intent:', '')} (${c})`).join(', ')}</div>` : ''}
      <div class="summary-stat">Unique topic tags: ${topicCount}</div>
    </div>`;

    summaryHtml += `<div class="summary-section">
      <div class="summary-title">CONNECTIONS BUILT</div>
      <div class="summary-stat">${connectionsCreated} connections created (threshold: ${threshold}+ shared tags)</div>
    </div>`;

    if (allErrors.length) {
      summaryHtml += `<div class="summary-section">
        <div class="summary-title summary-warn">ERRORS</div>
        ${allErrors.slice(0, 10).map((e) => `<div class="summary-stat summary-warn">${e}</div>`).join('')}
        ${allErrors.length > 10 ? `<div class="summary-stat summary-warn">...and ${allErrors.length - 10} more</div>` : ''}
      </div>`;
    }

    importSummary.innerHTML = summaryHtml;
    importSummary.style.display = 'block';

    statusEl.textContent = `Done. ${totalImported} imported, ${connectionsCreated} connections.`;
    if (onUploadSuccess) onUploadSuccess(null);
    queuedFiles = [];
    renderQueue();
  }

  async function uploadRawEntry() {
    const content = rawContent.value.trim();
    if (!content) {
      statusEl.textContent = 'Paste content before uploading.';
      return;
    }

    statusEl.textContent = 'Uploading raw entry...';
    resultsEl.innerHTML = '';

    const autoTags = buildAutoTagsForRaw(content);
    const userTags = splitTags(tagsInput.value);
    const allTags = [...autoTags, ...userTags];

    const payload = {
      title: titleInput.value.trim() || 'Untitled',
      content,
      node_type: CATEGORY_CONFIG[categorySelect.value].nodeType,
      tags: allTags,
      metadata: { source: 'raw-entry' },
    };

    try {
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        resultsEl.innerHTML = `<div class="result-fail">Raw entry: ${err.detail}</div>`;
        statusEl.textContent = 'Failed.';
        return;
      }
      const node = await res.json();
      resultsEl.innerHTML = `<div class="result-ok">Raw entry → ${node.node_type} node created</div>`;
      if (onUploadSuccess) onUploadSuccess(node);
      rawContent.value = '';
      statusEl.textContent = 'Done.';
    } catch (err) {
      resultsEl.innerHTML = `<div class="result-fail">Raw entry: ${err.message}</div>`;
      statusEl.textContent = 'Failed.';
    }
  }

  function buildAutoTagsForRaw(content) {
    const cfg = CATEGORY_CONFIG[categorySelect.value];
    const tags = ['raw-entry', `type:${cfg.nodeType.toLowerCase()}`];
    const ctxBucket = computeCtxBucket(content.length);
    tags.push(`ctx:${ctxBucket}`);
    if (cfg.codeLanguage) {
      tags.push('raw-code');
      tags.push(languageSelect.value);
    } else {
      tags.push('raw-text');
    }
    return tags;
  }

  async function buildAutoTagsForFile(file, item) {
    const cfg = CATEGORY_CONFIG[categorySelect.value];
    const tags = ['uploaded', `type:${cfg.nodeType.toLowerCase()}`];
    const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
    if (ext) tags.push(ext);

    let textLength = 0;
    try {
      const text = await file.text();
      textLength = text.length;
    } catch {
      textLength = file.size;
    }
    const ctxBucket = computeCtxBucket(textLength);
    tags.push(`ctx:${ctxBucket}`);
    if (item?.groupName) {
      tags.push(`group:${item.groupName}`);
      if (item.relPath) {
        const parts = item.relPath.split('/');
        if (parts.length > 1) {
          const folderPath = parts.slice(0, -1).join('/');
          tags.push(`path:${folderPath}`);
        }
      }
    }
    return tags;
  }

  async function ensureGroupNode(groupName) {
    if (groupNodeMap.has(groupName)) {
      return groupNodeMap.get(groupName);
    }

    const groupScale = parseFloat(groupSize?.value || '1.5');
    const groupColorValue = groupColor?.value || '#FFD700';

    const payload = {
      title: groupName,
      content: `Folder group: ${groupName}`,
      node_type: 'Project',
      tags: ['group', 'folder', `group:${groupName}`],
      metadata: {
        source: 'folder-group',
        group_name: groupName,
        project_scale: Number.isFinite(groupScale) ? groupScale : 1.5,
        project_color: groupColorValue,
      },
    };

    try {
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        return null;
      }
      const node = await res.json();
      groupNodeMap.set(groupName, node.id);
      return node.id;
    } catch {
      return null;
    }
  }

  async function createBelongsToLink(sourceId, targetId) {
    try {
      await fetch(`/api/nodes/${sourceId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_id: targetId,
          relationship: 'BELONGS_TO',
        }),
      });
    } catch {
      // ignore
    }
  }

  function updateModeVisibility() {
    const cfg = CATEGORY_CONFIG[categorySelect.value];

    const rawAllowed = cfg.rawEnabled;
    if (!rawAllowed) {
      modeSelect.value = 'file';
    }
    modeRow.style.display = rawAllowed ? 'flex' : 'none';
    languageRow.style.display = cfg.codeLanguage && modeSelect.value === 'raw' ? 'flex' : 'none';

    rawEntryEl.style.display = modeSelect.value === 'raw' ? 'block' : 'none';
    dropZone.style.display = modeSelect.value === 'file' ? 'block' : 'none';
    queueEl.style.display = modeSelect.value === 'file' ? 'block' : 'none';
    document.getElementById('folder-upload').style.display = modeSelect.value === 'file' ? 'flex' : 'none';
    document.getElementById('folder-style').style.display = modeSelect.value === 'file' ? 'flex' : 'none';
    actionsRow.style.display = 'flex';

    const fileTypes = cfg.fileTypes.join(' ');
    dropTypesEl.textContent = fileTypes || 'No file types configured';
    fileInput.accept = cfg.fileTypes.join(',');

    const disabled = !cfg.rawEnabled && categorySelect.value === 'Research';
    unsupportedEl.style.display = disabled ? 'block' : 'none';
    fileInput.disabled = disabled;
    folderInput.disabled = disabled;
    startBtn.disabled = disabled;
    autoToggle.disabled = disabled;

    // For Conversation Data: hide individual file drop, show only folder upload + purge btn
    const isConvo = !!cfg.conversationImport;
    purgeBtn.style.display = isConvo ? 'inline-block' : 'none';
    convoOptions.style.display = isConvo ? 'block' : 'none';
    if (isConvo && modeSelect.value === 'file') {
      dropZone.style.display = 'none';
      document.getElementById('folder-upload').style.display = 'flex';
      document.getElementById('folder-style').style.display = 'flex';
    }
  }

  function populateLanguages() {
    languageSelect.innerHTML = CODE_LANGUAGES.map((lang) => `<option value="${lang}">${lang}</option>`).join('');
  }

  function clearQueueOnCategoryChange() {
    queuedFiles = [];
    renderQueue();
  }

  categorySelect.addEventListener('change', () => {
    clearQueueOnCategoryChange();
    updateModeVisibility();
  });

  modeSelect.addEventListener('change', () => {
    updateModeVisibility();
  });

  startBtn.addEventListener('click', uploadQueued);

  purgeBtn.addEventListener('click', async () => {
    if (!confirm('Delete ALL conversation nodes, month clusters, and their group node? This cannot be undone.')) return;
    purgeBtn.disabled = true;
    statusEl.textContent = 'Purging conversation data...';
    resultsEl.innerHTML = '';
    try {
      const res = await fetch('/api/nodes/conversations/purge', { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        resultsEl.innerHTML = `<div class="result-fail">Purge failed: ${err.detail}</div>`;
      } else {
        const data = await res.json();
        resultsEl.innerHTML = `<div class="result-ok">Purged ${data.deleted} node(s).</div>`;
        if (onUploadSuccess) onUploadSuccess(null);
      }
    } catch (err) {
      resultsEl.innerHTML = `<div class="result-fail">Purge error: ${err.message}</div>`;
    }
    purgeBtn.disabled = false;
    statusEl.textContent = 'Done.';
  });

  populateLanguages();
  updateModeVisibility();
  renderQueue();

  return { open, close };
}
