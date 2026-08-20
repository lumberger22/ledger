import { api } from "./client";

export const listAccounts = (includeHidden = false) =>
  api.get(`/api/accounts${includeHidden ? "?include_hidden=true" : ""}`);

export const createManualAccount = (data) => api.post("/api/accounts", data);
export const updateAccount = (id, data) => api.put(`/api/accounts/${id}`, data);
export const deleteAccount = (id) => api.del(`/api/accounts/${id}`);
