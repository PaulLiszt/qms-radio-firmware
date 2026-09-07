// mailer.js — 经本机 Postfix（SMTP，宿主 25 端口）发送邮件。
// 容器内通过 docker-compose 的 host.docker.internal 映射访问宿主 Postfix。
// 调试可用 MAIL_DISABLED=1：不真发，只把验证码打到控制台。
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.MAIL_HOST || 'host.docker.internal';
const SMTP_PORT = parseInt(process.env.MAIL_PORT || '25', 10);
const MAIL_FROM = process.env.MAIL_FROM || 'noreply@ba4qms.top';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@ba4qms.top';
const MAIL_DISABLED = process.env.MAIL_DISABLED === '1';

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
      tls: { rejectUnauthorized: false },
    });
  }
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  if (MAIL_DISABLED) {
    console.log(`[mail:DISABLED] -> ${to} | ${subject}\n${text}`);
    return { disabled: true };
  }
  return getTransporter().sendMail({ from: MAIL_FROM, to, subject, text, html });
}

function verificationHtml(code) {
  return `<p>您的 <b>QMS电台</b> 注册验证码是：</p>` +
    `<p style="font-size:26px;font-weight:bold;letter-spacing:6px;">${code}</p>` +
    `<p>该验证码 10 分钟内有效，请勿泄露给他人。</p>`;
}
function verificationText(code) {
  return `您的 QMS电台 注册验证码是：${code}\n该验证码 10 分钟内有效，请勿泄露给他人。`;
}

async function sendVerificationCode(email, code) {
  return sendMail({
    to: email,
    subject: 'QMS电台 注册验证码',
    text: verificationText(code),
    html: verificationHtml(code),
  });
}

async function sendAppealNotification({ callsign, email, note }) {
  const text = `收到呼号申诉：\n呼号: ${callsign}\n联系邮箱: ${email}\n备注: ${note || '(无)'}\n` +
    `请在服务器 data/appeals/ 目录查看上传的操作证与电台执照图片，并人工审核。`;
  return sendMail({ to: ADMIN_EMAIL, subject: `呼号申诉：${callsign}`, text });
}

module.exports = { sendMail, sendVerificationCode, sendAppealNotification, ADMIN_EMAIL, MAIL_DISABLED, MAIL_FROM };
