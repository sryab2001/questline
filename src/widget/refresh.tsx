import { requestWidgetUpdate, type WidgetInfo } from 'react-native-android-widget';

import { loadTodayGoals, readSnapshot } from '@/quick/today';

import { QuestWidget } from './quest-widget';

export const WIDGET_NAME = 'DailyQuest';

/** Builds the widget from the database as it is now. */
export async function renderQuestWidget(info: Pick<WidgetInfo, 'height'>) {
  const { goals } = await loadTodayGoals();
  return <QuestWidget goals={goals} snapshot={readSnapshot()} height={info.height} />;
}

/** Redraws every Daily Quest widget on the home screen (no-op when there are none). */
export async function refreshWidget() {
  await requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: (info) => renderQuestWidget(info) }).catch(() => {});
}
