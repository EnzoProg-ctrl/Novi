/**
 * Turns an uploaded file into plain text for the rest of the pipeline.
 *
 *   text        read as is
 *   pptx, docx  unzipped and read here: they are zip archives of XML, so no AI
 *               call (and no quota) is needed
 *   pdf, image  read by Gemini, which sees the page itself, so scanned PDFs,
 *               photos of handwritten notes and diagrams work too
 *
 * Legacy .ppt and .doc are binary formats nothing here can read; the upload
 * form already turns them away, and this says so plainly if one gets through.
 */

import { strFromU8, unzipSync } from "npm:fflate@0.8.2";
import { readWithGemini } from "../_shared/ai/gemini.ts";
import { UserError } from "../_shared/security.ts";

/** A failure the student can act on. Its message is shown on the material. */
export class ExtractError extends UserError {}

export type Extracted = { text: string; pageCount: number | null; model: string | null };

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

/**
 * Some browsers send no type for HEIC photos or send a generic one, so trust
 * the extension over the recorded MIME type when they disagree.
 */
function mimeFor(sourceType: string, path: string, recorded: string | null): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (MIME_BY_EXT[ext]) return MIME_BY_EXT[ext];
  if (recorded && recorded !== "application/octet-stream" && !recorded.startsWith("text/")) {
    return recorded;
  }
  return sourceType === "pdf" ? "application/pdf" : "image/jpeg";
}

export async function extractText(
  file: Blob,
  { sourceType, storagePath, mimeType, maxChars, signal, inlineMaxBytes }: {
    sourceType: string;
    storagePath: string;
    mimeType: string | null;
    maxChars: number;
    /** The run's time budget. */
    signal?: AbortSignal;
    /** Only for testing the large-file route with a small file. */
    inlineMaxBytes?: number;
  },
): Promise<Extracted> {
  const ext = storagePath.split(".").pop()?.toLowerCase();
  if (ext === "ppt" || ext === "doc") {
    throw new ExtractError(
      `Old .${ext} files can't be read. Save it as .${ext}x or PDF and upload that instead.`,
    );
  }

  if (sourceType === "text") {
    return { text: (await file.text()).trim(), pageCount: null, model: null };
  }

  if (sourceType === "pptx" || sourceType === "docx") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      throw new ExtractError(
        `That file isn't a valid .${sourceType}. If it's an older .${sourceType.slice(0, 3)} ` +
          `file, save it as .${sourceType} or PDF and upload it again.`,
      );
    }
    const result = sourceType === "pptx" ? readPptx(bytes) : readDocx(bytes);
    if (result.text.length < 40) {
      throw new ExtractError(
        sourceType === "pptx"
          ? "These slides have almost no text (they may be mostly pictures). Export the deck as a PDF and upload that, so Novi can read the slides themselves."
          : "That document has no readable text.",
      );
    }
    return { ...result, model: null };
  }

  if (sourceType === "pdf" || sourceType === "image") {
    const mime = mimeFor(sourceType, storagePath, mimeType);
    const { text, model } = await readWithGemini(file, mime, sourceType, maxChars, { signal, inlineMaxBytes });
    if (!text) {
      throw new ExtractError(
        sourceType === "image"
          ? "Novi couldn't find any study material in that photo. Try a sharper, well-lit photo of the page."
          : "Novi couldn't find any readable text in that PDF.",
      );
    }
    return { text, pageCount: null, model };
  }

  throw new ExtractError(`${sourceType} files aren't supported yet.`);
}

// ── Office files ────────────────────────────────────────────────

/** XML entities the Office formats actually use. */
function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Text of each paragraph in a chunk of DrawingML (`a:`) or WordprocessingML
 * (`w:`) XML. Run text is joined within a paragraph; tabs and line breaks are
 * kept so lists and tables stay readable.
 */
