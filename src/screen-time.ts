// Screen time from the local native module (modules/screen-time). Every call is
// safe where the module isn't built in (Expo Go, tests): it reports "no access".
import ScreenTime from '../modules/screen-time';

export const screenTimeAvailable = () => ScreenTime !== null;

export const hasUsageAccess = () => ScreenTime?.hasUsageAccess() ?? false;

export const openUsageAccessSettings = () => ScreenTime?.openUsageAccessSettings();

/** Foreground milliseconds between two epoch times, or -1 without access. */
export const foregroundMillis = (startMs: number, endMs: number) =>
  ScreenTime ? ScreenTime.getForegroundMillis(startMs, endMs) : Promise.resolve(-1);
