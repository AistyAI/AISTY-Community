import { hanko } from '../../hanko';
import { getTenantDomain } from './domainHelper';

// Set a workspace domain override for localhost hub mode.
export function setWorkspaceOverride(domain) {
    if (domain) {
        sessionStorage.setItem("aisty_workspace_override", domain);
    } else {
        sessionStorage.removeItem("aisty_workspace_override");
    }
}

export function getWorkspaceOverride() {
    return sessionStorage.getItem("aisty_workspace_override") || null;
}

// Resolve the current user's id from the Hanko session token (the `sub` claim).
export const getSessionUserId = async () => {
    try {
        const token = await hanko.getSessionToken();
        if (!token) return null;
        // Development sign-in tokens are "dev.<base64url email>", not JWTs.
        if (token.startsWith("dev.")) return `dev|${atob(token.slice(4).replace(/-/g, "+").replace(/_/g, "/"))}`;
        const payload = token.split(".")[1];
        if (!payload) return null;
        const claims = JSON.parse(
            atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
        );
        return claims.sub || claims.subject || null;
    } catch (_) {
        return null;
    }
};

// A plain fetch with the session attached, returning the Response itself.
export const authorizedFetch = async (url, options = {}) => {
    const token = await hanko.getSessionToken();
    return fetch(url, {
        ...options,
        headers: { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
};

export const fetchWithHankoAuth = async (url, options = {}) => {
    const token = await hanko.getSessionToken();
    if (!token) throw new Error("No active Hanko session");

    const headers = {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
    };

    // When on a tenant workspace domain (e.g.
    const tenantDomain = getTenantDomain();
    if (tenantDomain) {
        headers["X-Workspace-Domain"] = tenantDomain;
    } else {
        // On localhost hub mode, use the override set by PayWall / WorkspaceHub
        const override = getWorkspaceOverride();
        if (override) {
            headers["X-Workspace-Domain"] = override;
        }
    }

    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
        let detail = res.statusText;
        try {
            const body = await res.clone().json();
            detail = body?.error || body?.message || JSON.stringify(body);
        } catch (_) {
            try { detail = (await res.text()) || res.statusText; } catch (_) {}
        }
        throw new Error(`Failed to fetch ${url}: ${detail}`);
    }
    return res.json();
};

// Same auth and workspace scoping, but returns the response body as a Blob.
export const fetchBlobWithHankoAuth = async (url, options = {}) => {
    const token = await hanko.getSessionToken();
    if (!token) throw new Error("No active Hanko session");

    const headers = {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
    };

    const tenantDomain = getTenantDomain();
    if (tenantDomain) {
        headers["X-Workspace-Domain"] = tenantDomain;
    } else {
        const override = getWorkspaceOverride();
        if (override) headers["X-Workspace-Domain"] = override;
    }

    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
        let detail = res.statusText;
        try {
            const body = await res.clone().json();
            detail = body?.error || body?.message || JSON.stringify(body);
        } catch (_) {
            try { detail = (await res.text()) || res.statusText; } catch (_) {}
        }
        throw new Error(`Failed to fetch ${url}: ${detail}`);
    }
    return res.blob();
};