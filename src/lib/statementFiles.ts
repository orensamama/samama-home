// Reads a statement file in the browser (CSV / TXT, Excel .xlsx, PDF) into transactions.
// The Excel and PDF readers are large, so they are loaded only when such a file is chosen.

import {
  parseStatementText,
  parseTextTransactions,
  rowsToTransactions,
  type ParsedTransaction,
} from "@/lib/statementParse";

export const STATEMENT_ACCEPT = ".csv,.tsv,.txt,.xlsx,.pdf,text/csv,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** Israeli bank exports are often windows-1255, not UTF-8. */
function decodeText(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (!utf8.includes("�")) return utf8;
  try {
    return new TextDecoder("windows-1255").decode(buffer);
  } catch {
    return utf8;
  }
}

type PdfItem = { str: string; transform: number[] };

/** Lines of a PDF page: text items grouped by their height on the page, in reading order. */
function pdfLines(items: PdfItem[]): string[] {
  const rows: { y: number; items: PdfItem[] }[] = [];
  for (const item of items) {
    if (!item.str.trim()) continue;
    const y = item.transform[5];
    const row = rows.find((candidate) => Math.abs(candidate.y - y) < 3);
    if (row) row.items.push(item);
    else rows.push({ y, items: [item] });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((row) => {
    const text = row.items.map((item) => item.str).join(" ");
    // Hebrew reads right to left: the rightmost piece comes first.
    const rtl = /[֐-׿]/.test(text);
    const ordered = [...row.items].sort((a, b) => (rtl ? b.transform[4] - a.transform[4] : a.transform[4] - b.transform[4]));
    return ordered.map((item) => item.str.trim()).filter(Boolean).join(" ");
  });
}

async function readPdf(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const lines: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    lines.push(...pdfLines(content.items as unknown as PdfItem[]));
  }
  return lines.join("\n");
}

/** The transactions in a statement file. Throws an Error with a Hebrew message the UI can show. */
export async function readStatementFile(file: File, today: Date = new Date()): Promise<ParsedTransaction[]> {
  const extension = extensionOf(file.name);

  if (extension === "xls") {
    throw new Error("קבצי Excel ישנים (xls) לא נתמכים. שמרו את הקובץ כ-xlsx או כ-CSV ונסו שוב.");
  }

  if (extension === "xlsx") {
    try {
      const { readSheet } = await import("read-excel-file/universal");
      const rows = await readSheet(file);
      return rowsToTransactions(rows as unknown[][], today);
    } catch (error) {
      console.error("[import] could not read the Excel file", error);
      throw new Error("לא הצלחנו לקרוא את קובץ ה-Excel. נסו לשמור אותו כ-CSV.");
    }
  }

  if (extension === "pdf") {
    let text: string;
    try {
      text = await readPdf(await file.arrayBuffer());
    } catch (error) {
      console.error("[import] could not read the PDF", error);
      throw new Error("לא הצלחנו לקרוא את ה-PDF. אפשר להעתיק את הטקסט מהקובץ ולהדביק אותו בתיבת ההדבקה.");
    }
    return parseTextTransactions(text, today);
  }

  return parseStatementText(decodeText(await file.arrayBuffer()), today);
}
