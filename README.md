<div align="center">

# Aisty Community

**The governed AI workspace, self-hosted and free.**

[Website](https://aisty.ai) · [Docs](https://aisty.ai/docs) · [Hosted Aisty](https://aisty.ai/contact) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)

[![CI](https://github.com/AistyAI/AISTY-Community/actions/workflows/ci.yml/badge.svg)](https://github.com/AistyAI/AISTY-Community/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/AistyAI/AISTY-Community?sort=semver&color=14161a)](https://github.com/AistyAI/AISTY-Community/releases)
[![Image](https://img.shields.io/badge/image-ghcr.io%2Faistyai%2Faisty--community-14161a?logo=docker&logoColor=white)](https://github.com/AistyAI/AISTY-Community/pkgs/container/aisty-community)
[![License](https://img.shields.io/badge/license-Aisty%20Community%201.0-ff9f1c)](LICENSE)
[![Website](https://img.shields.io/badge/aisty.ai-visit-14161a)](https://aisty.ai)

</div>

![Goals and tickets board in Aisty Community](docs/board.png)

Your team sets goals, Aisty suggests the tickets that move them, and an AI
agent carries them out across GitHub, Jira, Slack, Gmail and HubSpot. Every
change it wants to make waits for a person first, and everything it did is
recorded in an append-only, hash-chained audit trail.

It runs on your servers with a model you choose, and sign-in runs there too
([Hanko](https://www.hanko.io), with email codes and passkeys). Nothing leaves
your deployment unless you turn it on.

## Quick start

You need Docker with Compose 2.23 or newer, a domain behind a TLS-terminating
reverse proxy (Caddy, nginx, Traefik) that forwards everything to port 8080,
and an SMTP service to send sign-in codes.

```bash
mkdir aisty && cd aisty
curl -fsSLO https://github.com/AistyAI/AISTY-Community/releases/latest/download/docker-compose.yml
curl -fsSL -o .env https://github.com/AistyAI/AISTY-Community/releases/latest/download/env.example

openssl rand -base64 32        # put this in MASTER_KEY
openssl rand -hex 32           # put this in HANKO_SECRET_KEY
# set APP_DOMAIN, POSTGRES_PASSWORD and the SMTP_ settings in .env
docker compose up -d
```

Open `https://APP_DOMAIN`, create an account and sign in. The first person to finish setup owns the
workspace; set `BOOTSTRAP_OWNER_EMAIL` to reserve that for one address. Setup
ends by connecting a model. Our partner [kvrun](https://kvrun.com) deploys
private open-weight models with an OpenAI-compatible endpoint, or you can use
vLLM, Ollama, OpenAI, Anthropic or Gemini.

The image is `ghcr.io/aistyai/aisty-community`, built for `linux/amd64` and
`linux/arm64`. Pin `AISTY_VERSION` in `.env` to a release in production, and
back up `MASTER_KEY` separately from the database. Sign-in accounts live in a
second database, `hanko`, on the same Postgres, so back up both databases.

### Upgrading

```bash
docker compose pull && docker compose up -d
```

Database migrations run on start. Read the [release notes](https://github.com/AistyAI/AISTY-Community/releases)
before moving across a minor version.

## What you get

| | |
|---|---|
| **AI tickets** | The agent reads what it needs, proposes exact changes, and runs exactly what was approved. |
| **Approval policy** | Off, critical only, every change, or everything including answers. Plans can be approved, declined or sent back with notes. |
| **Goals and suggestions** | Aisty proposes tickets that move your goals; you pick which ones go on the board. |
| **Chat** | Ask questions with read-only look-ups in your tools; "Run as task" turns an answer into an approved ticket. |
| **IP access** | Allow the workspace only from listed networks (checked on every request); mirror the list in your server firewall. |
| **Recurring tickets** | Daily to yearly, per timezone. Approve a recurring plan once and later runs with the same plan go ahead. |
| **Team and roles** | Owner, admin, member, billing, viewer. Invites are one-time links. |
| **Integrations** | GitHub, Jira, Slack, Gmail (service account) and HubSpot. |
| **Audit trail** | Append-only (enforced by the database), hash-chained, filterable, CSV export. |
| **Encryption** | Credentials, model keys, plans and audit details are sealed with your `MASTER_KEY`; credentials are also encrypted in the browser before they are sent. |

## What hosted Aisty adds

Hosted Aisty is the same app with more of it switched on. Those parts are
visible in Aisty Community, locked, so you can see exactly what upgrading adds:

- **Company Brain**: your documents, SOPs and history, read by the agent before it plans
- **Progress dashboard** (Home): KPIs against goals and work in flight, plus **Insights** from every ticket
- **A private model** on dedicated GPUs, or fine-tuned on your data on Enterprise
- **Every integration**, including Xero, Stripe, Outlook, Salesforce and NetSuite
- **Approval rules** by amount, owner and two-person review
- **Evidence packs**, retention policies, SSO/SAML, SCIM and Aisty Link

Upgrading starts with a call to scope a 30-day pilot around your workflows. The
Plan page books that call and exports your workspace (goals, tickets, team,
policy and verified audit history, never credentials) for import into the
pilot. [Talk to us](https://aisty.ai/contact) or email [info@aisty.ai](mailto:info@aisty.ai).

## Development

Needs Node 22+ and Docker.

```bash
docker run -d --name aisty-db -e POSTGRES_PASSWORD=test -p 5544:5432 postgres:16-alpine

# API on :8080, with email-only development sign-in
cd api && npm install
DATABASE_URL=postgres://postgres:test@127.0.0.1:5544/postgres \
MASTER_KEY=$(openssl rand -base64 32) AISTY_DEV_AUTH=true npm run dev

# Web app on :3000, proxied to the API
cd web && npm install && node scripts/patch-react-scripts.js && npx react-scripts start
```

Tests:

```bash
node scripts/check-no-paid-code.js
cd api && TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:5544/aisty_test npm test   # wipes that database
cd web && npx eslint src && CI=true npx react-scripts test --watchAll=false
```

`AISTY_DEV_AUTH` is refused when `NODE_ENV=production`. To sign in for real
during development, run Hanko from `docker-compose.yml` and set
`AISTY_IDENTITY_URL` to it; the web app reaches it through `/auth`.

## Layout

| Path | What it is |
|---|---|
| `web/` | The Aisty web app. Shared pages come from hosted Aisty; hosted-only pages are replaced by locked upsell pages (`src/components/free`). `src/edition.js` holds every call to action. |
| `api/` | Fastify API, Postgres store, job worker and agent. Serves the same paths and JSON the shared pages use. |
| `api/src/agent` | Model adapters, the five integrations, and the plan, hold, execute runner. |
| `scripts/check-no-paid-code.js` | Fails CI if hosted-only code reappears in this repository. |

## Releases

Pushing a `vX.Y.Z` tag runs the test suite, publishes the multi-arch image to
GHCR with an SBOM and provenance, and creates a GitHub release with
`docker-compose.yml` and `env.example` attached. The tag must match the
version in `api/package.json` and `web/package.json`.

## Support

- Questions and bugs: [GitHub issues](https://github.com/AistyAI/AISTY-Community/issues)
- Security reports: [security@aisty.ai](mailto:security@aisty.ai), see [SECURITY.md](SECURITY.md)
- Commercial support and hosted Aisty: [support@aisty.ai](mailto:support@aisty.ai)

## License

Aisty Community is source-available under the [Aisty Community License 1.0](LICENSE).
Use it free inside your organisation, modify it, and have a partner install it
for you. You may not sell, resell, host it for others or build a competing
product from it. For a commercial license, email [info@aisty.ai](mailto:info@aisty.ai).

"Aisty" is a trademark of One To Infinity Ltd. See [Privacy](https://aisty.ai/privacy-policy)
and [Terms](https://aisty.ai/terms-and-conditions).
