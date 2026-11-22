import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { fetchWithHankoAuth } from "./verifiedCall";
import { API_URL } from "../../config";

const PROJECT = "Aisty";

const WorkspaceRoleContext = createContext({
  role: null,
  loading: true,
  companyData: null,
  companyId: null,
  refresh: () => {},
});

// Role hierarchy (must match backend ROLE_HIERARCHY)
const ROLE_HIERARCHY = ["viewer", "member", "billing", "admin", "owner"];

function roleRank(role) {
  const idx = ROLE_HIERARCHY.indexOf(role);
  return idx === -1 ? 0 : idx;
}

// True if the user's role outranks the target role.
export function canManageRole(userRole, targetRole) {
  return roleRank(userRole) > roleRank(targetRole);
}

// Display labels for every role the API can return.
export const ROLE_LABELS = {
  owner: "Owner",
  admin: "Admin",
  billing: "Billing Admin",
  member: "Member",
  viewer: "Viewer",
  aisty_link: "Aisty Link",
};

// Human-readable label for a role slug.
export function formatRole(role) {
  if (!role) return "";
  if (ROLE_LABELS[role]) return ROLE_LABELS[role];
  return String(role)
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// Convenience permission checks.
export function canViewTeam(role) {
  return ["owner", "admin", "billing"].includes(role);
}

export function canViewBilling(role) {
  return ["owner", "billing"].includes(role);
}

export function canEditCompany(role) {
  return ["owner", "admin"].includes(role);
}

export function canManageIntegrations(role) {
  return ["owner", "admin"].includes(role);
}

export function canChangeRoles(role) {
  return ["owner", "admin"].includes(role);
}

export function WorkspaceRoleProvider({ children }) {
  const [role, setRole] = useState(null);
  const [companyData, setCompanyData] = useState(null);
  const [companyId, setCompanyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  const fetchRole = useCallback(async () => {
    try {
      const data = await fetchWithHankoAuth(
        `${API_URL}/company/me?project=${PROJECT}`,
        { method: "GET" }
      );
      const company = data?.company ?? data;
      setRole(data?.workspaceRole || "owner"); // default owner for legacy
      setCompanyData(company);
      setCompanyId(company?._id || null);
    } catch (e) {
      console.error("[WorkspaceRoleContext] Failed to fetch role:", e);
      setRole("viewer"); // safest fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchRole();
  }, [fetchRole]);

  return (
    <WorkspaceRoleContext.Provider value={{ role, loading, companyData, companyId, refresh: fetchRole }}>
      {children}
    </WorkspaceRoleContext.Provider>
  );
}

export function useWorkspaceRole() {
  return useContext(WorkspaceRoleContext);
}

export default WorkspaceRoleContext;
