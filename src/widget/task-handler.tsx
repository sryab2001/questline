import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { markGoalDone } from '@/quick/today';

import { renderQuestWidget } from './refresh';

/** Runs headless whenever the widget is added, resized, refreshed (every 30 min) or tapped. */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(await renderQuestWidget(props.widgetInfo));
      break;
    case 'WIDGET_CLICK':
      if (props.clickAction === 'MARK_DONE' && typeof props.clickActionData?.habitId === 'string') {
        await markGoalDone(props.clickActionData.habitId);
      }
      props.renderWidget(await renderQuestWidget(props.widgetInfo));
      break;
    default:
      break;
  }
}
