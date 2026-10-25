package com.sabak.simontok

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.nio.charset.Charset
import java.security.SecureRandom
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.io.OutputStream
import java.util.concurrent.atomic.AtomicBoolean

class BluetoothReceiptPrinter(private val context: Context) {
    private val adapter: BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()
    private val appContext = context.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())
    private val printerUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    @SuppressLint("MissingPermission")
    fun pairedDevices(): List<ThermalPrinterDevice> {
        if (!hasBluetoothPermission()) return emptyList()
        return adapter?.bondedDevices
            ?.map { ThermalPrinterDevice(it.name ?: "Printer Bluetooth", it.address, bonded = true) }
            ?.sortedBy { it.name.uppercase(Locale.US) }
            .orEmpty()
    }

    @SuppressLint("MissingPermission")
    fun discoverDevices(
        onUpdate: (List<ThermalPrinterDevice>) -> Unit,
        onFinished: (String?) -> Unit
    ) {
        if (!hasBluetoothPermission()) {
            onFinished("Izin Bluetooth belum aktif.")
            return
        }

        val bluetoothAdapter = adapter
        if (bluetoothAdapter == null) {
            onFinished("Bluetooth tidak tersedia di HP ini.")
            return
        }
        if (!bluetoothAdapter.isEnabled) {
            onFinished("Bluetooth belum aktif.")
            return
        }

        val devices = linkedMapOf<String, ThermalPrinterDevice>()
        pairedDevices().forEach { devices[it.address] = it }
        onUpdate(devices.values.toList())
        var finished = false

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                when (intent.action) {
                    BluetoothDevice.ACTION_FOUND -> {
                        val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                        } else {
                            @Suppress("DEPRECATION")
                            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                        }
                        if (device != null) {
                            devices[device.address] = ThermalPrinterDevice(
                                name = device.name ?: "Printer Bluetooth",
                                address = device.address,
                                bonded = device.bondState == BluetoothDevice.BOND_BONDED
                            )
                            mainHandler.post { onUpdate(devices.values.sortedBy { it.name.uppercase(Locale.US) }) }
                        }
                    }
                    BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
                        if (finished) return
                        finished = true
                        runCatching { appContext.unregisterReceiver(this) }
                        mainHandler.post { onFinished(null) }
                    }
                }
            }
        }

        val filter = IntentFilter().apply {
            addAction(BluetoothDevice.ACTION_FOUND)
            addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            appContext.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            @Suppress("DEPRECATION")
            appContext.registerReceiver(receiver, filter)
        }

        if (bluetoothAdapter.isDiscovering) bluetoothAdapter.cancelDiscovery()
        mainHandler.postDelayed({
            if (!finished) {
                finished = true
                runCatching { bluetoothAdapter.cancelDiscovery() }
                runCatching { appContext.unregisterReceiver(receiver) }
                onFinished(null)
            }
        }, 12000)
        if (!bluetoothAdapter.startDiscovery()) {
            finished = true
            runCatching { appContext.unregisterReceiver(receiver) }
            val pairedCount = devices.size
            onFinished(
                if (pairedCount > 0) null
                else "Gagal mencari printer. Pastikan izin Bluetooth diizinkan, Bluetooth aktif, dan printer dalam mode pairing."
            )
        }
    }

    @SuppressLint("MissingPermission")
    fun pair(address: String) {
        if (!hasBluetoothPermission()) throw SecurityException("Izin Bluetooth belum aktif.")
        val device = adapter?.getRemoteDevice(address) ?: throw IllegalStateException("Printer tidak ditemukan.")
        if (device.bondState != BluetoothDevice.BOND_BONDED) {
            device.createBond()
        }
    }

    @SuppressLint("MissingPermission")
    fun print(address: String, text: String) {
        if (address.isBlank()) throw IllegalStateException("Printer belum dipilih.")
        if (!hasBluetoothPermission()) throw SecurityException("Izin Bluetooth belum aktif.")
        val device: BluetoothDevice = adapter?.getRemoteDevice(address)
            ?: throw IllegalStateException("Bluetooth tidak tersedia.")
        if (!printLock.compareAndSet(false, true)) {
            throw IllegalStateException("Printer sedang mencetak. Tunggu sampai proses sebelumnya selesai.")
        }

        try {
            adapter.cancelDiscovery()
            device.createRfcommSocketToServiceRecord(printerUuid).use { socket ->
                socket.connect()
                socket.outputStream.use { output ->
                    output.write(byteArrayOf(0x1B, 0x40))
                    output.flush()
                    Thread.sleep(120)
                    writeSlowly(output, text.toByteArray(Charset.forName("GBK")))
                    Thread.sleep(180)
                    output.write(byteArrayOf(0x0A, 0x0A, 0x0A))
                    output.flush()
                    Thread.sleep(180)
                    output.write(byteArrayOf(0x1D, 0x56, 0x42, 0x00))
                    output.flush()
                    Thread.sleep(300)
                }
            }
        } finally {
            printLock.set(false)
        }
    }

    private fun writeSlowly(output: OutputStream, bytes: ByteArray) {
        var offset = 0
        val chunkSize = 32
        while (offset < bytes.size) {
            val count = minOf(chunkSize, bytes.size - offset)
            output.write(bytes, offset, count)
            output.flush()
            offset += count
            Thread.sleep(35)
        }
    }

    private fun hasBluetoothPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED &&
                context.checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
        } else {
            context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        }
    }

    companion object {
        private val printLock = AtomicBoolean(false)
    }
}

