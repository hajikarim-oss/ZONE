import nodemailer from "nodemailer";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

// Outgoing emails send directly to the designated recipients.
// If REDIRECT_ALL_EMAILS_TO is provided in environment variables, it will redirect; otherwise it delivers directly.
export const REDIRECT_ALL_EMAILS_TO = (process.env.REDIRECT_ALL_EMAILS_TO || "").trim();

export function isEmailEnabled(): boolean {
  if (process.env.DISABLE_EMAIL_NOTIFICATIONS === "true") return false;
  return Boolean(process.env.SMTP_HOST);
}

function getTransporter() {
  if (!isEmailEnabled()) return null;
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

export type SlackJiraCardOptions = {
  badgeText: string;
  badgeTone?: "blue" | "amber" | "orange" | "red" | "purple" | "green";
  issueKey?: string;
  brandName?: string | null;
  campaignName?: string | null;
  heading: string;
  intro?: string;
  calloutTitle?: string;
  calloutBody?: string;
  actionRequired?: string;
  fields?: { label: string; value: string }[];
  timelineSteps?: { time: string; label: string; active?: boolean; done?: boolean }[];
  head?: string[];
  rows?: string[][];
  cta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  footer?: string;
};

const TONE_PALETTE: Record<
  NonNullable<SlackJiraCardOptions["badgeTone"]>,
  { accent: string; badgeBg: string; badgeText: string; highlightBg: string; highlightBorder: string }
> = {
  blue: {
    accent: "#0C66E4",
    badgeBg: "#E9F2FF",
    badgeText: "#0055CC",
    highlightBg: "#F7FAFC",
    highlightBorder: "#0C66E4",
  },
  green: {
    accent: "#1F845A",
    badgeBg: "#DCFFF1",
    badgeText: "#216E4E",
    highlightBg: "#F7FCFA",
    highlightBorder: "#1F845A",
  },
  amber: {
    accent: "#E2B203",
    badgeBg: "#FFF7D6",
    badgeText: "#533F04",
    highlightBg: "#FFFDF5",
    highlightBorder: "#E2B203",
  },
  orange: {
    accent: "#E56910",
    badgeBg: "#FFEFE5",
    badgeText: "#A54800",
    highlightBg: "#FFF9F5",
    highlightBorder: "#E56910",
  },
  red: {
    accent: "#CA3521",
    badgeBg: "#FFEDEB",
    badgeText: "#AE2E19",
    highlightBg: "#FFF7F7",
    highlightBorder: "#CA3521",
  },
  purple: {
    accent: "#6E5DC6",
    badgeBg: "#F3F0FF",
    badgeText: "#5E4DB2",
    highlightBg: "#FAF8FF",
    highlightBorder: "#6E5DC6",
  },
};

/**
 * Premium, polished email layout:
 * - Natural, well-formatted typography (no mechanical template look)
 * - Concise, high-value executive summary
 * - Clear action highlight box
 * - Clean 2-column key/value metadata
 * - High-contrast CTA buttons
 */
export function slackJiraEmailHtml(opts: SlackJiraCardOptions): string {
  const palette = TONE_PALETTE[opts.badgeTone || "blue"];

  const metadataRows =
    opts.fields && opts.fields.length > 0
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:0;margin:20px 0;background:#F8F9FA;border:1px solid #E9ECEF;border-radius:8px;overflow:hidden;">
          <tbody>
            ${opts.fields
              .reduce<{ label: string; value: string }[][]>((acc, item, idx) => {
                if (idx % 2 === 0) acc.push([item]);
                else acc[acc.length - 1].push(item);
                return acc;
              }, [])
              .map(
                (pair, rowIdx, allRows) => `<tr>
                  ${pair
                    .map(
                      (f, colIdx) => `<td style="width:50%;padding:12px 16px;border-bottom:${
                        rowIdx === allRows.length - 1 ? "none" : "1px solid #E9ECEF"
                      };border-right:${colIdx === 0 && pair.length > 1 ? "1px solid #E9ECEF" : "none"};vertical-align:top;">
                        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#6C757D;margin-bottom:4px;">${esc(
                          f.label
                        )}</div>
                        <div style="font-size:13.5px;font-weight:600;color:#212529;line-height:1.4;">${esc(
                          f.value
                        )}</div>
                      </td>`
                    )
                    .join("")}
                  ${pair.length === 1 ? `<td style="width:50%;padding:12px 16px;border-bottom:${rowIdx === allRows.length - 1 ? "none" : "1px solid #E9ECEF"};"></td>` : ""}
                </tr>`
              )
              .join("")}
          </tbody>
        </table>`
      : "";

  const stepsTracker =
    opts.timelineSteps && opts.timelineSteps.length > 0
      ? `<div style="margin:20px 0;padding:14px 16px;background:#F8F9FA;border:1px solid #E9ECEF;border-radius:8px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6C757D;margin-bottom:10px;">Escalation Schedule & Checkpoints</div>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:12.5px;line-height:1.4;">
            ${opts.timelineSteps
              .map(
                (s) => `<tr>
                  <td style="padding:4px 0;width:24px;vertical-align:middle;color:${s.done ? "#1F845A" : s.active ? palette.accent : "#ADB5BD"};font-size:14px;">
                    ${s.done ? "✓" : s.active ? "➔" : "•"}
                  </td>
                  <td style="padding:4px 0;width:150px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11.5px;font-weight:${
                    s.active ? "700" : "500"
                  };color:${s.active ? "#212529" : "#6C757D"};">
                    ${esc(s.time)}
                  </td>
                  <td style="padding:4px 0;color:${s.active ? "#212529" : "#495057"};font-weight:${s.active ? "700" : "400"};">
                    ${esc(s.label)}
                  </td>
                </tr>`
              )
              .join("")}
          </table>
        </div>`
      : "";

  const tableRowsHtml = opts.rows?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:18px 0;font-size:13px;border:1px solid #E9ECEF;border-radius:8px;overflow:hidden;">
        ${
          opts.head
            ? `<tr style="background:#F8F9FA;">${opts.head
                .map(
                  (h) =>
                    `<th style="text-align:left;padding:10px 12px;border-bottom:1px solid #E9ECEF;color:#6C757D;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;">${esc(
                      h
                    )}</th>`
                )
                .join("")}</tr>`
            : ""
        }
        ${opts.rows
          .map(
            (r) =>
              `<tr>${r
                .map(
                  (c) =>
                    `<td style="padding:10px 12px;border-bottom:1px solid #F1F3F5;color:#212529;vertical-align:top;">${esc(
                      c
                    )}</td>`
                )
                .join("")}</tr>`
          )
          .join("")}
      </table>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(opts.heading)}</title>
