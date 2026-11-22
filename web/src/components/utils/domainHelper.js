// Aisty Free serves exactly one workspace per deployment, on whatever host it is installed at.

export function isAppDomain() {
  return false;
}

export function isTenantDomain() {
  return true;
}

export function getTenantDomain() {
  return null;
}

export function workspaceUrl() {
  return "/home";
}
