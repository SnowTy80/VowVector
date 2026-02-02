const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function healthCheck() {
  return request('/health');
}

export async function getGraphData() {
  return request('/graph');
}

export async function listNodes(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`/nodes${qs ? '?' + qs : ''}`);
}

export async function getNode(id) {
  return request(`/nodes/${id}`);
}

export async function createNode(data) {
  return request('/nodes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateNode(id, data) {
  return request(`/nodes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteNode(id) {
  return request(`/nodes/${id}`, { method: 'DELETE' });
}

export async function createLink(sourceId, data) {
  return request(`/nodes/${sourceId}/link`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteLink(sourceId, targetId, relationship = null) {
  const qs = new URLSearchParams({ target_id: targetId });
  if (relationship) qs.set('relationship', relationship);
  return request(`/nodes/${sourceId}/link?${qs.toString()}`, { method: 'DELETE' });
}

export async function bulkDeleteNodes(nodeIds) {
  return request('/nodes/bulk/delete', {
    method: 'POST',
    body: JSON.stringify({ node_ids: nodeIds }),
  });
}

export async function bulkTagNodes(nodeIds, tags) {
  return request('/nodes/bulk/tag', {
    method: 'POST',
    body: JSON.stringify({ node_ids: nodeIds, tags }),
  });
}
