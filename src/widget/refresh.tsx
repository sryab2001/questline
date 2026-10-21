'use no memo';

import { requestWidgetUpdate, type WidgetInfo } from 'react-native-android-widget';

import { loadTodayGoals, readSnapshot } from '@/quick/today';

import { QuestWidget, WidgetError } from './quest-widget';

export const WIDGET_NAME = 'DailyQuest';

/** Builds the widget from the database as it is now. */
export async function renderQuestWidget(info: Pick<WidgetInfo, 'height'>) {
  try {
    const { goals } = await loadTodayGoals();
    // Call the component directly so a failure is caught here, not later inside the library.
    return QuestWidget({ goals, snapshot: readSnapshot(), height: info.height });
  } catch (e) {
    return <WidgetError message={e instanceof Error ? e.message : String(e)} />;
  }
}

/** Redraws every Daily Quest widget on the home screen (no-op when there are none). */
export async function refreshWidget() {
  await requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: (info) => renderQuestWidget(info) }).catch(() => {});
}
