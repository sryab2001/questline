import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { equipItem, forgeItems, markSeen } from '@/db/actions';
import {
  describeEffect,
  FORGE_INPUTS,
  forgeResult,
  type Item,
  nextRarity,
  type OwnedItem,
  PASSIVE_STAT_BONUS,
  type RecordMilestone,
  type Slot,
  SLOTS,
} from '@/engine';
import type { PlayerData } from '@/hooks/use-player-state';
import { playSound } from '@/sound';
import { colors, fonts } from '@/theme';

import { RARITY_COLOR } from './gain-toast';
import { SysButton } from './sys-button';
import { SysText } from './sys-text';
import { SystemWindow } from './system-window';

const SLOT_INFO: Record<Slot, { label: string; icon: 'sword' | 'shield-half-full' | 'ring' }> = {
  weapon: { label: 'WEAPON', icon: 'sword' },
  armor: { label: 'ARMOR', icon: 'shield-half-full' },
  accessory: { label: 'ACCESSORY', icon: 'ring' },
};

export function ItemLine({ item, compact }: { item: Item; compact?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <SysText style={{ fontFamily: fonts.bodySemi, fontSize: compact ? 13 : 14, color: RARITY_COLOR[item.rarity] }}>
        [{item.rarity}] {item.name}
      </SysText>
      <SysText variant="caption" style={{ fontSize: 11 }}>
        {item.effects.map(describeEffect).join(' · ')}
      </SysText>
    </View>
  );
}

/** Three gear slots. Effects start the day an item is equipped. */
export function EquipmentWindow({ player }: { player: PlayerData }) {
  const [picking, setPicking] = useState<Slot | null>(null);
  const [forging, setForging] = useState(false);
  const { equipped, inventory } = player.state;

  return (
    <SystemWindow title="EQUIPMENT" variant="gold">
      {SLOTS.map((slot) => {
        const item = equipped[slot];
        const owned = inventory.filter((i) => i.slot === slot).length;
        return (
          <Pressable
            key={slot}
            style={styles.slot}
            onPress={() => setPicking(slot)}
            accessibilityRole="button"
            accessibilityLabel={`${SLOT_INFO[slot].label}: ${item ? item.name : 'empty'}`}>
            <MaterialCommunityIcons name={SLOT_INFO[slot].icon} size={22} color={item ? RARITY_COLOR[item.rarity] : colors.textDone} />
            {item ? (
              <ItemLine item={item} />
            ) : (
              <View style={{ flex: 1 }}>
                <SysText variant="caption">{SLOT_INFO[slot].label}</SysText>
                <SysText variant="caption" style={{ fontSize: 11 }}>
                  {owned > 0 ? `${owned} owned · tap to equip` : 'Empty'}
                </SysText>
              </View>
            )}
          </Pressable>
        );
      })}
      {inventory.length === 0 ? (
        <SysText variant="caption" style={{ textAlign: 'center', lineHeight: 18 }}>
          Clear weekly Gates, unlock achievements, finish Main Quest chapters and find rare drops to earn gear.
        </SysText>
      ) : (
        <SysButton label={`THE FORGE · ${inventory.length} ITEMS`} variant="ghost" onPress={() => setForging(true)} />
      )}
      {picking ? <ItemPicker player={player} slot={picking} onClose={() => setPicking(null)} /> : null}
      {forging ? <ForgeModal player={player} onClose={() => setForging(false)} /> : null}
    </SystemWindow>
  );
}

