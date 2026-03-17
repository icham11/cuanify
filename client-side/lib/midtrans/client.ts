import { snap, coreApi, MIDTRANS_CONFIG } from "./config";

export { snap, coreApi, MIDTRANS_CONFIG };

export const MIDTRANS_CLIENT_KEY = MIDTRANS_CONFIG.clientKey;
export const MIDTRANS_ENVIRONMENT = MIDTRANS_CONFIG.isProduction ? "production" : "sandbox";
