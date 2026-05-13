import { invalidateApiCache } from "./client";

export const API_CACHE_TTL_5_MIN_MS = 5 * 60 * 1000;

export const salesHistoryChannelUrl = (channel: "direct" | "tokopedia" | "shopee") =>
  `/api/sales?sales_channel=${channel}`;

export const staffListUrl = "/api/staff";

export const productionListUrl = (limit = 50) => `/api/production?limit=${limit}`;

export const productRecipeUrl = (productId: number | string) =>
  `/api/products/${productId}/recipe`;

export const debtsListUrl = (params?: URLSearchParams | string) => {
  const query =
    params instanceof URLSearchParams ? params.toString() : params?.trim() ?? "";
  return query ? `/api/debts?${query}` : "/api/debts";
};

export const bakeryOrdersUrl = "/api/bookings/orders";
export const aiRagIndexUrl = "/api/ai/rag/index";
export const aiRagDocumentsUrl = "/api/ai/rag/documents";
export const aiSessionsUrl = "/api/ai/sessions";
export const aiChatHistoryUrl = (sessionId: number, limit = 50) =>
  `/api/ai/chat?sessionId=${sessionId}&limit=${limit}`;
export const aiInsightsUrl = (type = "all") =>
  `/api/ai/insights?type=${encodeURIComponent(type)}`;

export function invalidateSalesCaches() {
  invalidateApiCache(/\/api\/sales(?:\?|$)/);
}

export function invalidateStaffCaches() {
  invalidateApiCache(/\/api\/staff(?:\?|$)/);
}

export function invalidateProductionCaches() {
  invalidateApiCache(/\/api\/production(?:\?|$)/);
}

export function invalidateProductionDependencyCaches() {
  invalidateProductionCaches();
  invalidateApiCache(/\/api\/products\/\d+\/recipe(?:\?|$)/);
  invalidateAiInsightsCaches();
}

export function invalidateDebtsCaches() {
  invalidateApiCache(/\/api\/debts(?:\?|$)/);
}

export function invalidateAiInsightsCaches() {
  invalidateApiCache(/\/api\/ai\/insights(?:\?|$)/);
}

export function invalidateAiRagStatusCaches() {
  invalidateApiCache(/\/api\/ai\/rag\/index(?:\?|$)/);
}

export function invalidateAiDocumentCaches() {
  invalidateApiCache(/\/api\/ai\/rag\/documents(?:\?|$)/);
  invalidateAiRagStatusCaches();
}

export function invalidateAiChatCaches(sessionId?: number | null) {
  invalidateApiCache(/\/api\/ai\/sessions(?:\?|$)/);
  if (sessionId) {
    invalidateApiCache(`/api/ai/chat?sessionId=${sessionId}`);
  }
}
