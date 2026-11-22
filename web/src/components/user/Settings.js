import React, { useEffect, useState } from 'react';
import { Popup, Button } from '../../ui';
import Integration from '../integrations/Integrations';
import AiApprovalSettings from './AiApprovalSettings';
import ModelSettings from '../free/ModelSettings';
import LockedFeature from '../free/LockedFeature';
import { LockIcon } from '../../ui';
import { LockedPanel } from '../free/LockedFeature';
import { hanko } from '../../hanko';
import { fetchWithHankoAuth } from '../utils/verifiedCall';
import {
  useWorkspaceRole,
  canEditCompany,
  canManageIntegrations,
} from '../utils/WorkspaceRoleContext';
import '../../styles/user/settings.css';
import { API_URL } from "../../config";

const PROJECT = 'Aisty';

// Return only the fields of `next` whose value differs from `prev`.
function computeFormDiff(prev, next) {
  if (!prev) return next;
  const diff = {};
  for (const key of Object.keys(next)) {
    const a = next[key];
    const b = prev[key];
    if (a === b) continue;
    if (a == null && b == null) continue;
    try {
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
    } catch (_) { /* fall through: include the field */ }
    diff[key] = a;
  }
  return diff;
}

const TABS = [
  { id: 'company', label: 'Company' },
  // Aisty Free brings no model of its own: this is where one is connected.
  { id: 'model', label: 'Model' },
  // Visible to every role: the policy explains why the AI is (or isn't) stopping to ask, which everyone who uses chat needs to know.
  { id: 'ai-approvals', label: 'AI Approvals' },
  { id: 'integrations', label: 'Integrations', requiresIntegrations: true },
  // Hosted-only, shown in place and locked.
  { id: 'aisty-link', label: 'Aisty Link', locked: true },
  { id: 'enterprise', label: 'Enterprise', locked: true },
];

function Settings() {
  const { role: myRole } = useWorkspaceRole();
  const isEditor = canEditCompany(myRole);
  const showIntegrations = canManageIntegrations(myRole);

  // ?tab=model lets a call to action land on the right tab.
  const [activeTab, setActiveTab] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    return TABS.some((t) => t.id === requested) ? requested : 'company';
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [company, setCompany] = useState(null);
  const [form, setForm] = useState({ name: '' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const loadCompany = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await fetchWithHankoAuth(
        `${API_URL}/company/me?project=${PROJECT}`,
        { method: 'GET' }
      );
      if (data?.company) {
        setCompany(data.company);
        setForm({ name: data.company.name || '' });
      }
    } catch (e) {
      setError(e.message || 'Failed to load company');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompany();
  }, []);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      // Diff against the loaded company so the audit log captures the actual fields the user changed, rather than the whole form on every save.
      const diff = computeFormDiff(company, form);
      if (Object.keys(diff).length === 0) {
        setSaved(true);
        return;
      }
      await fetchWithHankoAuth(
        `${API_URL}/company/me?project=${PROJECT}`,
        {
          method: 'PUT',
          body: JSON.stringify(diff),
        }
      );
      setSaved(true);
    } catch (e) {
      setError(e.message || 'Failed to save company');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      setIsDeleting(true);
      await hanko.user.delete();
      window.location.href = '/';
    } catch (err) {
      console.error('Failed to delete account:', err);
      setIsDeleting(false);
    }
  };

  const renderTabContent = () => {
    if (activeTab === 'model') {
      return <ModelSettings />;
    }
    if (activeTab === 'ai-approvals') {
      return <AiApprovalSettings />;
    }
    if (activeTab === 'integrations') {
      if (!showIntegrations) return <p>You don't have permission to manage integrations.</p>;
      return <Integration />;
    }
    if (activeTab === 'aisty-link' || activeTab === 'enterprise') {
      return <LockedFeature feature={activeTab} />;
    }

    return (
      <div>
        {loading ? (
          <p>Loading company…</p>
        ) : (
          <form className="company-form" onSubmit={(e) => e.preventDefault()}>
            <label>
              Workspace name
              <input
                placeholder="Workspace name"
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)} maxLength={100}
                disabled={!isEditor}
              />
            </label>
            {error && <div className="error">{error}</div>}
            {saved && <div className="success">Saved.</div>}

            {isEditor && (
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            )}
          </form>
        )}
        <div className="company-locked">
          <LockedPanel feature="company-profile" />
        </div>
      </div>
    );
  };

  // Filter tabs based on role permissions
  const visibleTabs = TABS.filter((tab) => {
    if (tab.requiresIntegrations) return showIntegrations;
    return true;
  });

  return (
    <div className="settings-page">
      <h2>Settings</h2>
      <div className="settings-tabs">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            className={`settings-tab ${activeTab === tab.id ? 'is-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.locked && <LockIcon size={12} style={{ marginLeft: 6, verticalAlign: '-1px', opacity: 0.7 }} />}
          </button>
        ))}
      </div>

      <div key={activeTab} className="tab-panel tab-animate">
        {renderTabContent()}
      </div>

      <Popup show={showDeleteModal} onClose={() => setShowDeleteModal(false)}>
        <div className="deleteModal">
          <h2>Delete account?</h2>
          <p>
            This action is <strong>permanent</strong>. All your data will be
            removed.
          </p>

          <div className="modalActions">
            <button
              className="cancelBtn"
              onClick={() => setShowDeleteModal(false)}
              disabled={isDeleting}
            >
              Cancel
            </button>

            <button
              className="confirmDeleteBtn"
              onClick={handleDeleteAccount}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Account'}
            </button>
          </div>
        </div>
      </Popup>

    </div>
  );
}

export default Settings;