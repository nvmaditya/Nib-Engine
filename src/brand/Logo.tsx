import { cn } from '@/lib/utils';

const PALETTES = {
  ink: { bg: '#1E2B7C', border: 'none', rules: 'rgba(255,255,255,.28)', margin: '#FF9B9B', pen: '#FFFFFF', cut: '#1E2B7C' },
  paper: { bg: '#FBFBF7', border: 'rgba(0,0,0,.12)', rules: '#A7C1E2', margin: '#E58C8C', pen: '#20389A', cut: '#FBFBF7' },
} as const;

export function Logo({ size = 30, variant = 'ink', className }: { size?: number; variant?: 'ink' | 'paper'; className?: string }) {
  const c = PALETTES[variant];
  // Literal markup keeps the colours exactly as drawn (inline style strings), in both themes.
  const inner = `<rect x=".5" y=".5" width="63" height="63" rx="15" style="fill:${c.bg};stroke:${c.border};stroke-width:1"/>
<path d="M5 20.5H59M5 32.5H59M5 44.5H59" style="stroke:${c.rules};stroke-width:1.5"/>
<path d="M14 5V59" style="stroke:${c.margin};stroke-width:1.8"/>
<path d="M17 44 C19.5 42 21 38.5 22.5 35 C22.6 38.5 22.3 41.5 22 44 C23.4 38.8 26.2 35.2 29.2 35.2 C32.2 35.2 31.9 39.6 31.4 42.4 C31 45.2 33.6 46 36.6 44 L40.2 41.4" style="fill:none;stroke:${c.pen};stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round"/>
<g transform="translate(40.6 41) rotate(45) scale(.44) translate(-32 -56)"><path d="M32 56 L22 35 C20.6 31.5 21 27.5 23.5 24.5 L27 20.5 V10 H37 V20.5 L40.5 24.5 C43 27.5 43.4 31.5 42 35 Z" style="fill:${c.pen}"/><path d="M32 54 V38" style="fill:none;stroke:${c.cut};stroke-width:2.6"/><circle cx="32" cy="34.2" r="3.1" style="fill:${c.cut}"/></g>`;
  return <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Nib" className={className} dangerouslySetInnerHTML={{ __html: inner }} />;
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={cn('font-bold tracking-[-0.045em]', className)}>nib</span>;
}
