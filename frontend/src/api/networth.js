import { api } from "./client";

export const getNetWorth = () => api.get("/api/networth");
export const getNetWorthHistory = (days = 180) =>
  api.get(`/api/networth/history?days=${days}`);
