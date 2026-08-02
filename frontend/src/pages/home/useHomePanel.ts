import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { Printer, PrinterStatus } from '../../api/client';

/**
 * Shared logic for the tier-1 home panel (both visual variants).
 *
 * One printer only: this is the family wall panel, not the fleet dashboard.
 * Picks the first active printer. Status rides the same ['printerStatus', id]
 * query the WebSocket provider writes into, so updates are push-driven; the
 * refetchInterval is just a safety net.
 */

export type PanelPhase =
  | 'offline' // not connected
  | 'printing' // RUNNING / PREPARE / SLICING
  | 'paused' // PAUSE
  | 'done' // FINISH
  | 'failed' // FAILED
  | 'idle'; // IDLE / unknown

export function useHomePanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: printers = [] } = useQuery({
    queryKey: ['printers'],
    queryFn: () => api.getPrinters(),
  });
  const printer: Printer | undefined = printers.find((p: Printer) => p.is_active) ?? printers[0];
  const printerId = printer?.id;

  const { data: status } = useQuery({
    queryKey: ['printerStatus', printerId],
    queryFn: () => api.getPrinterStatus(printerId!),
    enabled: printerId != null,
    refetchInterval: 5000,
  });

  const phase: PanelPhase = useMemo(() => {
    if (!status?.connected) return 'offline';
    switch (status.state) {
      case 'RUNNING':
      case 'PREPARE':
      case 'SLICING':
        return 'printing';
      case 'PAUSE':
        return 'paused';
      case 'FINISH':
        return 'done';
      case 'FAILED':
        return 'failed';
      default:
        return 'idle';
    }
  }, [status?.connected, status?.state]);

  const invalidate = () => {
    if (printerId != null) queryClient.invalidateQueries({ queryKey: ['printerStatus', printerId] });
  };
  const fail = (key: string) => (e: unknown) => {
    setActionError(t(key) + (e instanceof Error && e.message ? ` — ${e.message}` : ''));
    window.setTimeout(() => setActionError(null), 6000);
  };

  const pause = useMutation({
    mutationFn: () => api.pausePrint(printerId!),
    onSuccess: invalidate,
    onError: fail('home.errPause'),
  });
  const resume = useMutation({
    mutationFn: () => api.resumePrint(printerId!),
    onSuccess: invalidate,
    onError: fail('home.errResume'),
  });
  const stop = useMutation({
    mutationFn: () => api.stopPrint(printerId!),
    onSuccess: invalidate,
    onError: fail('home.errStop'),
  });

  // Reprint = queue the archive of the current/last job and let the
  // dispatcher start it (the direct reprint endpoint is 410-gone upstream).
  const reprint = useMutation({
    mutationFn: async () => {
      let archiveId = status?.current_archive_id ?? null;
      if (archiveId == null) {
        // Idle panel: fall back to this printer's most recent archive.
        const archives = await api.getArchives(printerId!, undefined, 1);
        archiveId = archives?.[0]?.id ?? null;
      }
      if (archiveId == null) throw new Error(t('home.errNoJob'));
      return api.addToQueue({ printer_id: printerId!, archive_id: archiveId, use_ams: true });
    },
    onSuccess: invalidate,
    onError: fail('home.errReprint'),
  });

  const alarm = status?.hms_errors?.[0] ?? null;

  return {
    printer,
    status: status as PrinterStatus | undefined,
    phase,
    alarm,
    actionError,
    busy: pause.isPending || resume.isPending || stop.isPending || reprint.isPending,
    reprintQueued: reprint.isSuccess,
    actions: {
      pause: () => pause.mutate(),
      resume: () => resume.mutate(),
      stop: () => stop.mutate(),
      reprint: () => reprint.mutate(),
    },
  };
}

/** Minutes → compact display parts. 95 → {h:1, m:35} */
export function splitRemaining(min: number | null | undefined): { h: number; m: number } | null {
  if (min == null || min <= 0) return null;
  return { h: Math.floor(min / 60), m: min % 60 };
}
