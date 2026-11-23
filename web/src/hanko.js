// Sign-in for Aisty Free runs against the Aisty Identity Service for Free, a Hanko tenant separate from hosted Aisty.
import { Hanko } from "@teamhanko/hanko-elements";

export const HANKO_API_URL = process.env.REACT_APP_HANKO_API_URL || "https://aisty-ce.aisty.ai";
export const DEV_AUTH = process.env.REACT_APP_DEV_AUTH === "true";

const DEV_KEY = "aisty_free_dev_session";

function devHanko() {
  const listeners = new Set();
  const token = () => {
    try { return localStorage.getItem(DEV_KEY) || undefined; } catch { return undefined; }
  };
  return {
    getSessionToken: () => token(),
    session: { getToken: () => token() },
    onSessionCreated(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    devSignIn(email) {
      const b64 = btoa(unescape(encodeURIComponent(email.trim().toLowerCase()))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      localStorage.setItem(DEV_KEY, `dev.${b64}`);
      listeners.forEach((cb) => cb());
    },
    user: {
      logout: async () => localStorage.removeItem(DEV_KEY),
      delete: async () => localStorage.removeItem(DEV_KEY),
    },
  };
}

export const hanko = DEV_AUTH ? devHanko() : new Hanko(HANKO_API_URL);
