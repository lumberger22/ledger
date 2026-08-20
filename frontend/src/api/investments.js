import { api } from "./client";

export const getInvestmentsSummary = () => api.get("/api/investments/summary");
export const getInvestmentsHistory = (days = 180) =>
  api.get(`/api/investments/history?days=${days}`);
