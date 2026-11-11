package expo.modules.devicelog

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * What happened to the handheld, kept on the handheld until DigiGate has sent it: entries numbered in order, the
 * newest MAX_ENTRIES kept. Written with commit(), so an entry made as the handheld shuts down is on disk before it does.
 */
internal class DeviceLogStore(context: Context) {
  private val prefs: SharedPreferences = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  @Synchronized
  fun append(kind: String, at: Long, battery: Int?, reason: String? = null) {
    val seq = prefs.getInt(SEQ_KEY, 0) + 1
    val entry = JSONObject().put("seq", seq).put("at", at).put("kind", kind)
    if (battery != null) entry.put("battery", battery)
    if (reason != null) entry.put("reason", reason)
    val entries = read()
    entries.put(entry)
    val kept = JSONArray()
    for (index in maxOf(0, entries.length() - MAX_ENTRIES) until entries.length()) kept.put(entries.get(index))
    prefs.edit().putInt(SEQ_KEY, seq).putString(ENTRIES_KEY, kept.toString()).commit()
  }

  @Synchronized
  fun entriesAfter(seq: Int): List<Map<String, Any?>> {
    val entries = read()
    return (0 until entries.length()).mapNotNull { index ->
      val entry = entries.optJSONObject(index) ?: return@mapNotNull null
      if (entry.optInt("seq") <= seq) return@mapNotNull null
      mapOf(
        "seq" to entry.optInt("seq"),
        "at" to entry.optLong("at").toDouble(),
        "kind" to entry.optString("kind"),
        "battery" to if (entry.has("battery")) entry.optInt("battery") else null,
        "reason" to if (entry.has("reason")) entry.optString("reason") else null,
      )
    }
  }

  fun getInt(key: String, fallback: Int): Int = prefs.getInt(key, fallback)
  fun getLong(key: String, fallback: Long): Long = prefs.getLong(key, fallback)
  fun getString(key: String): String? = prefs.getString(key, null)

  /** For the small facts kept between runs; written straight away, as they decide what the next start records. */
  fun edit(change: SharedPreferences.Editor.() -> Unit) {
    prefs.edit().apply(change).commit()
  }

  private fun read(): JSONArray = runCatching { JSONArray(prefs.getString(ENTRIES_KEY, "[]")) }.getOrDefault(JSONArray())

  private companion object {
    const val PREFS = "digigate_device_log"
    const val SEQ_KEY = "seq"
    const val ENTRIES_KEY = "entries"
    const val MAX_ENTRIES = 500
  }
}
