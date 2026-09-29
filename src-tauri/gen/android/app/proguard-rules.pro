# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
# Rust resolves this inherited method through JNI during Tauri plugin initialization.
# Keep it in the tracked rules because clean release worktrees do not contain
# the generated, Git-ignored proguard-tauri.pro file.
-keep class com.lifeos.desktop.TauriActivity {
  public app.tauri.plugin.PluginManager getPluginManager();
}
