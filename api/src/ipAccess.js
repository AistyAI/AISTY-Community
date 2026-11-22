// Workspace IP allowlist, enforced by the API on every request.
import net from "node:net";
import { one } from "./db.js";
import { badRequest } from "./errors.js";

let cache = { at: 0, list: [] };
const TTL_MS = 15_000;

export function clearIpCache() {
  cache = { at: 0, list: [] };
}

function normaliseIp(ip) {
  const s = String(ip || "").trim();
  return s.startsWith("::ffff:") && net.isIPv4(s.slice(7)) ? s.slice(7) : s;
}

function toBigInt(ip) {
  if (net.isIPv4(ip)) return { v: ip.split(".").reduce((a, o) => (a << 8n) + BigInt(o), 0n), bits: 32 };
  if (net.isIPv6(ip)) {
    const [head, tail = ""] = ip.split("::");
    const h = head ? head.split(":") : [];
    const t = tail ? tail.split(":") : [];
    const parts = [...h, ...Array(8 - h.length - t.length).fill("0"), ...t];
    return { v: parts.reduce((a, p) => (a << 16n) + BigInt(parseInt(p || "0", 16)), 0n), bits: 128 };
  }
  return null;
}

/** Does `ip` fall within `entry` (an address or a CIDR range)? */
export function matches(entry, ip) {
  const [base, prefixRaw] = entry.split("/");
  const a = toBigInt(normaliseIp(ip));
  const b = toBigInt(base);
  if (!a || !b || a.bits !== b.bits) return false;
  const prefix = prefixRaw === undefined ? b.bits : Number(prefixRaw);
  const shift = BigInt(b.bits - prefix);
  return (a.v >> shift) === (b.v >> shift);
}

function validEntry(entry) {
  const [base, prefix, extra] = entry.split("/");
  if (extra !== undefined || !net.isIP(base)) return false;
  if (prefix === undefined) return true;
  const max = net.isIPv4(base) ? 32 : 128;
  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= max;
}

/** Validate a new list. Refuses one that would lock out the person saving it. */
export function normaliseAllowList(value, callerIp) {
  if (!Array.isArray(value)) throw badRequest("Allowed IPs must be a list.");
  if (value.length > 100) throw badRequest("At most 100 allowed IP entries.");
  const list = [...new Set(value.map((v) => String(v || "").trim()).filter(Boolean))];
  const bad = list.find((e) => !validEntry(e));
  if (bad) throw badRequest(`"${bad}" is not an IP address or CIDR range.`);
  if (list.length && !list.some((e) => matches(e, callerIp))) {
    throw badRequest(`That list would lock you out: your address (${normaliseIp(callerIp)}) is not on it. Add it first.`);
  }
  return list;
}

export async function ipAllowed(ip) {
  if (Date.now() - cache.at > TTL_MS) {
    const row = await one("SELECT data->'allowedIps' AS ips FROM companies ORDER BY created_at LIMIT 1").catch(() => null);
    cache = { at: Date.now(), list: Array.isArray(row?.ips) ? row.ips : [] };
  }
  return cache.list.length === 0 || cache.list.some((e) => matches(e, ip));
}
