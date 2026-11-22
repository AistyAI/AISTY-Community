import React, { useEffect, useState } from "react";
import { Popup } from '../../ui';
import IpAccess from './IpAccess';
import { fetchWithHankoAuth } from '../utils/verifiedCall';
import {
  useWorkspaceRole,
  canChangeRoles,
  canManageRole,
  formatRole,
} from '../utils/WorkspaceRoleContext';
import '../../styles/team/team.css';
import { API_URL } from "../../config";

const PROJECT = "Aisty";

/** Roles that can be assigned (owner is never assignable). */
const ASSIGNABLE_ROLES = ["admin", "billing", "member", "viewer"];

function Team() {
  const { role: myRole } = useWorkspaceRole();
  const [team, setTeam] = useState([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [loading, setLoading] = useState(false);
  const [showInvitePopup, setShowInvitePopup] = useState(false);
  const [error, setError] = useState("");
  const [inviteLink, setInviteLink] = useState(null);

  const fetchTeam = async () => {
    try {
      setError("");
      const data = await fetchWithHankoAuth(
        `${API_URL}/team?project=${PROJECT}`,
        { method: "GET" }
      );

      if (Array.isArray(data)) {
        setTeam(data);
      } else if (Array.isArray(data.team)) {
        setTeam(data.team);
      } else {
        setTeam([]);
        setError(data.message || "Failed to load team");
      }
    } catch (e) {
      setError(e.message || "Failed to load team");
      setTeam([]);
    }
  };

  useEffect(() => {
    fetchTeam();
  }, []);

  // Aisty Free sends no email: the invite comes back as a one-time link to share.
  const inviteMember = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchWithHankoAuth(`${API_URL}/team/invite?project=${PROJECT}`, {
        method: "POST",
        body: JSON.stringify({ email, role }),
      });
      setInviteLink({ email, url: res.inviteUrl });
      setEmail("");
      setRole("member");
      setShowInvitePopup(false);
      fetchTeam();
    } catch (e) {
      setError(String(e.message || e).replace(/^Failed to fetch [^:]+: /, ""));
    } finally {
      setLoading(false);
    }
  };

  const removeMember = async (id) => {
    await fetchWithHankoAuth(`${API_URL}/team/${id}?project=${PROJECT}`, {
      method: "DELETE",
    });
    fetchTeam();
  };

  const changeRole = async (id, newRole) => {
    try {
      await fetchWithHankoAuth(`${API_URL}/team/${id}/role?project=${PROJECT}`, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      });
      fetchTeam();
    } catch (e) {
      setError(e.message || "Failed to change role");
    }
  };

  return (
    <div className="team-page">
        <div className="team-section-header">
            <div>
              <h2>Team Members</h2>
              <p className="secondary-text">Add your team to Aisty to allow them to work with the AI and manage the AI's tasks.</p>
            </div>

            {canChangeRoles(myRole) && (
              <button className="team-invite-btn" onClick={() => setShowInvitePopup(true)}>
                <span className="team-invite-btn__icon">+</span>
                Invite team member
              </button>
            )}
        </div>

      {error && <div className="ip-message ip-error">{error}</div>}
      {inviteLink && (
        <div className="team-invite-link">
          <p>Invite link for <b>{inviteLink.email}</b>. Send it to them; it works once and expires in 7 days.</p>
          <div className="team-invite-link__row">
            <code>{inviteLink.url}</code>
            <button type="button" className="btn secondary small" onClick={() => navigator.clipboard?.writeText(inviteLink.url)}>Copy</button>
            <button type="button" className="btn secondary small" onClick={() => setInviteLink(null)}>Done</button>
          </div>
        </div>
      )}

      {/* Team List */}
      <div className="team-table-wrapper">
        <table className="team-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              {canChangeRoles(myRole) && <th className="actions-col">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {team.map((m) => {
              const canEdit = canChangeRoles(myRole) && canManageRole(myRole, m.role);
              return (
                <tr key={m._id}>
                  <td>{m.email}</td>
                  <td>
                    {canEdit ? (
                      <select
                        className="role-select"
                        value={m.role}
                        onChange={(e) => changeRole(m._id, e.target.value)}
                      >
                        {ASSIGNABLE_ROLES
                          .filter((r) => canManageRole(myRole, r) || r === m.role)
                          .map((r) => (
                            <option key={r} value={r}>{formatRole(r)}</option>
                          ))
                        }
                      </select>
                    ) : (
                      <span className={`badge badge-role-${m.role}`}>{formatRole(m.role)}</span>
                    )}
                  </td>
                  <td><span className={`badge badge-status-${m.status}`}>{m.status}</span></td>
                  {canChangeRoles(myRole) && (
                    <td className="actions-col">
                      {canEdit && (
                        <button className="team-remove-btn" onClick={() => removeMember(m._id)}>
                          Remove
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <IpAccess />
      <Popup show={showInvitePopup} onClose={() => setShowInvitePopup(false)}>
        <div className="invite-popup">
          <h3>Invite team member</h3>

          <div className="popup-field">
            <label>Email</label>
            <input
              placeholder="email@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="popup-field">
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="admin">Admin</option>
              <option value="billing">Billing Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          <div className="popup-actions">
            <button
              className="popup-cancel-btn"
              onClick={() => setShowInvitePopup(false)}
            >
              Cancel
            </button>
            <button className="popup-submit-btn" onClick={inviteMember} disabled={loading}>
              {loading ? "Creating..." : "Create invite link"}
            </button>
          </div>
        </div>
      </Popup>
    </div>
  );
}

export default Team;
