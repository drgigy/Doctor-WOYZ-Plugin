const REPORT_FIELDS = [
  "patientName",
  "patientAge",
  "patientSex",
  "patientUhid",
  "presentingComplaint",
  "historyOfPresentIllness",
  "pastMedicalHistory",
  "allergies",
  "familyHistory",
  "personalHistory",
  "examinationFindings",
  "reviewOfInvestigations",
  "currentMedication",
  "provisionalDiagnosis",
  "treatmentPlan"
];

const REPORT_FIELD_DESCRIPTIONS = {
  patientName: "Patient name exactly as spoken, otherwise NIL.",
  patientAge: "Patient age exactly as spoken, otherwise NIL.",
  patientSex: "Patient sex or gender exactly as spoken, otherwise NIL.",
  patientUhid: "UHID exactly as spoken, otherwise NIL.",
  presentingComplaint: "Concise reason for today's encounter after cross-referencing the complete conversation: the main current complaints, referral reason, second-opinion request, review purpose, and any explicitly dictated investigation finding that the conversation clearly establishes as the reason for consultation. Preserve onset, duration, or reported interval change when spoken. Do not create a complaint from an isolated report or medicine. Use NIL when unsupported.",
  historyOfPresentIllness: "Clinically coherent, problem-oriented synthesis of the explicitly supported clinical course behind today's encounter. Include relevant onset, progression, associated symptoms, pertinent negatives, investigations, procedures, treatment, and response when spoken. Exclude unrelated remarks and symptoms unless the conversation clearly connects them. Never invent clinical relevance or causal links. Use NIL when unsupported.",
  pastMedicalHistory: "Established previous or chronic medical conditions, surgeries, admissions, or major past illnesses explicitly stated or clearly expressed in colloquial language anywhere in the conversation. Normalize colloquial condition names into standard clinical English only when context clearly indicates an established history. Do not infer diagnoses from symptoms, medicines, family history, or laboratory values. Use NIL when unsupported.",
  allergies: "Allergies explicitly spoken in the audio, otherwise NIL.",
  familyHistory: "Family history explicitly spoken in the audio, otherwise NIL.",
  personalHistory: "Personal history explicitly spoken in the audio, otherwise NIL.",
  examinationFindings: "Examination findings explicitly dictated by the doctor, otherwise NIL.",
  reviewOfInvestigations: "Only investigation reports and values explicitly spoken, otherwise NIL.",
  currentMedication: "Only medicines described as already being taken, one numbered medicine per line, otherwise NIL.",
  provisionalDiagnosis: "Most likely working or provisional diagnosis clearly supported by the complete consultation, investigation review, or doctor assessment. It need not be introduced by the words provisional diagnosis. Do not guess from isolated symptoms, medications, or general medical knowledge. Use NIL when unsupported.",
  treatmentPlan: "Plan, prescription, advice, orders, referral, follow-up, monitoring, reassurance, or conservative management clearly supported by the consultation. It need not be introduced by the words treatment plan. Never invent drug changes, doses, procedures, investigations, or follow-up, and never copy current medicines as new advice. Use NIL when unsupported."
};

const REPORT_SCHEMA = {
  type: "object",
  properties: Object.fromEntries(
    REPORT_FIELDS.map(field => [
      field,
      {
        type: "string",
        description: REPORT_FIELD_DESCRIPTIONS[field]
      }
    ])
  ),
  required: REPORT_FIELDS
};

const DICTATION_SCHEMA = {
  type: "object",
  properties: {
    text: {
      type: "string",
      description: "Faithful transcription of only the clearly spoken medical dictation, with grammar and punctuation corrected but no facts added or removed."
    }
  },
  required: ["text"]
};

const PRESCRIPTION_FIELDS = [
  "date",
  "patientName",
  "patientAge",
  "patientSex",
  "patientUhid",
  "medicationsAdvised"
];

const PRESCRIPTION_SCHEMA = {
  type: "object",
  properties: {
    date: { type: "string", description: "Dictated prescription date, or today's date when none was dictated." },
    patientName: { type: "string", description: "Patient name exactly as spoken, otherwise NIL." },
    patientAge: { type: "string", description: "Patient age exactly as spoken, otherwise NIL." },
    patientSex: { type: "string", description: "Patient sex or gender exactly as spoken, otherwise NIL." },
    patientUhid: { type: "string", description: "UHID exactly as spoken, otherwise NIL." },
    medicationsAdvised: { type: "string", description: "Only explicitly dictated medications, advice, investigations, and follow-up. Use the same style as the embedded Visit + Prescription Prescription section: Medications: with numbered medicine lines and Malayalam instruction lines, then Advice: for review/investigation/follow-up instructions. Never infer missing details." }
  },
  required: PRESCRIPTION_FIELDS
};

const MEDICAL_CERTIFICATE_FIELDS = [
  "date",
  "patientName",
  "patientAge",
  "patientSex",
  "patientUhid",
  "certificateBody"
];

