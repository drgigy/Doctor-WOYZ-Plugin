const admin = require("firebase-admin");
const chromium = require("@sparticuz/chromium").default;
const fs = require("fs");
const PDFDocument = require("pdfkit");
const puppeteer = require("puppeteer-core");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

admin.initializeApp();

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const EMAIL_FROM = "Doctor WOYZ <notes@woyz.in>";
const ADMIN_EMAILS = new Set(["drgigy@gmail.com"]);
const FONT_REGULAR = require.resolve("@fontsource/noto-sans-malayalam/files/noto-sans-malayalam-malayalam-400-normal.woff");
const FONT_BOLD = require.resolve("@fontsource/noto-sans-malayalam/files/noto-sans-malayalam-malayalam-700-normal.woff");
const FONT_REGULAR_DATA_URI = `data:font/woff;base64,${fs.readFileSync(FONT_REGULAR).toString("base64")}`;
const FONT_BOLD_DATA_URI = `data:font/woff;base64,${fs.readFileSync(FONT_BOLD).toString("base64")}`;
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
        lines.push(line);
      }
    }
    lines.push("");
  }

  const footnote = cleanText(payload.footnote);
  if (footnote) {
    lines.push("Note");
    for (const line of footnote.split("\n")) lines.push(cleanText(line));
    lines.push("");
  }

  const credentials = cleanText(payload.doctorCredentials);
  if (credentials) lines.push("", ...credentials.split("\n").map(line => cleanText(line)).filter(Boolean));
  return lines.filter((line, index, all) => !(line === "" && all[index - 1] === ""));
}

function isMalayalamCharacter(character) {
  return /[\u0D00-\u0D7F]/u.test(character);
}

function nextNonSpaceIsMalayalam(text, startIndex) {
  for (let index = startIndex; index < text.length; index += 1) {
    const character = text[index];
    if (!/\s/u.test(character)) return isMalayalamCharacter(character);
  }
  return false;
}

function splitScriptRuns(text) {
  const runs = [];
  let current = "";
  let currentMalayalam = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const characterMalayalam = isMalayalamCharacter(character)
      || (/[\s\u200C\u200D]/u.test(character) && (currentMalayalam || nextNonSpaceIsMalayalam(text, index + 1)));
    if (current && characterMalayalam !== currentMalayalam) {
      runs.push({ text: current, malayalam: currentMalayalam });
      current = "";
    }
    current += character;
    currentMalayalam = characterMalayalam;
  }
  if (current) runs.push({ text: current, malayalam: currentMalayalam });
  return runs;
}

function usePdfFont(doc, malayalam, bold) {
  doc.font(malayalam ? (bold ? "NotoMalayalamBold" : "NotoMalayalam") : (bold ? "Helvetica-Bold" : "Helvetica"));
  if (malayalam && doc._font?.font?._tables) {
    // FontKit crashes on some Malayalam GPOS anchors. Disabling GPOS keeps the
    // text renderable instead of failing the whole email send.
    doc._font.font._tables.GPOS = null;
  }
}

function writePdfLine(doc, line) {
  if (!line) {
    doc.moveDown(0.45);
    return;
  }
  const isHeading = /^[A-Z0-9 /+().:-]+$/.test(line) && line.length < 80;
  const runs = splitScriptRuns(line);
  const baseOptions = {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      lineGap: isHeading ? 2 : 1
  };
  doc.fontSize(isHeading ? 12 : 10.5).fillColor(isHeading ? "#004270" : "#111827");
  runs.forEach((run, index) => {
    usePdfFont(doc, run.malayalam, isHeading);
    doc.text(run.text, {
      ...baseOptions,
      continued: index < runs.length - 1
    });
  });
  doc.moveDown(isHeading ? 0.35 : 0.2);
}

function makePdf(payload) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 52, right: 52, bottom: 52, left: 52 },
      info: {
        Title: cleanText(payload.title, "Visit Note"),
        Author: "Doctor WOYZ"
      }
    });
    const chunks = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.registerFont("NotoMalayalam", FONT_REGULAR);
    doc.registerFont("NotoMalayalamBold", FONT_BOLD);

    for (const line of buildPdfLines(payload)) {
      writePdfLine(doc, line);
    }

    doc.end();
  });
}

function injectPdfFonts(html) {
  const fontCss = `
    <style>
      @font-face {
        font-family: "Noto Sans Malayalam";
        font-style: normal;
        font-weight: 400;
        src: url("${FONT_REGULAR_DATA_URI}") format("woff");
      }
      @font-face {
        font-family: "Noto Sans Malayalam";
        font-style: normal;
        font-weight: 700;
        src: url("${FONT_BOLD_DATA_URI}") format("woff");
      }
      body, #printPreview {
        font-family: Arial, "Noto Sans Malayalam", sans-serif !important;
      }
    </style>
  `;
  const source = String(html || "");
  if (source.includes("</head>")) return source.replace("</head>", `${fontCss}</head>`);
  return `${fontCss}${source}`;
}

async function makePdfFromHtml(html) {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 980, height: 1320, deviceScaleFactor: 1 });
    await page.setJavaScriptEnabled(false);
    await page.setContent(injectPdfFonts(html), { waitUntil: "load" });
    await page.emulateMediaType("screen");
    const pdf = await page.pdf({
      width: "980px",
      height: "1320px",
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" }
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

async function makeEmailPdf(payload) {
  const printHtml = cleanText(payload.printHtml);
  if (printHtml) return makePdfFromHtml(printHtml);
  return makePdf(payload);
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
  const adminEmail = cleanText(decoded.email).toLowerCase();
  const isAdmin = ADMIN_EMAILS.has(adminEmail);
  if (!device || device.status !== "approved" || (!isAdmin && device.ownerUid !== decoded.uid)) {
    throw Object.assign(new Error("This device is not approved to send email."), { status: 403 });
  }
  return decoded;
}

exports.sendVisitNoteEmailHttp = onRequest(
  {
    region: "asia-south1",
    secrets: [RESEND_API_KEY],
    timeoutSeconds: 120,
    memory: "1GiB"
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

      const pdf = await makeEmailPdf(payload);
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
