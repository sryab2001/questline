import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressBar } from '@/components/progress-bar';
import { SysButton } from '@/components/sys-button';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import { activateSkill, allocatePoint, cancelSkillToday } from '@/db/actions';
import { RANK_MIN_LEVEL, RANKS, SKILLS, type Stat, STAT_INFO, STATS } from '@/engine';
import { usePlayerState } from '@/hooks/use-player-state';
import { playSound } from '@/sound';
import { colors, fonts } from '@/theme';

export default function StatusScreen() {
  const player = usePlayerState();
  if (!player) return null;
  const { state, settings } = player;
  const nextRank = RANKS[RANKS.indexOf(state.rank) + 1];
  const points = Math.max(0, state.abilityPoints.available);
  const rest = state.skills.rest_day;

  const spend = async (stat: Stat) => {
    if (points <= 0) return;
    await allocatePoint(stat);
    playSound('tick');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const toggleRest = () => {
    if (rest.activeToday) {
      Alert.alert('Cancel Rest Day?', 'Your MP is refunded and today counts normally again.', [
        { text: 'Keep resting', style: 'cancel' },
        { text: 'Cancel Rest Day', style: 'destructive', onPress: () => cancelSkillToday('rest_day') },
      ]);
      return;
    }
    Alert.alert(`Use ${SKILLS.rest_day.name}?`, `${SKILLS.rest_day.description}\n\nCosts ${SKILLS.rest_day.mpCost} MP.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Use skill',
        onPress: async () => {
          await activateSkill('rest_day');
          playSound('clear');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <SysText variant="caption">{state.streak}-day streak</SysText>
          <View style={{ flexDirection: 'row' }}>
            <IconButton icon="calendar-month-outline" label="History" onPress={() => router.push('/history')} />
            <IconButton icon="cog-outline" label="Settings" onPress={() => router.push('/settings')} />
          </View>
        </View>

        <SystemWindow title="STATUS">
          <View style={styles.top}>
            <View style={styles.levelBlock}>
              <SysText variant="display">{state.level}</SysText>
              <SysText variant="label">LEVEL</SysText>
            </View>
            <View style={styles.info}>
              <InfoRow label="NAME" value={settings.playerName} />
              <InfoRow label="JOB" value="None" />
              <InfoRow label="TITLE" value="None" />
              <InfoRow label="RANK" value={state.rank} accent />
            </View>
          </View>

          <View style={styles.vitals}>
            <Vital label="HP" hint="Streak health" value={state.hp} max={state.maxHp} color={colors.dangerSoft} />
            <Vital label="MP" hint="Powers skills" value={state.mp} max={state.maxMp} color="#5c8dff" />
          </View>

          <View style={styles.divider} />

          {STATS.map((stat) => (
            <View key={stat} style={styles.statRow}>
              <SysText style={styles.statKey}>{stat}</SysText>
              <View style={{ flex: 1, gap: 2 }}>
                <SysText variant="number">{state.stats[stat]}</SysText>
                <SysText variant="caption" style={{ fontSize: 11 }}>
                  {STAT_INFO[stat].source}
                </SysText>
              </View>
              {points > 0 ? (
                <Pressable
                  style={styles.plus}
                  onPress={() => spend(stat)}
                  accessibilityRole="button"
                  accessibilityLabel={`Add a point to ${STAT_INFO[stat].name}`}>
                  <MaterialCommunityIcons name="plus" size={20} color={colors.cyan} />
                </Pressable>
              ) : null}
            </View>
          ))}

          <View style={styles.pointsRow}>
            <SysText variant="caption" style={{ fontSize: 13 }}>
              Available ability points
            </SysText>
            <SysText style={styles.points}>{points}</SysText>
          </View>

          {nextRank ? (
            <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: colors.borderMuted, paddingTop: 12 }}>
              <View style={styles.barLabels}>
                <SysText variant="caption">Next rank: {nextRank}</SysText>
                <SysText variant="caption">
                  Lv. {state.level} / {RANK_MIN_LEVEL[nextRank]}
                </SysText>
              </View>
              <ProgressBar value={state.level / RANK_MIN_LEVEL[nextRank]} height={4} />
            </View>
          ) : null}
        </SystemWindow>

        <SystemWindow title="SKILLS" variant="epic">
          <View style={styles.skillRow}>
            <MaterialCommunityIcons name="weather-night" size={26} color={rest.unlocked ? colors.epic : colors.textDone} />
            <View style={{ flex: 1, gap: 2 }}>
              <SysText style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: rest.unlocked ? colors.text : colors.textDone }}>
                {SKILLS.rest_day.name} · {SKILLS.rest_day.mpCost} MP
              </SysText>
              <SysText variant="caption" style={{ fontSize: 12, lineHeight: 17 }}>
                {rest.unlocked ? SKILLS.rest_day.description : `Unlocks at level ${SKILLS.rest_day.unlockLevel}.`}
              </SysText>
            </View>
          </View>
          {rest.unlocked ? (
            <SysButton
              label={rest.activeToday ? 'ACTIVE TODAY · CANCEL' : state.mp < SKILLS.rest_day.mpCost ? 'NOT ENOUGH MP' : 'USE TODAY'}
              variant={rest.activeToday ? 'ghost' : 'primary'}
              disabled={!rest.activeToday && !rest.canUse}
              onPress={toggleRest}
            />
          ) : null}
          <View style={styles.skillRow}>
            <MaterialCommunityIcons name="shield-star-outline" size={26} color={state.shields > 0 ? colors.epic : colors.textDone} />
            <View style={{ flex: 1, gap: 2 }}>
              <SysText style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>Streak Shields · {state.shields}</SysText>
              <SysText variant="caption" style={{ fontSize: 12, lineHeight: 17 }}>
                Used automatically on a failed day. Buy them in the Store.
              </SysText>
            </View>
          </View>
        </SystemWindow>
      </ScrollView>
    </SafeAreaView>
  );
}

function IconButton({ icon, label, onPress }: { icon: 'cog-outline' | 'calendar-month-outline'; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={styles.iconBtn}>
      <MaterialCommunityIcons name={icon} size={22} color={colors.textMuted} />
    </Pressable>
  );
}

function Vital({ label, hint, value, max, color }: { label: string; hint: string; value: number; max: number; color: string }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <View style={styles.barLabels}>
        <SysText variant="caption" style={{ fontSize: 11, letterSpacing: 1.1 }}>
          {label}
        </SysText>
        <SysText variant="caption" style={{ fontSize: 11, fontVariant: ['tabular-nums'] }}>
          {value}/{max}
        </SysText>
      </View>
      <ProgressBar value={value / max} color={color} height={5} glow={false} />
      <SysText variant="caption" style={{ fontSize: 10 }}>
        {hint}
      </SysText>
    </View>
  );
}

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <SysText variant="caption" style={{ fontSize: 13 }}>
        {label}
      </SysText>
      <SysText style={{ fontSize: 13, color: accent ? colors.cyan : colors.text }}>{value}</SysText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 18 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  levelBlock: { alignItems: 'center', minWidth: 78 },
  info: { flex: 1, gap: 6 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  vitals: { flexDirection: 'row', gap: 14 },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  divider: { height: 1, backgroundColor: colors.borderMuted },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46 },
  statKey: { width: 64, fontFamily: fonts.display, fontSize: 17, letterSpacing: 1.7 },
  plus: { width: 44, height: 44, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  pointsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
    paddingTop: 10,
  },
  points: { fontFamily: fonts.display, fontSize: 22, color: colors.cyan, textShadowColor: 'rgba(92,208,255,0.6)', textShadowRadius: 10 },
  skillRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
