// components/integrations/integrationsApi.js
import { fetchWithHankoAuth } from "../utils/verifiedCall";
import { sealFields } from "./sealing";
import { API_URL } from "../../config";

export const PROJECT = "Aisty";

// Every integrations call.
export function integrationsApi(path, { method = "GET", body } = {}) {
  const url = new URL(`${API_URL}/integrations${path}`, window.location.origin);
  url.searchParams.set("project", PROJECT);
  return fetchWithHankoAuth(url.toString(), {
    method,
    ...(body !== undefined ? { body: JSON.stringify({ ...body, project: PROJECT }) } : {}),
  });
}

export function loadCompany() {
  return fetchWithHankoAuth(`${API_URL}/company/me?project=${PROJECT}`).then((r) => r?.company ?? r);
}

// Strips the "Failed to fetch <url>: " prefix fetchWithHankoAuth adds.
export function errorText(err, fallback = "Something went wrong.") {
  const message = err?.message || "";
  const idx = message.indexOf(": ");
  return (message.startsWith("Failed to fetch") && idx > -1 ? message.slice(idx + 2) : message) || fallback;
}

let sealingKey = null;
async function getSealingKey(refresh = false) {
  if (!sealingKey || refresh) sealingKey = await integrationsApi("/sealing-key");
  return sealingKey;
}

// Submit a connection.
export async function submitConnection(endpoint, provider, companyId, plain = {}, secrets = {}) {
  const post = async (refreshKey) => {
    const hasSecrets = Object.values(secrets).some((v) => v !== undefined && v !== "");
    const sealed = hasSecrets ? await sealFields(await getSealingKey(refreshKey), provider, companyId, secrets) : undefined;
    return integrationsApi(endpoint, { method: "POST", body: { companyId, ...plain, ...(sealed ? { sealed } : {}) } });
  };
  try {
    return await post(false);
  } catch (err) {
    // The server key rotated since this page loaded: fetch it and retry once.
    if (/encryption key changed/i.test(err?.message || "")) return post(true);
    throw err;
  }
}
