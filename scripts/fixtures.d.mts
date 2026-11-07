export function zipOf(files: { name: string; data: string | Uint8Array }[]): Uint8Array<ArrayBuffer>;
export function docxOf(bodyXml: string): Uint8Array<ArrayBuffer>;
export const w: {
  p(runs: string, o?: { style?: string; num?: 1 | 2 }): string;
  r(text: string, o?: { b?: boolean; u?: boolean; s?: boolean }): string;
  pageBreak: string;
};
export function essayDocx(o?: { breakInParagraph?: boolean }): Uint8Array<ArrayBuffer>;
export function textPdf(pages: [size: number, y: number, text: string][][]): Uint8Array<ArrayBuffer>;
export const RIVERS_PAGES: [number, number, string][][];
