package expo.modules.devicesignal

import android.content.Context
import android.telephony.TelephonyManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DeviceSignalModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DeviceSignal")

    // The same 0 to 4 bars the status bar shows. Null with no SIM, or before the radio has reported.
    Function("cellBars") {
      val telephony = appContext.reactContext?.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
      telephony?.signalStrength?.level
    }
  }
}
