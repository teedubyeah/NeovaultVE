const BASE_URL = import.meta.env.VITE_API_URL || '/api';

let _sessionPassword = null;

export function setSessionPassword(p) { _sessionPassword = p; }
export function getSessionPassword() { return _sessionPassword; }
export function clearSession() {
  _sessionPassword = null;
  sessionStorage.removeItem('nve_token');
  sessionStorage.removeItem('nve_user');
}
export function getToken() { return sessionStorage.getItem('nve_token'); }
export function setSession(token, user, password) {
  sessionStorage.setItem('nve_token', token);
  sessionStorage.setItem('nve_user', JSON.stringify(user));
  _sessionPassword = password;
}
export function getUser() {
  const u = sessionStorage.getItem('nve_user');
  return u ? JSON.parse(u) : null;
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(_sessionPassword && { 'X-Password': _sessionPassword }),
    ...options.headers,
  };
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) { clearSession(); window.location.href = '/login'; return; }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const auth = {
  register: (body) => request('/auth/register', { method: 'POST', body }),
  login:    (body) => request('/auth/login',    { method: 'POST', body }),
  me:       ()     => request('/auth/me'),
};

export const notes = {
  list:     ()          => request('/notes'),
  archived: ()          => request('/notes/archived'),
  create:   (body)      => request('/notes',     { method: 'POST',   body }),
  update:   (id, body)  => request(`/notes/${id}`, { method: 'PUT',  body }),
  delete:   (id)        => request(`/notes/${id}`, { method: 'DELETE' }),
};

export const admin = {
  users:         ()          => request('/admin/users'),
  createUser:    (body)      => request('/admin/users',           { method: 'POST',   body }),
  updateUser:    (id, body)  => request(`/admin/users/${id}`,     { method: 'PATCH',  body }),
  deleteUser:    (id)        => request(`/admin/users/${id}`,     { method: 'DELETE' }),
  resetPassword: (id, body)  => request(`/admin/users/${id}/reset-password`, { method: 'POST', body }),
};

export const bookmarkFolders = {
  list:   ()         => request('/bookmarks/folders'),
  create: (body)     => request('/bookmarks/folders',     { method: 'POST',   body }),
  update: (id, body) => request(`/bookmarks/folders/${id}`, { method: 'PUT',  body }),
  delete: (id)       => request(`/bookmarks/folders/${id}`, { method: 'DELETE' }),
};

export const bookmarksApi = {
  list:      (folderId) => request('/bookmarks' + (folderId ? `?folder_id=${folderId}` : '')),
  favorites: ()         => request('/bookmarks/favorites'),
  create:    (body)     => request('/bookmarks',     { method: 'POST',   body }),
  update:    (id, body) => request(`/bookmarks/${id}`, { method: 'PUT',  body }),
  delete:    (id)       => request(`/bookmarks/${id}`, { method: 'DELETE' }),
  importPreview: (html)              => request('/bookmarks/import/preview', { method: 'POST', body: { html } }),
  importConfirm: (html, resolutions) => request('/bookmarks/import/confirm', { method: 'POST', body: { html, resolutions } }),
  move:          (id, folder_id)     => request(`/bookmarks/${id}/move`, { method: 'PATCH', body: { folder_id } }),
  exportUrl: ()         => '/api/bookmarks/export',
};

export const account = {
  changePassword: (body) => request('/auth/change-password', { method: 'POST', body }),
  clearData:      (body) => request('/auth/clear-data',      { method: 'POST', body }),
};

export const adminExt = {
  clearUserData: (id)  => request(`/admin/users/${id}/clear-data`, { method: 'POST' }),
  clearAllData:  ()    => request('/admin/clear-all-data',          { method: 'POST' }),
};
