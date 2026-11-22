import { CloseIcon } from "../../utils/Icons";

// Date, member, action and source filters for the audit table.
export default function AuditFilters({
  filters,
  handleFilterChange,
  members,
  membersLoading,
  scope,
  setFilters,
  windowInfo,
}) {
  return (
    <div className="auditTrail__filters">
      <label>
        <span>From</span>
        <input
          type="date"
          value={filters.from}
          min={windowInfo?.since ? windowInfo.since.slice(0, 10) : undefined}
          onChange={(e) => handleFilterChange("from", e.target.value)}
        />
      </label>
      <label>
        <span>To</span>
        <input
          type="date"
          value={filters.to}
          min={windowInfo?.since ? windowInfo.since.slice(0, 10) : undefined}
          onChange={(e) => handleFilterChange("to", e.target.value)}
        />
      </label>
      <label>
        <span>Team member</span>
        <select
          value={filters.userId}
          onChange={(e) => handleFilterChange("userId", e.target.value)}
          disabled={membersLoading}
        >
          <option value="">All members</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.email}
            </option>
          ))}
        </select>
      </label>
      {scope === "workspace" ? (
        <label>
          <span>Action type</span>
          <select
            value={filters.verb}
            onChange={(e) => handleFilterChange("verb", e.target.value)}
          >
            <option value="">All action types</option>
            <option value="created">Created / added / connected</option>
            <option value="updated">Updated / edited</option>
            <option value="deleted">Deleted / removed / disconnected</option>
            <option value="executed">Executed / ran</option>
            <option value="exported">Exported</option>
          </select>
        </label>
      ) : (
        <label>
          <span>Show</span>
          <select
            value={filters.feed}
            onChange={(e) => handleFilterChange("feed", e.target.value)}
          >
            <option value="">Everything</option>
            <option value="ai">What Aisty did</option>
          </select>
        </label>
      )}
      <button
        type="button"
        className="auditTrail__clearBtn"
        onClick={() => setFilters({ from: "", to: "", userId: "", verb: "", feed: "" })}
        title="Clear filters"
      >
        <CloseIcon width={14} height={14} /> Clear
      </button>
    </div>
  );
}
