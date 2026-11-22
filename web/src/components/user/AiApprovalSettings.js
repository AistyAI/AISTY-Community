import React, { useEffect, useState } from 'react';
import { Button, useToast } from '../../ui';
import { fetchWithHankoAuth } from '../utils/verifiedCall';
import { CheckIcon } from '../utils/Icons';
import { UpgradeNudge } from '../free/LockedFeature';
import '../../styles/user/aiApprovals.css';
import { API_URL } from "../../config";

// The backend resolves the tenant from this and returns 400 without it.
const PROJECT = 'Aisty';

// Which AI actions this workspace holds for a human before they run.

const LEVELS = [
  {
    id: 'off',
    label: 'Off',
    summary: 'Aisty acts on its own. Nothing is paused for review.',
    tiers: [],
    examples: 'Best for a workspace where the AI only reads and drafts.',
  },
  {
    id: 'critical',
    label: 'Critical actions',
    summary: 'Anything destructive, outbound, or financial waits for you.',
    tiers: ['critical'],
    examples: 'Deleting an issue · sending an email · commenting on a public PR · anything involving money.',
  },
  {
    id: 'medium',
    label: 'Medium and above',
    summary: 'Every change Aisty makes to a connected system waits for you.',
    tiers: ['medium', 'critical'],
    examples: 'Creating an issue · editing a page · updating a record, plus everything above.',
    recommended: true,
  },
  {
    id: 'all',
    label: 'Everything',
    summary: 'Every plan and every answer waits for you. Look-ups still run so Aisty can prepare them.',
    tiers: ['medium', 'critical', 'answers'],
    examples: 'Nothing is filed or changed until someone has read it.',
  },
];

// The three tiers every tool is sorted into, weakest first.
const TIERS = [
  {
    id: 'low',
    label: 'Reads',
    detail: 'Looking things up: listing issues, reading a file, searching mail. Reads always run.',
  },
  {
    id: 'medium',
    label: 'Changes',
    detail: 'Writing to a connected system: creating an issue, editing a page, updating a record.',
  },
  {
    id: 'critical',
    label: 'High risk',
    detail: 'Destructive, outbound or financial: deleting, sending email, commenting publicly, anything involving money.',
  },
  {
    id: 'answers',
    label: 'Answers',
    detail: 'The finished result of a ticket, before it is filed on the board.',
  },
];

export default function AiApprovalSettings() {
  const { addToast } = useToast();
  const [level, setLevel] = useState('critical');
  const [savedLevel, setSavedLevel] = useState('critical');
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchWithHankoAuth(`${API_URL}/ai-approvals/policy?project=${PROJECT}`);
        if (cancelled) return;
        setLevel(data.level);
        setSavedLevel(data.level);
        setCanEdit(!!data.canEdit);
        setUpdatedAt(data.updatedAt || null);
      } catch (err) {
        console.error('Failed to load the approval policy:', err);
        if (!cancelled) addToast('Could not load the approval policy.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const data = await fetchWithHankoAuth(`${API_URL}/ai-approvals/policy?project=${PROJECT}`, {
        method: 'PUT',
        body: JSON.stringify({ level }),
      });
      setSavedLevel(data.level);
      setUpdatedAt(data.updatedAt || null);
      addToast('Approval policy saved.', 'success');
    } catch (err) {
      console.error('Failed to save the approval policy:', err);
      addToast('Could not save the approval policy.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading approval policy…</p>;

  const dirty = level !== savedLevel;
  // Fall back to the first entry rather than risking an undefined read if the server ever returns a level this build does not know about.
  const selectedLevel = LEVELS.find((l) => l.id === level) || LEVELS[0];

  return (
    <div className="aiApprovals">
      <header className="aiApprovals__intro">
        <h3 className="aiApprovals__title">When should Aisty ask first?</h3>
        <p className="aiApprovals__lede">
          Held actions wait on the ticket or in the chat with everything you need to approve them, send them back
          with changes, or decline them. Every decision is recorded in the audit trail.
        </p>
      </header>

      <div className="aiApprovals__layout">
        <div className="aiApprovals__main">
          <div className="aiApprovals__levels" role="radiogroup" aria-label="Approval level">
            {LEVELS.map((opt) => {
              const selected = level === opt.id;
              return (
                <label key={opt.id} className={`aiApprovals__level${selected ? ' is-selected' : ''}${canEdit ? '' : ' is-readonly'}`}>
                  <input type="radio" name="approval-level" className="aiApprovals__radio" value={opt.id}
                    checked={selected} disabled={!canEdit} onChange={() => setLevel(opt.id)} />
                  <span className="aiApprovals__dot" aria-hidden="true" />
                  <span className="aiApprovals__content">
                    <span className="aiApprovals__row">
                      <span className="aiApprovals__label">{opt.label}</span>
                      {opt.recommended && <span className="aiApprovals__recommended">Recommended</span>}
                    </span>
                    <span className="aiApprovals__summary">{opt.summary}</span>
                  </span>
                  <span className="aiApprovals__gauge" aria-hidden="true">
                    {TIERS.map((tier) => (
                      <span key={tier.id} className={`aiApprovals__gaugeSeg${opt.tiers.includes(tier.id) ? ' is-held' : ''}`} />
                    ))}
                  </span>
                </label>
              );
            })}
          </div>

          {savedLevel === 'off' && (
            <p className="aiApprovals__warning">
              Aisty currently runs every action without asking, including ones that cannot be undone. Its work is
              still recorded in the Audit Trail.
            </p>
          )}

          {canEdit ? (
            <div className="aiApprovals__footer">
              <Button variant="primary" size="medium" disabled={!dirty || saving} onClick={save}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
              {!dirty && updatedAt && (
                <span className="aiApprovals__saved">
                  <CheckIcon /> Last changed {new Date(updatedAt).toLocaleDateString()}
                </span>
              )}
              {dirty && <span className="aiApprovals__saved">Unsaved change</span>}
            </div>
          ) : (
            <p className="aiApprovals__readonly">Only owners and admins can change the approval policy.</p>
          )}
        </div>

        <aside className="aiApprovals__effect" aria-live="polite">
          <h4 className="aiApprovals__effectTitle">At <strong>{selectedLevel.label}</strong></h4>
          <ul className="aiApprovals__tiers">
            {TIERS.map((tier) => {
              const held = selectedLevel.tiers.includes(tier.id);
              return (
                <li key={tier.id} className={`aiApprovals__tier${held ? ' is-held' : ''}`}>
                  <span className="aiApprovals__tierBody">
                    <span className="aiApprovals__tierLabel">{tier.label}</span>
                    <span className="aiApprovals__tierDetail">{tier.detail}</span>
                  </span>
                  <span className="aiApprovals__tierState">{held ? 'Asks first' : 'Runs'}</span>
                </li>
              );
            })}
          </ul>
          <div className="aiApprovals__scope">
            <UpgradeNudge cta="approvals-employee-ai" action="See AI tool monitoring">
              These rules govern Aisty. They don't reach ChatGPT, Claude or other AI tools your people use on their own.
            </UpgradeNudge>
          </div>
        </aside>
      </div>
    </div>
  );
}