const MEDICAL_CERTIFICATE_SCHEMA = {
  type: "object",
  properties: {
    date: { type: "string", description: "Dictated certificate date, or today's date when none was dictated." },
    patientName: { type: "string", description: "Patient name exactly as spoken, otherwise NIL." },
    patientAge: { type: "string", description: "Patient age exactly as spoken, otherwise NIL." },
    patientSex: { type: "string", description: "Patient sex or gender exactly as spoken, otherwise NIL." },
    patientUhid: { type: "string", description: "UHID exactly as spoken, otherwise NIL." },
    certificateBody: { type: "string", description: "Only the facts dictated for the medical certificate, with grammar and spelling corrected but no facts added, removed, or inferred." }
  },
  required: MEDICAL_CERTIFICATE_FIELDS
};

function buildVisitNotePrompt(mode = "ambient") {
  const dictationVisitMode = mode === "visitDictation";
  const visitFields = dictationVisitMode
    ? `Use this output meaning:
- patientName: Name.
- patientAge: Age.
- patientSex: Sex.
- patientUhid: UHID.
- presentingComplaint: Chief Complaints.
- historyOfPresentIllness: History of Present Illness.
- examinationFindings: Examination Findings.
- provisionalDiagnosis: Diagnosis.
- reviewOfInvestigations: Review of Investigations.
- allergies: Allergies.
- currentMedication: Current Medications.
- treatmentPlan: Orders / Advice / Follow-up.
- Use NIL for pastMedicalHistory, familyHistory, and personalHistory unless the
  doctor explicitly dictates them.`
    : "";
  return `
You are a clinical note assistant helping a doctor create a concise OPD medical
note from ambient audio.

Correct spelling and grammar. Keep the original meaning exactly.
Do not add, infer, assume, recommend, or hallucinate clinical information.
If something is unclear, omit that unclear detail. If a whole field has no
clearly dictated information, write "NIL".
Return only the requested JSON object. Do not return markdown. Do not use code
fences.

Output fields:
- patientName: Patient name if dictated, otherwise NIL.
- patientAge: Patient age if dictated, otherwise NIL.
- patientSex: Patient sex/gender if dictated, otherwise NIL.
- patientUhid: UHID exactly as dictated, otherwise NIL.
- presentingComplaint: Chief Complaints.
- historyOfPresentIllness: History of Present Illness.
- pastMedicalHistory: Past Medical or Surgical History.
- allergies: Allergies.
- familyHistory: Family History.
- personalHistory: Personal History.
- examinationFindings: Examination Findings.
- reviewOfInvestigations: Review of Investigations.
- currentMedication: Current Medications.
- provisionalDiagnosis: Diagnosis.
- treatmentPlan: Orders, advice, follow-up, investigations ordered, medication
  plan, referral, or review plan.

Rules:
- Return only the requested JSON object.
- Place the dictated information under the correct JSON field.
- Do not write "Not dictated"; use "NIL" only when no information was dictated
  for that field.
- Do not create extra fields.
- Never add clinical information that was not spoken.
- Preserve dictated brand names exactly and do not convert them to generic
  names.
- Translate Malayalam clinical content into professional clinical English.
- Transliterate patient names, medicine names, and place names into English.
- Preserve onset, duration, chronology, examination findings, investigation
  details, diagnosis, and advice exactly as spoken.
- Translate clearly dictated colloquial disease names into standard medical
  terms when they refer to established conditions: "sugar" or "sugar disease"
  means Diabetes mellitus; "pressure", "BP", or "blood pressure problem" means
  Hypertension; "cholesterol problem" means Dyslipidemia.
- Do not apply these disease-name translations when the word refers only to a
  test value, symptom, family history, uncertainty, or a denied condition.
- Do not infer a diagnosis from a medicine, investigation, or general medical
  knowledge.
- Current medicines must go in currentMedication.
- Newly advised medicines, changed medicines, investigations ordered, review
  instructions, and follow-up advice must go in treatmentPlan.
- Do not duplicate currentMedication into treatmentPlan unless the doctor
  explicitly says to continue, change, stop, or prescribe it.

Formatting rules:
- presentingComplaint: each complaint on a separate line.
- historyOfPresentIllness: one or two concise paragraphs.
- pastMedicalHistory: one item per line.
- allergies: one item per line.
- familyHistory: one item per line.
- personalHistory: one item per line.
- examinationFindings: bullet points or separate lines.
- currentMedication: numbered list, one medicine per line, with dose and
  frequency if dictated.
- provisionalDiagnosis: one diagnosis per line.
- treatmentPlan: one advice/order/medicine/follow-up item per line.
- If investigations, lab tests, imaging, EEG, NCS, scans, or follow-up tests
  are ordered, include them in treatmentPlan line by line.

Review of Investigations rules:
- Organize by test/report name and date when dictated.
- Put each investigation/report as a separate numbered item.
- Under each imaging/report item, place each finding on a separate line.
- For blood reports, include each value on a separate line with appropriate
  units.
- Do not include investigation names or values that were not dictated.

Investigation units:
Use standard units when values are dictated:
Haemoglobin g/dL; RBC millions/cumm; WBC cells/cumm; Total count cells/cumm;
Platelets lakhs/cumm; PCV %; Blood sugar mg/dL; HbA1c %; Creatinine mg/dL;
Urea mg/dL; Sodium mEq/L; Potassium mEq/L; Chloride mEq/L; Bilirubin mg/dL;
ALT U/L; AST U/L; ALP U/L; Albumin g/dL; Cholesterol mg/dL; Triglycerides
mg/dL; HDL mg/dL; LDL mg/dL; TSH mIU/L; INR no unit; PT seconds; APTT seconds;
ESR mm/hr; CRP mg/L; Troponin ng/mL; Uric Acid mg/dL; Calcium mg/dL; BNP pg/mL.

Example style for reviewOfInvestigations:
1. MRI Brain with MR Angiogram - 25 April 2026
- Acute infarct in the right periventricular white matter.
- MR angiography of the circle of Willis is unremarkable.
2. Blood Report - 23 March 2026
- Haemoglobin: 13.6 g/dL
- Total count: 13,620 cells/cumm
- Platelet count: 2.51 lakhs/cumm

Patient context:
Name: [patient name]
ID: [UHID]
Mobile: [mobile number]
Diagnosis/main symptom: [diagnosis]
${visitFields}
`.trim();
}

