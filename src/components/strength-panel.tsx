import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { setTitle } from '@/db/actions';
import { ACHIEVEMENT_BY_TITLE, describeEffect, PASSIVE_STAT_BONUS } from '@/engine';
import type { PlayerData } from '@/hooks/use-player-state';
import { colors, fonts } from '@/theme';

import { ProgressBar } from './progress-bar';
import { SysButton } from './sys-button';
import { SysText } from './sys-text';
import { SystemWindow } from './system-window';

/** Plain-language stage for a habit-strength value (Lally-style curve). */
export function strengthStage(s: number) {
  if (s >= 85) return 'Automatic';
  if (s >= 60) return 'Strong';
  if (s >= 25) return 'Building';
  return 'Forming';
}

export function HabitStrengthWindow({ player }: { player: PlayerData }) {
  const quests = player.habits.filter((h) => !h.archived);
  if (quests.length === 0) return null;
  return (
    <SystemWindow title="HABIT STRENGTH">
      <SysText variant="caption" style={{ lineHeight: 17 }}>
        How automatic each quest has become. It grows with every clear (~66 for most habits); one missed day barely dents it,
        several in a row do.
      </SysText>
      {quests.map((h) => {
        const st = player.state.habits[h.id];
        if (!st) return null;
        return (
          <View key={h.id} style={{ gap: 4 }}>
            <View style={styles.row}>
              <SysText style={{ flex: 1, fontSize: 14, color: colors.text }}>
                {h.name}
                {st.mastered ? <SysText style={{ color: st.weakened ? colors.dangerSoft : colors.epic, fontSize: 12 }}> · {st.weakened ? 'WEAKENED' : 'PASSIVE'}</SysText> : null}
              </SysText>
              <SysText variant="caption" style={{ fontVariant: ['tabular-nums'] }}>
                {strengthStage(st.strength)} · {Math.round(st.strength)}%
              </SysText>
            </View>
            <ProgressBar value={st.strength / 100} color={colors.epic} height={4} glow={false} />
          </View>
        );
      })}
    </SystemWindow>
  );
}

export function PassiveSkillsWindow({ player }: { player: PlayerData }) {
  const mastered = player.habits.filter((h) => h.mastered && !h.archived);
  if (mastered.length === 0) return null;
  return (
    <SystemWindow title="PASSIVE SKILLS" variant="epic">
      {mastered.map((h) => {
        const st = player.state.habits[h.id];
        const weak = st?.weakened;
        return (
          <View key={h.id} style={styles.skill}>
            <MaterialCommunityIcons name={weak ? 'shield-off-outline' : 'infinity'} size={24} color={weak ? colors.dangerSoft : colors.epic} />
            <View style={{ flex: 1, gap: 2 }}>
              <SysText style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>[{h.masteryName || `${h.name} Mastery`}]</SysText>
              <SysText variant="caption" style={{ fontSize: 12 }}>
                {weak
                  ? 'Weakened: reminders are back until the habit recovers.'
                  : `Permanent +${PASSIVE_STAT_BONUS} ${h.stat} · runs on its cue, no reminders`}
              </SysText>
            </View>
          </View>
        );
      })}
    </SystemWindow>
  );
}

/** Titles earned from achievements (with effects), mastered quests and strong Seasons. */
export function earnedTitles(player: PlayerData): string[] {
  const fromAchievements = player.state.achievements.filter((a) => a.unlockedDay).map((a) => a.title);
  const fromMastery = player.habits.filter((h) => h.mastered && h.masteryTitle).map((h) => h.masteryTitle!);
  const fromSeasons = player.state.seasonTitles.map((t) => `${t.title} (${t.month})`);
  return [...new Set([...fromAchievements, ...fromMastery, ...fromSeasons])];
}

export function TitlePicker({ player, onClose }: { player: PlayerData; onClose: () => void }) {
  const titles = earnedTitles(player);
  const pick = async (t: string) => {
    await setTitle(t);
    onClose();
  };
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <SystemWindow title="TITLES" variant="gold">
          {titles.length === 0 ? (
            <SysText style={{ textAlign: 'center' }}>No titles yet. Unlock an achievement, master a quest or finish a strong Season.</SysText>
          ) : (
            <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8 }}>
              {titles.map((t) => {
                const on = player.settings.title === t;
                const effect = ACHIEVEMENT_BY_TITLE.get(t)?.titleEffect;
                return (
                  <Pressable
                    key={t}
                    onPress={() => pick(t)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={[styles.titleRow, on && { borderColor: colors.gold }]}>
                    <SysText style={{ fontFamily: fonts.display, fontSize: 17, color: on ? colors.gold : colors.text }}>{t}</SysText>
                    <SysText variant="caption" style={{ fontSize: 11 }}>
                      {effect ? describeEffect(effect) : 'Cosmetic'}
                    </SysText>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <SysText variant="caption" style={{ textAlign: 'center', fontSize: 11 }}>
            A title&apos;s effect applies from the day you equip it.
          </SysText>
          {player.settings.title ? <SysButton label="UNEQUIP" variant="ghost" onPress={() => pick('')} /> : null}
          <SysButton label="CLOSE" variant="ghost" onPress={onClose} />
        </SystemWindow>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  skill: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(2,4,9,0.85)', justifyContent: 'center', padding: 20 },
  titleRow: { minHeight: 52, borderWidth: 1, borderColor: colors.borderMuted, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 6 },
});
