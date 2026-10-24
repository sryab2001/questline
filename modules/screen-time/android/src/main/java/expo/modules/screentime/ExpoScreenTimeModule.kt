package expo.modules.screentime

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Total screen time from Android's usage stats: how long any app was in the
 * foreground, with overlapping activities merged and the home screen excluded.
 * Needs the user to grant Usage access once in system settings.
 */
class ExpoScreenTimeModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context is not available")

  override fun definition() = ModuleDefinition {
    Name("ExpoScreenTime")

    Function("hasUsageAccess") { hasUsageAccess() }

    Function("openUsageAccessSettings") {
      context.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** Foreground milliseconds between two epoch times, or -1 without Usage access. */
    AsyncFunction("getForegroundMillis") { startMs: Double, endMs: Double ->
      foregroundMillis(startMs.toLong(), endMs.toLong()).toDouble()
    }
  }

  private fun hasUsageAccess(): Boolean {
    val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    } else {
      @Suppress("DEPRECATION")
      ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }

  /** Launchers and the system UI don't count as screen time. */
  private fun ignoredPackages(): Set<String> {
    val ignored = mutableSetOf("com.android.systemui")
    try {
      val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
      for (info in context.packageManager.queryIntentActivities(home, 0)) ignored.add(info.activityInfo.packageName)
    } catch (_: Exception) {
      // Without the list, launcher time is counted; better than failing.
    }
    return ignored
  }

  private fun foregroundMillis(start: Long, end: Long): Long {
    if (end <= start) return 0
    if (!hasUsageAccess()) return -1
    val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val ignored = ignoredPackages()
    val events = usm.queryEvents(start, end)
    val event = UsageEvents.Event()

    // Merge foreground intervals across apps: time counts while any activity is resumed.
    val active = HashSet<String>()
    var segmentStart = 0L
    var total = 0L
    var sawAny = false
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      val pkg = event.packageName ?: continue
      if (pkg in ignored) continue
      val key = "$pkg/${event.className}"
      when (event.eventType) {
        UsageEvents.Event.ACTIVITY_RESUMED -> {
          if (active.isEmpty()) segmentStart = event.timeStamp
          active.add(key)
          sawAny = true
        }
        UsageEvents.Event.ACTIVITY_PAUSED, UsageEvents.Event.ACTIVITY_STOPPED -> {
          if (active.remove(key)) {
            if (active.isEmpty()) total += event.timeStamp - segmentStart
          } else if (!sawAny) {
            // The app was already in front when the window began.
            total += event.timeStamp - start
          }
          sawAny = true
        }
      }
    }
    if (active.isNotEmpty()) total += minOf(end, System.currentTimeMillis()) - segmentStart
    return total.coerceIn(0, end - start)
  }
}
