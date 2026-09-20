const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.message || `Request failed (${response.status})`);
  return data;
}

export const api = {
  getModels: () => request("/admin/api/models"),
  publishModel: (model) =>
    request("/admin/api/models/publish", {
      method: "POST",
      body: JSON.stringify(model),
    }),
  getData: (model) => request(`/admin/api/data/${encodeURIComponent(model)}`),
  createData: (model, record) =>
    request(`/admin/api/data/${encodeURIComponent(model)}`, {
      method: "POST",
      body: JSON.stringify(record),
    }),
  updateData: (model, id, record) =>
    request(`/admin/api/data/${encodeURIComponent(model)}/${id}`, {
      method: "PUT",
      body: JSON.stringify(record),
    }),
  deleteData: (model, id) =>
    request(`/admin/api/data/${encodeURIComponent(model)}/${id}`, {
      method: "DELETE",
    }),
};

export { API_URL };
