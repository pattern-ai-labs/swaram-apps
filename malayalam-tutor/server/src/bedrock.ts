import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
} from "@aws-sdk/client-bedrock-runtime";
import { config } from "./config.js";

const client = new BedrockRuntimeClient({ region: config.awsRegion });

export interface StudyBrief {
  title: string;
  summary: string; // Malayalam
  keyPoints: string[]; // Malayalam
  cleanedText: string; // faithful source text the tutor teaches from
  kind: "pdf" | "text";
}

/** Shared instruction. The tutor downstream is Malayalam, so summary/keyPoints
 * are produced in Malayalam while cleanedText stays faithful to the source. */
const JSON_INSTRUCTION =
  "You are preparing study material for a Malayalam-speaking voice tutor. " +
  "Respond with ONLY a single JSON object (no markdown, no code fences) with these keys:\n" +
  '- "title": a short title for the material (string)\n' +
  '- "summary": a 2-4 sentence summary IN MALAYALAM (string)\n' +
  '- "keyPoints": 3-8 key learning points IN MALAYALAM (array of strings)\n';

const PDF_INSTRUCTION =
  JSON_INSTRUCTION +
  '- "cleanedText": the full readable text extracted from the document, faithful to the source, with layout noise removed (string)\n' +
  "Extract the text accurately. Do not invent content.";

const TEXT_INSTRUCTION =
  JSON_INSTRUCTION +
  "Base everything strictly on the DOCUMENT text provided below. Do not invent content.";

function parseJsonLoose(raw: string): any {
  let t = raw.trim();
  if (t.startsWith("```")) {
    // strip ```json ... ``` fences if the model added them
    t = t.replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
  }
  // Fall back to the outermost {...} if there is stray prose around it.
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first > 0 || last < t.length - 1) {
    if (first !== -1 && last !== -1) t = t.slice(first, last + 1);
  }
  return JSON.parse(t);
}

async function converseForBrief(content: ContentBlock[]): Promise<any> {
  const out = await client.send(
    new ConverseCommand({
      modelId: config.bedrockModelId,
      messages: [{ role: "user", content }],
      inferenceConfig: { maxTokens: 64000, temperature: 0 },
    })
  );
  const text = out.output?.message?.content?.find((b) => "text" in b)?.text;
  if (!text) throw new Error("Bedrock returned no text content");
  return parseJsonLoose(text);
}

export async function briefFromPdf(
  bytes: Uint8Array,
  fallbackTitle: string
): Promise<StudyBrief> {
  const obj = await converseForBrief([
    { document: { format: "pdf", name: "lesson", source: { bytes } } },
    { text: PDF_INSTRUCTION },
  ]);
  return {
    title: String(obj.title ?? fallbackTitle).slice(0, 200),
    summary: String(obj.summary ?? ""),
    keyPoints: Array.isArray(obj.keyPoints) ? obj.keyPoints.map(String) : [],
    cleanedText: String(obj.cleanedText ?? ""),
    kind: "pdf",
  };
}

export async function briefFromText(
  text: string,
  fallbackTitle: string
): Promise<StudyBrief> {
  const obj = await converseForBrief([
    { text: `${TEXT_INSTRUCTION}\n\n--- DOCUMENT ---\n${text}` },
  ]);
  return {
    title: String(obj.title ?? fallbackTitle).slice(0, 200),
    summary: String(obj.summary ?? ""),
    keyPoints: Array.isArray(obj.keyPoints) ? obj.keyPoints.map(String) : [],
    // For pasted/plain text we keep the original verbatim — no round-trip risk.
    cleanedText: text,
    kind: "text",
  };
}
