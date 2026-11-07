import type { Settings } from '@/engine/types';

/** How a setting is set: in the Style panel, by an action, or in Export. */
export type ControlKind = 'slider' | 'buttons' | 'color' | 'switch' | 'picker' | 'action' | 'export';

export interface SettingControl {
  kind: ControlKind;
  /** The control's name in the interface (sliders take their labels from here). */
  label: string;
  /** A block can have its own value (one of the engine's `BOX_KEYS`). */
  block: boolean;
  /** Shown only while the setting is on, and turns off only (the fold crease). */
  onlyWhenOn?: true;
}

/**
 * Every setting the engine reads, and where it is set: the Realism inventory, rows 1–22. None is left
 * out and none becomes unreachable; ranged ones are sliders over the engine's full `LIMITS`.
 */
export const SETTING_CONTROLS: Record<keyof Settings, SettingControl> = {
  font: { kind: 'picker', label: 'Change handwriting', block: true },
  ink: { kind: 'buttons', label: 'Ink', block: true },
  customInk: { kind: 'color', label: 'Pick any ink colour', block: true },
  tip: { kind: 'buttons', label: 'Pen', block: true },
  weight: { kind: 'slider', label: 'Line weight', block: true },
  size: { kind: 'slider', label: 'Letter size', block: true },
  gap: { kind: 'slider', label: 'Line spacing', block: false },
  mess: { kind: 'slider', label: 'Natural movement', block: true },
  wobble: { kind: 'slider', label: 'Letter wobble', block: true },
  variety: { kind: 'slider', label: 'Vary each letter', block: true },
  flow: { kind: 'slider', label: 'Ink flow', block: true },
  track: { kind: 'slider', label: 'Letter spacing', block: true },
  words: { kind: 'slider', label: 'Word spacing', block: true },
  mistakes: { kind: 'slider', label: 'Mistakes', block: true },
  paper: { kind: 'buttons', label: 'Paper', block: false },
  holes: { kind: 'switch', label: 'Punch holes', block: false },
  lighting: { kind: 'switch', label: 'Room lighting', block: false },
  ghost: { kind: 'switch', label: 'Show-through', block: false },
  crease: { kind: 'switch', label: 'Fold crease', block: false, onlyWhenOn: true },
  look: { kind: 'export', label: 'How it looks', block: false },
  tilt: { kind: 'export', label: 'Slight camera tilt', block: false },
  seed: { kind: 'action', label: 'New variation', block: false },
};
