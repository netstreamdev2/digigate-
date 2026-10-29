package expo.modules.securehash

import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

class SecureHashModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SecureHash")

    // Async functions run off the JavaScript thread, so a PIN check never freezes the screen.
    AsyncFunction("pbkdf2Sha256") { password: String, saltBase64: String, iterations: Int, keyLength: Int ->
      val salt = Base64.decode(saltBase64, Base64.NO_WRAP)
      val spec = PBEKeySpec(password.toCharArray(), salt, iterations, keyLength * 8)
      try {
        val derived = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
        Base64.encodeToString(derived, Base64.NO_WRAP)
      } finally {
        spec.clearPassword()
      }
    }
  }
}
