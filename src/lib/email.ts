import nodemailer from "nodemailer";
import { env } from "$env/dynamic/private";

export async function sendEmail(
  to: string[], 
  subject: string, 
  text: string, 
  html?: string,
  attachments?: Array<{ filename: string; content: string }>
) {
  if (!env.GMAIL_USER || !env.GMAIL_PASS) {
    throw new Error("Gmail credentials not configured in environment variables");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: env.GMAIL_USER,
      pass: env.GMAIL_PASS,
    },
  });

  // send mail with defined transport object
  const info = await transporter.sendMail({
    from: `"Where is Curtis" <${env.GMAIL_USER}>`,
    to,
    subject,
    text,
    html: html || text,
    attachments
  });

  console.log("Message sent: %s", info.messageId);
  return info;
}