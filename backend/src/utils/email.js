import nodemailer from "nodemailer";

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM || "Advanced Pro <no-reply@advancedpro.local>";

let transporter = null;

if (smtpHost && smtpUser && smtpPass) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
}

export async function sendResetCodeEmail({ to, code }) {
  if (!transporter) {
    console.log("[RESET-CODE]", to, code);
    return { skipped: true };
  }

  const subject = "رمز إعادة تعيين كلمة المرور";
  const text = `رمز إعادة تعيين كلمة المرور الخاص بك هو: ${code}\nالرمز صالح لمدة 10 دقائق.`;

  await transporter.sendMail({
    from: smtpFrom,
    to,
    subject,
    text,
    html: `
      <div style="font-family: Arial, sans-serif; direction: rtl;">
        <h2>رمز إعادة تعيين كلمة المرور</h2>
        <p>رمز التحقق الخاص بك هو:</p>
        <div style="font-size: 24px; font-weight: bold; margin: 12px 0;">${code}</div>
        <p>الرمز صالح لمدة 10 دقائق.</p>
      </div>
    `,
  });

  return { sent: true };
}
