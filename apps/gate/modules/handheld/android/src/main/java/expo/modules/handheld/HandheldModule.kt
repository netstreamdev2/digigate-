package expo.modules.handheld

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.UserManager
import android.provider.MediaStore
import android.provider.Settings
import android.telecom.TelecomManager
import android.view.inputmethod.InputMethodManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * A gate handheld under DigiGate's control, once DigiGate is its device owner. Not a full kiosk: DigiGate is the home
 * screen and the guard can still open the phone, camera and gallery, but every other app is hidden and the settings
 * that would take the handheld off the record are locked: hotspot, airplane mode, mobile data, the clock, location,
 * factory reset, safe mode, and copying files off it. Every step is undone by release().
 */
class HandheldModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "The app isn't ready yet" }

  private val policy: DevicePolicyManager
    get() = context.getSystemService(DevicePolicyManager::class.java)

  private val admin: ComponentName
    get() = ComponentName(context, GateDeviceAdmin::class.java)

  private val home: ComponentName
    get() = ComponentName(context.packageName, HOME_ALIAS)

  private val isOwner: Boolean
    get() = policy.isDeviceOwnerApp(context.packageName)

  override fun definition() = ModuleDefinition {
    Name("Handheld")

    Function("isDeviceOwner") { isOwner }

    // Idempotent: run at every start, so a handheld always ends up as the policy says. Returns what couldn't be done,
    // by name, for the shift screen; one setting failing never stops the rest.
    Function("applyGatePolicy") { alsoAllowed: List<String> ->
      if (!isOwner) return@Function listOf("not-device-owner")
      val problems = mutableListOf<String>()
      fun attempt(name: String, step: () -> Unit) {
        runCatching(step).onFailure { problems.add(name) }
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        attempt("auto-time") { policy.setAutoTimeEnabled(admin, true) }
        attempt("auto-time-zone") { policy.setAutoTimeZoneEnabled(admin, true) }
        attempt("location-on") { policy.setLocationEnabled(admin, true) }
      }
      for (restriction in restrictions()) attempt(restriction) { policy.addUserRestriction(admin, restriction) }
      attempt("read-phone-state") {
        policy.setPermissionGrantState(admin, context.packageName, Manifest.permission.READ_PHONE_STATE, DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED)
      }
      attempt("home-screen") { makeHome() }
      attempt("hide-apps") { hideApps(alsoAllowed.toSet()) }
      problems
    }

    // Hands the handheld back as an ordinary Android device: every restriction lifted, every hidden app back, the usual
    // home screen, and DigiGate no longer its owner. Done by a supervisor, and on record, before a handheld leaves.
    Function("release") {
      if (!isOwner) return@Function listOf("not-device-owner")
      val problems = mutableListOf<String>()
      for (restriction in restrictions()) runCatching { policy.clearUserRestriction(admin, restriction) }.onFailure { problems.add(restriction) }
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      for (name in prefs.getStringSet(HIDDEN_KEY, emptySet()).orEmpty()) {
        runCatching { policy.setApplicationHidden(admin, name, false) }.onFailure { problems.add("unhide") }
      }
      prefs.edit().remove(HIDDEN_KEY).commit()
      runCatching {
        policy.clearPackagePersistentPreferredActivities(admin, context.packageName)
        context.packageManager.setComponentEnabledSetting(home, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
      }.onFailure { problems.add("home-screen") }
      // Deprecated since Android 8, but still the only way a device owner steps down without wiping the handheld.
      @Suppress("DEPRECATION")
      if (problems.isEmpty()) runCatching { policy.clearDeviceOwnerApp(context.packageName) }.onFailure { problems.add("owner") }
      problems
    }
  }

  private fun restrictions(): List<String> = buildList {
    add(UserManager.DISALLOW_CONFIG_TETHERING)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) add(UserManager.DISALLOW_AIRPLANE_MODE)
    add(UserManager.DISALLOW_CONFIG_MOBILE_NETWORKS)
    add(UserManager.DISALLOW_CONFIG_DATE_TIME)
    add(UserManager.DISALLOW_CONFIG_LOCATION)
    add(UserManager.DISALLOW_FACTORY_RESET)
    add(UserManager.DISALLOW_SAFE_BOOT)
    add(UserManager.DISALLOW_ADD_USER)
    // Force-stopping DigiGate or clearing its data from Settings would lose checks not yet synced.
    add(UserManager.DISALLOW_APPS_CONTROL)
    // Photos of licences and IDs never leave the handheld except through DigiGate's own sync.
    add(UserManager.DISALLOW_USB_FILE_TRANSFER)
    add(UserManager.DISALLOW_BLUETOOTH_SHARING)
  }

  private fun makeHome() {
    context.packageManager.setComponentEnabledSetting(home, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
    val filter = IntentFilter(Intent.ACTION_MAIN).apply {
      addCategory(Intent.CATEGORY_HOME)
      addCategory(Intent.CATEGORY_DEFAULT)
    }
    policy.addPersistentPreferredActivity(admin, filter, home)
  }

  /**
   * Hides every app a guard could open, except DigiGate, the phone, the camera and gallery, and what the handheld
   * needs to work: the keyboard, the system home and recents, Settings, the SIM's menu and the scanner's own apps.
   * Only apps with an icon are touched, so system services are never hidden.
   */
  private fun hideApps(alsoAllowed: Set<String>) {
    val keep = keptPackages() + alsoAllowed
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val hidden = prefs.getStringSet(HIDDEN_KEY, emptySet()).orEmpty().toMutableSet()

    // An app allowed since it was hidden comes back.
    for (name in hidden.filter { it in keep }) {
      if (runCatching { policy.setApplicationHidden(admin, name, false) }.getOrDefault(false)) hidden.remove(name)
    }
    for (name in packagesFor(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER))) {
      if (name in keep || SCANNER_VENDORS.any { name.startsWith(it) }) continue
      if (policy.setApplicationHidden(admin, name, true)) hidden.add(name)
    }
    prefs.edit().putStringSet(HIDDEN_KEY, hidden).commit()
  }

  private fun keptPackages(): Set<String> {
    val packages = context.packageManager
    val browsers = packagesFor(Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com")))
    val systemOnly = { names: Set<String> -> names.filter { isSystemApp(it) }.toSet() }

    val keep = mutableSetOf(context.packageName, SIM_TOOLKIT)
    context.getSystemService(TelecomManager::class.java)?.defaultDialerPackage?.let { keep.add(it) }
    keep += systemOnly(packagesFor(Intent(Intent.ACTION_DIAL)))
    keep += systemOnly(packagesFor(Intent(MediaStore.ACTION_IMAGE_CAPTURE)) + packagesFor(Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA)))
    // The gallery, but not a browser that also opens pictures.
    keep += systemOnly(packagesFor(Intent(Intent.ACTION_VIEW).setType("image/*"))) - browsers
    keep += context.getSystemService(InputMethodManager::class.java)?.inputMethodList?.map { it.packageName }.orEmpty()
    keep += packagesFor(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME))
    packages.resolveActivity(Intent(Settings.ACTION_SETTINGS), 0)?.activityInfo?.packageName?.let { keep.add(it) }
    return keep
  }

  private fun packagesFor(intent: Intent): Set<String> =
    context.packageManager.queryIntentActivities(intent, PackageManager.MATCH_ALL).map { it.activityInfo.packageName }.toSet()

  private fun isSystemApp(name: String): Boolean =
    runCatching { context.packageManager.getApplicationInfo(name, 0).flags and ApplicationInfo.FLAG_SYSTEM != 0 }.getOrDefault(false)

  private companion object {
    const val HOME_ALIAS = "expo.modules.handheld.GateHome"
    const val PREFS = "digigate_handheld"
    const val HIDDEN_KEY = "hidden_apps"
    const val SIM_TOOLKIT = "com.android.stk"
    // Hiding a scanner vendor's app can stop its scan service, so they're never touched, whatever the brand.
    val SCANNER_VENDORS = listOf("com.ubx.", "com.urovo.", "com.symbol.", "com.zebra.", "com.honeywell.", "com.hsm.", "com.newland.", "com.chainway.")
  }
}