function buildDictationPrompt() {
  return `
You are an expert medical transcription assistant. Convert the recorded
Malayalam, English, or Kerala Manglish dictation into clear professional
clinical English suitable for pasting into an existing review note.

Rules:
- Return only the requested JSON object.
- Put the complete result in the text field as normal paragraphs.
- Preserve all clinical facts, chronology, medicines, doses, investigations,
  examination findings, assessment, advice, and follow-up exactly as dictated.
- Translate Malayalam clinical content and transliterate names into English.
- Correct grammar and punctuation, but never invent, infer, recommend, or add
  information that was not spoken.
- Do not split the result into a visit-note template or add section headings
  unless the doctor explicitly requests them.
`.trim();
}

function buildReplyLetterPrompt() {
  return `
You are a clinical reply letter drafting assistant.

Create a clean reply letter from the dictated audio.
Correct spelling and grammar and make sentences complete.
Do not add, infer, assume, or hallucinate any clinical information.
Do not remove anything that was dictated.
Return only the requested JSON object.

Use exactly this layout in the text field:
To,
Recipient doctor name
Recipient credentials or address line 1
Recipient credentials or address line 2

Main paragraph or paragraphs starting from the left-hand side.

Thank you

Rules:
- The first line must be exactly "To,".
- Put the dictated recipient doctor's name, credentials, department, hospital,
  or address in the next lines exactly as dictated.
- If the recipient block has multiple parts, put each part on its own line,
  for example doctor name, designation, hospital, city/place.
- Leave one blank line after the recipient doctor's block before starting the
  clinical paragraph.
- Do not write "Dear Doctor", "Dear Sir", "Sir", "Madam", "Respected", or any
  salutation.
- Do not write a title or heading such as "Reply Letter".
- Start the clinical paragraph directly from the left-hand side after the
  recipient block.
- Put "Thank you" at the end, one blank line below the final paragraph.
- Do not include the sender doctor's name, credentials, signature, or footer;
  the app adds those from Settings during print.
- Keep the original meaning exactly.
If a detail is not dictated, omit it. Do not write "NIL", "Not dictated", or
any placeholder line.

Never add clinical information that was not spoken.
`.trim();
}