function paragraphs(xml: string, ns: "a" | "w"): string[] {
  const out: string[] = [];
  const para = new RegExp(`<${ns}:p[\\s>][\\s\\S]*?</${ns}:p>`, "g");
  // Exactly <a:t> / <w:t>, not <a:tbl>, <w:tab/> or <w:tc>.
  const piece = new RegExp(`<${ns}:t(?:\\s[^>]*)?>([^<]*)</${ns}:t>|<${ns}:(tab|br)\\b[^>]*/>`, "g");
  for (const [p] of xml.matchAll(para)) {
    let line = "";
    for (const m of p.matchAll(piece)) {
      if (m[1] !== undefined) line += decode(m[1]);
      else line += m[2] === "tab" ? "\t" : "\n";
    }
    line = line.replace(/[ \t]+$/gm, "").trim();
    if (line) out.push(line);
  }
  return out;
}

/** Unzips only the entries wanted, so embedded media is never inflated. */
function unzip(bytes: Uint8Array, wanted: (name: string) => boolean): Record<string, string> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      // Skip anything implausibly large for XML (a zip bomb, or not XML at all).
      filter: (f) => wanted(f.name) && f.originalSize < 25 * 1024 * 1024,
    });
  } catch {
    throw new ExtractError("That file is damaged or isn't a real Office file, so it couldn't be opened.");
  }
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strFromU8(v)]));
}

/** Relationship id -> target, from a .rels file. */
function relTargets(rels: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of (rels ?? "").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/\bId="([^"]+)"/)?.[1];
    const target = m[0].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) map.set(id, target);
  }
  return map;
}

const slideNumber = (path: string) => Number(path.match(/(\d+)\.xml$/)?.[1] ?? 0);

/**
 * Slides in presentation order (not file-name order, which goes stale when
 * slides are moved), each with its speaker notes.
 */
function readPptx(bytes: Uint8Array): { text: string; pageCount: number } {
  const xml = unzip(bytes, (n) =>
    n === "ppt/presentation.xml" ||
    n === "ppt/_rels/presentation.xml.rels" ||
    /^ppt\/slides\/slide\d+\.xml$/.test(n) ||
    /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(n) ||
    /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n));

  const presRels = relTargets(xml["ppt/_rels/presentation.xml.rels"]);
  let order = [...(xml["ppt/presentation.xml"] ?? "").matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)]
    .map((m) => presRels.get(m[1]))
    .filter((t): t is string => Boolean(t))
    .map((t) => `ppt/${t.replace(/^\.?\/?/, "").replace(/^ppt\//, "")}`)
    .filter((p) => xml[p] !== undefined);
  if (order.length === 0) {
    order = Object.keys(xml)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => slideNumber(a) - slideNumber(b));
  }

  const sections = order.map((path, i) => {
    const body = paragraphs(xml[path], "a");
    const rels = relTargets(xml[path.replace("slides/", "slides/_rels/") + ".rels"]);
    const notesTarget = [...rels.values()].find((t) => t.includes("notesSlide"));
    const notesPath = notesTarget ? `ppt/notesSlides/${notesTarget.split("/").pop()}` : null;
    // Drop the slide-number field that every notes page carries.
    const notesXml = notesPath ? (xml[notesPath] ?? "").replace(/<a:fld\b[\s\S]*?<\/a:fld>/g, "") : "";
    const notes = paragraphs(notesXml, "a");

    const parts = [`## Slide ${i + 1}`, ...body];
    if (notes.length) parts.push("", `Speaker notes: ${notes.join(" ")}`);
    return parts.join("\n");
  });

  return { text: sections.join("\n\n").trim(), pageCount: order.length };
}

function readDocx(bytes: Uint8Array): { text: string; pageCount: null } {
  const xml = unzip(bytes, (n) => n === "word/document.xml");
  const doc = xml["word/document.xml"];
  if (!doc) throw new ExtractError("That file isn't a valid Word document.");
  return { text: paragraphs(doc, "w").join("\n\n"), pageCount: null };
}
