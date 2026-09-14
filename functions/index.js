const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

admin.initializeApp();

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const EMAIL_FROM = "Doctor WOYZ <notes@woyz.in>";
const ALLOWED_ORIGINS = new Set([
  "https://doctor.woyz.in",
  "https://drgigy.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://doctor.woyz.in";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function jsonResponse(res, status, body, origin) {
  res.set(corsHeaders(origin));
  res.status(status).json(body);
}

function cleanText(value, fallback = "") {
  const text = String(value || "").replace(/\r\n?/g, "\n").trim();
  return text || fallback;
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function normalizeEmail(value) {
  const email = String(value || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

function pdfSafeText(value) {
  return cleanText(value)
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
    .replace(/\t/g, " ");
}

function escapePdfText(value) {
  return pdfSafeText(value).replace(/[\\()]/g, "\\$&");
}

function wrapLine(value, max = 88) {
  const words = pdfSafeText(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function buildPdfLines(payload) {
  const lines = [];
  const header = stripHtml(payload.printHeaderHtml || "");
  if (header) lines.push(...header.split("\n").map(line => cleanText(line)).filter(Boolean), "");
  lines.push(cleanText(payload.title, "Visit Note"), "");

  const patient = payload.patient && typeof payload.patient === "object" ? payload.patient : {};
  const patientLines = [
    patient.date ? `Date: ${patient.date}` : "",
    patient.name ? `Name: ${patient.name}` : "",
    patient.age ? `Age: ${patient.age}` : "",
    patient.sex ? `Sex: ${patient.sex}` : "",
    patient.uhid ? `UHID: ${patient.uhid}` : ""
  ].filter(Boolean);
  if (patientLines.length) lines.push(...patientLines, "");

  const sections = Array.isArray(payload.sections) ? payload.sections.slice(0, 32) : [];
  for (const section of sections) {
    const heading = cleanText(section && section.title);
    const value = cleanText(section && section.value);
    if (!heading && !value) continue;
    if (heading) lines.push(heading.toUpperCase());
    if (value) {
      for (const rawLine of value.split("\n")) {
        const line = cleanText(rawLine);
        if (!line) {
          lines.push("");
          continue;
        }
        lines.push(...wrapLine(line));
      }
    }
    lines.push("");
  }

  const footnote = cleanText(payload.footnote);
  if (footnote) {
    lines.push("Note");
    for (const line of footnote.split("\n")) lines.push(...wrapLine(line));
    lines.push("");
  }

  const credentials = cleanText(payload.doctorCredentials);
  if (credentials) lines.push("", ...credentials.split("\n").map(line => cleanText(line)).filter(Boolean));
  return lines.filter((line, index, all) => !(line === "" && all[index - 1] === ""));
}

function makePdf(payload) {
  const width = 595.28;
  const height = 841.89;
  const marginX = 54;
  const marginTop = 64;
  const lineHeight = 16;
  const lines = buildPdfLines(payload);
  const pageCapacity = Math.floor((height - marginTop - 54) / lineHeight);
  const pages = [];
  for (let cursor = 0; cursor < lines.length; cursor += pageCapacity) {
    pages.push(lines.slice(cursor, cursor + pageCapacity));
  }
  if (!pages.length) pages.push(["Visit Note"]);

  const objects = [];
  const addObject = content => {
    objects.push(content);
    return objects.length;
  };

  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];
  const contentIds = [];

  for (const pageLines of pages) {
    const commands = ["BT", "/F1 11 Tf", "14 TL", `${marginX} ${height - marginTop} Td`];
    pageLines.forEach((line, index) => {
      if (index > 0) commands.push("T*");
      if (line) commands.push(`(${escapePdfText(line)}) Tj`);
    });
    commands.push("ET");
    const stream = commands.join("\n");
    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    contentIds.push(contentId);
    pageIds.push(null);
  }

  const pagesIdPlaceholder = objects.length + pages.length + 1;
  for (let index = 0; index < pages.length; index += 1) {
    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesIdPlaceholder} 0 R /MediaBox [0 0 ${width} ${height}] ` +
      `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`
    );
    pageIds[index] = pageId;
  }

  const pagesId = addObject(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "binary");
}

function emailBody(payload) {
  const title = cleanText(payload.title, "Visit Note");
  const patient = payload.patient && typeof payload.patient === "object" ? payload.patient : {};
  const name = cleanText(patient.name);
  return [
    `${title} attached as PDF.`,
    name ? `Patient: ${name}` : "",
    "",
    "Sent from Doctor WOYZ."
  ].filter(line => line !== "").join("\n");
}

async function verifyApprovedDevice(req, payload) {
  const authHeader = String(req.headers.authorization || "");
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) throw Object.assign(new Error("Device authentication is required."), { status: 401 });

  const decoded = await admin.auth().verifyIdToken(match[1]);
  const deviceId = cleanText(payload.deviceId);
  if (!deviceId) throw Object.assign(new Error("Device ID is missing."), { status: 400 });

  const snapshot = await admin.firestore().collection("deviceApprovals").doc(deviceId).get();
  const device = snapshot.exists ? snapshot.data() : null;
  if (!device || device.ownerUid !== decoded.uid || device.status !== "approved") {
    throw Object.assign(new Error("This device is not approved to send email."), { status: 403 });
  }
  return decoded;
}

exports.sendVisitNoteEmailHttp = onRequest(
  {
    region: "asia-south1",
    secrets: [RESEND_API_KEY],
    timeoutSeconds: 60,
    memory: "256MiB"
  },
  async (req, res) => {
    const origin = String(req.headers.origin || "");
    if (req.method === "OPTIONS") {
      res.set(corsHeaders(origin));
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      jsonResponse(res, 405, { error: "Method not allowed." }, origin);
      return;
    }

    try {
      const payload = req.body && typeof req.body === "object" ? req.body : {};
      await verifyApprovedDevice(req, payload);

      const to = normalizeEmail(payload.to);
      if (!to) throw Object.assign(new Error("A valid receiver email address is required."), { status: 400 });

      const pdf = makePdf(payload);
      const safeTitle = cleanText(payload.title, "Visit Note").replace(/[^\w.-]+/g, "_").slice(0, 80);
      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY.value()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [to],
          subject: cleanText(payload.title, "Visit Note"),
          text: emailBody(payload),
          attachments: [{
            filename: `${safeTitle || "Visit_Note"}.pdf`,
            content: pdf.toString("base64")
          }]
        })
      });

      const result = await resendResponse.json().catch(() => ({}));
      if (!resendResponse.ok) {
        console.error("Resend email failed", resendResponse.status, result);
        throw Object.assign(new Error(result.message || "Resend could not send the email."), { status: 502 });
      }

      jsonResponse(res, 200, { ok: true, id: result.id || null }, origin);
    } catch (error) {
      console.error("sendVisitNoteEmailHttp failed", error);
      jsonResponse(res, error.status || 500, { error: error.message || "Email could not be sent." }, origin);
    }
  }
);
