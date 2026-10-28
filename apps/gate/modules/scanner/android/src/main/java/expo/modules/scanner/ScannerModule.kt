package expo.modules.scanner

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Base64
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ScannerModule : Module() {
  private val adapter: ScannerAdapter? = adapterFor(Build.MANUFACTURER)
  private var receiver: BroadcastReceiver? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("Scanner")

    Events("onScan")

    OnStartObserving("onScan") { startListening() }
    OnStopObserving("onScan") { stopListening() }
    OnDestroy { stopListening() }

    Function("getScannerInfo") {
      mapOf(
        "vendor" to adapter?.vendor,
        "manufacturer" to Build.MANUFACTURER,
        "model" to Build.MODEL,
        "androidVersion" to Build.VERSION.RELEASE,
        "outputMode" to (adapter?.outputMode() ?: OutputMode.UNKNOWN).jsName,
      )
    }

    Function("switchToAppOutput") {
      adapter?.switchToAppOutput() ?: false
    }
  }

  private fun startListening() {
    val scanner = adapter ?: return
    if (receiver != null) return

    val scanReceiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        val scan = scanner.readScan(intent) ?: return
        sendEvent(
          "onScan",
          mapOf(
            "bytes" to Base64.encodeToString(scan.bytes, Base64.NO_WRAP),
            "length" to scan.bytes.size,
            "symbology" to scan.symbology,
            "vendor" to scanner.vendor,
            "receivedAt" to System.currentTimeMillis(),
          ),
        )
      }
    }
    val filter = IntentFilter().apply { scanner.scanActions.forEach(::addAction) }

    // The broadcast comes from the vendor's scanner service, a different app, so the receiver must be exported.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(scanReceiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      context.registerReceiver(scanReceiver, filter)
    }
    receiver = scanReceiver
  }

  private fun stopListening() {
    val current = receiver ?: return
    receiver = null
    appContext.reactContext?.unregisterReceiver(current)
  }
}
