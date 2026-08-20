import { api } from "./client";

export const getIncome = (period, start, end) => {
  const params = new URLSearchParams({ period });
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  return api.get(`/api/income?${params.toString()}`);
};

export const uploadPaystub = (file) => {
  const formData = new FormData();
  formData.append("file", file);
  return api.postForm("/api/income/upload", formData);
};

export const confirmPaystubs = (paystubs) =>
  api.post("/api/income/confirm", { paystubs });
