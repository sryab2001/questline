import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { equipItem, markSeen } from '@/db/actions';
import { describeEffect, type Item, type OwnedItem, type Slot, SLOTS } from '@/engine';
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
          Clear weekly Gates, unlock achievements and finish Class Quests to earn rated items.
        </SysText>
      ) : null}
      {picking ? <ItemPicker player={player} slot={picking} onClose={() => setPicking(null)} /> : null}
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

/** Unseen achievement unlocks and new items, shown together once. */
export function unseenRewards(player: PlayerData) {
  const achievements = player.state.achievements.filter((a) => a.unlockedDay && !player.seen.has(`ach:${a.id}`));
  const items = player.state.inventory.filter((i) => !player.seen.has(`item:${i.id}`));
  return { achievements, items };
}

export function RewardsModal({
  achievements,
  items,
}: {
  achievements: PlayerData['state']['achievements'];
  items: OwnedItem[];
}) {
  useEffect(() => {
    playSound(achievements.length > 0 ? 'levelup' : 'quest');
  }, [achievements.length]);

  const dismiss = () => Promise.all([...achievements.map((a) => markSeen(`ach:${a.id}`)), ...items.map((i) => markSeen(`item:${i.id}`))]);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={dismiss} statusBarTranslucent>
      <View style={styles.backdrop}>
        <SystemWindow title={achievements.length > 0 ? 'ACHIEVEMENT' : 'ITEM ACQUIRED'} variant="gold" pulse>
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 12 }}>
            {achievements.map((a) => (
              <View key={a.id} style={{ alignItems: 'center', gap: 2 }}>
                <SysText style={styles.achTitle}>[{a.title}]</SysText>
                <SysText variant="caption" style={{ textAlign: 'center' }}>
                  {a.description}
                </SysText>
                {a.allStats > 0 ? (
                  <SysText style={{ fontSize: 13, color: colors.cyan }}>All stats +{a.allStats}</SysText>
                ) : null}
              </View>
            ))}
            {achievements.length > 0 ? (
              <SysText variant="caption" style={{ textAlign: 'center', fontSize: 11 }}>
                New title{achievements.length > 1 ? 's' : ''} available on the Status screen.
              </SysText>
            ) : null}
            {items.length > 0 ? (
              <View style={{ gap: 8, borderTopWidth: achievements.length > 0 ? 1 : 0, borderTopColor: '#3a3018', paddingTop: 10 }}>
                {items.map((i) => (
                  <View key={i.id} style={styles.pickRow}>
                    <ItemLine item={i} />
                  </View>
                ))}
                <SysText variant="caption" style={{ textAlign: 'center', fontSize: 11 }}>
                  Equip items from the Status screen.
                </SysText>
              </View>
            ) : null}
          </ScrollView>
          <SysButton label="ACCEPT" variant="gold" onPress={dismiss} />
        </SystemWindow>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  slot: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  backdrop: { flex: 1, backgroundColor: 'rgba(2,4,9,0.88)', justifyContent: 'center', padding: 20 },
  pickRow: { minHeight: 52, borderWidth: 1, borderColor: colors.borderMuted, justifyContent: 'center', padding: 10 },
  hiddenRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  achTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.gold, textAlign: 'center' },
});
