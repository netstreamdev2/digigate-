package expo.modules.devicelog

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.telephony.ServiceState
import android.telephony.TelephonyManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Records why a handheld might have gone quiet, as it happens, so the control room can be told once it's back: switched
 * off, went off without shutting down (a flat battery, mostly), switched on, airplane mode, mobile data, the SIM, no
 * signal, and DigiGate itself being closed. Nothing here needs the network; DigiGate sends the entries as events.
 */
class DeviceLogModule : Module() {
  private var store: DeviceLogStore? = null
  private var receiver: BroadcastReceiver? = null
  private val ticker = Handler(Looper.getMainLooper())
  private val pending = mutableMapOf<String, Pair<String, Long>>()

  override fun definition() = ModuleDefinition {
    Name("DeviceLog")

    OnCreate {
      val context = appContext.reactContext?.applicationContext ?: return@OnCreate
      val log = DeviceLogStore(context)
      store = log
      if (!startedThisProcess) {
        startedThisProcess = true
        recordRestart(context, log)
        recordAppExits(context, log)
      }
      listen(context, log)
      ticker.post(object : Runnable {
        override fun run() {
          tick(context, log)
          ticker.postDelayed(this, TICK_MS)
        }
      })
    }

    OnDestroy {
      ticker.removeCallbacksAndMessages(null)
      val context = appContext.reactContext?.applicationContext
      receiver?.let { registered -> runCatching { context?.unregisterReceiver(registered) } }
      receiver = null
    }

    // Entries newer than `seq`, oldest first. DigiGate keeps the last seq it has turned into events.
    Function("entriesAfter") { seq: Int -> store?.entriesAfter(seq).orEmpty() }
  }

