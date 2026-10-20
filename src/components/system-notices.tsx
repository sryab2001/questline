import { router } from 'expo-router';

import { usePlayerState } from '@/hooks/use-player-state';

import { LevelUpModal } from './level-up-modal';
import { PenaltyModal } from './penalty-modal';
import { previousMonth, SeasonRecapModal } from './season-recap-modal';
import { SurvivalResultModal } from './survival-result-modal';

/** Shows pending System messages one at a time: penalties, penalty-quest results, level-ups, then Season recaps. */
export function SystemNotices() {
  const player = usePlayerState();
  if (!player) return null;

  if (player.unseenFailures.length > 0) return <PenaltyModal failures={player.unseenFailures} />;
  if (player.survivalResult) return <SurvivalResultModal entry={player.survivalResult} />;

  const { level } = player.state;
  const seen = player.settings.lastSeenLevel;
  if (level > seen) {
    return <LevelUpModal from={seen} to={level} onOpenStatus={() => router.navigate('/status')} />;
  }

  const lastMonth = previousMonth(player.today.slice(0, 7));
  const monthDays = player.state.history.filter((d) => d.day.startsWith(lastMonth) && d.kind !== 'empty');
  if (monthDays.length > 0 && !player.seen.has(`season:${lastMonth}`)) {
    const title = player.state.seasonTitles.find((t) => t.month === lastMonth)?.title ?? null;
    return <SeasonRecapModal month={lastMonth} days={monthDays} title={title} />;
  }
  return null;
}
