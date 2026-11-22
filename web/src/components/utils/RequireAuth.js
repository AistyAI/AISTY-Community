import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { hanko } from '../../hanko';
import { AistyLogo } from './Icons';
import '../free/free.css';
import { API_URL } from "../../config";


function Gate({ title, children }) {
  const logout = async () => {
    await hanko.user.logout().catch(() => {});
    window.location.href = '/login';
  };
  return (
    <div className="gatePage">
      <div className="gateCard">
        <div><AistyLogo width={110} height={22} /></div>
        <h1>{title}</h1>
        {children}
        <button type="button" className="btn secondary medium" onClick={logout}>Sign in with another account</button>
      </div>
    </div>
  );
}

// Signed in, and where should this person be?
function RequireAuth({ children, onboarding = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState({ status: 'checking' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await Promise.resolve(hanko.getSessionToken()).catch(() => null);
      if (!token) {
        navigate('/login', { replace: true });
        return;
      }
      try {
        const res = await fetch(`${API_URL}/me/workspace`, { headers: { Authorization: `Bearer ${token}` } });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.status === 401) { navigate('/login', { replace: true }); return; }
        if (res.status === 403) { setState({ status: 'not_member', message: body.error }); return; }
        if (!res.ok) { setState({ status: 'error', message: body.error || `The server returned ${res.status}.` }); return; }
        if (body.status === 'needs_onboarding') {
          if (!body.canCreate) { setState({ status: 'reserved' }); return; }
          if (!onboarding) { navigate('/onboarding/company', { replace: true }); return; }
          setState({ status: 'ok' });
          return;
        }
        if (onboarding) { navigate('/goals-tickets', { replace: true }); return; }
        setState({ status: 'ok' });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: 'Could not reach the Aisty server.' });
      }
    })();
    return () => { cancelled = true; };
  }, [navigate, onboarding, location.pathname]);

  if (state.status === 'ok') return children;
  if (state.status === 'not_member') {
    return <Gate title="You're not in this workspace yet"><p>{state.message || 'Ask the workspace owner to invite you, then open the invite link they send.'}</p></Gate>;
  }
  if (state.status === 'reserved') {
    return <Gate title="This deployment is being set up"><p>It is reserved for its configured owner. Ask them to finish setup and invite you.</p></Gate>;
  }
  if (state.status === 'error') {
    return <Gate title="Something went wrong"><p>{state.message}</p></Gate>;
  }
  return null;
}

export default RequireAuth;
