// Small line icons used across the interface.
const P = { fill:'none', stroke:'currentColor', strokeLinecap:'round', strokeLinejoin:'round', 'aria-hidden':true };

export const ShuffleIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth="2" {...P}><path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="m15 15 6 6" /><path d="M4 4l5 5" /></svg>
);
export const ImportIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2" {...P}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M12 18v-6" /><path d="m9 14 3-3 3 3" /></svg>
);
export const DownloadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2" {...P}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
);
export const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2.2" {...P}><path d="M12 5v14M5 12h14" /></svg>
);
export const MoveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2.2" {...P}><path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3" /></svg>
);
export const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2.2" {...P}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
