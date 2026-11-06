import { useEffect, useState } from 'react';

// A short message at the bottom of the screen, sometimes with an action such as Undo.
export default function Toast({ toast }) {
  const [shown, setShown] = useState(null);
  useEffect(() => {
    if (!toast) return;
    setShown(toast);
    const t = setTimeout(() => setShown(cur => (cur && cur.id === toast.id ? null : cur)), toast.action ? 6000 : 2600);
    return () => clearTimeout(t);
  }, [toast && toast.id]);
  const t = shown || toast;
  return (
    <div className={'toast' + (shown ? ' show' : '')} id="toast" role="status" aria-live="polite">
      <span id="toast-msg">{t ? t.msg : ''}</span>
      {t && t.action && (
        <button type="button" id="toast-act" onClick={() => { setShown(null); t.action.fn(); }}>{t.action.label}</button>
      )}
    </div>
  );
}
