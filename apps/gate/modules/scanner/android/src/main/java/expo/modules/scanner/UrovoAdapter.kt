package expo.modules.scanner

import android.content.Intent

// Urovo's ScanManager lives in the device firmware (android.device.ScanManager), not in a library we can
// compile against, so it's reached by reflection. Any mismatch degrades to UNKNOWN / false instead of crashing.
internal class UrovoAdapter : ScannerAdapter {
  override val vendor = "urovo"

  // Current firmware broadcasts ACTION_DECODE_DATA; older Urovo firmware used urovo.rcv.message.
  override val scanActions = listOf("android.intent.ACTION_DECODE_DATA", "urovo.rcv.message")

  override fun readScan(intent: Intent): RawScan? {
    // Older firmware spells the byte-array extra "barocode".
    val raw = intent.getByteArrayExtra("barcode") ?: intent.getByteArrayExtra("barocode") ?: return null
    val length = intent.getIntExtra("length", raw.size).coerceIn(0, raw.size)
    @Suppress("DEPRECATION")
    val symbology = intent.extras?.get("barcodeType")?.toString()
    return RawScan(raw.copyOf(length), symbology)
  }

  override fun outputMode(): OutputMode {
    val mode = callScanManager("getOutputMode") as? Int
    return when (mode) {
      OUTPUT_MODE_INTENT -> OutputMode.APP
      OUTPUT_MODE_KEYBOARD -> OutputMode.KEYBOARD
      else -> OutputMode.UNKNOWN
    }
  }

  override fun switchToAppOutput(): Boolean =
    callScanManager("switchOutputMode", OUTPUT_MODE_INTENT) as? Boolean ?: false

  private fun callScanManager(method: String, vararg args: Int): Any? =
    runCatching {
      val managerClass = Class.forName("android.device.ScanManager")
      val manager = managerClass.getDeclaredConstructor().newInstance()
      val parameterTypes = Array(args.size) { Int::class.javaPrimitiveType }
      managerClass.getMethod(method, *parameterTypes).invoke(manager, *args.toTypedArray())
    }.getOrNull()

  private companion object {
    const val OUTPUT_MODE_INTENT = 0
    const val OUTPUT_MODE_KEYBOARD = 1
  }
}
