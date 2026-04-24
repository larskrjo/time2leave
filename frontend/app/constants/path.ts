const DEFAULT_DEV_BASE_URL = "http://localhost:8000";
const DEFAULT_PROD_BASE_URL = "https://api.traffic.larsjohansen.com";

const envBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
export const BASE_URL =
    envBase && envBase.length > 0
        ? envBase
        : import.meta.env.DEV
          ? DEFAULT_DEV_BASE_URL
          : DEFAULT_PROD_BASE_URL;

export const COMMUTE_HEATMAP_URL = `${BASE_URL}/api/v1/commute/heatmap`;
