package com.fime.docencheck.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(entities = [AsistenciaPendienteEntity::class], version = 2, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {

    abstract fun asistenciaPendienteDao(): AsistenciaPendienteDao

    companion object {
        /** v2: columna `error` para los rechazos permanentes (auditoría A-12). Conserva la cola existente. */
        private val MIGRACION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE asistencias_pendientes ADD COLUMN error TEXT")
            }
        }

        fun crear(context: Context): AppDatabase =
            Room.databaseBuilder(context, AppDatabase::class.java, "docencheck.db")
                .addMigrations(MIGRACION_1_2)
                .build()
    }
}
