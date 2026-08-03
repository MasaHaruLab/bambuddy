import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PanelPhase } from './useHomePanel';

/**
 * Shared pieces for the two tier-1 panel variants. Icon-first by design: the
 * panel must be operable by a family member who cannot read the labels, so
 * every control keeps a universal symbol and every state has a color code
 * (chrome blue = go/running, amber = paused, red = stop/alarm — no green
 * anywhere by owner's decree).
 */

// --- Icons (stroke inherits currentColor) ---------------------------------

export const IconPause = () => (
  <svg viewBox="0 0 24 24" className="hp-ico" aria-hidden>
    <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
    <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
  </svg>
);
export const IconPlay = () => (
  <svg viewBox="0 0 24 24" className="hp-ico" aria-hidden>
    <path d="M8 5.5v13a1 1 0 0 0 1.52.86l10.2-6.5a1 1 0 0 0 0-1.72L9.52 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor" />
  </svg>
);
export const IconStop = () => (
  <svg viewBox="0 0 24 24" className="hp-ico" aria-hidden>
    <rect x="5.5" y="5.5" width="13" height="13" rx="2" fill="currentColor" />
  </svg>
);
export const IconReprint = () => (
  <svg viewBox="0 0 24 24" className="hp-ico" aria-hidden>
    <path
      d="M12 4a8 8 0 1 1-7.47 5.1"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
    />
    <path d="M4 3.5v6h6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const IconPlug = () => (
  <svg viewBox="0 0 24 24" className="hp-ico" aria-hidden>
    <path
      d="M9 7V3.5M15 7V3.5M7.5 7h9v4a4.5 4.5 0 0 1-9 0V7ZM12 15.5V21"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  </svg>
);
export const IconAlert = () => (
  <svg viewBox="0 0 24 24" className="hp-ico" aria-hidden>
    <path d="M12 3 2.5 20h19L12 3Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M12 10v4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="12" cy="17.6" r="1.2" fill="currentColor" />
  </svg>
);

// --- Hold-to-stop ----------------------------------------------------------

const HOLD_MS = 3000;

/**
 * Stop is the one irreversible control on the panel, so it fires only after a
 * 3-second hold — a physical gesture that needs no reading and cannot happen
 * by brushing the screen. Returns press handlers plus fill progress 0..1.
 */
export function useHoldToStop(onStop: () => void, enabled: boolean) {
  const [progress, setProgress] = useState(0);
  const raf = useRef<number | null>(null);
  const start = useRef<number>(0);
  const fired = useRef(false);

  const cancel = useCallback(() => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = null;
    setProgress(0);
  }, []);

  const begin = useCallback(() => {
    if (!enabled) return;
    fired.current = false;
    start.current = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start.current) / HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        if (!fired.current) {
          fired.current = true;
          onStop();
        }
        cancel();
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [enabled, onStop, cancel]);

  useEffect(() => cancel, [cancel]);

  return { progress, begin, cancel };
}

// --- Button state table ----------------------------------------------------

export interface ButtonSpec {
  key: 'pause' | 'resume' | 'stop' | 'reprint';
  enabled: boolean;
  tone: 'amber' | 'blue' | 'red' | 'idle';
  pulse?: boolean;
}

/** All four buttons are always present (stable layout = learnable layout);
 *  the phase only changes which are live. */
export function buttonSpecs(phase: PanelPhase): ButtonSpec[] {
  const off = (key: ButtonSpec['key']): ButtonSpec => ({ key, enabled: false, tone: 'idle' });
  switch (phase) {
    case 'printing':
      return [
        { key: 'pause', enabled: true, tone: 'amber' },
        off('resume'),
        { key: 'stop', enabled: true, tone: 'red' },
        off('reprint'),
      ];
    case 'paused':
      return [
        off('pause'),
        { key: 'resume', enabled: true, tone: 'blue', pulse: true },
        { key: 'stop', enabled: true, tone: 'red' },
        off('reprint'),
      ];
    case 'done':
    case 'failed':
    case 'idle':
      return [off('pause'), off('resume'), off('stop'), { key: 'reprint', enabled: true, tone: 'blue' }];
    case 'offline':
    default:
      return [off('pause'), off('resume'), off('stop'), off('reprint')];
  }
}

export const BUTTON_ICONS = {
  pause: IconPause,
  resume: IconPlay,
  stop: IconStop,
  reprint: IconReprint,
} as const;

// --- Strips ----------------------------------------------------------------

/**
 * Human-readable alarm text. Module 0x0C is the printer's AI camera
 * detection (spaghetti / print-failure watch) — that one gets a plain-words
 * warning instead of a bare hex code, because it is the alarm a family
 * member actually needs to act on.
 */
export function alarmText(
  alarm: { code?: string; module?: number },
  t: (key: string) => string,
): string {
  if (alarm.module === 0x0c) return t('home.alarmPrintFailure');
  return alarm.code ? `${t('home.alarmGeneric')} · ${alarm.code}` : t('home.alarmGeneric');
}

export function AlarmStrip({ text }: { text: string }) {
  return (
    <div className="hp-alarm" role="alert">
      <IconAlert />
      <span>{text}</span>
    </div>
  );
}

export function NoticeStrip({ text, tone }: { text: string; tone: 'blue' | 'red' }) {
  return <div className={`hp-notice hp-notice-${tone}`}>{text}</div>;
}

export function OfflineOverlay() {
  const { t } = useTranslation();
  return (
    <div className="hp-offline">
      <IconPlug />
      <div className="hp-offline-title">{t('home.offline')}</div>
      <div className="hp-offline-hint">{t('home.offlineHint')}</div>
    </div>
  );
}

/** h:mm digits — numerals read across every language on the panel. */
export function formatRemaining(min: number | null | undefined): string | null {
  if (min == null || min < 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}
