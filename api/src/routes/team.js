// Team, roles and invitations.
import { tx, query, one } from "../db.js";
import { uuid, randomToken, sha256 } from "../crypto.js";
import { audit, fromRequest } from "../audit.js";
import { config } from "../config.js";
import { HttpError, badRequest, notFound } from "../errors.js";
import { requireAdmin, currentCompany } from "../auth.js";

const ASSIGNABLE = ["admin", "member", "billing", "viewer"];
const INVITE_DAYS = 7;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const view = (r) => ({
  _id: r.id, email: r.email, role: r.role, status: r.status, userId: r.user_id,
  invitedAt: r.invited_at, activatedAt: r.activated_at,
});

export default async function teamRoutes(app) {
  app.get("/team", { preHandler: app.workspace }, async (req) => {
    if (!["owner", "admin", "billing"].includes(req.workspaceRole)) throw new HttpError(403, "Your role cannot view the team.");
    const { rows } = await query(
      "SELECT * FROM team_members WHERE company_id = $1 AND status IN ('active','invited') ORDER BY role = 'owner' DESC, invited_at",
      [req.companyId],
    );
    return { team: rows.map(view) };
  });

  app.post("/team/invite", { preHandler: app.workspace }, async (req, reply) => {
    requireAdmin(req);
    const email = String(req.body?.email || "").trim().toLowerCase();
    const role = String(req.body?.role || "member");
    if (!EMAIL_RE.test(email) || email.length > 254) throw badRequest("Enter a valid email address.");
    if (!ASSIGNABLE.includes(role)) throw badRequest("Choose a valid role.");
    if (role === "admin" && req.workspaceRole !== "owner") throw new HttpError(403, "Only the owner can invite admins.");

    const token = randomToken();
    const member = await tx(async (c) => {
      const dupe = await c.query(
        "SELECT id, status FROM team_members WHERE company_id = $1 AND lower(email) = $2 AND status IN ('active','invited')",
        [req.companyId, email],
      );
      if (dupe.rows.some((r) => r.status === "active")) throw new HttpError(409, "That person is already a member.");
      const id = dupe.rows[0]?.id || uuid();
      await c.query(
        `INSERT INTO team_members (id, company_id, email, role, status, invite_token_hash, invite_expires_at)
         VALUES ($1,$2,$3,$4,'invited',$5, now() + interval '${INVITE_DAYS} days')
         ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, invite_token_hash = EXCLUDED.invite_token_hash,
           invite_expires_at = EXCLUDED.invite_expires_at, invited_at = now()`,
        [id, req.companyId, email, role, sha256(token)],
      );
      await audit({ ...fromRequest(req), action: "team.invite", resource: "team_member", resourceId: id, metadata: { email, role } }, c);
      return id;
    });
    reply.code(201);
    return {
      message: "Invitation created. Share the link with them; it works once and expires in 7 days.",
      memberId: member,
      inviteUrl: `${config.appUrl}/invite?token=${encodeURIComponent(token)}`,
    };
  });

  app.patch("/team/:id/role", { preHandler: app.workspace }, async (req) => {
    requireAdmin(req);
    const role = String(req.body?.role || "");
    if (!ASSIGNABLE.includes(role)) throw badRequest("Choose a valid role.");
    await tx(async (c) => {
      const { rows } = await c.query("SELECT * FROM team_members WHERE id = $1 AND company_id = $2 FOR UPDATE", [req.params.id, req.companyId]);
      const m = rows[0];
      if (!m || m.status === "removed") throw notFound("Member not found.");
      if (m.role === "owner") throw new HttpError(403, "The owner's role cannot be changed.");
      if ((m.role === "admin" || role === "admin") && req.workspaceRole !== "owner") throw new HttpError(403, "Only the owner can change admin roles.");
      await c.query("UPDATE team_members SET role = $1 WHERE id = $2", [role, m.id]);
      await audit({ ...fromRequest(req), action: "team.role_change", resource: "team_member", resourceId: m.id, metadata: { email: m.email, from: m.role, to: role } }, c);
    });
    return { message: "Role updated." };
  });

  app.delete("/team/:id", { preHandler: app.workspace }, async (req) => {
    requireAdmin(req);
    await tx(async (c) => {
      const { rows } = await c.query("SELECT * FROM team_members WHERE id = $1 AND company_id = $2 FOR UPDATE", [req.params.id, req.companyId]);
      const m = rows[0];
      if (!m || m.status === "removed") throw notFound("Member not found.");
      if (m.role === "owner") throw new HttpError(403, "The owner cannot be removed.");
      if (m.role === "admin" && req.workspaceRole !== "owner") throw new HttpError(403, "Only the owner can remove an admin.");
      await c.query("UPDATE team_members SET status = 'removed', invite_token_hash = NULL WHERE id = $1", [m.id]);
      await audit({ ...fromRequest(req), action: "team.remove", resource: "team_member", resourceId: m.id, metadata: { email: m.email } }, c);
    });
    // Drop cached sessions so a removed member loses access promptly.
    await query("DELETE FROM session_cache WHERE email = (SELECT email FROM team_members WHERE id = $1)", [req.params.id]);
    return { message: "Member removed." };
  });

  for (const action of ["accept", "decline"]) {
    app.post(`/invite/${action}`, { preHandler: app.authenticate }, async (req) => {
      const token = String(req.body?.token || "");
      if (!token) throw badRequest("No invite token.");
      const company = await currentCompany();
      if (!company) throw notFound("This invitation is no longer valid.");
      return tx(async (c) => {
        const { rows } = await c.query(
          "SELECT * FROM team_members WHERE company_id = $1 AND invite_token_hash = $2 AND status = 'invited' FOR UPDATE",
          [company.id, sha256(token)],
        );
        const m = rows[0];
        if (!m || new Date(m.invite_expires_at) < new Date()) throw new HttpError(410, "This invitation has expired or was already used.");
        if (!req.user.email || req.user.email.toLowerCase() !== m.email.toLowerCase()) {
          throw new HttpError(403, `This invitation is for ${m.email}. Sign in with that address to accept it.`);
        }
        const auditBase = { ...fromRequest(req), companyId: company.id, workspaceRole: m.role, resource: "team_member", resourceId: m.id, metadata: { email: m.email } };
        if (action === "decline") {
          await c.query("UPDATE team_members SET status = 'declined', invite_token_hash = NULL WHERE id = $1", [m.id]);
          await audit({ ...auditBase, action: "team.invite_decline" }, c);
          return { message: "You have declined the invitation." };
        }
        const already = await c.query(
          "SELECT id FROM team_members WHERE company_id = $1 AND user_id = $2 AND status = 'active'", [company.id, req.user.userId],
        );
        if (already.rows.length) {
          await c.query("UPDATE team_members SET status = 'declined', invite_token_hash = NULL WHERE id = $1", [m.id]);
          return { message: "You are already a member of this workspace.", companyName: company.data?.name || "" };
        }
        await c.query(
          "UPDATE team_members SET status = 'active', user_id = $2, invite_token_hash = NULL, activated_at = now() WHERE id = $1",
          [m.id, req.user.userId],
        );
        await audit({ ...auditBase, action: "team.invite_accept" }, c);
        return { message: "Invitation accepted!", companyName: company.data?.name || "" };
      });
    });
  }
}

export async function memberCount(companyId) {
  const r = await one("SELECT count(*)::int AS n FROM team_members WHERE company_id = $1 AND status = 'active'", [companyId]);
  return r?.n || 0;
}
