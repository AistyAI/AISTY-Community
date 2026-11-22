// A small HTTP client for provider APIs: timeouts, JSON, and errors that say what went wrong without echoing credentials.
export class ProviderError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function request(url, { method = "GET", headers = {}, body, timeoutMs = 20_000, form = false } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : form ? new URLSearchParams(body).toString() : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
    });
  } catch (err) {
    throw new ProviderError(`Could not reach ${new URL(url).host}: ${err.name === "TimeoutError" ? "timed out" : err.message}`);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const detail = typeof data === "object" && data
      ? data.message || data.error?.message || data.error || data.errorMessages?.join("; ") || JSON.stringify(data).slice(0, 300)
      : String(text).slice(0, 300);
    throw new ProviderError(`${new URL(url).host} returned ${res.status}: ${detail}`, res.status);
  }
  return data;
}

/** Keep tool output small enough to hand back to a model. */
export function clip(value, max = 8000) {
  const s = typeof value === "string" ? value : JSON.stringify(value, null, 1);
  return s.length > max ? `${s.slice(0, max)}\n…(truncated)` : s;
}

export const AI_DISCLOSURE = "Sent by Aisty, an AI assistant, on behalf of your colleague.";
