import { api } from "./client";

export const uploadCsv = (file, accountType = "credit_card") => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("account_type", accountType);
  return api.postForm("/api/upload", formData);
};

export const getPending = (batchIds) => {
  const ids = Array.isArray(batchIds) ? batchIds.join(",") : batchIds;
  return api.get(`/api/pending?batch_id=${encodeURIComponent(ids)}`);
};
// Every pending charge synced from a connected account, across every Plaid
// Item — used to surface a "needs review" link without the client having to
// track each Item's individual sync batch id.
export const getPlaidPending = () => api.get("/api/pending/plaid");
export const updatePending = (id, data) => api.put(`/api/pending/${id}`, data);
export const deletePending = (id) => api.del(`/api/pending/${id}`);
export const confirmBatch = (batchIds) => {
  const ids = Array.isArray(batchIds) ? batchIds.join(",") : batchIds;
  return api.post(`/api/pending/confirm?batch_id=${encodeURIComponent(ids)}`);
};
