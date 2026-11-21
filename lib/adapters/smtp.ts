// Real SMTP via nodemailer, with errors mapped to stable codes.
import nodemailer from "nodemailer";
import { AppError } from "../errors";
import type { Mailer, OutgoingEmail, SmtpConfig } from "./types";

function transport(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 12_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

export function mapSmtpError(e: unknown): AppError {
  const err = e as { code?: string; responseCode?: number; message?: string; response?: string };
  const detail = [err.code, err.responseCode, err.response || err.message].filter(Boolean).join(" | ");
  if (err.code === "EAUTH" || err.responseCode === 535 || err.responseCode === 534) return new AppError("smtp_auth", detail);
  if (err.code === "EENVELOPE" || err.responseCode === 550 || err.responseCode === 553) return new AppError("smtp_recipient", detail);
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNREFUSED", "ENOTFOUND"].includes(err.code || ""))
    return new AppError("smtp_connect", detail);
  if (/wrong version number|ssl|tls/i.test(err.message || "")) return new AppError("smtp_tls", detail);
  return new AppError("smtp_other", detail);
}

export const realMailer: Mailer = {
  async verify(cfg) {
    if (!cfg.host || !cfg.user || !cfg.pass) throw new AppError("smtp_missing");
    try {
      await transport(cfg).verify();
    } catch (e) {
      throw mapSmtpError(e);
    }
  },
  async send(cfg, msg: OutgoingEmail) {
    if (!cfg.host || !cfg.user || !cfg.pass) throw new AppError("smtp_missing");
    try {
      const info = await transport(cfg).sendMail({
        from: { name: cfg.fromName || cfg.fromEmail, address: cfg.fromEmail || cfg.user },
        replyTo: cfg.replyTo || undefined,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        messageId: msg.messageId,
        inReplyTo: msg.inReplyTo,
        references: msg.references,
        headers: msg.headers,
      });
      return { messageId: info.messageId || msg.messageId };
    } catch (e) {
      throw mapSmtpError(e);
    }
  },
};