function buildVisitPrescriptionPrompt() {
  return `
You are a clinical note assistant helping a doctor create a concise OPD medical
note with an embedded prescription from ambient audio.

Correct spelling and grammar. Keep the original meaning exactly.
Do not add, infer, assume, or hallucinate clinical information.
If something is unclear, write it as unclear instead of guessing.
Return only the requested JSON object. Put the complete plain text note in the
text field. Do not use markdown fences.

Use these headings, in this order, but omit a heading completely if no
information was dictated for that section:

Chief Complaints:

History of Present Illness:

Past Medical or Surgical History:

Allergies:

Examination Findings:

Review of Investigations:

Current Medications:

Diagnosis:

Orders:

Prescription:

Place the dictated information under the correct heading.
Do not write "Not dictated".
Do not create extra headings.

Formatting rules:
- Every heading and subheading must start on its own new line.
- Put one blank line between major headings.
- Never join headings with previous text. For example, do not write
  "Orders:CT BrainPrescription:Medications"; write Orders, Prescription, and
  Medications on separate lines.
- Chief Complaints: each complaint on a separate line.
- History of Present Illness: one or two concise paragraphs.
- Past Medical or Surgical History: line by line.
- Allergies: line by line.
- Examination Findings: bullet points or separate lines.
- Review of Investigations: organize by test/report name and date when
  dictated. Put each investigation/report as a separate numbered item. Under
  each imaging/report item, place each finding on a separate line. For blood
  reports, include each value on a separate line with appropriate units.
- Current Medications: numbered list, one medicine per line, with dose and
  frequency if dictated.
- Diagnosis: line by line.
- Orders: line by line. If investigations, lab tests, imaging, EEG/NCS, scans,
  or follow-up tests are ordered, always include them here line by line.
- Prescription: include only medicines that are prescribed, newly started,
  changed, or explicitly continued. Do not duplicate the Current Medications
  section unless those medicines are explicitly prescribed or continued in the
  visit.
- Inside Prescription, use exactly these subheadings when relevant:
  Medications:
  1. Tablet/Cap/Syrup/Inj brand name dose - clear English patient instruction
     with timing, duration, and food/administration instruction.
     Malayalam patient instruction for the same medicine.
  Advice:
  - Review/follow-up/investigation instructions line by line
- Do not write the word "Malayalam" before the Malayalam text. Put the
  Malayalam instruction directly below the English instruction.
- For each prescription medicine, keep the medicine name and dose as the first
  part of the line, then write a clear English instruction. Directly below it,
  write the same patient-facing instruction in Malayalam when possible.
- Do not translate medicine brand names into Malayalam. Keep medicine names and
  doses in English in both English and Malayalam instruction lines.
- Do not put advice such as "continue medicines", "review after one month", or
  investigation advice as numbered medicine rows.
- For each medication, keep brand name and dose clear. Put timing, duration,
  and before food/after food/empty stomach instructions in the same medication
  line if dictated.
- If a total tablet/capsule count is dictated for dispensing, do not convert it
  into a patient instruction like "Take 10 tablets." Write it as total quantity,
  for example "(total 10 tablets)", after the actual dose/timing instruction.
- In English prescription instructions, write duration in numeric form only,
  for example "1 month", "10 days", "2 weeks". Do not write "one month", "one
  more month", "for one more month", or vague words like "more" or "less".
- In Malayalam patient instruction lines, spell general counts and durations in
  Malayalam words instead of English numerals when possible, especially at the
  start of a line or sentence. Examples: "1 tablet" -> "ഒരു ഗുളിക", "10 days"
  -> "പത്ത് ദിവസം", "20 days" -> "ഇരുപത് ദിവസം", "1 month" -> "ഒരു മാസം",
  "2 weeks" -> "രണ്ട് ആഴ്ച".
- Keep drug names and doses in English/numerals inside Malayalam instruction
  lines, for example "Gabapin 300 mg" and "Levipil 250 mg" should remain in
  English.
- If one duration is dictated for a group of medicines, repeat that duration in
  every medication line. Do not leave duration implicit or blank for any
  prescribed medicine when a shared duration was spoken.
- Always write tablet medicines as "Tablet", not "Tab". When a tablet count is
  dictated, write it clearly as "1 tablet in the morning", "1 tablet at noon",
  or "1 tablet at night".
- When a specific clock time is dictated, keep the clock time in the
  instruction, for example "1 tablet at 7 AM before food".
- If only the word evening is dictated without a clock time, write it as night.
- Do not use internal labels like "morning:", "noon:", "night:", "bedtime:",
  "Duration:", or "Instructions:" in prescription lines. Write one clear
  patient-facing sentence after the medicine name.
- For tapering or step-down prescriptions, create one numbered medication entry
  for each step. Repeat the same medicine name in each entry. Write the phase
  clearly in the instruction, for example "First 20 days", "Next 20 days",
  "Next 20 days, then stop". Put the Malayalam version directly below each
  English tapering instruction without any label.
- If a lab appointment, investigation schedule, paper/lab schedule, imaging,
  EEG, NCS, CT, MRI, blood test, or any investigation order is dictated,
  include it under Prescription > Advice line by line, even if it is also
  written under Orders. Do not omit investigation orders from the embedded
  prescription.
- Do not repeat the same advice or investigation item in Prescription > Advice.
  If the same investigation is spoken more than once, include it only once.
- Do not merge tapering steps into one paragraph. Do not duplicate the same
  step.
- Do not include patient demographics inside the Prescription section.
- Preserve dictated brand names exactly and do not convert them to generic
  names.
- Translate clearly dictated colloquial disease names into standard medical
  terms when they refer to established conditions: "sugar" or "sugar disease"
  means Diabetes mellitus; "pressure", "BP", or "blood pressure problem" means
  Hypertension; "cholesterol problem" means Dyslipidemia.

Investigation units:
Use standard units when values are dictated:
Haemoglobin g/dL; RBC millions/cumm; WBC cells/cumm; Total count cells/cumm;
Platelets lakhs/cumm; PCV %; Blood sugar mg/dL; HbA1c %; Creatinine mg/dL;
Urea mg/dL; Sodium mEq/L; Potassium mEq/L; Chloride mEq/L; Bilirubin mg/dL;
ALT U/L; AST U/L; ALP U/L; Albumin g/dL; Cholesterol mg/dL; Triglycerides
mg/dL; HDL mg/dL; LDL mg/dL; TSH mIU/L; INR no unit; PT seconds; APTT seconds;
ESR mm/hr; CRP mg/L; Troponin ng/mL; Uric Acid mg/dL; Calcium mg/dL; BNP pg/mL.

Example style for Review of Investigations:
1. MRI Brain with MR Angiogram - 25 April 2026
   - Acute infarct in the right periventricular white matter.
   - MR angiography of the circle of Willis is unremarkable.
2. Blood Report - 23 March 2026
   - Haemoglobin: 13.6 g/dL
   - Total count: 13,620 cells/cumm
   - Platelet count: 2.51 lakhs/cumm

Never add clinical information that was not spoken.
`.trim();
}

