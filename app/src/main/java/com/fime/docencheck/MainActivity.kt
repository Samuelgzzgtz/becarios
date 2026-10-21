package com.fime.docencheck

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import com.fime.docencheck.navigation.DocenCheckNavGraph
import com.fime.docencheck.ui.theme.DocenCheckTema
import com.fime.docencheck.ui.theme.DocenCheckTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Edge-to-edge con íconos claros en la barra de estado: todas las
        // pantallas empiezan con el header verde (o el encabezado del login).
        enableEdgeToEdge(statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT))
        super.onCreate(savedInstanceState)
        setContent {
            DocenCheckTheme {
                Box(Modifier.fillMaxSize().background(DocenCheckTema.colores.fondo)) {
                    DocenCheckNavGraph()
                }
            }
        }
    }
}
