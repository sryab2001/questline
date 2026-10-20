import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SysButton } from '@/components/sys-button';
import { SysText } from '@/components/sys-text';
import { SystemWindow } from '@/components/system-window';
import { addStoreItem, buy, deleteStoreItem, updateStoreItem } from '@/db/actions';
import { type BoxResult, describeBoxResult, SYSTEM_ITEMS, type SystemItemId } from '@/engine';
import { type StoreItem, usePlayerState } from '@/hooks/use-player-state';
import { playSound } from '@/sound';
import { colors, fonts } from '@/theme';

const SYSTEM_ORDER: SystemItemId[] = ['shield', 'blessed_box', 'cursed_box'];
const SYSTEM_COLOR: Record<SystemItemId, string> = { shield: colors.epic, blessed_box: colors.gold, cursed_box: colors.dangerSoft };
const g = (n: number) => `${n.toLocaleString()} G`;

export default function StoreScreen() {
  const player = usePlayerState();
  const [editing, setEditing] = useState<StoreItem | 'new' | null>(null);
  const [opened, setOpened] = useState<{ title: string; result: BoxResult } | null>(null);
  if (!player) return null;
  const { state, storeItems, purchases } = player;

  const purchase = async (label: string, cost: number, item: Parameters<typeof buy>[0]) => {
    if (state.gold < cost) return;
    Alert.alert(`Buy ${label}?`, `${g(cost)} will be spent. You have ${g(state.gold)}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Buy',
        onPress: async () => {
          try {
            const result = await buy(item);
            playSound('purchase');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            if (result) setOpened({ title: label, result });
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
          <SysText style={styles.gold}>{g(state.gold)}</SysText>
        </View>

        <SystemWindow title="STORE">
          <SectionTitle title="YOUR REWARDS" hint="Real-life treats you set" />
          {storeItems.length === 0 ? (
            <SysText variant="caption" style={{ textAlign: 'center' }}>
              Add treats to spend your gold on: a gaming hour, takeout, a new book.
            </SysText>
          ) : (
            storeItems.map((item) => {
              const ok = state.gold >= item.cost;
              return (
                <Pressable
                  key={item.id}
                  style={styles.row}
                  onLongPress={() => setEditing(item)}
                  delayLongPress={350}
                  accessibilityHint="Long-press to edit">
                  <View style={{ flex: 1, gap: 2 }}>
                    <SysText style={styles.name}>{item.name}</SysText>
                    <SysText style={styles.price}>{g(item.cost)}</SysText>
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
          <SysButton label="+ ADD REWARD" variant="ghost" onPress={() => setEditing('new')} />

          <SectionTitle title="ITEMS" hint={state.shields > 0 ? `Shields owned: ${state.shields}` : undefined} />
          {SYSTEM_ORDER.map((id) => {
            const item = SYSTEM_ITEMS[id];
            const noTreats = id === 'blessed_box' && storeItems.length === 0;
            const ok = state.gold >= item.cost && !noTreats;
            return (
              <View key={id} style={styles.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <SysText style={[styles.name, { color: SYSTEM_COLOR[id] }]}>{item.name}</SysText>
                  <SysText variant="caption" style={{ fontSize: 11, lineHeight: 16 }}>
                    {noTreats ? 'Add a reward first.' : item.description}
                  </SysText>
                </View>
                <SysButton
                  label={g(item.cost)}
                  variant={ok ? 'primary' : 'ghost'}
                  disabled={!ok}
                  style={styles.buyBtn}
                  accessibilityLabel={`Buy ${item.name} for ${g(item.cost)}`}
                  onPress={() => purchase(item.name, item.cost, { kind: id })}
                />
              </View>
            );
          })}

          <SysText variant="caption" style={{ textAlign: 'center', fontSize: 11 }}>
            Earn gold: +40 G per goal · +150 G per Daily Quest clear
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

      {editing ? <RewardEditor item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      {opened ? <BoxResultModal title={opened.title} result={opened.result} onClose={() => setOpened(null)} /> : null}
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

function RewardEditor({ item, onClose }: { item: StoreItem | null; onClose: () => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const [cost, setCost] = useState(item ? String(item.cost) : '300');
  const costNum = Math.round(Number(cost));
  const valid = name.trim().length > 0 && Number.isFinite(costNum) && costNum > 0;

  const save = async () => {
    if (item) await updateStoreItem(item.id, name, costNum);
    else await addStoreItem(name, costNum);
    onClose();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <SystemWindow title={item ? 'EDIT REWARD' : 'NEW REWARD'}>
          <SysText variant="label" style={{ fontSize: 13 }}>
            NAME
          </SysText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. 1 hour of gaming"
            placeholderTextColor={colors.textDone}
            style={styles.input}
            autoFocus
            accessibilityLabel="Reward name"
          />
          <SysText variant="label" style={{ fontSize: 13 }}>
            PRICE (GOLD)
          </SysText>
          <TextInput value={cost} onChangeText={setCost} keyboardType="number-pad" style={styles.input} accessibilityLabel="Price in gold" />
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

function BoxResultModal({ title, result, onClose }: { title: string; result: BoxResult; onClose: () => void }) {
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <SystemWindow variant={result.type === 'treat' ? 'gold' : 'epic'} title="ITEM OBTAINED" pulse>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <MaterialCommunityIcons
              name={result.type === 'shield' ? 'shield-star-outline' : result.type === 'mp' ? 'flask-outline' : result.type === 'gold' ? 'sack' : 'gift-outline'}
              size={48}
              color={result.type === 'treat' ? colors.gold : colors.epic}
            />
            <SysText variant="caption">{title} contained</SysText>
            <SysText style={{ fontFamily: fonts.display, fontSize: 26, textAlign: 'center', color: colors.text }}>
              [{describeBoxResult(result)}]
            </SysText>
            {result.type === 'treat' ? <SysText variant="caption">Enjoy it. You earned it.</SysText> : null}
          </View>
          <SysButton label="COLLECT" variant={result.type === 'treat' ? 'gold' : 'primary'} onPress={onClose} />
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