</head>
<body style="margin:0;padding:24px 12px;background:#EDF0F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#212529;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;margin:0 auto;background:#FFFFFF;border-radius:10px;box-shadow:0 3px 12px rgba(0,0,0,0.06);overflow:hidden;border:1px solid #E2E8F0;">
    <!-- Top Accent Bar -->
    <tr>
      <td style="height:4px;background:${palette.accent};line-height:4px;font-size:4px;">&nbsp;</td>
    </tr>

    <!-- Header Strip -->
    <tr>
      <td style="padding:16px 24px;border-bottom:1px solid #E9ECEF;background:#FAFCFF;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="vertical-align:middle;">
              <span style="font-size:11.5px;font-weight:800;letter-spacing:0.06em;color:#0C66E4;text-transform:uppercase;">TBM Post Production</span>
              ${
                opts.issueKey
                  ? `<span style="margin-left:8px;font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:700;background:#E9ECEF;color:#212529;padding:2px 7px;border-radius:4px;">${esc(
                      opts.issueKey
                    )}</span>`
                  : ""
              }
              ${
                opts.brandName
                  ? `<span style="margin-left:6px;font-size:12px;font-weight:600;color:#6C757D;">/ ${esc(
                      opts.brandName
                    )}${opts.campaignName ? ` · ${esc(opts.campaignName)}` : ""}</span>`
                  : ""
              }
            </td>
            <td style="text-align:right;vertical-align:middle;">
              <span style="display:inline-block;background:${palette.badgeBg};color:${palette.badgeText};font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;padding:4px 9px;border-radius:4px;">
                ${esc(opts.badgeText)}
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Body Container -->
    <tr>
      <td style="padding:24px 26px;">
        <h1 style="font-size:19px;font-weight:700;line-height:1.35;margin:0 0 12px;color:#1A202C;">${esc(
          opts.heading
        )}</h1>

        ${
          opts.intro
            ? `<div style="font-size:14px;line-height:1.6;color:#334155;margin:0 0 18px;">${esc(
                opts.intro
              ).replace(/\n/g, "<br/>")}</div>`
            : ""
        }

        ${
          opts.actionRequired || opts.calloutBody
            ? `<div style="border-left:4px solid ${palette.highlightBorder};background:${palette.highlightBg};padding:14px 18px;border-radius:0 8px 8px 0;margin:18px 0;">
                <div style="font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;color:${palette.badgeText};margin-bottom:6px;">${esc(opts.calloutTitle || "Action Required")}</div>
                <div style="font-size:13.5px;color:#1E293B;line-height:1.6;">${esc(
                  opts.calloutBody || opts.actionRequired || ""
                ).replace(/\n/g, "<br/>")}</div>
              </div>`
            : ""
        }

        ${metadataRows}
        ${stepsTracker}
        ${tableRowsHtml}

        <!-- Action Buttons -->
        ${
          opts.cta || opts.secondaryCta
            ? `<div style="margin-top:24px;padding-top:18px;border-top:1px solid #E2E8F0;">
                ${
                  opts.cta
                    ? `<a href="${opts.cta.href}" style="display:inline-block;background:${palette.accent};color:#FFFFFF;text-decoration:none;padding:11px 20px;border-radius:6px;font-size:13.5px;font-weight:700;margin-right:10px;text-align:center;">${esc(
                        opts.cta.label
                      )}</a>`
                    : ""
                }
                ${
                  opts.secondaryCta
                    ? `<a href="${opts.secondaryCta.href}" style="display:inline-block;background:#F1F5F9;color:#1E293B;border:1px solid #CBD5E1;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:13.5px;font-weight:600;text-align:center;">${esc(
                        opts.secondaryCta.label
                      )}</a>`
                    : ""
                }
              </div>`
            : ""
        }

        ${
          opts.footer
            ? `<div style="font-size:11.5px;color:#94A3B8;margin-top:24px;padding-top:14px;border-top:1px solid #F1F5F9;line-height:1.5;">${esc(
                opts.footer
              )}</div>`
            : ""
        }
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Fallback emailHtml helper
export function emailHtml(opts: {
  heading: string;
  intro?: string;
  rows?: string[][];
  head?: string[];
  cta?: { label: string; href: string };
  footer?: string;
}) {
  return slackJiraEmailHtml({
    badgeText: "TBM NOTIFICATION",
    badgeTone: "blue",
    heading: opts.heading,
    intro: opts.intro,
    head: opts.head,
    rows: opts.rows,
    cta: opts.cta,
    footer: opts.footer,
  });
}

