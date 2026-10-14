import nodemailer from "nodemailer";

// Same mailer as the Campaign Panel: no-ops (logs) when SMTP_* isn't set,
// never throws into the caller's flow.
let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    });
  }
  return transporter;
}

export const APP_URL = process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Plain, clean email shell. `rows` renders as a small table (used for task lists).
export function emailHtml(opts: { heading: string; intro?: string; rows?: string[][]; head?: string[]; cta?: { label: string; href: string }; footer?: string }) {
  const table = opts.rows?.length
    ? `<table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:13px">
        ${opts.head ? `<tr>${opts.head.map((h) => `<th style="text-align:left;padding:8px;border-bottom:1px solid #e8e8e9;color:#6d6e6f;font-weight:600">${esc(h)}</th>`).join("")}</tr>` : ""}
        ${opts.rows.map((r) => `<tr>${r.map((c) => `<td style="padding:8px;border-bottom:1px solid #f1f1f1;color:#1e1f21">${esc(c)}</td>`).join("")}</tr>`).join("")}
      </table>`
    : "";
  return `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1e1f21">
    <div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#5b3fd1;text-transform:uppercase">TBM Post Production</div>
    <h2 style="font-size:20px;margin:8px 0 4px">${esc(opts.heading)}</h2>
    ${opts.intro ? `<p style="font-size:14px;line-height:1.5;color:#3d3e40">${esc(opts.intro).replace(/\n/g, "<br/>")}</p>` : ""}
    ${table}
    ${opts.cta ? `<a href="${opts.cta.href}" style="display:inline-block;background:#5b3fd1;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600">${esc(opts.cta.label)}</a>` : ""}
    ${opts.footer ? `<p style="font-size:12px;color:#6d6e6f;margin-top:24px">${esc(opts.footer)}</p>` : ""}
  </div>`;
}

export async function sendMail(to: string | string[], subject: string, html: string, cc?: string[]): Promise<{ ok: boolean; error?: string }> {
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!list.length) return { ok: false, error: "No recipient" };
  const t = getTransporter();
  if (!t) {
    console.log(`[mailer] SMTP not configured — skipped email to ${list.join(", ")}: ${subject}`);
    return { ok: false, error: "SMTP not configured" };
  }
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || "notifications@theboredmonkey.com",
      to: list.join(", "),
      cc: cc?.filter(Boolean).join(", ") || undefined,
      subject,
      html,
    });
    return { ok: true };
  } catch (err) {
    console.error(`[mailer] failed to send email to ${list.join(", ")}:`, err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
