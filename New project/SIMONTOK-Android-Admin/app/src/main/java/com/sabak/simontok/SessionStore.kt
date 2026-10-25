package com.sabak.simontok

import android.content.Context

class SessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("simontok_session", Context.MODE_PRIVATE)

    fun save(session: UserSession) {
        prefs.edit()
            .putString("username", session.username)
            .putString("access_token", session.accessToken)
            .putString("refresh_token", session.refreshToken)
            .apply()
    }

    fun read(): UserSession? {
        val username = prefs.getString("username", null)
        val token = prefs.getString("access_token", null)
        val refreshToken = prefs.getString("refresh_token", null).orEmpty()
        if (username.isNullOrBlank() || token.isNullOrBlank()) return null
        return UserSession(username = username, accessToken = token, refreshToken = refreshToken)
    }

    fun clear() {
        prefs.edit().clear().apply()
    }
}
