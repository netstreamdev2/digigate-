package expo.modules.devicesignal

import android.app.usage.NetworkStats
import android.app.usage.NetworkStatsManager
import android.content.Context
import android.net.ConnectivityManager
import android.os.Process
import android.telephony.TelephonyManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DeviceSignalModule : Module() {
  private val context: Context?
    get() = appContext.reactContext

  private val telephony: TelephonyManager?
    get() = context?.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager

  override fun definition() = ModuleDefinition {
    Name("DeviceSignal")

    // The same 0 to 4 bars the status bar shows. Null with no SIM, or before the radio has reported.
    Function("cellBars") {
      telephony?.signalStrength?.level
    }

    // The SIM as the control room needs it: whether one is in, whose it is, and whether data can flow. Never its
    // number or serial: Android keeps those from apps, and the dashboard holds the number the admin typed in.
    Function("sim") {
      val phone = telephony ?: return@Function null
      mapOf(
        "state" to simState(phone.simState),
        "simOperator" to phone.simOperatorName?.takeIf { it.isNotBlank() },
        "networkOperator" to phone.networkOperatorName?.takeIf { it.isNotBlank() },
        "roaming" to phone.isNetworkRoaming,
        "dataEnabled" to runCatching { phone.isDataEnabled }.getOrNull(),
      )
    }

    // Mobile data used in each [start, end) range, in bytes: the whole handheld's (hotspot and every app included; null
    // unless DigiGate is device owner or has usage access) and DigiGate's own, which Android always lets it read.
    AsyncFunction("mobileData") { ranges: List<List<Double>> ->
      val stats = context?.getSystemService(NetworkStatsManager::class.java) ?: return@AsyncFunction emptyList<Map<String, Double?>>()
      ranges.mapNotNull { range ->
        val start = range.getOrNull(0)?.toLong() ?: return@mapNotNull null
        val end = range.getOrNull(1)?.toLong() ?: return@mapNotNull null
        mapOf("device" to deviceBytes(stats, start, end), "app" to appBytes(stats, start, end))
      }
    }
  }

  private fun simState(state: Int): String = when (state) {
    TelephonyManager.SIM_STATE_ABSENT -> "absent"
    TelephonyManager.SIM_STATE_READY -> "ready"
    TelephonyManager.SIM_STATE_PIN_REQUIRED, TelephonyManager.SIM_STATE_PUK_REQUIRED, TelephonyManager.SIM_STATE_NETWORK_LOCKED -> "locked"
    TelephonyManager.SIM_STATE_PERM_DISABLED, TelephonyManager.SIM_STATE_CARD_IO_ERROR, TelephonyManager.SIM_STATE_CARD_RESTRICTED -> "faulty"
    else -> "unknown"
  }

  @Suppress("DEPRECATION")
  private fun deviceBytes(stats: NetworkStatsManager, start: Long, end: Long): Double? =
    runCatching {
      val bucket = stats.querySummaryForDevice(ConnectivityManager.TYPE_MOBILE, null, start, end)
      (bucket.rxBytes + bucket.txBytes).toDouble()
    }.getOrNull()

  @Suppress("DEPRECATION")
  private fun appBytes(stats: NetworkStatsManager, start: Long, end: Long): Double? =
    runCatching {
      var total = 0L
      val buckets = stats.queryDetailsForUid(ConnectivityManager.TYPE_MOBILE, null, start, end, Process.myUid())
      try {
        val bucket = NetworkStats.Bucket()
        while (buckets.hasNextBucket()) {
          buckets.getNextBucket(bucket)
          total += bucket.rxBytes + bucket.txBytes
        }
      } finally {
        buckets.close()
      }
      total.toDouble()
    }.getOrNull()
}
