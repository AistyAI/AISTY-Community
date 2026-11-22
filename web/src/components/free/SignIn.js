import React, { useEffect, useState } from "react";
import { register } from "@teamhanko/hanko-elements";
import { hanko, HANKO_API_URL, DEV_AUTH } from "../../hanko";
import "./free.css";

/** The sign-in form: the Aisty Identity Service, or a dev stand-in locally. */
export default function SignIn() {
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!DEV_AUTH) register(HANKO_API_URL).catch((err) => console.error("[SignIn] Hanko init failed", err));
  }, []);

  if (!DEV_AUTH) {
    return <hanko-auth lang="en" hanko-api={HANKO_API_URL} redirect-url={window.location.origin} />;
  }

  return (
    <form className="devLogin" onSubmit={(e) => { e.preventDefault(); if (email.includes("@")) hanko.devSignIn(email); }}>
      <p className="devLogin__note">Development sign-in. Any email address works; production builds use the Aisty Identity Service.</p>
      <input className="inputField" type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
      <button type="submit" className="btn primary medium">Sign in</button>
    </form>
  );
}