function ItemPicker({ player, slot, onClose }: { player: PlayerData; slot: Slot; onClose: () => void }) {
  const items = player.state.inventory.filter((i) => i.slot === slot);
  const current = player.state.equipped[slot];
  const pick = async (id: string) => {
    await equipItem(slot, id);
    if (id) playSound('tick');
    onClose();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <SystemWindow title={SLOT_INFO[slot].label} variant="gold">
          {items.length === 0 ? (
            <SysText style={{ textAlign: 'center' }}>No {slot} yet.</SysText>
          ) : (
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
              {items.map((i) => {
                const on = current?.id === i.id;
                return (
                  <Pressable
                    key={i.id}
                    onPress={() => pick(i.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={[styles.pickRow, on && { borderColor: colors.gold }]}>
                    <ItemLine item={i} />
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <SysText variant="caption" style={{ textAlign: 'center', fontSize: 11 }}>
            Effects apply from today, never retroactively.
          </SysText>
          {current ? <SysButton label="UNEQUIP" variant="ghost" onPress={() => pick('')} /> : null}
          <SysButton label="CLOSE" variant="ghost" onPress={onClose} />
        </SystemWindow>
      </View>
    </Modal>
  );
}

/** Grid's craft: three items of one rarity become one of the next. The result is shown before you commit. */
function ForgeModal({ player, onClose }: { player: PlayerData; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const items = player.state.inventory.filter((i) => nextRarity(i.rarity));
  const equippedIds = new Set(Object.values(player.state.equipped).map((e) => e?.id));
  const first = items.find((i) => i.id === picked[0]);
  const result = picked.length === FORGE_INPUTS && first ? forgeResult(picked, first.rarity) : null;

  const toggle = (it: OwnedItem) => {
    setPicked((p) => {
      if (p.includes(it.id)) return p.filter((x) => x !== it.id);
      if (p.length >= FORGE_INPUTS) return p;
      if (first && first.rarity !== it.rarity) return [it.id];
      return [...p, it.id];
    });
  };

  const forge = async () => {
    await forgeItems(picked);
    playSound('levelup');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onClose();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <SystemWindow title="THE FORGE" variant="gold">
          <SysText variant="caption" style={{ textAlign: 'center', lineHeight: 18 }}>
            Pick {FORGE_INPUTS} items of the same rarity. They are melted down into one item of the next rarity.
          </SysText>
          <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ gap: 6 }}>
            {items.length === 0 ? <SysText style={{ textAlign: 'center' }}>Nothing to forge yet.</SysText> : null}
            {items.map((i) => {
              const on = picked.includes(i.id);
              const dim = !!first && first.rarity !== i.rarity;
              return (
                <Pressable
                  key={i.id}
                  onPress={() => toggle(i)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={[styles.pickRow, on && { borderColor: colors.gold, backgroundColor: '#1d170b' }, dim && { opacity: 0.45 }]}>
                  <ItemLine item={i} compact />
                  {equippedIds.has(i.id) ? (
                    <SysText variant="caption" style={{ fontSize: 10 }}>
                      EQUIPPED
                    </SysText>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
          {result ? (
            <View style={styles.result}>
              <SysText variant="caption">Will become</SysText>
              <ItemLine item={result} />
            </View>
          ) : null}
          <SysButton label={result ? 'FORGE' : `PICK ${FORGE_INPUTS - picked.length} MORE`} variant="gold" disabled={!result} onPress={forge} />
          <SysButton label="CLOSE" variant="ghost" onPress={onClose} />
        </SystemWindow>
      </View>
    </Modal>
  );
}

/** Mastered quests, extracted as Shadows. They grow with habit strength and fade if it drops. */
export function ShadowArmyWindow({ player }: { player: PlayerData }) {
  const { shadows } = player.state;
  if (shadows.length === 0) return null;
  return (
    <SystemWindow title="SHADOW ARMY" variant="epic">
      {shadows.map((s) => {
        const h = player.habits.find((x) => x.id === s.habitId);
        return (
          <View key={s.habitId} style={styles.shadow}>
            <MaterialCommunityIcons name={s.faded ? 'ghost-off-outline' : 'ghost'} size={26} color={s.faded ? colors.dangerSoft : colors.epic} />
            <View style={{ flex: 1, gap: 1 }}>
              <SysText style={{ fontFamily: fonts.display, fontSize: 17, color: s.faded ? colors.textMuted : colors.text }}>
                {s.name} <SysText style={{ fontSize: 12, color: s.faded ? colors.dangerSoft : colors.epic }}>· {s.faded ? 'FADED' : s.rank.toUpperCase()}</SysText>
              </SysText>
              <SysText variant="caption" style={{ fontSize: 12 }}>
                Shadow of {s.habitName}
                {h?.masteryName ? ` · [${h.masteryName}]` : ''}
              </SysText>
              <SysText variant="caption" style={{ fontSize: 11 }}>
                {s.faded ? 'Habit weakened: reminders are back until it recovers.' : `+${PASSIVE_STAT_BONUS} ${s.stat} · runs on its cue, no reminders`}
              </SysText>
            </View>
          </View>
        );
      })}
    </SystemWindow>
  );
}

const HIDDEN: { key: keyof PlayerData['state']['hiddenStats']; name: string; source: string }[] = [
  { key: 'indomitable', name: 'Indomitable', source: 'Comebacks and Penalty Quests survived' },
  { key: 'composure', name: 'Composure', source: 'Minimum Clears and Rest Days taken' },
  { key: 'insight', name: 'Insight', source: 'Weekly check-ins and masteries' },
  { key: 'dignity', name: 'Dignity', source: 'Gates and high-grade clears' },
];

/** Overgeared-style hidden stats: a mirror of how you play, with no gameplay effect. */
export function HiddenStatsWindow({ player }: { player: PlayerData }) {
  return (
    <SystemWindow title="HIDDEN STATS" variant="epic">
      {HIDDEN.map((h) => (
        <View key={h.key} style={styles.hiddenRow}>
          <View style={{ flex: 1 }}>
            <SysText style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>{h.name}</SysText>
            <SysText variant="caption" style={{ fontSize: 11 }}>
              {h.source}
            </SysText>
          </View>
          <SysText style={{ fontFamily: fonts.display, fontSize: 20, color: colors.epic }}>{player.state.hiddenStats[h.key]}</SysText>
        </View>
      ))}
    </SystemWindow>
  );
}

export interface Bounty {
  key: string;
  text: string;
  source: string;
}

/** Unseen achievements, new gear, earned bounties and Record milestones, shown together once. */
export function unseenRewards(player: PlayerData) {
  const seen = (ref: string) => player.seen.has(ref);
  const achievements = player.state.achievements.filter((a) => a.unlockedDay && !seen(`ach:${a.id}`));
  const items = player.state.inventory.filter((i) => !seen(`item:${i.id}`));
  const milestones = player.state.record.milestones.filter((m) => !seen(`rec:${m.habitId}:${m.times}`));
  const bounties: Bounty[] = [];
  for (const q of player.mainQuests) {
    const st = player.state.mainQuests.find((m) => m.id === q.id);
    if (!st) continue;
    q.data.chapters.forEach((ch, ci) => {
      const key = `bounty:${q.id}:${ci}`;
      if (ch.bounty?.trim() && st.chapters[ci]?.cleared && !seen(key)) bounties.push({ key, text: ch.bounty.trim(), source: `${q.name} · ${ch.title}` });
    });
    const key = `bounty:${q.id}`;
    if (q.data.bounty.trim() && st.complete && !seen(key)) bounties.push({ key, text: q.data.bounty.trim(), source: q.name });
  }
  return { achievements, items, milestones, bounties };
}

export function RewardsModal({
  achievements,
  items,
  milestones,
  bounties,
}: {
  achievements: PlayerData['state']['achievements'];
  items: OwnedItem[];
  milestones: RecordMilestone[];
  bounties: Bounty[];
}) {
  const big = achievements.length > 0 || bounties.length > 0;
  useEffect(() => {
    playSound(big ? 'levelup' : 'quest');
  }, [big]);

  const dismiss = () =>
    Promise.all([
      ...achievements.map((a) => markSeen(`ach:${a.id}`)),
      ...items.map((i) => markSeen(`item:${i.id}`)),
      ...milestones.map((m) => markSeen(`rec:${m.habitId}:${m.times}`)),
      ...bounties.map((b) => markSeen(b.key)),
    ]);
  const title = bounties.length > 0 ? 'BOUNTY EARNED' : achievements.length > 0 ? 'ACHIEVEMENT' : milestones.length > 0 ? 'RECORD' : 'ITEM ACQUIRED';

  return (
    <Modal transparent animationType="fade" visible onRequestClose={dismiss} statusBarTranslucent>
      <View style={styles.backdrop}>
        <SystemWindow title={title} variant="gold" pulse>
          <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ gap: 12 }}>
            {bounties.map((b) => (
              <View key={b.key} style={styles.bounty}>
                <MaterialCommunityIcons name="treasure-chest" size={30} color={colors.gold} />
                <SysText style={styles.achTitle}>{b.text}</SysText>
                <SysText variant="caption" style={{ textAlign: 'center' }}>
                  Earned by clearing {b.source}. You set this reward yourself; claim it.
                </SysText>
              </View>
            ))}
            {achievements.map((a) => (
              <View key={a.id} style={{ alignItems: 'center', gap: 2 }}>
                <SysText style={styles.achTitle}>[{a.title}]</SysText>
                <SysText variant="caption" style={{ textAlign: 'center' }}>
                  {a.description}
                </SysText>
                {a.allStats > 0 ? <SysText style={{ fontSize: 13, color: colors.cyan }}>All stats +{a.allStats}</SysText> : null}
              </View>
            ))}
            {milestones.map((m) => (
              <View key={`${m.habitId}:${m.times}`} style={{ alignItems: 'center', gap: 2 }}>
                <SysText style={[styles.achTitle, { fontSize: 18 }]}>[{m.title}]</SysText>
                <SysText variant="caption" style={{ textAlign: 'center' }}>
                  {m.times}× your daily target, done for real.
                </SysText>
              </View>
            ))}
            {achievements.length > 0 || milestones.length > 0 ? (
              <SysText variant="caption" style={{ textAlign: 'center', fontSize: 11 }}>
                New titles are available on the Status screen.
              </SysText>
            ) : null}
            {items.length > 0 ? (
              <View style={{ gap: 8, borderTopWidth: big || milestones.length > 0 ? 1 : 0, borderTopColor: '#3a3018', paddingTop: 10 }}>
                {items.map((i) => (
                  <View key={i.id} style={styles.pickRow}>
                    <ItemLine item={i} />
                  </View>
                ))}
                <SysText variant="caption" style={{ textAlign: 'center', fontSize: 11 }}>
                  Equip or forge items from the Status screen.
                </SysText>
              </View>
            ) : null}
          </ScrollView>
          <SysButton label={bounties.length > 0 ? 'CLAIM' : 'ACCEPT'} variant="gold" onPress={dismiss} />
        </SystemWindow>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  slot: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  backdrop: { flex: 1, backgroundColor: 'rgba(2,4,9,0.88)', justifyContent: 'center', padding: 20 },
  pickRow: { minHeight: 52, borderWidth: 1, borderColor: colors.borderMuted, alignItems: 'center', flexDirection: 'row', gap: 8, padding: 10 },
  result: { gap: 4, borderTopWidth: 1, borderTopColor: '#3a3018', paddingTop: 10 },
  shadow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  hiddenRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  achTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.gold, textAlign: 'center' },
  bounty: { alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.gold, padding: 12, backgroundColor: '#1d170b' },
});
