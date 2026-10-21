package com.fime.docencheck.ui.theme

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.clickable
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DateRangePicker
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberDateRangePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.fime.docencheck.core.util.FormatoUi
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset

@Composable
private fun coloresCampo() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = MaterialTheme.colorScheme.primary,
    unfocusedBorderColor = MaterialTheme.colorScheme.outline,
    focusedLabelColor = MaterialTheme.colorScheme.primary,
    focusedContainerColor = DocenCheckTema.colores.superficie,
    unfocusedContainerColor = DocenCheckTema.colores.superficie,
    disabledContainerColor = DocenCheckTema.colores.superficie
)

/** Texto de apoyo: el error (rojo, con ícono) tiene prioridad sobre la ayuda. */
@Composable
private fun TextoApoyo(error: String?, ayuda: String?) {
    when {
        error != null -> Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.ErrorOutline, contentDescription = null, modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(Espacio.xs))
            Text(error)
        }
        ayuda != null -> Text(ayuda)
    }
}

/**
 * Campo de texto estándar con validación en línea: [error] marca el campo en
 * rojo y explica qué corregir debajo; [ayuda] da un ejemplo o formato.
 */
@Composable
fun CampoTexto(
    valor: String,
    onCambio: (String) -> Unit,
    etiqueta: String,
    modifier: Modifier = Modifier,
    error: String? = null,
    ayuda: String? = null,
    placeholder: String? = null,
    icono: ImageVector? = null,
    teclado: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Next,
    onIme: (() -> Unit)? = null,
    unaLinea: Boolean = true,
    lineasMinimas: Int = 1,
    habilitado: Boolean = true,
    finalCampo: (@Composable () -> Unit)? = null,
    transformacion: VisualTransformation = VisualTransformation.None
) {
    OutlinedTextField(
        value = valor,
        onValueChange = onCambio,
        label = { Text(etiqueta) },
        placeholder = placeholder?.let { { Text(it) } },
        leadingIcon = icono?.let { { Icon(it, contentDescription = null) } },
        trailingIcon = finalCampo,
        isError = error != null,
        supportingText = if (error != null || ayuda != null) ({ TextoApoyo(error, ayuda) }) else null,
        keyboardOptions = KeyboardOptions(keyboardType = teclado, imeAction = imeAction),
        keyboardActions = KeyboardActions(onAny = { onIme?.invoke() ?: defaultKeyboardAction(imeAction) }),
        singleLine = unaLinea,
        minLines = if (unaLinea) 1 else lineasMinimas,
        enabled = habilitado,
        visualTransformation = transformacion,
        shape = FormaCampo,
        colors = coloresCampo(),
        modifier = modifier.fillMaxWidth()
    )
}

/** Contraseña con botón de ojo accesible (48 dp, "Mostrar contraseña"; auditoría M-20). */
@Composable
fun CampoContrasena(
    valor: String,
    onCambio: (String) -> Unit,
    etiqueta: String,
    modifier: Modifier = Modifier,
    error: String? = null,
    ayuda: String? = null,
    icono: ImageVector? = null,
    imeAction: ImeAction = ImeAction.Done,
    onIme: (() -> Unit)? = null,
    visibleInicial: Boolean = false
) {
    var visible by rememberSaveable { mutableStateOf(visibleInicial) }
    CampoTexto(
        valor = valor,
        onCambio = onCambio,
        etiqueta = etiqueta,
        modifier = modifier,
        error = error,
        ayuda = ayuda,
        icono = icono,
        teclado = KeyboardType.Password,
        imeAction = imeAction,
        onIme = onIme,
        transformacion = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
        finalCampo = {
            IconButton(onClick = { visible = !visible }) {
                Icon(
                    if (visible) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
                    contentDescription = if (visible) "Ocultar contraseña" else "Mostrar contraseña"
                )
            }
        }
    )
}

// -----------------------------------------------------------------------------
// Fechas. El DatePicker de Material trabaja en milisegundos UTC de medianoche;
// aquí se convierte a LocalDate (fecha local de Monterrey ya calculada por FechaUi).
// -----------------------------------------------------------------------------

fun LocalDate.aMillisUtc(): Long = atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
fun Long.aFechaUtc(): LocalDate = Instant.ofEpochMilli(this).atZone(ZoneOffset.UTC).toLocalDate()

private class FechasPermitidas(val minima: LocalDate?, val maxima: LocalDate?) : SelectableDates {
    override fun isSelectableDate(utcTimeMillis: Long): Boolean {
        val fecha = utcTimeMillis.aFechaUtc()
        return (minima == null || !fecha.isBefore(minima)) && (maxima == null || !fecha.isAfter(maxima))
    }

