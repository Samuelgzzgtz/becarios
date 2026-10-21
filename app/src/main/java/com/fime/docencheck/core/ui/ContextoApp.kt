package com.fime.docencheck.core.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import com.fime.docencheck.DocenCheckApp

/** Acceso a los repositorios desde un @Composable, sin Hilt/Koin. */
@Composable
fun appActual(): DocenCheckApp = LocalContext.current.applicationContext as DocenCheckApp
