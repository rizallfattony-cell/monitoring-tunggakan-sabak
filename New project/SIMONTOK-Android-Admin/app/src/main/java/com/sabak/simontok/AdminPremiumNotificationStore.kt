package com.sabak.simontok

import android.content.Context

class AdminPremiumNotificationStore(context: Context) {
    private val prefs = context.getSharedPreferences("admin_premium_notifications", Context.MODE_PRIVATE)

    @Synchronized
    fun takeNew(requests: List<PremiumAdminRequest>): List<PremiumAdminRequest> {
        val knownIds = prefs.getStringSet(KEY_KNOWN_IDS, emptySet()).orEmpty().toMutableSet()
        if (!prefs.getBoolean(KEY_INITIALIZED, false)) {
            saveKnownIds(knownIds + requests.map { it.id })
            prefs.edit().putBoolean(KEY_INITIALIZED, true).apply()
            return emptyList()
        }

        val unseen = requests.filter { it.id.isNotBlank() && it.id !in knownIds }
        saveKnownIds(knownIds + requests.map { it.id })
        return unseen.sortedBy { it.createdAt }
    }

    private fun saveKnownIds(ids: Collection<String>) {
        prefs.edit().putStringSet(KEY_KNOWN_IDS, ids.filter(String::isNotBlank).takeLast(250).toSet()).apply()
    }

    private companion object {
        const val KEY_INITIALIZED = "initialized"
        const val KEY_KNOWN_IDS = "known_ids"
    }
}