    override fun isSelectableYear(year: Int): Boolean =
        (minima == null || year >= minima.year) && (maxima == null || year <= maxima.year)
}

/** Campo de solo lectura que abre un calendario (A-14, M-11: ya no se escribe "aaaa-mm-dd"). */
@Composable
fun SelectorFecha(
    etiqueta: String,
    fecha: LocalDate?,
    onFecha: (LocalDate) -> Unit,
    modifier: Modifier = Modifier,
    error: String? = null,
    ayuda: String? = null,
    fechaMinima: LocalDate? = null,
    fechaMaxima: LocalDate? = null,
    habilitado: Boolean = true
) {
    var abierto by rememberSaveable { mutableStateOf(false) }
    val texto = fecha?.let { FormatoUi.fechaMedia(it) } ?: ""
    Box(modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = texto,
            onValueChange = {},
            readOnly = true,
            enabled = habilitado,
            label = { Text(etiqueta) },
            placeholder = { Text("Elegir fecha") },
            trailingIcon = { Icon(Icons.Rounded.CalendarMonth, contentDescription = null) },
            isError = error != null,
            supportingText = if (error != null || ayuda != null) ({ TextoApoyo(error, ayuda) }) else null,
            singleLine = true,
            shape = FormaCampo,
            colors = coloresCampo(),
            modifier = Modifier.fillMaxWidth()
        )
        // Capa táctil encima del campo: todo el campo abre el calendario.
        Box(
            Modifier
                .matchParentSize()
                .padding(bottom = if (error != null || ayuda != null) 20.dp else 0.dp)
                .clickable(enabled = habilitado, role = Role.Button, onClickLabel = "Elegir fecha") { abierto = true }
                .semantics { contentDescription = "$etiqueta: ${texto.ifEmpty { "sin elegir" }}" }
        )
    }
    if (abierto) {
        DialogoFecha(
            inicial = fecha,
            fechaMinima = fechaMinima,
            fechaMaxima = fechaMaxima,
            onConfirmar = { onFecha(it); abierto = false },
            onCancelar = { abierto = false }
        )
    }
}

@Composable
fun DialogoFecha(
    inicial: LocalDate?,
    onConfirmar: (LocalDate) -> Unit,
    onCancelar: () -> Unit,
    fechaMinima: LocalDate? = null,
    fechaMaxima: LocalDate? = null
) {
    val estado = rememberDatePickerState(
        initialSelectedDateMillis = inicial?.aMillisUtc(),
        selectableDates = remember(fechaMinima, fechaMaxima) { FechasPermitidas(fechaMinima, fechaMaxima) }
    )
    DatePickerDialog(
        onDismissRequest = onCancelar,
        confirmButton = {
            TextButton(onClick = { estado.selectedDateMillis?.let { onConfirmar(it.aFechaUtc()) } }, enabled = estado.selectedDateMillis != null) {
                Text("Aceptar")
            }
        },
        dismissButton = { TextButton(onClick = onCancelar) { Text("Cancelar") } }
    ) {
        DatePicker(state = estado)
    }
}

/** Calendario de rango (Consulta de asistencias, filtros de equipo). */
@Composable
fun DialogoRangoFechas(
    desdeInicial: LocalDate?,
    hastaInicial: LocalDate?,
    onConfirmar: (LocalDate, LocalDate) -> Unit,
    onCancelar: () -> Unit,
    fechaMaxima: LocalDate? = null
) {
    val estado = rememberDateRangePickerState(
        initialSelectedStartDateMillis = desdeInicial?.aMillisUtc(),
        initialSelectedEndDateMillis = hastaInicial?.aMillisUtc(),
        selectableDates = remember(fechaMaxima) { FechasPermitidas(null, fechaMaxima) }
    )
    val inicio = estado.selectedStartDateMillis
    val fin = estado.selectedEndDateMillis ?: inicio
    DatePickerDialog(
        onDismissRequest = onCancelar,
        confirmButton = {
            TextButton(
                onClick = { if (inicio != null && fin != null) onConfirmar(inicio.aFechaUtc(), fin.aFechaUtc()) },
                enabled = inicio != null
            ) { Text("Filtrar") }
        },
        dismissButton = { TextButton(onClick = onCancelar) { Text("Cancelar") } }
    ) {
        DateRangePicker(
            state = estado,
            title = { Text("Elige el rango", modifier = Modifier.padding(start = 24.dp, end = 12.dp, top = 16.dp)) },
            modifier = Modifier.heightIn(max = 520.dp)
        )
    }
}