fun buildReceiptText(
    row: CustomerDebt,
    meter: ReceiptMeter?,
    settings: ReceiptSettings,
    extraCharge: Double = 0.0,
    now: Date = Date(),
    transactionId: String = newReceiptTransactionId(),
    reference: String = newReceiptReference()
): String {
    val date = SimpleDateFormat("dd/MM/yyyy", Locale("id", "ID")).apply { timeZone = java.util.TimeZone.getTimeZone("Asia/Jakarta") }.format(now)
    val time = SimpleDateFormat("HH:mm:ss", Locale("id", "ID")).apply { timeZone = java.util.TimeZone.getTimeZone("Asia/Jakarta") }.format(now)
    val billMonth = formatReceiptMonth(now)
    val stand = listOfNotNull(meter?.standAwal?.takeIf { it.isNotBlank() }, meter?.standAkhir?.takeIf { it.isNotBlank() })
        .joinToString("-")
        .ifBlank { "-" }
    val admin = settings.adminFee
    val tagihan = row.rptag + extraCharge
    val total = tagihan + admin

    return buildString {
        appendLine(center(settings.namaToko.uppercase(Locale("id", "ID")), 32))
        appendLine()
        appendLine(center(settings.alamatToko.uppercase(Locale("id", "ID")), 32))
        appendLine()
        appendLine(center("Struk Pembayaran Tagihan Listrik", 32))
        appendLine()
        appendLine(labelValue("Tgl Bayar", "$date"))
        appendLine("                 $time")
        appendLine(labelValue("ID Transaksi", transactionId))
        appendLine(labelValue("No Pelanggan", row.idpel))
        appendLine(labelValue("Nama", row.nama.uppercase(Locale("id", "ID"))))
        appendLine(labelValue("Tarif/Daya", "${row.tarif}/${row.daya}"))
        appendLine(labelValue("Stand Meter", stand))
        appendLine(labelValueWrapped("Reff", reference, 15))
        appendLine()
        appendLine("Rincian Tagihan")
        appendLine(moneyLine(billMonth, tagihan))
        appendLine(moneyLine("Denda", 0.0))
        appendLine(moneyLine("Lain-Lain", 0.0))
        appendLine("--------------------------------")
        appendLine(moneyLine("Rp Tagihan", tagihan))
        appendLine(moneyLine("Admin Bank", admin))
        appendLine("--------------------------------")
        appendLine(moneyLine("Total Bayar", total))
        appendLine()
        appendLine(center("STRUK INI SEBAGAI BUKTI YANG SAH", 32))
        appendLine(center("MOHON DI SIMPAN", 32))
    }
}

private fun labelValue(label: String, value: String): String {
    return label.padEnd(14).take(14) + " : " + value
}

private fun labelValueWrapped(label: String, value: String, firstLineLength: Int): String {
    val prefix = label.padEnd(14).take(14) + " : "
    if (value.length <= firstLineLength) return prefix + value
    val first = value.take(firstLineLength)
    val rest = value.drop(firstLineLength)
    return prefix + first + "\n" + " ".repeat(prefix.length) + rest
}

private fun moneyLine(label: String, value: Double): String {
    val amount = formatRupiahPlain(value).padStart(9)
    return label.padEnd(14).take(14) + " : Rp " + amount
}

private fun center(text: String, width: Int): String {
    if (text.length >= width) return text
    val left = (width - text.length) / 2
    return " ".repeat(left) + text
}

private fun formatRupiahPlain(value: Double): String {
    return "%,.0f".format(Locale("id", "ID"), value).replace(",", ".")
}

private fun formatReceiptMonth(date: Date): String {
    val names = listOf("Jan", "Feb", "Maret", "April", "Mei", "Juni", "Juli", "Agust", "Sept", "Okt", "Nov", "Des")
    val calendar = Calendar.getInstance(java.util.TimeZone.getTimeZone("Asia/Jakarta"), Locale("id", "ID"))
    calendar.time = date
    val month = names[calendar.get(Calendar.MONTH)]
    val year = calendar.get(Calendar.YEAR).toString().takeLast(2)
    return "$month$year"
}

internal fun newReceiptTransactionId(): String = randomDigits(10)

internal fun newReceiptReference(): String = randomRef()

private fun randomDigits(length: Int): String {
    val random = SecureRandom()
    return buildString {
        repeat(length) { append(random.nextInt(10)) }
    }
}

private fun randomRef(): String {
    val chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    val random = SecureRandom()
    return buildString {
        repeat(30) { append(chars[random.nextInt(chars.length)]) }
    }
}
