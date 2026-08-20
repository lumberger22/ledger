import { api } from "./client";

export const createLinkToken = (itemId) =>
  api.post("/api/plaid/link-token", itemId ? { item_id: itemId } : {});

export const exchangePublicToken = (publicToken, institutionId, institutionName) =>
  api.post("/api/plaid/exchange-token", {
    public_token: publicToken,
    institution_id: institutionId,
    institution_name: institutionName,
  });

export const listPlaidItems = () => api.get("/api/plaid/items");

export const removePlaidItem = (plaidItemId) =>
  api.del(`/api/plaid/items/${encodeURIComponent(plaidItemId)}`);

export const triggerSync = (itemId) =>
  api.post(`/api/plaid/sync${itemId ? `?item_id=${encodeURIComponent(itemId)}` : ""}`);
