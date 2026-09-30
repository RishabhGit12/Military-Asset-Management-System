let token = sessionStorage.getItem('token');
export const setToken = t => { token = t; t ? sessionStorage.setItem('token', t) : sessionStorage.clear(); };
export async function api(path, { method = 'GET', body, params } = {}) {
  const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v)) : '';
     const r = await fetch(`${import.meta.env.VITE_API_URL || ''}/api${path}${qs}`, { method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Request failed');
  return data;
}
