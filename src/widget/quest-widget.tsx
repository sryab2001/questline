'use no memo';
// ^ Widget components are called as plain functions by react-native-android-widget,
// outside React. The React Compiler would add a cache hook to them, which throws
// there and leaves the widget black.

import { FlexWidget, TextWidget } from 'react-native-android-widget';

import type { PlayerSnapshot, QuickGoal } from '@/quick/today';

// The widget renders natively, outside React Native, so colours are literal hex.
const C = {
  bg: '#050912',
  panel: '#0a1a2e',
  row: '#0b1c31',
  border: '#3fb8ff',
  muted: '#1d3d5c',
  cyan: '#5cd0ff',
  text: '#e6f6ff',
  textMuted: '#9cc3dc',
  textDone: '#7fa3bb',
  gold: '#ffc857',
  epic: '#b98cff',
  danger: '#ff7a87',
} as const;

const DISPLAY = 'Rajdhani_700Bold';
const BODY = 'Inter_500Medium';
const ROW_HEIGHT = 34;
const HEADER_HEIGHT = 40;

const fmt = (n: number) => String(Math.round(n * 10) / 10);

export interface QuestWidgetProps {
  goals: QuickGoal[];
  snapshot: PlayerSnapshot | null;
  /** Widget height in dp, to fit as many rows as there is room for. */
  height: number;
}

/** Shown instead of a black box if building the widget ever fails. */
export function WidgetError({ message }: { message: string }) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: C.bg, borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'column', flexGap: 4 }}>
      <TextWidget text="DAILY QUEST" style={{ fontFamily: DISPLAY, fontSize: 15, color: C.cyan }} />
      <TextWidget text="Tap to open Questline." style={{ fontFamily: BODY, fontSize: 13, color: C.text }} />
      <TextWidget text={message} maxLines={3} truncate="END" style={{ fontFamily: BODY, fontSize: 10, color: C.textMuted }} />
    </FlexWidget>
  );
}

/** Today's Daily Quest on the home screen. Tap ✓ to clear a quest; tap anything else to open the app. */
export function QuestWidget({ goals, snapshot, height }: QuestWidgetProps) {
  const cleared = goals.filter((g) => g.done).length;
  const kept = goals.length > 0 && goals.every((g) => g.done || g.min);
  const rowsThatFit = Math.max(1, Math.floor((height - HEADER_HEIGHT - 16) / ROW_HEIGHT));
  const open = goals.filter((g) => !g.done && !g.limit);
  // Quests you can still tap first, then Limit Quests (usage), then cleared ones.
  const ordered = [...open, ...goals.filter((g) => g.limit), ...goals.filter((g) => g.done && !g.limit)];
  const shown = ordered.slice(0, goals.length > rowsThatFit ? rowsThatFit - 1 : rowsThatFit);
  const hidden = goals.length - shown.length;

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel="Questline Daily Quest"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: C.bg,
        borderColor: kept ? C.gold : C.border,
        borderWidth: 1,
        borderRadius: 12,
        padding: 10,
        flexDirection: 'column',
        flexGap: 6,
      }}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 26 }}>
        <TextWidget
          text={kept && cleared === goals.length ? 'QUEST COMPLETE' : 'DAILY QUEST'}
          style={{ fontFamily: DISPLAY, fontSize: 15, letterSpacing: 0.15, color: kept ? C.gold : C.cyan }}
        />
        <TextWidget
          text={`${snapshot?.test ? 'TEST · ' : ''}${goals.length ? `${cleared}/${goals.length}` : ''}${snapshot ? `${goals.length ? ' · ' : ''}LV ${snapshot.level} · ${snapshot.streak}d` : ''}`}
          style={{ fontFamily: DISPLAY, fontSize: 13, color: C.textMuted }}
        />
      </FlexWidget>

      {goals.length === 0 ? (
        <TextWidget text="No quests yet. Tap to open the System." style={{ fontFamily: BODY, fontSize: 13, color: C.textMuted }} />
      ) : null}

      {shown.map((g) => (
        <FlexWidget
          key={g.habitId}
          style={{
            width: 'match_parent',
            height: ROW_HEIGHT - 4,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: g.done ? C.panel : C.row,
            borderColor: g.done ? C.muted : g.min ? C.epic : C.muted,
            borderWidth: 1,
            borderRadius: 6,
            paddingLeft: 10,
          }}>
          <FlexWidget style={{ flex: 1 }}>
            <TextWidget text={g.name} truncate="END" maxLines={1} style={{ fontFamily: BODY, fontSize: 13, color: g.done ? C.textDone : C.text }} />
          </FlexWidget>
          <TextWidget
            text={
              g.limit
                ? `${fmt(g.progress)}/${fmt(g.target)} ${g.unit || 'min'}`
                : g.done
                  ? 'CLEAR'
                  : g.target > 1 || g.unit
                    ? `${fmt(g.progress)}/${fmt(g.target)}${g.unit ? ` ${g.unit}` : ''}`
                    : g.min
                      ? 'MIN'
                      : ''
            }
            style={{ fontFamily: DISPLAY, fontSize: 12, color: g.limit ? (g.done ? C.epic : C.danger) : g.done ? C.gold : g.min ? C.epic : C.textMuted, marginRight: 6 }}
          />
          <FlexWidget
            clickAction={g.done || g.limit ? 'OPEN_APP' : 'MARK_DONE'}
            clickActionData={{ habitId: g.habitId }}
            accessibilityLabel={g.done ? `${g.name} cleared` : `Clear ${g.name}`}
            style={{
              width: 40,
              height: ROW_HEIGHT - 4,
              alignItems: 'center',
              justifyContent: 'center',
              borderLeftWidth: 1,
              borderLeftColor: C.muted,
            }}>
            <TextWidget
              text={g.limit ? (g.done ? '◔' : '✕') : g.done ? '✓' : '○'}
              style={{ fontFamily: DISPLAY, fontSize: 18, color: g.limit ? (g.done ? C.epic : C.danger) : g.done ? C.gold : C.cyan }}
            />
          </FlexWidget>
        </FlexWidget>
      ))}

      {hidden > 0 ? (
        <TextWidget text={`+${hidden} more · tap to open`} style={{ fontFamily: BODY, fontSize: 11, color: C.textMuted }} />
      ) : null}
    </FlexWidget>
  );
}
