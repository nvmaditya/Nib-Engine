// Download and Share. Each makes the files from a copy of the document frozen when it was pressed, so
// nothing typed, undone or opened meanwhile gets into them, and says in one message what happened.
// Download saves each file through a link to its bytes. Share hands the files to the system share
// sheet: images go as images (never in a ZIP), because most share targets can't open a ZIP.
import { toast } from '@/store/editor';
import { buildExport, type ExportFile } from './build';
import { failMessage, planOf, savedMessage, type ExportPlan } from './plan';
import { freeze, type Frozen } from './render';
import { IDLE_RUN, useExportPick, useExportPrefs, useExportRun } from './state';

/** What the device's choices and the page choice make of the frozen copy. */
export const currentPlan = (f: Frozen): ExportPlan =>
  planOf(useExportPrefs.getState(), useExportPick.getState(), f.pages, f.doc.fileName, f.title);

const wait = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

/**
 * Saves each file through an `<a download>` to an object URL of its bytes, about a quarter of a second
 * apart (a browser may ask to allow several downloads). Each URL is let go 30 s later, once the
 * browser has long had the bytes.
 */
export async function saveFiles(files: ExportFile[]): Promise<void> {
  for (let k = 0; k < files.length; k++) {
    if (k) await wait(250);
    const { name, type, bytes } = files[k];
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

/** Whether this browser can hand `data` to the share sheet. False wherever asking fails. */
function canShare(data: ShareData): boolean {
  try {
    return typeof navigator.canShare === 'function' && typeof navigator.share === 'function' && navigator.canShare(data);
  } catch {
    return false;
  }
}

/** Whether Share… is offered: the browser can share a PDF file. */
export function canShareFiles(): boolean {
  try {
    return canShare({ files: [new File([new Uint8Array(1)], 'page.pdf', { type: 'application/pdf' })] });
  } catch {
    return false; // no File constructor, or one that refuses
  }
}

/** How long `Ready to share.` stays up: long enough to tap on a phone, where a message can't be paused. */
export const READY_MS = 15_000;

const named = (e: unknown, name: string): boolean => typeof e === 'object' && e !== null && 'name' in e && e.name === name;

/**
 * Opens the share sheet with `data`. It asks at once, with nothing awaited first, so a call made in a
 * tap stays inside it. A closed sheet says nothing. When the browser wants a fresh tap (the first one
 * expired while the files were made), the message's Share is that tap, with the same files. It is not
 * a run: it leaves the run as it finds it, whether idle or a download being made.
 */
function openSheet(data: ShareData): Promise<void> {
  return new Promise<void>(resolve => resolve(navigator.share(data))).catch((e: unknown) => {
    if (named(e, 'AbortError')) return;
    if (named(e, 'NotAllowedError')) toast('Ready to share.', { label: 'Share', fn: () => { void openSheet(data); } }, { duration: READY_MS });
    else toast('Nib couldn’t share that. Use Download instead.');
  });
}

/** The run's progress, told after each page. */
const progress = (done: number): void => useExportRun.setState({ done });

/** Makes the chosen files and saves them. Does nothing while a download or share is going. */
export async function download(): Promise<void> {
  if (useExportRun.getState().kind) return;
  const f = freeze(), plan = currentPlan(f);
  if (!plan.pages.length) return;
  useExportRun.setState({ kind: 'download', done: 0, total: plan.pages.length });
  try {
    const files = await buildExport(plan, f, progress);
    await saveFiles(files);
    toast(savedMessage(files.map(x => x.name)));
  } catch {
    toast(failMessage(plan));
  } finally {
    useExportRun.setState({ ...IDLE_RUN });
  }
}

/**
 * Makes the chosen files, images never in a ZIP, and opens the share sheet with them. The run ends
 * once the files are made, before the sheet opens: the sheet is the browser's, and Download and Share
 * are free again while it is open.
 */
export async function share(): Promise<void> {
  if (useExportRun.getState().kind) return;
  const f = freeze(), plan: ExportPlan = { ...currentPlan(f), zip: false };
  if (!plan.pages.length) return;
  useExportRun.setState({ kind: 'share', done: 0, total: plan.pages.length });
  let files: File[];
  try {
    files = (await buildExport(plan, f, progress)).map(x => new File([x.bytes], x.name, { type: x.type }));
  } catch {
    toast(failMessage(plan));
    return;
  } finally {
    useExportRun.setState({ ...IDLE_RUN });
  }
  const data: ShareData = { files };
  if (!canShare(data)) { toast('This browser can’t share these files. Use Download instead.'); return; }
  await openSheet(data);
}