  private fun listen(context: Context, log: DeviceLogStore) {
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_SHUTDOWN)
      addAction(QUICKBOOT_POWEROFF)
      addAction(Intent.ACTION_AIRPLANE_MODE_CHANGED)
    }
    val listener = object : BroadcastReceiver() {
      override fun onReceive(received: Context, intent: Intent) {
        when (intent.action) {
          Intent.ACTION_SHUTDOWN, QUICKBOOT_POWEROFF -> {
            log.append("switched_off", System.currentTimeMillis(), battery(received))
            log.edit { putInt(SHUTDOWN_BOOT_KEY, bootCount(received)) }
          }
          Intent.ACTION_AIRPLANE_MODE_CHANGED -> settle(log, "airplane", if (intent.getBooleanExtra("state", false)) "on" else "off", now = true)
        }
      }
    }
    // System broadcasts reach a receiver that isn't exported.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) context.registerReceiver(listener, filter, Context.RECEIVER_NOT_EXPORTED)
    else context.registerReceiver(listener, filter)
    receiver = listener
  }

  /** A restart since DigiGate last ran: logged as switched off already, or it went off without warning. */
  private fun recordRestart(context: Context, log: DeviceLogStore) {
    val current = bootCount(context)
    val last = log.getInt(BOOT_KEY, NOT_KNOWN)
    log.edit { putInt(BOOT_KEY, current) }
    if (last == NOT_KNOWN || current == NOT_KNOWN || last == current) return

    if (log.getInt(SHUTDOWN_BOOT_KEY, NOT_KNOWN) != last) {
      val lastAlive = log.getLong(ALIVE_AT_KEY, 0L)
      if (lastAlive > 0) log.append("went_off", lastAlive, log.getInt(ALIVE_BATTERY_KEY, NOT_KNOWN).takeIf { it >= 0 })
    }
    log.append("switched_on", System.currentTimeMillis() - SystemClock.elapsedRealtime(), battery(context))
  }

  /** DigiGate being closed since it last ran, and why, as far as Android says (Android 11 and later). */
  private fun recordAppExits(context: Context, log: DeviceLogStore) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
    val activities = context.getSystemService(ActivityManager::class.java) ?: return
    val seen = log.getLong(EXIT_SEEN_KEY, NOT_KNOWN.toLong())
    val exits = runCatching { activities.getHistoricalProcessExitReasons(context.packageName, 0, 16) }.getOrDefault(emptyList())
      .filter { it.processName == context.packageName }
    val newest = exits.maxOfOrNull { it.timestamp } ?: return
    log.edit { putLong(EXIT_SEEN_KEY, newest) }
    // The first run has nothing to compare with, and a process ended by the handheld switching off is no news.
    if (seen == NOT_KNOWN.toLong()) return
    val restartedAt = System.currentTimeMillis() - SystemClock.elapsedRealtime()
    for (exit in exits.filter { it.timestamp > seen }.sortedBy { it.timestamp }) {
      if (exit.timestamp >= restartedAt - SHUTDOWN_GRACE_MS && exit.timestamp <= restartedAt) continue
      val reason = exitReason(exit.reason) ?: continue
      log.append("app_closed", exit.timestamp, null, reason)
    }
  }

  private fun exitReason(reason: Int): String? = when (reason) {
    ApplicationExitInfo.REASON_USER_REQUESTED -> "by_user"
    ApplicationExitInfo.REASON_CRASH, ApplicationExitInfo.REASON_CRASH_NATIVE -> "crash"
    ApplicationExitInfo.REASON_ANR -> "not_responding"
    ApplicationExitInfo.REASON_LOW_MEMORY -> "low_memory"
    ApplicationExitInfo.REASON_SIGNALED, ApplicationExitInfo.REASON_OTHER, ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE,
    ApplicationExitInfo.REASON_INITIALIZATION_FAILURE, ApplicationExitInfo.REASON_PERMISSION_CHANGE -> "system"
    // Exiting by itself, an update, or another user stopping: none is the handheld going quiet.
    else -> null
  }

  /** Once a minute: a sign of life for the next start, and anything that changed and stayed changed. */
  private fun tick(context: Context, log: DeviceLogStore) {
    val now = System.currentTimeMillis()
    val level = battery(context)
    log.edit {
      putLong(ALIVE_AT_KEY, now)
      if (level != null) putInt(ALIVE_BATTERY_KEY, level)
    }

    val airplane = Settings.Global.getInt(context.contentResolver, Settings.Global.AIRPLANE_MODE_ON, 0) == 1
    settle(log, "airplane", if (airplane) "on" else "off", now = false)
    val phone = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager ?: return
    when (phone.simState) {
      TelephonyManager.SIM_STATE_ABSENT -> settle(log, "sim", "out", now = false)
      TelephonyManager.SIM_STATE_READY -> settle(log, "sim", "in", now = false)
    }
    runCatching { phone.isDataEnabled }.getOrNull()?.let { settle(log, "data", if (it) "on" else "off", now = false) }
    // In airplane mode no signal is expected, so it isn't news.
    if (!airplane) {
      val service = runCatching { phone.serviceState?.state }.getOrNull()
      val inService = when (service) {
        ServiceState.STATE_IN_SERVICE -> true
        ServiceState.STATE_OUT_OF_SERVICE, ServiceState.STATE_EMERGENCY_ONLY -> false
        else -> phone.signalStrength?.level?.let { it > 0 }
      }
      inService?.let { settle(log, "signal", if (it) "on" else "off", now = false) }
    }
  }

  /**
   * Records a change once it has held for two ticks, so a flickering signal isn't a story, at the time it was first
   * seen. A change the guard made (airplane mode) is recorded at once. The first reading ever is only remembered.
   */
  private fun settle(log: DeviceLogStore, what: String, value: String, now: Boolean) {
    val key = "state_$what"
    val known = log.getString(key)
    if (known == value) {
      pending.remove(what)
      return
    }
    if (known == null) {
      log.edit { putString(key, value) }
      return
    }
    val at = System.currentTimeMillis()
    val seen = pending[what]
    if (!now && (seen == null || seen.first != value)) {
      pending[what] = value to at
      return
    }
    pending.remove(what)
    log.edit { putString(key, value) }
    log.append(KINDS.getValue(what).getValue(value), seen?.second ?: at, null)
  }

  private fun battery(context: Context): Int? =
    context.getSystemService(BatteryManager::class.java)?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)?.takeIf { it in 0..100 }

  private fun bootCount(context: Context): Int = Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, NOT_KNOWN)

  private companion object {
    @Volatile var startedThisProcess = false
    const val TICK_MS = 60_000L
    const val SHUTDOWN_GRACE_MS = 10 * 60_000L
    const val NOT_KNOWN = -1
    const val QUICKBOOT_POWEROFF = "android.intent.action.QUICKBOOT_POWEROFF"
    const val BOOT_KEY = "boot_count"
    const val SHUTDOWN_BOOT_KEY = "shutdown_boot_count"
    const val ALIVE_AT_KEY = "alive_at"
    const val ALIVE_BATTERY_KEY = "alive_battery"
    const val EXIT_SEEN_KEY = "exit_seen"
    val KINDS = mapOf(
      "airplane" to mapOf("on" to "airplane_on", "off" to "airplane_off"),
      "sim" to mapOf("out" to "sim_removed", "in" to "sim_back"),
      "data" to mapOf("off" to "data_off", "on" to "data_on"),
      "signal" to mapOf("off" to "no_signal", "on" to "signal_back"),
    )
  }
}
