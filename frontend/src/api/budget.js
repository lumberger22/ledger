import { api } from "./client";

export const getBudget = () => api.get("/api/budget");
export const updateBudget = (data) => api.put("/api/budget", data);
export const getBudgetStatus = (period, start, end) => {
  const params = new URLSearchParams({ period });
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  return api.get(`/api/budget/status?${params.toString()}`);
};
