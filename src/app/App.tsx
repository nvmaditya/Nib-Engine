import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { sampleDoc, cleanSettings } from '@/engine/doc.js';
import { loadUploadedFonts } from '@/features/style/fonts';
import { bootStyle, refreshStylePrefsOnShow } from '@/features/style/prefs';
import { bootstrapDocuments } from '@/store/bootstrap';
import { getDoc } from '@/store/documents';
import { NOT_ON_DEVICE, closeDocument, installDocFollow, installFlushOnHide, openDocument, toast, useEditor } from '@/store/editor';
import { TopBar } from '@/shell/TopBar';
import { HomePage } from '@/features/home/HomePage';
import { DocumentView } from '@/features/doc/DocumentView';
import { MEMORY_ID, navigate, useRoute } from './route';

export function App() {
  const route = useRoute();
  const [boot, setBoot] = useState<'pending' | 'ok' | 'memory'>('pending');
  const openId = useEditor(s => s.docId);

  useEffect(() => {
    let live = true;
    // Uploaded fonts are registered before any document is read, so no document loses its hand.
    // The two run side by side because bootstrapDocuments never cleans a stored document (it only
    // makes the first one). If it ever reads stored documents, it must wait for bootStyle first.
    void Promise.all([bootstrapDocuments(), bootStyle()]).then(([r]) => {
      if (!live) return;
      if (!r.ok) {
        const S = cleanSettings(null, false);
        const now = Date.now();
        openDocument({ id: MEMORY_ID, title: 'The Water Cycle', createdAt: now, updatedAt: now, settings: S, doc: sampleDoc(S) });
      }
      if (!r.ok) navigate({ name: 'doc', id: MEMORY_ID, stage: 'write' });
      setBoot(r.ok ? 'ok' : 'memory');
    });
    return () => { live = false; };
  }, []);

  useEffect(() => installFlushOnHide(), []);
  useEffect(() => installDocFollow(), []); // another tab's saves, renames and deletes of the open document
  useEffect(() => refreshStylePrefsOnShow(), []);

  const wantId = route.name === 'doc' ? route.id : null;
  useEffect(() => {
    if (boot === 'pending' || wantId === null || wantId === openId) return;
    if (boot === 'memory') { if (wantId !== MEMORY_ID) navigate({ name: 'home' }); return; }
    let live = true;
    // Going Home closes the open document first, so Home doesn't clear the message shown here.
    const goHome = () => { void closeDocument(); navigate({ name: 'home' }); };
    // Another tab may have added a hand since this page started: register it before the document is read.
    void loadUploadedFonts().then(() => getDoc(wantId)).then(rec => {
      if (!live) return;
      if (rec) openDocument(rec);
      else { goHome(); toast(NOT_ON_DEVICE); }
    }).catch(() => { if (live) goHome(); });
    return () => { live = false; };
  }, [boot, wantId, openId]);

  if (boot === 'pending') return <div className="flex flex-1 items-center justify-center text-muted">Opening Nib…</div>;

  return (
    <>
      {boot === 'memory' && (
        <div role="status" className="flex-none bg-primary-soft px-4 py-2 text-center text-sm">
          Nib can't save on this device right now. Your work stays until you close this tab.
        </div>
      )}
      <TopBar route={route} ready={route.name === 'doc' && openId === route.id} />
      {route.name === 'home' ? <HomePage /> : openId === route.id ? <DocumentView stage={route.stage} /> : null}
      <Toaster position="bottom-center" />
    </>
  );
}
