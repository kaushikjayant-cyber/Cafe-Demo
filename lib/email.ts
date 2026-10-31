import "server-only";

import { serverEnv } from "@/lib/env.server";

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

/** Sends through Resend's REST API. Throws with Resend's message if it refuses. */
export async function sendEmail(email: Email): Promise<void> {
  const { RESEND_API_KEY, RESEND_FROM } = serverEnv();
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
      reply_to: email.replyTo,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(`Resend ${response.status}: ${body.message ?? "unknown error"}`);
  }
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