function buildPrescriptionPrompt() {
  return `
You are an expert medical prescription transcription assistant. Convert the
recorded Malayalam, English, or Kerala Manglish prescription dictation into
the same prescription format used inside Visit + Prescription.

Rules:
- Return only the requested JSON object.
- Fill date only if dictated. If not dictated, use today's date.
- Fill patientName, patientAge, patientSex, and patientUhid only when each is
  explicitly dictated. Otherwise use "NIL".
- Put all prescription content in medicationsAdvised.
- Write medicationsAdvised so it can be printed in a prescription template:
  medicine rows must stay under Medications, and non-medicine instructions,
  review plans, tests, imaging, and follow-up must stay under Advice.
- medicationsAdvised must use this exact section style when relevant:
  Medications:
  1. Tablet/Cap/Syrup/Inj brand name dose - clear English patient instruction
     with timing, duration, and food/administration instruction.
     Malayalam patient instruction for the same medicine.
  Advice:
  - Review/follow-up/investigation instructions line by line
- Do not combine section headings and content into one continuous sentence.
- Do not write "Prescription:" inside medicationsAdvised.
- Do not write the word "Malayalam" before the Malayalam text. Put the
  Malayalam instruction directly below the English instruction.
- For each prescription medicine, keep the medicine name and dose as the first
  part of the line, then write a clear English instruction. Directly below it,
  write the same patient-facing instruction in Malayalam when possible.
- Do not translate medicine brand names into Malayalam. Keep medicine names and
  doses in English in both English and Malayalam instruction lines.
- Do not put advice such as "continue medicines", "review after one month", or
  investigation advice as numbered medicine rows.
- If investigations, lab tests, imaging, EEG/NCS, scans, or follow-up tests are
  ordered, include them under Advice line by line.
- Preserve drug names, doses, timings, durations, and instructions exactly as
  dictated.
- Every heading and subheading must start on its own new line.
- If a total tablet/capsule count is dictated for dispensing, do not convert it
  into a patient instruction like "Take 10 tablets." Write it as total quantity,
  for example "(total 10 tablets)", after the actual dose/timing instruction.
- In English prescription instructions, write duration in numeric form only,
  for example "1 month", "10 days", "2 weeks". Do not write "one month", "one
  more month", "for one more month", or vague words like "more" or "less".
- In Malayalam patient instruction lines, spell general counts and durations in
  Malayalam words instead of English numerals when possible, especially at the
  start of a line or sentence. Examples: "1 tablet" -> "ഒരു ഗുളിക", "10 days"
  -> "പത്ത് ദിവസം", "1 month" -> "ഒരു മാസം".
- Always write tablet medicines as "Tablet", not "Tab".
- If only the word evening is dictated without a clock time, write it as night.
- Do not use internal labels like "morning:", "noon:", "night:", "Duration:",
  or "Instructions:" in prescription lines. Write one clear patient-facing
  sentence after the medicine name.
- Never invent, infer, recommend, or add information that was not spoken.
`.trim();
}

function buildMedicalCertificatePrompt() {
  return `
You are an expert medical certificate transcription assistant. Convert the
recorded Malayalam, English, or Kerala Manglish medical certificate dictation
into a clean professional medical certificate.

Rules:
- Return only the requested JSON object.
- Fill date only if dictated. If not dictated, use today's date.
- Fill patientName, patientAge, patientSex, and patientUhid only when each is
  explicitly dictated. Otherwise use "NIL". Preserve the UHID exactly.
- Put the certificate wording in certificateBody.
- The certificateBody must begin with "This is to certify that" and should be
  written as one or more clear paragraphs.
- If patient identifiers are dictated, include them naturally in the first
  sentence of certificateBody, for example patient name, age, sex/gender, and
  UHID. Do not include any identifier that was not dictated.
- Correct grammar, spelling, punctuation, and sentence flow.
- Do not add, remove, infer, recommend, or hallucinate any medical detail,
  diagnosis, duration, leave period, fitness status, date, restriction, or
  instruction that was not dictated.
- Do not convert uncertain words into new medical facts. Keep the dictated
  meaning intact.
- Do not include "To whomsoever it may concern", "Thank you", doctor
  credentials, or a signature inside certificateBody; those are added by the
  app layout.
`.trim();
}

function buildTaskPrompt(mode) {
  if (mode === "reviewDictation") {
    return "Transcribe this recording faithfully into the requested JSON. Correct only grammar, spelling, and punctuation. Do not add, remove, or infer clinical content.";
  }
  if (mode === "prescription") {
    return "Extract only the clearly dictated prescription details into the requested JSON. Preserve every drug name, dose, frequency, duration, and instruction exactly.";
  }
  if (mode === "medicalCertificate") {
    return "Convert only the clearly dictated facts into the requested medical-certificate JSON. Correct grammar and spelling without adding, removing, or inferring facts.";
  }
  if (mode === "replyLetter") {
    return "Draft a polite professional reply letter from only the clearly dictated facts into the requested JSON text field. Do not add, remove, or infer clinical content.";
  }
  if (mode === "visitPrescription") {
    return "Create one combined visit note with an embedded Prescription section in the requested JSON text field. Use only clearly dictated information.";
  }
  if (mode === "visitDictation") {
    return "Organize only the clearly dictated clinical information into the requested visit-note JSON. Use NIL for every unsupported field.";
  }
  return "Review the complete doctor-patient recording, cross-reference all clearly supported clinical details, and produce a mutually consistent structured visit note. Never infer missing details. Use NIL for every unsupported field.";
}

