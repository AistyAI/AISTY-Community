// The API is served from the same origin as the app, under /api.
export const API_URL = process.env.REACT_APP_BACKEND_URL || "/api";
export const AI_WORKFLOWS_URL = process.env.REACT_APP_AI_WORKFLOWS_URL || API_URL;
