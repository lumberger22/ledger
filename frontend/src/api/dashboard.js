import { api } from "./client";

export const getDashboard = (period, start, end) => {
  const params = new URLSearchParams({ period });
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  return api.get(`/api/dashboard?${params.toString()}`);
};
