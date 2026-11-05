// All data access goes through the backend REST API. The frontend never touches the DB or filesystem.
export class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data || {}; }
}

async function request(method, url, body) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let res;
  try {
    res = await fetch('/api' + url, { method, headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
  } catch {
    throw new ApiError('Cannot reach the Consumer Insights Hub server. Is it running?', 0);
  }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json().catch(() => ({})) : null;
  if (!res.ok) throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status, data);
  return data;
}

export const qs = (params = {}) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b || {}),
  put: (u, b) => request('PUT', u, b || {}),
  patch: (u, b) => request('PATCH', u, b || {}),
  del: (u) => request('DELETE', u),
  upload: (u, formData) => request('POST', u, formData),
  url: (u) => '/api' + u,
};
