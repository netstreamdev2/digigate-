package expo.modules.scanner

import android.content.Intent

/** One scanner vendor's way of delivering decoded barcodes and switching its output mode. */
internal interface ScannerAdapter {
  val vendor: String

  /** Broadcast actions the vendor's scanner service uses to deliver a decoded barcode. */
  val scanActions: List<String>

  fun readScan(intent: Intent): RawScan?

  fun outputMode(): OutputMode

  /** Switches the scanner from typing into the focused app to broadcasting raw bytes. */
  fun switchToAppOutput(): Boolean
}

internal enum class OutputMode(val jsName: String) {
  APP("app"),
  KEYBOARD("keyboard"),
  UNKNOWN("unknown"),
}

internal class RawScan(val bytes: ByteArray, val symbology: String?)

internal fun adapterFor(manufacturer: String): ScannerAdapter? =
  when {
    manufacturer.equals("UROVO", ignoreCase = true) -> UrovoAdapter()
    else -> null
  }
