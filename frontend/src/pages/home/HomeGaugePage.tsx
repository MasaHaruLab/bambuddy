import type React from 'react';
import { useTranslation } from 'react-i18next';
import { useHomePanel } from './useHomePanel';
import {
  AlarmStrip,
  BUTTON_ICONS,
  NoticeStrip,
  OfflineOverlay,
  buttonSpecs,
  formatRemaining,
  useHoldToStop,
} from './shared';

/**
 * Tier-1 panel, variant A — 「圆表」.
 *
 * One machined instrument gauge carries the whole answer to "how is it
 * going": a 270° graduated dial whose chrome-blue sweep is the progress and
 * whose center is the remaining time. Four round machine buttons below.
 */

const R = 84; // dial radius in viewBox units
const CX = 100;
const CY = 100;
const START = 135; // degrees, gauge zero
const SWEEP = 270;

function polar(deg: number, r: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

function arcPath(fromDeg: number, toDeg: number, r: number): string {
  const [x1, y1] = polar(fromDeg, r);
  const [x2, y2] = polar(toDeg, r);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function Gauge({ progress, remaining, layer, totalLayers, phaseLabel }: {
  progress: number;
  remaining: string | null;
  layer: number | null;
  totalLayers: number | null;
  phaseLabel: string;
}) {
  const pct = Math.max(0, Math.min(100, progress));
  const end = START + (SWEEP * pct) / 100;
  const ticks = [];
  for (let i = 0; i <= 100; i += 2.5) {
    const deg = START + (SWEEP * i) / 100;
    const major = i % 10 === 0;
    const [x1, y1] = polar(deg, R + (major ? 0 : 3));
    const [x2, y2] = polar(deg, R + 8);
    ticks.push(
      <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={major ? 'hp-tick-major' : 'hp-tick-minor'} />
    );
  }
  return (
    <div className="hp-gauge-wrap">
      <svg viewBox="0 0 200 200" className="hp-gauge" role="img" aria-label={`${pct}%`}>
        {/* bezel */}
        <circle cx={CX} cy={CY} r={97} className="hp-bezel-outer" />
        <circle cx={CX} cy={CY} r={93} className="hp-bezel-inner" />
        {/* dial track + progress sweep */}
        <path d={arcPath(START, START + SWEEP, R)} className="hp-dial-track" />
        {pct > 0 && <path d={arcPath(START, Math.max(START + 0.5, end), R)} className="hp-dial-fill" />}
        {ticks}
        {/* needle */}
        <g className="hp-needle" style={{ transform: `rotate(${end}deg)` }}>
          <line x1={CX + 14} y1={CY} x2={CX + R - 6} y2={CY} />
        </g>
        <circle cx={CX} cy={CY} r={10} className="hp-hub" />
        <circle cx={CX} cy={CY} r={4} className="hp-hub-pin" />
      </svg>
      <div className="hp-gauge-center">
        {remaining ? (
          <>
            <div className="hp-time">{remaining}</div>
            <div className="hp-time-sub">{phaseLabel}</div>
          </>
        ) : (
          <div className="hp-time-sub hp-time-solo">{phaseLabel}</div>
        )}
        {layer != null && totalLayers != null && totalLayers > 0 && (
          <div className="hp-layers">{layer} / {totalLayers}</div>
        )}
        <div className="hp-pct">{Math.round(pct)}%</div>
      </div>
    </div>
  );
}

export function HomeGaugePage() {
  const { t } = useTranslation();
  const panel = useHomePanel();
  const { status, phase, alarm, actions, actionError, reprintQueued, busy } = panel;
  const specs = buttonSpecs(phase);
  const hold = useHoldToStop(actions.stop, phase === 'printing' || phase === 'paused');

  const phaseLabel = t(`home.phase.${phase}`);
  const jobName = status?.subtask_name || status?.current_print || null;

  return (
    <div className="hp-root hp-variant-a">
      {alarm && <AlarmStrip text={alarm.code ? `${t('home.alarmGeneric')} · ${alarm.code}` : t('home.alarmGeneric')} />}
      {actionError && <NoticeStrip tone="red" text={actionError} />}
      {reprintQueued && !actionError && <NoticeStrip tone="blue" text={t('home.queued')} />}

      <header className="hp-jobchip">
        {status?.cover_url && <img className="hp-cover" src={status.cover_url} alt="" />}
        <div className="hp-jobname">{jobName ?? t('home.noJob')}</div>
      </header>

      <main className="hp-main">
        <Gauge
          progress={status?.progress ?? 0}
          remaining={phase === 'printing' || phase === 'paused' ? formatRemaining(status?.remaining_time) : null}
          layer={status?.layer_num ?? null}
          totalLayers={status?.total_layers ?? null}
          phaseLabel={phaseLabel}
        />
      </main>

      <nav className="hp-buttons" aria-label={t('home.controls')}>
        {specs.map((spec) => {
          const Icon = BUTTON_ICONS[spec.key];
          const isStop = spec.key === 'stop';
          return (
            <button
              key={spec.key}
              className={`hp-btn hp-tone-${spec.tone}${spec.pulse ? ' hp-pulse' : ''}`}
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
              <span className="hp-btn-face">
                <Icon />
              </span>
              <span className="hp-btn-label">
                {t(`home.${spec.key}`)}
                {isStop && spec.enabled && <em className="hp-hold-hint">{t('home.holdToStop')}</em>}
              </span>
            </button>
          );
        })}
      </nav>

      {phase === 'offline' && <OfflineOverlay />}
    </div>
  );
}
