// Types for react-native-android-widget internals used by quest-widget.test.ts to
// build the widget tree in Node, without the native module.
declare module 'react-native-android-widget/lib/commonjs/widgets/FlexWidget' {
  export { FlexWidget } from 'react-native-android-widget';
}
declare module 'react-native-android-widget/lib/commonjs/widgets/TextWidget' {
  export { TextWidget } from 'react-native-android-widget';
}
declare module 'react-native-android-widget/lib/commonjs/api/build-widget-tree' {
  export function buildWidgetTree(jsx: unknown): { type: string; props: unknown; children?: unknown[] };
}
