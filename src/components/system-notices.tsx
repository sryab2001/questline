import { router } from 'expo-router';

import { usePlayerState } from '@/hooks/use-player-state';

import { LevelUpModal } from './level-up-modal';
import { PenaltyModal } from './penalty-modal';
import { SurvivalResultModal } from './survival-result-modal';

/** Shows pending System messages one at a time: penalties, penalty-quest results, then level-ups. */
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
  return null;
}
