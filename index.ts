// App entry: background handlers first (they can run without any screen), then the router.
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import './src/background';
import { widgetTaskHandler } from './src/widget/task-handler';

import 'expo-router/entry';

registerWidgetTaskHandler(widgetTaskHandler);
