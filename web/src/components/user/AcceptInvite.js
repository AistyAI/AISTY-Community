import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { hanko } from '../../hanko';
import { AistyLogo, CheckIcon } from '../utils/Icons';
import SignIn from '../free/SignIn';
import "../../styles/user/login/login.css";
import "../../styles/user/login/onboarding.css";
import '../../styles/user/inviteStyle.css';
import { API_URL } from "../../config";


// /invite: Accept or decline a workspace invitation.
function AcceptInvite() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const token  = params.get('token');
  const action = params.get('action') || 'accept';

  const [authed, setAuthed]     = useState(false);
  const [loading, setLoading]   = useState(true);
  const [status, setStatus]     = useState(null);   // "success" | "error"
  const [message, setMessage]   = useState('');
  const [companyName, setCompanyName] = useState(null);
  const [processing, setProcessing] = useState(false);

  // Check authentication
  useEffect(() => {
    (async () => {
      try {
        const session = await hanko.getSessionToken();
        setAuthed(!!session);
      } catch {
        setAuthed(false);
      }
      setLoading(false);
    })();
  }, []);

  // Listen for Hanko auth success
  useEffect(() => {
    const handler = () => setAuthed(true);
    hanko.onSessionCreated(handler);
    return () => {}; // Hanko doesn't expose removeListener – safe to leave
  }, []);

  // Process invite once authed
  const processInvite = useCallback(async () => {
    if (!token) {
      setStatus('error');
      setMessage('No invite token found. The link may be invalid.');
      return;
    }

    setProcessing(true);

    try {
      const sessionToken = await hanko.getSessionToken();
      const endpoint = action === 'decline' ? 'decline' : 'accept';

      const res = await fetch(`${API_URL}/invite/${endpoint}?project=Aisty`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus('error');
        setMessage(body.error || 'Something went wrong. Please try again.');
        return;
      }

      setStatus('success');

      if (action === 'decline') {
        setMessage('You have declined the invitation.');
      } else {
        setMessage(body.message || 'Invitation accepted!');
        if (body.companyName) setCompanyName(body.companyName);
      }
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Network error. Please try again.');
    } finally {
      setProcessing(false);
    }
  }, [token, action]);

  // Auto-process once authenticated
  useEffect(() => {
    if (authed && !status && !processing) {
      processInvite();
    }
  }, [authed, status, processing, processInvite]);

  // Redirect helper
  const goToWorkspace = () => navigate('/goals-tickets');

  // Loading state
  if (loading) {
    return (
      <div className="invitePage">
        <div className="inviteCard">
          <div className="inviteLogo"><AistyLogo /></div>
          <p className="inviteLoading">Checking your session…</p>
        </div>
      </div>
    );
  }

  // Not authenticated → show Hanko login
  if (!authed) {
    return (
      <div className="invitePage">
        <div className="inviteCard inviteCardWide">
          <div className="inviteLogo"><AistyLogo /></div>
          <h2 className="inviteTitle">
            {action === 'decline' ? 'Decline Invitation' : 'Accept Invitation'}
          </h2>
          <p className="inviteSubtitle">
            Sign in or create an account to {action === 'decline' ? 'decline' : 'accept'} your workspace invitation.
          </p>
          <div className="inviteAuth">
            <SignIn />
          </div>
        </div>
      </div>
    );
  }

  // Processing
  if (processing) {
    return (
      <div className="invitePage">
        <div className="inviteCard">
          <div className="inviteLogo"><AistyLogo /></div>
          <p className="inviteLoading">
            {action === 'decline' ? 'Declining…' : 'Accepting invitation…'}
          </p>
        </div>
      </div>
    );
  }

  // Result
  return (
    <div className="invitePage">
      <div className="inviteCard">
        <div className="inviteLogo"><AistyLogo /></div>

        {status === 'success' && action !== 'decline' && (
          <>
            <div className="inviteSuccessIcon"><CheckIcon width={28} height={28} /></div>
            <h2 className="inviteTitle">You're in!</h2>
            <p className="inviteMessage">
              {companyName
                ? `You've joined the ${companyName} workspace.`
                : 'Your invitation has been accepted.'}
            </p>
            <button className="inviteBtn inviteBtnPrimary" onClick={goToWorkspace}>
              Go to Workspace
            </button>
          </>
        )}

        {status === 'success' && action === 'decline' && (
          <>
            <h2 className="inviteTitle">Invitation Declined</h2>
            <p className="inviteMessage">{message}</p>
            <button
              className="inviteBtn inviteBtnSecondary"
              onClick={() => navigate('/login')}
            >
              Return to Login
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="inviteErrorIcon">!</div>
            <h2 className="inviteTitle">Something went wrong</h2>
            <p className="inviteMessage inviteMessageError">{message}</p>
            <button
              className="inviteBtn inviteBtnSecondary"
              onClick={() => navigate('/login')}
            >
              Return to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default AcceptInvite;