function extractJson(payload) {
  const text = payload.candidates?.[0]?.content?.parts
    ?.map(part => part.text || "")
    .join("")
    .trim();
  if (!text) throw new Error("The AI returned an empty response.");

  return JSON.parse(text);
}

function normalizeBloodUnits(text) {
  if (!text || text === "NIL") return text;
  const unitRules = [
    ["Hemoglobin", "g/dL"],
    ["Total count", "/uL"],
    ["Platelet count", "lakh/uL"],
    ["TLC", "lakh/uL"],
    ["ESR", "mm/hr"],
    ["HbA1c", "%"],
    ["Fasting", "mg/dL"],
    ["Fasting Sugar", "mg/dL"],
    ["Fasting Glucose", "mg/dL"],
    ["FBS", "mg/dL"],
    ["RBS", "mg/dL"],
    ["PPBS", "mg/dL"],
    ["Total Cholesterol", "mg/dL"],
    ["Triglycerides", "mg/dL"],
    ["HDL", "mg/dL"],
    ["LDL", "mg/dL"],
    ["SGOT", "U/L"],
    ["SGPT", "U/L"],
    ["ALP", "U/L"],
    ["Total bilirubin", "mg/dL"],
    ["Albumin", "g/dL"],
    ["Total protein", "g/dL"],
    ["CRP", "mg/L"],
    ["RF Factor", "IU/mL"],
    ["Calcium", "mg/dL"],
    ["TSH", "uIU/mL"],
    ["Vitamin B12", "pg/mL"],
    ["Vitamin D", "ng/mL"],
    ["Urea", "mg/dL"],
    ["Creatinine", "mg/dL"],
    ["Sodium", "mmol/L"],
    ["Potassium", "mmol/L"],
    ["Chloride", "mmol/L"]
  ];
  const withUnits = unitRules.reduce((current, [label, unit]) => {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedUnit = unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b(${escapedLabel})(:?\\s+)(\\d+(?:\\.\\d+)?)(?!\\d)(?!\\.\\d)(?:\\s*${escapedUnit})?`, "gi");
    return current.replace(pattern, (_, matchedLabel, separator, value) => {
      const labelText = matchedLabel.replace(/\b\w/g, character => character.toUpperCase());
      return `${labelText}: ${value}${unit === "%" ? "%" : ` ${unit}`}`;
    });
  }, text);
  return withUnits
    .replace(/\s+\/uL\b/g, "/uL")
    .replace(/\s+%/g, "%");
}

function formatMedicationLikeText(text) {
  if (!text || text === "NIL") return text;
  return text
    .replace(/([a-z)])(\d+[\.)])(?=\s*[A-Z])/g, "$1\n$2")
    .replace(/\)(?=[A-Z])/g, ")\n")
    .replace(/\.(?=\s*[A-Z][A-Za-z0-9-]*(?:\s+\d|\s+\(|\s+-|\s+one|\s+half|\s+two|\s+three|\s+four|\s+tablet|\s+capsule))/g, ".\n")
    .replace(/\s*(?=\b(?:Tab|Tablet|Cap|Capsule|Inj|Injection|Syp|Syrup)\s+[A-Z])/g, "\n")
    .split(/\n|;|,(?=\s*[A-Z][A-Za-z0-9-]+\s+\d)/)
    .map(line => line
      .trim()
      .replace(/^\d+[\.)]\s*/, "")
      .replace(/^[-•]\s*/, "")
      .replace(/\s*\d+[\.)]\s*$/, "")
      .trim())
    .filter(Boolean)
    .join("\n");
}

function numberMedicationItems(text) {
  const formatted = formatMedicationLikeText(text);
  if (!formatted || formatted === "NIL") return formatted;
  return formatted
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => `${index + 1}. ${line}`)
    .join("\n");
}

function numberPrescriptionItems(text) {
  const formatted = formatMedicationLikeText(text);
  if (!formatted || formatted === "NIL") return formatted;
  return formatted
    .replace(/([a-z)])(\d+[\.)])(?=\s*[A-Z])/g, "$1\n$2")
    .split("\n")
    .map(line => line
      .trim()
      .replace(/^\d+[\.)]\s*/, "")
      .replace(/^[-•]\s*/, "")
      .replace(/\s*\d+[\.)]\s*$/, "")
      .trim())
    .filter(Boolean)
    .map((line, index) => `${index + 1}. ${line}`)
    .join("\n");
}

function formatCurrentMedication(text) {
  return numberMedicationItems(text);
}

function formatTreatmentPlan(text) {
  return formatMedicationLikeText(text);
}

function splitInvestigationFindings(line) {
  const trimmed = line.replace(/^[-•]\s*/, "").trim();
  if (!trimmed) return [];
  const bloodLabel = "(?:Hemoglobin|Total count|Platelet count|TLC|ESR|HbA1c|Fasting|Fasting Sugar|Fasting Glucose|FBS|RBS|PPBS|Total Cholesterol|Triglycerides|HDL|LDL|SGOT|SGPT|ALP|Total bilirubin|Albumin|Total protein|CRP|RF Factor|Calcium|TSH|Vitamin B12|Vitamin D|Urea|Creatinine|Sodium|Potassium|Chloride)";
  return trimmed
    .replace(new RegExp(`\\s*-\\s*(?=${bloodLabel}\\b)`, "gi"), "\n")
    .replace(/\s+-\s+(?=[A-Za-z][A-Za-z0-9 /()%+-]{1,40}:)/g, "\n")
    .replace(/\.\s+(?=[A-Za-z][A-Za-z0-9 /()%+-]{1,40}:)/g, "\n")
    .split("\n")
    .map(item => item.trim().replace(/^[-•]\s*/, ""))
    .filter(Boolean)
    .map(item => `- ${item.replace(/\.$/, "")}.`);
}

function formatReviewOfInvestigations(text) {
  if (!text || text === "NIL") return text;
  const reportHeading = "(?:mri|ct|eeg|ncv|emg|doppler|carotid|usg|ecg|echo|holter|blood reports?|blood investigations?|x[- ]?ray|mra|mrv|pet|spect)";
  const normalizedText = text
    .replace(/\b(?:NIL|not available)\.?\s*(?=\d+\.\s*[A-Za-z])/gi, "\n")
    .replace(/(\d+\.\s*[A-Za-z][A-Za-z ]+\([^)]+\))\s*-\s*/g, "$1\n- ")
    .replace(/\s*-\s*(?=[A-Za-z][A-Za-z0-9 /()%+-]{1,40}:)/g, "\n- ")
    .replace(new RegExp(`\\s*(?=\\d+\\.\\s+${reportHeading}\\b)`, "gi"), "\n");
  const lines = normalizedText.split("\n").map(line => line.trim()).filter(Boolean);
  const sections = [];
  let currentSection = null;
  lines.forEach(line => {
    let cleaned = line.replace(/^•\s*/, "- ").replace(/^[-•]\s*/, "- ").trim();
    if (/^-\s*[^:]{1,45}:\s*(?:NIL|not available)?\.?$/i.test(cleaned)) return;
    const numberedHeading = cleaned.match(new RegExp(`^\\d+\\.\\s*(${reportHeading}\\b.*)$`, "i"));
    if (numberedHeading) {
      currentSection = { heading: numberedHeading[1].replace(/:$/, "").trim(), items: [] };
      sections.push(currentSection);
      return;
    }
    if (new RegExp(`^${reportHeading}\\b`, "i").test(cleaned)) {
      currentSection = { heading: cleaned.replace(/:$/, ""), items: [] };
      sections.push(currentSection);
      return;
    }
    if (!cleaned.startsWith("- ")) cleaned = `- ${cleaned}`;
    if (!currentSection) {
      currentSection = { heading: "", items: [] };
      sections.push(currentSection);
    }
    currentSection.items.push(...splitInvestigationFindings(cleaned));
  });
  const output = sections
    .filter(section => section.items.length || !section.heading)
    .flatMap((section, index) => section.heading ? [`${index + 1}. ${section.heading}`, ...section.items] : section.items);
  return output.length ? output.join("\n") : "NIL";
}

function sanitizeTreatmentPlan(report) {
  const plan = report.treatmentPlan || "NIL";
  if (plan === "NIL") return report;
  const lower = plan.toLowerCase();
  const advisedCount = (lower.match(/\badvised to take\b/g) || []).length;
  const currentMedication = (report.currentMedication || "").toLowerCase();
  const planLines = lower.split(/\n+|\. /).map(line => line.trim()).filter(Boolean);
  const overlapCount = planLines.filter(line => (
    line.length > 8 && currentMedication.includes(line.replace(/^advised to take\s+/, ""))
  )).length;
  const managementLanguage = /\b(treatment plan|plan|advised|prescribed|start|stop|increase|decrease|continue|follow[- ]?up|review|refer|physiotherapy|investigation|repeat|avoid|monitor|observe|reassure|conservative|admission|surgery|procedure|exercise|lifestyle|diet|return|come back)\b/i.test(plan);

  if ((advisedCount >= 4 && overlapCount >= 1) || overlapCount >= 2) {
    return { ...report, treatmentPlan: "NIL" };
  }
  if (!managementLanguage && planLines.length > 3) {
    return { ...report, treatmentPlan: "NIL" };
  }
  return report;
}

function extractReport(payload) {
  const parsed = extractJson(payload);
  const report = Object.fromEntries(
    REPORT_FIELDS.map(field => [
      field,
      typeof parsed[field] === "string" && parsed[field].trim()
        ? parsed[field].trim()
        : "NIL"
    ])
  );
  report.reviewOfInvestigations = formatReviewOfInvestigations(normalizeBloodUnits(report.reviewOfInvestigations));
  report.currentMedication = formatCurrentMedication(report.currentMedication);
  report.treatmentPlan = formatTreatmentPlan(report.treatmentPlan);
  return sanitizeTreatmentPlan(report);
}

function extractDictation(payload) {
  const parsed = extractJson(payload);
  if (typeof parsed.text !== "string" || !parsed.text.trim()) {
    throw new Error("The AI returned an empty transcription.");
  }
  return parsed.text.trim();
}

function extractPrescription(payload) {
  const parsed = extractJson(payload);
  const prescription = Object.fromEntries(
    PRESCRIPTION_FIELDS.map(field => [
      field,
      typeof parsed[field] === "string" && parsed[field].trim()
        ? parsed[field].trim()
        : "NIL"
    ])
  );
  prescription.medicationsAdvised = numberPrescriptionItems(prescription.medicationsAdvised);
  if (!prescription.date || prescription.date === "NIL") {
    prescription.date = new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Kolkata"
    });
  }
  return prescription;
}

function extractMedicalCertificate(payload) {
  const parsed = extractJson(payload);
  const certificate = Object.fromEntries(
    MEDICAL_CERTIFICATE_FIELDS.map(field => [
      field,
      typeof parsed[field] === "string" && parsed[field].trim()
        ? parsed[field].trim()
        : "NIL"
    ])
  );
  if (!certificate.date || certificate.date === "NIL") {
    certificate.date = new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Kolkata"
    });
  }
  return certificate;
}

async function callProcessingService({ apiKey, model, audioBase64, mimeType, mode }) {
  const reviewDictationMode = mode === "reviewDictation";
  const replyLetterMode = mode === "replyLetter";
  const visitPrescriptionMode = mode === "visitPrescription";
  const prescriptionMode = mode === "prescription";
  const medicalCertificateMode = mode === "medicalCertificate";
  let schema = REPORT_SCHEMA;
  let prompt = buildVisitNotePrompt(mode);
  if (reviewDictationMode) {
    schema = DICTATION_SCHEMA;
    prompt = buildDictationPrompt();
  } else if (replyLetterMode) {
    schema = DICTATION_SCHEMA;
    prompt = buildReplyLetterPrompt();
  } else if (visitPrescriptionMode) {
    schema = DICTATION_SCHEMA;
    prompt = buildVisitPrescriptionPrompt();
  } else if (prescriptionMode) {
    schema = PRESCRIPTION_SCHEMA;
    prompt = buildPrescriptionPrompt();
  } else if (medicalCertificateMode) {
    schema = MEDICAL_CERTIFICATE_SCHEMA;
    prompt = buildMedicalCertificatePrompt();
  }
  const taskPrompt = buildTaskPrompt(mode);
  const serviceHost = ["generativelanguage.", "goo", "gleapis.com"].join("");
  const response = await fetch(
    `https://${serviceHost}/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: prompt
          }]
        },
        contents: [{
          role: "user",
          parts: [
            {
              text: taskPrompt
            },
            {
              inline_data: {
                mime_type: mimeType,
                data: audioBase64
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0,
          thinkingConfig: {
            thinkingBudget: -1
          },
          responseMimeType: "application/json",
          responseSchema: schema
        }
      })
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error?.message || "Secure processing failed.");
    error.status = response.status;
    throw error;
  }

  if (reviewDictationMode || replyLetterMode || visitPrescriptionMode) return { text: extractDictation(payload) };
  if (prescriptionMode) return { prescription: extractPrescription(payload) };
  if (medicalCertificateMode) return { medicalCertificate: extractMedicalCertificate(payload) };
  return { report: extractReport(payload) };
}

