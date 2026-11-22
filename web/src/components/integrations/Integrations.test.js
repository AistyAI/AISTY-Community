import React from "react";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import nodeCrypto from "crypto";
import { TextEncoder, TextDecoder } from "util";
import Integrations from "./Integrations";
import { fetchWithHankoAuth } from "../utils/verifiedCall";

// jsdom has no Web Crypto; use Node's implementation, which is the same API.
Object.defineProperty(window, "crypto", { value: nodeCrypto.webcrypto, configurable: true });
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;

jest.mock("../utils/verifiedCall", () => ({ fetchWithHankoAuth: jest.fn() }));

const mockToast = jest.fn();
jest.mock('../../ui', () => {
  const React = require("react");
  return {
    useToast: () => ({ addToast: mockToast }),
    Button: ({ children, variant, ...props }) => <button {...props}>{children}</button>,
    Input: ({ label, ...props }) => <label>{label}<input {...props} /></label>,
    Textarea: ({ label, ...props }) => <label>{label}<textarea {...props} /></label>,
    SparkIcon: () => null,
    LockIcon: () => null,
    Select: ({ label, options, value, onValueChange }) => (
      <label>{label}
        <select value={value} onChange={(e) => onValueChange(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    ),
  };
});

// Stand-in for the Free API's sealing key.
const server = nodeCrypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const SEALING_KEY = {
  v: 1, alg: "RSA-OAEP-256+A256GCM", kid: "testkid",
  publicKey: server.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
};

function serverOpen(sealed, aad) {
  const aesKey = nodeCrypto.privateDecrypt(
    { key: server.privateKey, padding: nodeCrypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(sealed.key, "base64")
  );
  const ct = Buffer.from(sealed.ct, "base64");
  const d = nodeCrypto.createDecipheriv("aes-256-gcm", aesKey, Buffer.from(sealed.iv, "base64"));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(ct.subarray(ct.length - 16));
  return JSON.parse(Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString());
}

const company = {
  _id: "c1",
  connectedServices: [{ provider: "github", meta: { ownerLogin: "acme" } }],
};

let calls;
beforeEach(() => {
  calls = [];
  mockToast.mockReset();
  fetchWithHankoAuth.mockImplementation(async (url, opts = {}) => {
    calls.push({ url, opts });
    if (url.includes("/company/me")) return { company };
    if (url.includes("/integrations/sealing-key")) return SEALING_KEY;
    return { message: "Connected" };
  });
});

const lastCall = (fragment) => [...calls].reverse().find((c) => c.url.includes(fragment));

async function openConnector(name) {
  render(<Integrations />);
  await screen.findByRole("heading", { name: /^Connected/ });
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${name}:`) }));
  return screen.getByRole("dialog");
}

test("Free connectors are available; the hosted catalogue is shown locked", async () => {
  render(<Integrations />);
  await screen.findByRole("heading", { name: /^Connected/ });
  const connected = screen.getByRole("region", { name: "Connected" });
  const available = screen.getByRole("region", { name: "Available" });
  const hosted = screen.getByRole("region", { name: "On hosted Aisty" });
  expect(within(connected).getByText("GitHub")).toBeInTheDocument();
  for (const name of ["Slack", "Gmail", "HubSpot", "Jira"]) expect(within(available).getByText(name)).toBeInTheDocument();
  for (const name of ["Xero", "Stripe", "Salesforce", "Outlook"]) expect(within(hosted).getByText(name)).toBeInTheDocument();
  expect(within(available).queryByText("Xero")).toBeNull();
});

test("secrets leave the browser only sealed, bound to the provider and workspace", async () => {
  const drawer = await openConnector("Slack");
  fireEvent.change(within(drawer).getByLabelText("Bot token"), { target: { value: " xoxb-123 " } });
  fireEvent.click(within(drawer).getByRole("button", { name: "Connect" }));
  await waitFor(() => expect(lastCall("/integrations/slack/connect")).toBeTruthy());
  const raw = lastCall("/integrations/slack/connect").opts.body;
  expect(raw).not.toContain("xoxb-123");
  const body = JSON.parse(raw);
  expect(body.companyId).toBe("c1");
  const opened = serverOpen(body.sealed, "slack:c1");
  expect(opened.fields).toEqual({ botToken: "xoxb-123" });
  expect(() => serverOpen(body.sealed, "slack:OTHER")).toThrow();
});

test("Gmail: the service account key is sealed, the mailbox travels in the clear", async () => {
  const drawer = await openConnector("Gmail");
  const key = JSON.stringify({ type: "service_account", client_email: "sa@x.iam", private_key: "-----BEGIN PRIVATE KEY-----" });
  fireEvent.change(within(drawer).getByLabelText("Service account key (JSON)"), { target: { value: key } });
  fireEvent.change(within(drawer).getByLabelText("Mailbox"), { target: { value: "ops@acme.com" } });
  fireEvent.click(within(drawer).getByRole("button", { name: "Connect" }));
  await waitFor(() => expect(lastCall("/integrations/gmail/connect")).toBeTruthy());
  const raw = lastCall("/integrations/gmail/connect").opts.body;
  expect(raw).not.toContain("PRIVATE KEY");
  const body = JSON.parse(raw);
  expect(body.email).toBe("ops@acme.com");
  expect(serverOpen(body.sealed, "gmail:c1").fields.serviceAccountKey).toBe(key);
});

test("a locked connector offers the upgrade, never a credentials form", async () => {
  const drawer = await openConnector("Xero");
  expect(within(drawer).getByRole("button", { name: "Book a call" })).toBeInTheDocument();
  expect(within(drawer).queryByRole("button", { name: "Connect" })).toBeNull();
  expect(within(drawer).queryByLabelText(/key|token|secret/i)).toBeNull();
});

test("Escape closes the drawer", async () => {
  await openConnector("Slack");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});
