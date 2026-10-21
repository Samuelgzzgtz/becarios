plugins {
    alias(libs.plugins.android.application) apply false
    // org.jetbrains.kotlin.android ya no se aplica: AGP 9+ trae Kotlin integrado
    // (https://developer.android.com/build/migrate-to-built-in-kotlin). Aplicarlo
    // ahora es un error de build, no solo redundante.
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.ksp) apply false
}
