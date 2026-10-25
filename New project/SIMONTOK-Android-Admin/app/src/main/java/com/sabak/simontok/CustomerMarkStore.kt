package com.sabak.simontok

import android.content.Context

class CustomerMarkStore(context: Context) {
    private val prefs = context.getSharedPreferences("simontok_customer_marks", Context.MODE_PRIVATE)

    fun read(idpel: String): CustomerMark {
        return CustomerMark(
            checked = prefs.getBoolean("${idpel}_checked", false),
            colorIndex = prefs.getInt("${idpel}_color", 0)
        )
    }

    fun save(idpel: String, mark: CustomerMark) {
        prefs.edit()
            .putBoolean("${idpel}_checked", mark.checked)
            .putInt("${idpel}_color", mark.colorIndex)
            .apply()
    }
}

data class CustomerMark(
    val checked: Boolean = false,
    val colorIndex: Int = 0
)
