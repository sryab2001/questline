// Builds the widget with the library's own tree builder, as it does on the phone,
// so a widget that would render black fails here instead.
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native-android-widget', async () => {
  const flex = await import('react-native-android-widget/lib/commonjs/widgets/FlexWidget');
  const text = await import('react-native-android-widget/lib/commonjs/widgets/TextWidget');
  return { FlexWidget: flex.FlexWidget, TextWidget: text.TextWidget };
});

const goal = (over: object) => ({ habitId: 'h', name: 'Push-ups', unit: 'reps', progress: 60, target: 100, done: false, min: false, limit: false, ...over });

describe('Daily Quest widget', () => {
  it('builds a widget tree for open, minimum and cleared quests', async () => {
    const { buildWidgetTree } = await import('react-native-android-widget/lib/commonjs/api/build-widget-tree');
    const { QuestWidget } = await import('./quest-widget');
    const goals = [
      goal({ habitId: 'a' }),
      goal({ habitId: 'b', name: 'Read', min: true, progress: 5, target: 20, unit: 'pages' }),
      goal({ habitId: 'c', name: 'Sleep before 23:00', unit: '', target: 1, progress: 1, done: true }),
      goal({ habitId: 'd', name: 'Phone under 3 h', unit: 'min', target: 180, progress: 42, done: true, limit: true }),
    ];
    const tree = buildWidgetTree(QuestWidget({ goals, snapshot: { day: '2026-10-21', level: 15, streak: 37, test: false }, height: 240 }));
    const texts = JSON.stringify(tree);
    expect(tree.type).toBe('LinearLayoutWidget');
    expect(texts).toContain('DAILY QUEST');
    expect(texts).toContain('60/100 reps');
    expect(texts).toContain('MARK_DONE');
    expect(texts).toContain('42/180 min');
  });

  it('builds when there are no quests and when rows overflow', async () => {
    const { buildWidgetTree } = await import('react-native-android-widget/lib/commonjs/api/build-widget-tree');
    const { QuestWidget, WidgetError } = await import('./quest-widget');
    expect(() => buildWidgetTree(QuestWidget({ goals: [], snapshot: null, height: 110 }))).not.toThrow();
    const many = Array.from({ length: 8 }, (_, i) => goal({ habitId: String(i) }));
    expect(JSON.stringify(buildWidgetTree(QuestWidget({ goals: many, snapshot: null, height: 110 })))).toContain('more · tap to open');
    expect(() => buildWidgetTree(WidgetError({ message: 'boom' }))).not.toThrow();
  });
});
