'use strict';
// עטיפת fetch פשוטה ל-API
const API = {
  async request(method, path, body) {
    const opts = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch('/api' + path, opts);
    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'שגיאה בבקשה');
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  },
  get(p) { return this.request('GET', p); },
  post(p, b) { return this.request('POST', p, b || {}); },
  put(p, b) { return this.request('PUT', p, b || {}); },
  del(p) { return this.request('DELETE', p); },
};
window.API = API;
