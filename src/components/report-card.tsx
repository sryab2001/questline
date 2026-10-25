import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import type { AnalysisPeriod } from '@/engine';
import type { PlayerData } from '@/hooks/use-player-state';
import { cachedReport, fetchLatestReport, requestReport, type WeeklyReport } from '@/review/report';
import { buildReportInput, periodRange } from '@/review/report-input';
import { useSyncStatus } from '@/sync/status';
import { colors } from '@/theme';

import { SysButton } from './sys-button';
import { SysText } from './sys-text';
import { SystemWindow } from './system-window';

const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** The System's commentary for a week or a Season, written by the AI on your server. */
export function ReportCard({ player, period }: { player: PlayerData; period: AnalysisPeriod }) {
  const signedIn = useSyncStatus().signedIn;
  const [report, setReport] = useState<WeeklyReport | null>(() => cachedReport(period));
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { from } = periodRange(period, player.today);

  // Pick up a report the server wrote on schedule.
  useEffect(() => {
    if (!signedIn) return;
    fetchLatestReport(period)
      .then((r) => r && setReport(r))
      .catch(() => {});
  }, [signedIn, period]);

  const ask = async () => {
    setAsking(true);
    setError(null);
    try {
      setReport(await requestReport(period, buildReportInput(player, period)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  };

  const current = report && report.through >= from;
  const writing = player.settings.aiReadsWriting;
  return (
    <SystemWindow title={period === 'week' ? "THE SYSTEM'S REPORT" : 'SEASON REPORT'} variant="gold">
      {current ? (
        <>
          <SysText style={{ fontSize: 14, lineHeight: 21, color: colors.text }}>{report.body}</SysText>
          <SysText variant="caption" style={{ fontSize: 10 }}>
            Through {dayLabel(report.through)} · {report.model}
          </SysText>
        </>
      ) : (
        <SysText variant="caption" style={{ lineHeight: 18 }}>
          {signedIn
            ? `Your server writes this from the analysis above: numbers, quest names and patterns${writing ? ', plus your journal and reflections (you allowed it in Settings → Sync)' : '. Your writing stays private unless you allow it in Settings → Sync'}.`
            : 'Sign in to your server (Settings → Sync) to get an AI-written report.'}
        </SysText>
      )}
      {error ? <SysText style={{ fontSize: 12, color: colors.dangerSoft }}>{error}</SysText> : null}
      {signedIn ? (
        asking ? (
          <ActivityIndicator color={colors.gold} />
        ) : (
          <SysButton label={current ? 'ASK AGAIN' : 'ASK THE SYSTEM'} variant="gold" onPress={ask} />
        )
      ) : null}
    </SystemWindow>
  );
}