export async function sendMail(
  to: string | string[],
  subject: string,
  html: string,
  cc?: string[]
): Promise<{ ok: boolean; error?: string }> {
  let list = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!list.length) return { ok: false, error: "No recipient" };
  if (!isEmailEnabled()) {
    console.log(`[mailer] Email notifications are disabled — skipped email to ${list.join(", ")}: ${subject}`);
    return { ok: false, error: "Email notifications are disabled" };
  }

  let finalCc = cc?.filter(Boolean) || [];
  let finalSubject = subject;
  let finalHtml = html;

  // Only redirect if REDIRECT_ALL_EMAILS_TO is explicitly populated in .env
  if (REDIRECT_ALL_EMAILS_TO) {
    const originalTo = list.join(", ");
    const originalCc = finalCc.length ? ` (CC: ${finalCc.join(", ")})` : "";
    finalSubject = `[Original To: ${originalTo}${originalCc}] ${subject}`;
    finalHtml = `
      <div style="background:#fff3cd;border:1px solid #ffeeba;color:#856404;padding:12px 16px;border-radius:6px;font-family:Inter,sans-serif;font-size:13px;line-height:1.4;margin-bottom:20px;">
        <strong>⚠️ REDIRECTED TEST EMAIL</strong><br/>
        This email was intercepted and redirected to <strong>${REDIRECT_ALL_EMAILS_TO}</strong>.<br/>
        <strong>Original recipient(s):</strong> ${originalTo}${originalCc}
      </div>
      ${html}
    `;
    list = [REDIRECT_ALL_EMAILS_TO];
    finalCc = [];
  }

  const t = getTransporter();
  if (!t) {
    console.log(`[mailer] SMTP not configured — skipped email to ${list.join(", ")}: ${subject}`);
    return { ok: false, error: "SMTP not configured" };
  }
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || "TBM Post Production <sachin@theboredmonkey.com>",
      to: list.join(", "),
      cc: finalCc.length ? finalCc.join(", ") : undefined,
      subject: finalSubject,
      html: finalHtml,
    });
    console.log(`[mailer] Successfully delivered email to ${list.join(", ")}: ${finalSubject}`);
    return { ok: true };
  } catch (err) {
    console.error(`[mailer] Failed to send email to ${list.join(", ")}:`, err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
