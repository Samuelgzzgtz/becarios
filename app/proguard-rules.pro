# TensorFlow Lite carga el modelo por reflexión/JNI; no debe reducirse.
-keep class org.tensorflow.lite.** { *; }

# kotlinx.serialization genera serializers que ProGuard no debe tocar.
-keepattributes *Annotation*, InnerClasses
-keep,includedescriptorclasses class com.fime.docencheck.**$$serializer { *; }
-keepclassmembers class com.fime.docencheck.** {
    *** Companion;
}
-keepclasseswithmembers class com.fime.docencheck.** {
    kotlinx.serialization.KSerializer serializer(...);
}