/** Campo que abre un reloj (corrección manual de asistencias). */
@Composable
fun SelectorHora(
    etiqueta: String,
    hora: LocalTime?,
    onHora: (LocalTime) -> Unit,
    modifier: Modifier = Modifier,
    error: String? = null
) {
    var abierto by rememberSaveable { mutableStateOf(false) }
    val texto = hora?.let { "%d:%02d".format(it.hour, it.minute) } ?: ""
    Box(modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = texto,
            onValueChange = {},
            readOnly = true,
            label = { Text(etiqueta) },
            placeholder = { Text("Elegir hora") },
            trailingIcon = { Icon(Icons.Rounded.Schedule, contentDescription = null) },
            isError = error != null,
            supportingText = error?.let { { TextoApoyo(it, null) } },
            singleLine = true,
            shape = FormaCampo,
            colors = coloresCampo(),
            modifier = Modifier.fillMaxWidth()
        )
        Box(
            Modifier
                .matchParentSize()
                .padding(bottom = if (error != null) 20.dp else 0.dp)
                .clickable(role = Role.Button, onClickLabel = "Elegir hora") { abierto = true }
                .semantics { contentDescription = "$etiqueta: ${texto.ifEmpty { "sin elegir" }}" }
        )
    }
    if (abierto) {
        val estado = rememberTimePickerState(initialHour = hora?.hour ?: 9, initialMinute = hora?.minute ?: 0, is24Hour = true)
        AlertDialog(
            onDismissRequest = { abierto = false },
            title = { Text(etiqueta) },
            text = { Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) { TimePicker(state = estado) } },
            confirmButton = {
                TextButton(onClick = { onHora(LocalTime.of(estado.hour, estado.minute)); abierto = false }) { Text("Aceptar") }
            },
            dismissButton = { TextButton(onClick = { abierto = false }) { Text("Cancelar") } }
        )
    }
}

/**
 * Lista desplegable (Material ExposedDropdownMenu). Sustituye las columnas de
 * botones verdes para elegir ingeniero (auditoría A-09).
 */
@Composable
fun <T> Desplegable(
    etiqueta: String,
    opciones: List<T>,
    seleccionado: T?,
    textoDe: (T) -> String,
    onSeleccionar: (T) -> Unit,
    modifier: Modifier = Modifier,
    error: String? = null,
    ayuda: String? = null,
    placeholder: String = "Elegir…",
    icono: ImageVector? = null,
    habilitado: Boolean = true,
    detalleDe: ((T) -> String?)? = null
) {
    var expandido by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(
        expanded = expandido && habilitado,
        onExpandedChange = { if (habilitado) expandido = it },
        modifier = modifier.fillMaxWidth()
    ) {
        OutlinedTextField(
            value = seleccionado?.let(textoDe) ?: "",
            onValueChange = {},
            readOnly = true,
            enabled = habilitado,
            label = { Text(etiqueta) },
            placeholder = { Text(placeholder) },
            leadingIcon = icono?.let { { Icon(it, contentDescription = null) } },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandido) },
            isError = error != null,
            supportingText = if (error != null || ayuda != null) ({ TextoApoyo(error, ayuda) }) else null,
            singleLine = true,
            shape = FormaCampo,
            colors = coloresCampo(),
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable, enabled = habilitado)
        )
        ExposedDropdownMenu(expanded = expandido && habilitado, onDismissRequest = { expandido = false }) {
            if (opciones.isEmpty()) {
                DropdownMenuItem(text = { Text("Sin opciones") }, onClick = { expandido = false }, enabled = false)
            }
            opciones.forEach { opcion ->
                DropdownMenuItem(
                    text = {
                        Column {
                            Text(textoDe(opcion))
                            detalleDe?.invoke(opcion)?.let {
                                Text(it, style = MaterialTheme.typography.bodySmall, color = DocenCheckTema.colores.textoSecundario)
                            }
                        }
                    },
                    onClick = {
                        onSeleccionar(opcion)
                        expandido = false
                    },
                    contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding
                )
            }
        }
    }
}

/** Búsqueda local en listas (nombre o matrícula), con botón para limpiar. */
@Composable
fun CampoBusqueda(valor: String, onCambio: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier) {
    OutlinedTextField(
        value = valor,
        onValueChange = onCambio,
        placeholder = { Text(placeholder) },
        leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
        trailingIcon = if (valor.isNotEmpty()) {
            { IconButton(onClick = { onCambio("") }) { Icon(Icons.Rounded.Close, contentDescription = "Borrar búsqueda") } }
        } else null,
        singleLine = true,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        shape = FormaPildora,
        colors = coloresCampo(),
        modifier = modifier.fillMaxWidth()
    )
}