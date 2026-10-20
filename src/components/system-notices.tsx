import { router } from 'expo-router';

import { usePlayerState } from '@/hooks/use-player-state';

import { LevelUpModal } from './level-up-modal';
import { PenaltyModal } from './penalty-modal';

/** Shows pending System messages one at a time: penalties first, then level-ups. */
export function SystemNotices() {
  const player = usePlayerState();
  if (!player) return null;

  if (player.unseenFailures.length > 0) return <PenaltyModal failures={player.unseenFailures} />;

  const { level } = player.state;
  const seen = player.settings.lastSeenLevel;
  if (level > seen) {
    return <LevelUpModal from={seen} to={level} onOpenStatus={() => router.navigate('/status')} />;
  }
  return null;
}