function normalizeMode(value) {
  return ["ambient", "reviewDictation", "visitDictation", "prescription", "medicalCertificate", "replyLetter", "visitPrescription"].includes(value)
    ? value
    : "ambient";
}

export async function generateSecureNote({ apiKey, audioBase64, mimeType, mode: requestedMode }) {
  const mode = normalizeMode(requestedMode);
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("Add your authorization key in Settings before recording.");
  }
  if (typeof audioBase64 !== "string" || !audioBase64.length) {
    throw new Error("The recording is empty.");
  }
  if (audioBase64.length > 28_000_000) {
    throw new Error("The recording is too large. Please make a shorter recording.");
  }
  if (typeof mimeType !== "string" || !mimeType.startsWith("audio/")) {
    throw new Error("Unsupported recording format.");
  }

  const modelPrefix = ["ge", "mini"].join("");
  const primaryModel = `${modelPrefix}-2.5-flash`;
  const liteModel = `${modelPrefix}-2.5-flash-lite`;
  const models = mode === "ambient"
    ? [primaryModel]
    : ["reviewDictation", "medicalCertificate", "replyLetter"].includes(mode)
      ? [liteModel, primaryModel]
      : [primaryModel, liteModel];
  const errors = [];

  for (const model of models) {
    try {
      const result = await callProcessingService({
        apiKey: apiKey.trim(),
        model,
        audioBase64,
        mimeType,
        mode
      });
      return { ...result, mode, model };
    } catch (error) {
      errors.push(error.message);
      const retryable =
        error.status === 400 ||
        error.status === 403 ||
        error.status === 404 ||
        error.status === 429 ||
        error.status === 503 ||
        /model|quota|billing|permission|not found|high demand|overload|temporar|try again/i.test(error.message);
      if (!retryable) break;
    }
  }

  console.error("Visit note generation failed:", errors);
  const combinedError = errors.join(" | ");
  if (/quota|rate limit|resource exhausted/i.test(combinedError)) {
    throw new Error("The processing quota has been reached. Check service usage or billing.");
  }
  if (/key|permission|forbidden|billing/i.test(combinedError)) {
    throw new Error("The authorization key or billing configuration does not allow this request.");
  }
  throw new Error(`The visit note could not be generated. ${combinedError.slice(0, 300)}`);
}
