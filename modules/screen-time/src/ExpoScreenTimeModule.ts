import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class ExpoScreenTimeModule extends NativeModule {
  hasUsageAccess(): boolean;
  openUsageAccessSettings(): void;
  /** Foreground milliseconds between two epoch times, or -1 without Usage access. */
  getForegroundMillis(startMs: number, endMs: number): Promise<number>;
}

/** Null where the native module isn't built in (Expo Go, tests, other platforms). */
export default requireOptionalNativeModule<ExpoScreenTimeModule>('ExpoScreenTime');
