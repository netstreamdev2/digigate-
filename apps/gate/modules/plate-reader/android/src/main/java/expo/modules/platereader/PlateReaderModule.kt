package expo.modules.platereader

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException

// Reads the text in a photo on the device, with no connection. Thin on purpose: it hands back every line with its
// height, and deciding which line is the plate happens in packages/core. Nothing read here is logged.
class PlateReaderModule : Module() {
  private var reader: TextRecognizer? = null

  // One reader for the app's life: the model loads once, so every photo after the first reads quickly.
  private fun textReader(): TextRecognizer =
    reader ?: TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS).also { reader = it }

  override fun definition() = ModuleDefinition {
    Name("PlateReader")

    // Loads the model before the guard takes the photo, so the first reading isn't the slow one.
    Function("prepare") {
      textReader()
      Unit
    }

    AsyncFunction("readLines") { uri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("ERR_NO_CONTEXT", "The app isn't ready to read photos", null)
        return@AsyncFunction
      }
      val image = try {
        InputImage.fromFilePath(context, Uri.parse(uri))
      } catch (cause: IOException) {
        promise.reject("ERR_PHOTO", "The photo couldn't be opened", cause)
        return@AsyncFunction
      }
      textReader().process(image)
        .addOnSuccessListener { text ->
          val lines = text.textBlocks.flatMap { block ->
            block.lines.map { line -> mapOf("text" to line.text, "height" to (line.boundingBox?.height() ?: 0)) }
          }
          promise.resolve(lines)
        }
        .addOnFailureListener { cause -> promise.reject("ERR_READ", "The photo couldn't be read", cause) }
    }

    OnDestroy {
      reader?.close()
      reader = null
    }
  }
}
