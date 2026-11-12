package expo.modules.handheld

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller

/*
 * The two ends of DigiGate updating itself on a handheld it owns.
 *
 * InstallResultReceiver hears how an install went. A successful one replaces the running app, so it's mostly a failure
 * that gets here; it's kept for the app to read and report at its next start (HandheldModule.lastInstallResult).
 *
 * UpdatedReceiver hears that DigiGate has just been replaced by a newer version, and opens it again, so the guard is
 * never left looking at a blank screen while the new version waits to be opened.
 */

class InstallResultReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
    val outcome = when (status) {
      PackageInstaller.STATUS_SUCCESS -> "installed"
      PackageInstaller.STATUS_PENDING_USER_ACTION -> "needs-user-action"
      PackageInstaller.STATUS_FAILURE_ABORTED -> "aborted"
      PackageInstaller.STATUS_FAILURE_BLOCKED -> "blocked"
      PackageInstaller.STATUS_FAILURE_CONFLICT -> "conflict"
      PackageInstaller.STATUS_FAILURE_INCOMPATIBLE -> "incompatible"
      PackageInstaller.STATUS_FAILURE_INVALID -> "invalid"
      PackageInstaller.STATUS_FAILURE_STORAGE -> "no-storage"
      else -> "failed"
    }
    context.getSharedPreferences(HandheldModule.PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(HandheldModule.INSTALL_RESULT_KEY, outcome)
      .apply()
  }
}

class UpdatedReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    // A device owner may open its own screen from the background; anything that refuses only waits for the next touch.
    runCatching { context.startActivity(launch) }
  }
}
