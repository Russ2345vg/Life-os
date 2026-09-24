package com.lifeos.desktop

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.ImageFormat
import android.graphics.SurfaceTexture
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.util.Size
import android.view.Surface
import android.view.TextureView
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import java.util.concurrent.atomic.AtomicBoolean

class QrCameraController(
  private val context: Context,
  private val onQr: (String) -> Unit,
  private val onFailure: (String) -> Unit,
) {
  private var cameraDevice: CameraDevice? = null
  private var captureSession: CameraCaptureSession? = null
  private var imageReader: ImageReader? = null
  private var previewSurface: Surface? = null
  private var backgroundThread: HandlerThread? = null
  private var backgroundHandler: Handler? = null
  private val decoding = AtomicBoolean(false)
  private var textureView: TextureView? = null

  fun start(view: TextureView) {
    stop()
    textureView = view
    val thread = HandlerThread("LifeOsQrCamera").also { it.start() }
    backgroundThread = thread
    backgroundHandler = Handler(thread.looper)
    if (view.isAvailable) openCamera(view) else {
      view.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
        override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) {
          openCamera(view)
        }

        override fun onSurfaceTextureSizeChanged(
          surface: SurfaceTexture,
          width: Int,
          height: Int,
        ) = Unit

        override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean = true

        override fun onSurfaceTextureUpdated(surface: SurfaceTexture) = Unit
      }
    }
  }

  fun stop() {
    textureView?.surfaceTextureListener = null
    textureView = null
    captureSession?.close()
    captureSession = null
    cameraDevice?.close()
    cameraDevice = null
    imageReader?.close()
    imageReader = null
    previewSurface?.release()
    previewSurface = null
    backgroundThread?.quitSafely()
    backgroundThread = null
    backgroundHandler = null
    decoding.set(false)
  }

  @SuppressLint("MissingPermission")
  private fun openCamera(view: TextureView) {
    val handler = backgroundHandler ?: return
    val manager = context.getSystemService(CameraManager::class.java)
    val cameraId = manager.cameraIdList.firstOrNull { id ->
      manager.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING) ==
        CameraCharacteristics.LENS_FACING_BACK
    } ?: manager.cameraIdList.firstOrNull()
    if (cameraId == null) {
      onFailure("Камера не найдена.")
      return
    }
    val characteristics = manager.getCameraCharacteristics(cameraId)
    val map = characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
    val analysisSize = chooseSize(map?.getOutputSizes(ImageFormat.YUV_420_888).orEmpty())
    val previewSize = chooseSize(map?.getOutputSizes(SurfaceTexture::class.java).orEmpty())
    val texture = view.surfaceTexture ?: return
    texture.setDefaultBufferSize(previewSize.width, previewSize.height)
    previewSurface = Surface(texture)
    imageReader = ImageReader.newInstance(
      analysisSize.width,
      analysisSize.height,
      ImageFormat.YUV_420_888,
      2,
    ).also { reader ->
      reader.setOnImageAvailableListener({ source -> analyze(source) }, handler)
    }
    manager.openCamera(cameraId, object : CameraDevice.StateCallback() {
      override fun onOpened(camera: CameraDevice) {
        cameraDevice = camera
        createSession(camera)
      }

      override fun onDisconnected(camera: CameraDevice) {
        camera.close()
        cameraDevice = null
        onFailure("Камера отключена.")
      }

      override fun onError(camera: CameraDevice, error: Int) {
        camera.close()
        cameraDevice = null
        onFailure("Не удалось запустить камеру.")
      }
    }, handler)
  }

  private fun createSession(camera: CameraDevice) {
    val preview = previewSurface ?: return
    val analysis = imageReader?.surface ?: return
    val handler = backgroundHandler ?: return
    camera.createCaptureSession(
      listOf(preview, analysis),
      object : CameraCaptureSession.StateCallback() {
        override fun onConfigured(session: CameraCaptureSession) {
          if (cameraDevice == null) return
          captureSession = session
          val request = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
            addTarget(preview)
            addTarget(analysis)
            set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
            set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
          }.build()
          session.setRepeatingRequest(request, null, handler)
        }

        override fun onConfigureFailed(session: CameraCaptureSession) {
          onFailure("Не удалось подготовить камеру.")
        }
      },
      handler,
    )
  }

  private fun analyze(reader: ImageReader) {
    val image = reader.acquireLatestImage() ?: return
    if (!decoding.compareAndSet(false, true)) {
      image.close()
      return
    }
    try {
      val plane = image.planes.firstOrNull() ?: return
      if (plane.pixelStride != 1) return
      val buffer = plane.buffer
      val bytes = ByteArray(buffer.remaining())
      buffer.get(bytes)
      val safeHeight = minOf(
        image.height,
        (((bytes.size - image.width).coerceAtLeast(0)) / plane.rowStride) + 1,
      )
      if (safeHeight <= 0) return
      val source = PlanarYUVLuminanceSource(
        bytes,
        plane.rowStride,
        safeHeight,
        0,
        0,
        image.width,
        safeHeight,
        false,
      )
      val readerWithHints = MultiFormatReader().apply {
        setHints(
          mapOf(
            DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE),
            DecodeHintType.TRY_HARDER to true,
            DecodeHintType.CHARACTER_SET to "UTF-8",
          ),
        )
      }
      val result = runCatching {
        readerWithHints.decodeWithState(BinaryBitmap(HybridBinarizer(source))).text
      }.getOrNull()
      if (!result.isNullOrBlank()) onQr(result)
    } catch (_: RuntimeException) {
      // A malformed camera frame is skipped; the repeating request continues.
    } finally {
      image.close()
      decoding.set(false)
    }
  }

  private fun chooseSize(sizes: Array<out Size>): Size =
    sizes.filter { it.width <= 1280 && it.height <= 1280 }
      .maxByOrNull { it.width * it.height }
      ?: sizes.minByOrNull { it.width * it.height }
      ?: Size(640, 480)
}
