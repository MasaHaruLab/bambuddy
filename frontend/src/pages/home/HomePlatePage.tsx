import type React from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useHomePanel } from './useHomePanel';
import {
  AlarmStrip,
  BUTTON_ICONS,
  NoticeStrip,
  OfflineOverlay,
  alarmText,
  buttonSpecs,
  formatRemaining,
  useHoldToStop,
} from './shared';

/**
 * Tier-1 panel, variant B — 「铭牌」.
 *
 * A machine's front panel read top to bottom: riveted job nameplate, an
 * etched linear sight-gauge for progress, and a strip of four guarded
 * rectangular switches. Same logic as variant A, different metal.
 */

function SightGauge({ progress, remaining, phaseLabel }: {
  progress: number;
  remaining: string | null;
  phaseLabel: string;
}) {
  const pct = Math.max(0, Math.min(100, progress));
  return (
    <section className="hp-sight">
      <div className="hp-sight-readout">
        <div className="hp-sight-big">
          {remaining ?? phaseLabel}
          {remaining && <span className="hp-sight-unit">{phaseLabel}</span>}
        </div>
        <div className="hp-sight-pct">{Math.round(pct)}%</div>
      </div>
      <div className="hp-sight-track">
        <div className="hp-sight-fill" style={{ width: `${pct}%` }} />
        <div className="hp-sight-ticks" aria-hidden>
          {Array.from({ length: 21 }, (_, i) => (
            <i key={i} className={i % 5 === 0 ? 'hp-st-major' : undefined} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function HomePlatePage({ bold = false }: { bold?: boolean }) {
  const { t } = useTranslation();
  const panel = useHomePanel();
  const { printer, status, phase, alarm, actions, actionError, reprintQueued, busy } = panel;
  const specs = buttonSpecs(phase);
  const hold = useHoldToStop(actions.stop, phase === 'printing' || phase === 'paused');
  const [camOk, setCamOk] = useState(true);

  const jobName = status?.subtask_name || status?.current_print || null;
  const active = phase === 'printing' || phase === 'paused';
  const layers =
    active && status?.layer_num != null && status?.total_layers
      ? `${status.layer_num} / ${status.total_layers}`
      : null;
  // Live camera. One <img> at a time (each stream costs the server an ffmpeg):
  // during an alarm or after a failure it becomes the big "look at the
  // machine" view, otherwise it fills the nameplate cover slot when the job
  // has no thumbnail.
  const camUrl = printer && camOk ? `/api/v1/printers/${printer.id}/camera/stream?fps=5` : null;
  const bigCam = Boolean((alarm || phase === 'failed') && camUrl);

  return (
    <div className={`hp-root hp-variant-b${bold ? ' hp-bold' : ''}`}>
      <Link to="/" className="hp-exit" aria-label={t('home.toApp')}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <rect x="4" y="4" width="7" height="7" rx="1.5" fill="currentColor" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" fill="currentColor" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" fill="currentColor" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" fill="currentColor" />
        </svg>
        <span>{t('home.toApp')}</span>
      </Link>
      {alarm && <AlarmStrip text={alarmText(alarm, t)} />}
      {actionError && <NoticeStrip tone="red" text={actionError} />}
      {reprintQueued && !actionError && <NoticeStrip tone="blue" text={t('home.queued')} />}
      {phase === 'failed' && !actionError && !reprintQueued && (
        <NoticeStrip tone="red" text={t('home.clearBedHint')} />
      )}

      {bigCam && (
        <section className="hp-cam-big">
          <img src={camUrl!} alt="" onError={() => setCamOk(false)} />
        </section>
      )}

      <section className="hp-plate">
        <i className="hp-screw hp-screw-tl" />
        <i className="hp-screw hp-screw-tr" />
        <i className="hp-screw hp-screw-bl" />
        <i className="hp-screw hp-screw-br" />
        {status?.cover_url ? (
          <img className="hp-plate-cover" src={status.cover_url} alt="" />
        ) : camUrl && !bigCam ? (
          <img className="hp-plate-cover" src={camUrl} alt="" onError={() => setCamOk(false)} />
        ) : (
          <div className="hp-plate-cover hp-plate-cover-empty" />
        )}
        <div className="hp-plate-text">
          <div className="hp-plate-name">{jobName ?? t('home.noJob')}</div>
          {layers && <div className="hp-plate-layers">{t('home.layer')} {layers}</div>}
        </div>
      </section>

      <SightGauge
        progress={status?.progress ?? 0}
        remaining={phase === 'printing' || phase === 'paused' ? formatRemaining(status?.remaining_time) : null}
        phaseLabel={t(`home.phase.${phase}`)}
      />

      <nav className="hp-switchrow" aria-label={t('home.controls')}>
        {specs.map((spec) => {
          const Icon = BUTTON_ICONS[spec.key];
          const isStop = spec.key === 'stop';
          return (
            <button
              key={spec.key}
              className={`hp-switch hp-tone-${spec.tone}${spec.pulse ? ' hp-pulse' : ''}`}
              disabled={!spec.enabled || busy}
              style={isStop ? ({ '--hold': hold.progress } as React.CSSProperties) : undefined}
              onPointerDown={isStop ? hold.begin : undefined}
              onPointerUp={isStop ? hold.cancel : undefined}
              onPointerLeave={isStop ? hold.cancel : undefined}
              onContextMenu={(e) => e.preventDefault()}
              onClick={
                isStop
                  ? undefined
                  : spec.key === 'pause'
                    ? actions.pause
                    : spec.key === 'resume'
                      ? actions.resume
                      : actions.reprint
              }
            >
              <Icon />
              <span className="hp-switch-label">
                {t(`home.${spec.key}`)}
                {isStop && spec.enabled && <em className="hp-hold-hint">{t('home.holdToStop')}</em>}
              </span>
              {isStop && <span className="hp-switch-holdbar" aria-hidden />}
            </button>
          );
        })}
      </nav>

      {phase === 'offline' && <OfflineOverlay />}
    </div>
  );
}
