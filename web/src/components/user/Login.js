import React, { useEffect, useCallback, useRef } from 'react';
import { hanko } from '../../hanko';
import { useNavigate } from 'react-router-dom';
import SignIn from '../free/SignIn';
import { AistyLogo } from '../utils/Icons';
import "../../styles/user/login/login.css";
import "../../styles/user/login/onboarding.css";

function Login() {
  const navigate = useNavigate();
  const redirectedRef = useRef(false);

  // Where to go next is RequireAuth's decision: onboarding, the workspace, or a page explaining the account is not a member.
  const handlePostLogin = useCallback(() => {
    navigate("/goals-tickets", { replace: true });
  }, [navigate]);

  useEffect(() => {
    const unsubscribe = hanko?.onSessionCreated(() => handlePostLogin());
    return () => unsubscribe?.();
  }, [handlePostLogin]);

  useEffect(() => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    Promise.resolve(hanko.getSessionToken()).then((token) => { if (token) handlePostLogin(); }).catch(() => {});
  }, [handlePostLogin]);

  return (
    <div className="loginPage">
      {/* Left: Auth form */}
      <div className="loginFormPanel">
        <div className="loginFormInner">
          <div className="loginLogo">
            <AistyLogo width={140} height={28} />
          </div>

          <div className="loginFormHeader">
            <h2>Sign in to Aisty</h2>
            <p>Your team's self-hosted Aisty workspace.</p>
          </div>

          <div className="loginContainer">
            <SignIn />
          </div>

          <div className="termsContainer">
            <p>Aisty Workspace, self-hosted. By continuing, you agree to the <a href="https://aisty.ai/terms-and-conditions" target="_blank" rel="noreferrer">Terms</a> and <a href="https://aisty.ai/privacy-policy" target="_blank" rel="noreferrer">Privacy Policy</a>.</p>
          </div>
        </div>
      </div>

      {/* Right: Branding panel */}
      <div className="loginBranding">
        <div className="loginBrandingContent">
          <h1>Governed AI, built for teams whose security review is the hard part</h1>

          <div className="loginTestimonial">
                        <blockquote>
              "Since we started using AISTY AI, it has significantly improved the speed of our overall processes. It has helped us respond to customers more efficiently, both operationally and in sales, and has supported how we update and manage prospects in HubSpot.

              We look forward to seeing future updates."
            </blockquote>
            <div className="loginTestimonialAuthor">
              <div className="loginAuthorAvatar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <div>
                <strong>Andrew Malpass</strong>
                <span>Head of Sales Fuel Systems, Carwood</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
