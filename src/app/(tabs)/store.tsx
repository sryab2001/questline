import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { SysButton } from '@/components/sys-button';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import { addStoreItem, buy, deleteStoreItem, type RewardKind, updateStoreItem } from '@/db/actions';
import { DAY_GOLD, describeBoxResult, GATE_GOLD_V2, SHIELD_CAP, SYSTEM_ITEMS, type SystemItemId } from '@/engine';
import { type StoreItem, usePlayerState } from '@/hooks/use-player-state';
import { playEvent } from '@/sound';
import { colors, fonts } from '@/theme';

const g = (n: number) => `${n.toLocaleString()} G`;
/** Gold is earned at about DAY_GOLD per kept day, so prices read as days of effort. */
const days = (cost: number) => {
  const d = Math.round((cost / DAY_GOLD) * 10) / 10;
  return d < 1 ? '< 1 day' : `≈ ${d} day${d === 1 ? '' : 's'}`;
};
const PRICE_DAYS = [1, 3, 5, 7, 14, 30];

export default function StoreScreen() {
  const player = usePlayerState();
  const [editing, setEditing] = useState<{ item: StoreItem | null; kind: RewardKind } | null>(null);
  if (!player) return null;
  const { state, storeItems, purchases } = player;
  const treats = storeItems.filter((i) => i.kind === 'treat');
  const unlocks = storeItems.filter((i) => i.kind === 'unlock');
  const shield = SYSTEM_ITEMS.shield;
  const shieldsFull = state.shields >= SHIELD_CAP;

  const purchase = async (label: string, cost: number, item: Parameters<typeof buy>[0]) => {
    if (state.gold < cost) return;
    Alert.alert(`Buy ${label}?`, `${g(cost)} (${days(cost)} of effort) will be spent. You have ${g(state.gold)}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Buy',
        onPress: async () => {
          try {
            await buy(item);
            playEvent('purchase');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          } catch (e) {
            Alert.alert('Purchase failed', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <SysText variant="label">GOLD</SysText>
          <View style={{ alignItems: 'flex-end' }}>
            <SysText style={styles.gold}>{g(state.gold)}</SysText>
            <SysText variant="caption" style={{ fontSize: 11 }}>
              {days(state.gold)} of effort
            </SysText>
          </View>
        </View>

        <SystemWindow title="UNLOCKS" variant="epic">
          <SysText variant="caption" style={{ lineHeight: 17 }}>
            Free permissions that open the moment today&apos;s Daily Quest is kept. Pair what you enjoy with what you&apos;re building.
          </SysText>
          {unlocks.map((u) => {
            const open = state.today.kept;
            return (
              <Pressable
                key={u.id}
                style={[styles.row, open && { borderColor: colors.epic }]}
                onLongPress={() => setEditing({ item: u, kind: 'unlock' })}
                delayLongPress={350}
                accessibilityHint="Long-press to edit">
                <MaterialCommunityIcons name={open ? 'lock-open-variant' : 'lock-outline'} size={22} color={open ? colors.epic : colors.textDone} />
                <View style={{ flex: 1 }}>
                  <SysText style={[styles.name, !open && { color: colors.textMuted }]}>{u.name}</SysText>
                  <SysText variant="caption" style={{ fontSize: 11 }}>
                    {open ? 'Unlocked for today. Enjoy it.' : 'Opens when the Daily Quest is kept'}
                  </SysText>
                </View>
              </Pressable>
            );
          })}
          <SysButton label="+ ADD UNLOCK" variant="ghost" onPress={() => setEditing({ item: null, kind: 'unlock' })} />
        </SystemWindow>

        <SystemWindow title="STORE">
          <SectionTitle title="YOUR REWARDS" hint="Priced in days of effort" />
          {treats.length === 0 ? (
            <SysText variant="caption" style={{ textAlign: 'center', lineHeight: 18 }}>
              Add treats worth working for. Experiences tend to satisfy more than things: a movie night, a day trip, a concert.
            </SysText>
          ) : (
            treats.map((item) => {
              const ok = state.gold >= item.cost;
              return (
                <Pressable
                  key={item.id}
                  style={styles.row}
                  onLongPress={() => setEditing({ item, kind: 'treat' })}
                  delayLongPress={350}
                  accessibilityHint="Long-press to edit">
                  <View style={{ flex: 1, gap: 2 }}>
                    <SysText style={styles.name}>{item.name}</SysText>
                    <SysText style={styles.price}>
                      {g(item.cost)} <SysText variant="caption" style={{ fontSize: 11 }}>· {days(item.cost)}</SysText>
                    </SysText>
                  </View>
                  <SysButton
                    label={ok ? 'BUY' : 'LOCKED'}
                    variant={ok ? 'primary' : 'ghost'}
                    disabled={!ok}
                    style={styles.buyBtn}
                    accessibilityLabel={ok ? `Buy ${item.name}` : `Not enough gold for ${item.name}`}
                    onPress={() => purchase(item.name, item.cost, { kind: 'treat', storeItemId: item.id, cost: item.cost })}
                  />
                </Pressable>
              );
            })
          )}
          <SysButton label="+ ADD REWARD" variant="ghost" onPress={() => setEditing({ item: null, kind: 'treat' })} />

          <SectionTitle title="ITEMS" hint={`Shields: ${state.shields} / ${SHIELD_CAP}`} />
          <View style={styles.row}>
            <View style={{ flex: 1, gap: 2 }}>
              <SysText style={[styles.name, { color: colors.epic }]}>{shield.name}</SysText>
              <SysText variant="caption" style={{ fontSize: 11, lineHeight: 16 }}>
                {shield.description} Hold up to {SHIELD_CAP}.
              </SysText>
            </View>
            <SysButton
              label={shieldsFull ? 'FULL' : g(shield.cost)}
              variant={!shieldsFull && state.gold >= shield.cost ? 'primary' : 'ghost'}
              disabled={shieldsFull || state.gold < shield.cost}
              style={styles.buyBtn}
              accessibilityLabel={shieldsFull ? 'Shields full' : `Buy ${shield.name} for ${g(shield.cost)}`}
              onPress={() => purchase(shield.name, shield.cost, { kind: 'shield' })}
            />
          </View>

          <SysText variant="caption" style={{ textAlign: 'center', fontSize: 11 }}>
            {state.economyV2
              ? `Earn about ${DAY_GOLD} G per kept day (more for harder quests) · +${GATE_GOLD_V2} G per Gate`
              : 'Earn gold by keeping your Daily Quest'}
          </SysText>
        </SystemWindow>

        {purchases.length > 0 ? (
          <SystemWindow title="RECENT">
            {purchases.slice(0, 8).map((p) => (
              <View key={p.id} style={styles.historyRow}>
                <SysText style={{ flex: 1, fontSize: 13, color: colors.text }} numberOfLines={1}>
                  {p.kind === 'treat' ? p.name : SYSTEM_ITEMS[p.kind as SystemItemId].name}
                  {p.result ? <SysText style={{ fontSize: 13, color: colors.textMuted }}> → {describeBoxResult(p.result)}</SysText> : null}
                </SysText>
                <SysText style={[styles.price, { color: colors.textMuted }]}>−{g(p.cost)}</SysText>
              </View>
            ))}
          </SystemWindow>
        ) : null}
      </ScrollView>

      {editing ? <RewardEditor item={editing.item} kind={editing.kind} onClose={() => setEditing(null)} /> : null}
    </SafeAreaView>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.section}>
      <SysText variant="label" style={{ fontSize: 13 }}>
        {title}
      </SysText>
      {hint ? <SysText variant="caption" style={{ fontSize: 11 }}>{hint}</SysText> : null}
    </View>
  );
}

function RewardEditor({ item, kind, onClose }: { item: StoreItem | null; kind: RewardKind; onClose: () => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const [cost, setCost] = useState(item && kind === 'treat' ? String(item.cost) : String(3 * DAY_GOLD));
  const costNum = Math.round(Number(cost));
  const valid = name.trim().length > 0 && (kind === 'unlock' || (Number.isFinite(costNum) && costNum > 0));

  const save = async () => {
    if (item) await updateStoreItem(item.id, name, costNum, kind);
    else await addStoreItem(name, costNum, kind);
    onClose();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <SystemWindow title={kind === 'unlock' ? (item ? 'EDIT UNLOCK' : 'NEW UNLOCK') : item ? 'EDIT REWARD' : 'NEW REWARD'}>
          <SysText variant="label" style={{ fontSize: 13 }}>
            NAME
          </SysText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={kind === 'unlock' ? 'e.g. Evening gaming' : 'e.g. Movie night'}
            placeholderTextColor={colors.textDone}
            style={styles.input}
            autoFocus
            accessibilityLabel="Reward name"
          />
          {kind === 'treat' ? (
            <>
              <SysText variant="label" style={{ fontSize: 13 }}>
                WORTH HOW MANY DAYS OF EFFORT?
              </SysText>
              <View style={styles.chips}>
                {PRICE_DAYS.map((d) => (
                  <Chip
                    key={d}
                    label={d === 1 ? '1 day' : d === 7 ? '1 week' : d === 14 ? '2 weeks' : d === 30 ? '1 month' : `${d} days`}
                    selected={costNum === d * DAY_GOLD}
                    onPress={() => setCost(String(d * DAY_GOLD))}
                  />
                ))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TextInput
                  value={cost}
                  onChangeText={setCost}
                  keyboardType="number-pad"
                  style={[styles.input, { flex: 1 }]}
                  accessibilityLabel="Price in gold"
                />
                <SysText variant="caption">G · {Number.isFinite(costNum) ? days(costNum) : ''}</SysText>
              </View>
            </>
          ) : (
            <SysText variant="caption" style={{ lineHeight: 18 }}>
              Unlocks cost nothing. They open every day you keep your Daily Quest.
            </SysText>
          )}
          <SysButton label="SAVE" disabled={!valid} onPress={save} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {item ? (
              <SysButton
                label="DELETE"
                variant="ghost"
                style={{ flex: 1 }}
                onPress={async () => {
                  await deleteStoreItem(item.id);
                  onClose();
                }}
              />
            ) : null}
            <SysButton label="CANCEL" variant="ghost" style={{ flex: 1 }} onPress={onClose} />
          </View>
        </SystemWindow>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  gold: { fontFamily: fonts.display, fontSize: 26, color: colors.gold, textShadowColor: 'rgba(255,200,87,0.45)', textShadowRadius: 10 },
  section: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
    paddingBottom: 6,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.panelRow,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 6,
  },
  name: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  price: { fontSize: 12, color: colors.gold, fontVariant: ['tabular-nums'] },
  buyBtn: { minWidth: 86, minHeight: 44, paddingHorizontal: 10 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backdrop: { flex: 1, backgroundColor: 'rgba(2,4,9,0.85)', justifyContent: 'center', padding: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.panelRow,
    color: colors.text,
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    fontSize: 15,
  },
});
