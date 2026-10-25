package com.sabak.simontok

import android.content.Context

data class CustomerScrollPosition(val index: Int = 0, val offset: Int = 0)

class CustomerScrollStore(context: Context) {
    private val prefs = context.getSharedPreferences("customer_scroll_position", Context.MODE_PRIVATE)

    fun save(username: String, index: Int, offset: Int) {
        val key = username.trim().uppercase()
        if (key.isBlank()) return
        prefs.edit()
            .putInt("${key}_index", index.coerceAtLeast(0))
            .putInt("${key}_offset", offset.coerceAtLeast(0))
            .apply()
    }

    fun read(username: String): CustomerScrollPosition {
        val key = username.trim().uppercase()
        if (key.isBlank()) return CustomerScrollPosition()
        return CustomerScrollPosition(
            index = prefs.getInt("${key}_index", 0).coerceAtLeast(0),
            offset = prefs.getInt("${key}_offset", 0).coerceAtLeast(0)
        )
    }
}
