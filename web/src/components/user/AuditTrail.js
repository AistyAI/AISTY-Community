import { useCallback, useEffect, useState } from "react";
import { Button, LockIcon, useToast } from "../../ui";
import { fetchWithHankoAuth } from "../utils/verifiedCall";
import { useWorkspaceRole } from "../utils/WorkspaceRoleContext";
import { openUpgrade } from "../../edition";
import CoverageGap, { EmployeeAiExample } from "../free/CoverageGap";
import { UpgradeNudge } from "../free/LockedFeature";
import "../../styles/user/auditTrail/page.css";
import "../../styles/user/auditTrail/rows.css";
import { API_URL, PROJECT, PAGE_SIZE, formatDay } from "./auditTrail/format";
import AuditFilters from "./auditTrail/AuditFilters";
import AuditTable from "./auditTrail/AuditTable";
import { ExtractPopup, downloadExport } from "./auditTrail/ExtractPopup";

// Read-only feed of every traceable action in the workspace.
function AuditTrail() {
  const { role: myRole, loading: roleLoading } = useWorkspaceRole();
  const { addToast } = useToast();
  const allowed = myRole === "owner" || myRole === "admin";

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ from: "", to: "", userId: "", verb: "", feed: "" });
  // 'workspace' hides Aisty Link violations; 'aisty_link' is the AI accountability feed.
  const [scope, setScope] = useState(() =>
    new URLSearchParams(window.location.search).get("tab") === "employee-ai" ? "employee_ai" : "workspace");
  const [exportOpen, setExportOpen] = useState(false);
  // Free reads the last 90 days: { days, since, olderEntries } from the API.
  const [windowInfo, setWindowInfo] = useState(null);
  // Which AI-action row is expanded.
  const [expandedId, setExpandedId] = useState(null);
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Load team members so the user filter can be a dropdown rather than a raw Hanko ID input.
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setMembersLoading(true);
    fetchWithHankoAuth(`${API_URL}/team?project=${PROJECT}`)
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : data?.members || [];
        // Deduplicate by userId: a single Hanko account may appear in multiple membership rows (legacy data).
        const seen = new Map();
        for (const m of list) {
          const id = m.userId || m.user_id || m._id;
          if (!id || seen.has(id)) continue;
          seen.set(id, { userId: id, email: m.email || m.user_email || id });
        }
        setMembers(Array.from(seen.values()).sort((a, b) => a.email.localeCompare(b.email)));
      })
      .catch((err) => {
        console.error("[AuditTrail] team load failed", err);
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  const buildQuery = useCallback(
    (overrides = {}) => {
      const params = new URLSearchParams({ project: PROJECT, scope });
      const merged = { ...filters, ...overrides };
      Object.entries(merged).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
      return params.toString();
    },
    [filters, scope],
  );

  const loadPage = useCallback(
    async (nextSkip = 0) => {
      if (!allowed || scope === "employee_ai") return;
      setLoading(true);
      try {
        const q = buildQuery({ skip: String(nextSkip), limit: String(PAGE_SIZE) });
        const data = await fetchWithHankoAuth(`${API_URL}/audit?${q}`);
        setRows(data?.rows || []);
        setTotal(data?.total || 0);
        setWindowInfo(data?.window || null);
        setSkip(nextSkip);
      } catch (err) {
        console.error("[AuditTrail] load failed", err);
        addToast(err?.message || "Failed to load audit log.", "error");
      } finally {
        setLoading(false);
      }
    },
    [allowed, scope, buildQuery, addToast],
  );

  useEffect(() => {
    if (!allowed) return;
    loadPage(0);
    // Re-fetch when filters or the active section change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, filters.from, filters.to, filters.userId, filters.verb, filters.feed, scope]);

  const handleFilterChange = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  if (roleLoading) return <p>Loading…</p>;
  if (!allowed) {
    return (
      <div className="auditTrail">
        <h2>Audit Trail</h2>
        <p>This view is restricted to owners and administrators.</p>
      </div>
    );
  }

  const page = Math.floor(skip / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hasFilters = Boolean(
    filters.from || filters.to || filters.userId || filters.verb || filters.feed,
  );

  return (
    <div className="auditTrail">
      <header className="auditTrail__hero">
        <div className="auditTrail__heroText">
          <h2>Audit Trail</h2>
          <p>
            Every action in this workspace and everything Aisty did, hash-chained so any gap or edit
            is detectable. Entries are never deleted. The last {windowInfo?.days || 90} days can be viewed and exported here.
          </p>
        </div>
        <div className="auditTrail__heroStats">
          <Button variant="secondary" onClick={() => openUpgrade("audit-evidence-pack")} title="Evidence packs and retention policies come with hosted Aisty">
            <LockIcon size={13} /> Evidence pack
          </Button>
          <Button variant="primary" onClick={() => setExportOpen(true)}>
            Extract logs
          </Button>
        </div>
      </header>

      <div className="auditTrail__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={scope === "workspace"}
          className={`auditTrail__tab${scope === "workspace" ? " auditTrail__tab--active" : ""}`}
          onClick={() => setScope("workspace")}
        >
          Workspace activity
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scope === "aisty_link"}
          className={`auditTrail__tab${scope === "aisty_link" ? " auditTrail__tab--active" : ""}`}
          onClick={() => setScope("aisty_link")}
        >
          AI activity &amp; compliance
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scope === "employee_ai"}
          className={`auditTrail__tab${scope === "employee_ai" ? " auditTrail__tab--active" : ""}`}
          onClick={() => setScope("employee_ai")}
        >
          Employee AI tools <LockIcon size={12} style={{ marginLeft: 4, verticalAlign: "-1px", opacity: 0.7 }} />
        </button>
      </div>

      {scope === "employee_ai" ? (
        <div className="employeeAi">
          <CoverageGap cta="audit-employee-ai" compact />
          <div className="employeeAi__table">
            <EmployeeAiExample />
          </div>
        </div>
      ) : (
      <>
      {scope === "aisty_link" && (
        <div className="auditWindow">
          <UpgradeNudge cta="audit-ai-activity" action="See AI tool monitoring">
            This is what Aisty did. AI tools your people use outside Aisty, like ChatGPT or Claude on a personal account, aren't recorded here.
          </UpgradeNudge>
        </div>
      )}

      <AuditFilters
        filters={filters}
        handleFilterChange={handleFilterChange}
        members={members}
        membersLoading={membersLoading}
        scope={scope}
        setFilters={setFilters}
        windowInfo={windowInfo}
      />

      {windowInfo && scope === "workspace" && (
        <div className="auditWindow">
          <UpgradeNudge cta="audit-history">
            Showing the last {windowInfo.days} days, from {formatDay(windowInfo.since)}.
            {windowInfo.olderEntries > 0
              ? ` ${windowInfo.olderEntries.toLocaleString()} older ${windowInfo.olderEntries === 1 ? "entry is" : "entries are"} kept on this server, unchanged and verified.`
              : " Older entries are kept on this server, unchanged and verified."}
            {" "}Viewing and exporting your full history comes with hosted Aisty.
          </UpgradeNudge>
        </div>
      )}

      {loading ? (
        <div className="auditTrail__loading">
          <div className="auditTrail__spinner" aria-hidden="true" />
          <span>Loading audit log…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="auditTrail__empty">
          <p><strong>No matching entries.</strong></p>
          <p className="secondary-text">
            {hasFilters
              ? "Try widening the date range or clearing filters."
              : "Once team members start performing actions, they'll appear here."}
          </p>
        </div>
      ) : (
        <>
          <AuditTable
            expandedId={expandedId}
            rows={rows}
            scope={scope}
            setExpandedId={setExpandedId}
          />

          <div className="auditTrail__pagination">
            <span>{total.toLocaleString()} total entries · Page {page} of {totalPages}</span>
            <div>
              <button
                type="button"
                className="auditTrail__pageBtn"
                onClick={() => loadPage(Math.max(0, skip - PAGE_SIZE))}
                disabled={skip === 0 || loading}
              >
                ← Newer
              </button>
              <button
                type="button"
                className="auditTrail__pageBtn"
                onClick={() => loadPage(skip + PAGE_SIZE)}
                disabled={skip + PAGE_SIZE >= total || loading}
              >
                Older →
              </button>
            </div>
          </div>
        </>
      )}
      </>
      )}

      <ExtractPopup
        open={exportOpen}
        minDate={windowInfo?.since ? windowInfo.since.slice(0, 10) : ""}
        days={windowInfo?.days || 90}
        onClose={() => setExportOpen(false)}
        onConfirm={async (from, to) => {
          await downloadExport(from, to, addToast);
          setExportOpen(false);
        }}
      />
    </div>
  );
}

export default AuditTrail;
