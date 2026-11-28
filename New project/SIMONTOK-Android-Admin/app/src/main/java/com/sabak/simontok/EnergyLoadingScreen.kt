package com.sabak.simontok

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.sin

private val blue = Color(0xFF0A4D8C)
private val cyan = Color(0xFF00A3C4)
private val gold = Color(0xFFFFD100)
private val spectrum = Brush.horizontalGradient(listOf(blue, cyan, gold))

@Composable
internal fun EnergyLoadingScreen(checkingVersion: Boolean) {
    val motion = rememberInfiniteTransition(label = "Energy")
    val orbit by motion.animateFloat(0f, 360f, infiniteRepeatable(tween(8000, easing = LinearEasing)), label = "Orbit")
    val sweep by motion.animateFloat(0f, 1f, infiniteRepeatable(tween(1800, easing = LinearEasing)), label = "Sweep")

    BoxWithConstraints(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFFF0F8FC), Color.White, Color(0xFFE6F4FA))))) {
        val compact = maxHeight < 440.dp
        Canvas(Modifier.matchParentSize()) {
            val step = 32.dp.toPx()
            val grid = cyan.copy(alpha = .065f)
            var x = 0f
            while (x < size.width) {
                drawLine(grid, Offset(x, 0f), Offset(x, size.height))
                x += step
            }
            var y = 0f
            while (y < size.height) {
                drawLine(grid, Offset(0f, y), Offset(size.width, y))
                y += step
            }
            for ((i, level) in listOf(.23f, .67f, .76f).withIndex()) {
                val w = size.width
                val h = size.height
                val base = level * h
                val bend = (if (i == 0) -.09f else .10f) * h
                val wave = Path().apply {
                    moveTo(-.08f * w, base)
                    cubicTo(.22f * w, base + bend, .50f * w, base - bend, .81f * w, base)
                    quadraticTo(.96f * w, base + bend / 2, 1.1f * w, base)
                }
                drawPath(wave, if (i == 1) gold.copy(alpha = .25f) else cyan.copy(alpha = .18f),
                    style = Stroke(1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(step * 6, step * 2), orbit / 360f * step * 8)))
            }
        }
        Spacer(Modifier.fillMaxWidth().height(5.dp).background(spectrum))
        Column(
            modifier = Modifier.fillMaxSize().safeDrawingPadding().padding(horizontal = 24.dp, vertical = if (compact) 12.dp else 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(Modifier.background(Color.White, CircleShape).border(1.dp, cyan.copy(alpha = .25f), CircleShape)
                .padding(horizontal = 14.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Spacer(Modifier.size(8.dp).background(cyan, CircleShape))
                Spacer(Modifier.width(8.dp))
                Text("SIMONTOK", fontSize = 12.sp, color = blue, fontWeight = FontWeight.SemiBold)
            }
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                Box(Modifier.sizeIn(maxWidth = 176.dp, maxHeight = 176.dp).aspectRatio(1f), contentAlignment = Alignment.Center) {
                    Canvas(Modifier.matchParentSize()) {
                        val d = size.minDimension
                        val outer = d * .465f
                        rotate(orbit) {
                            drawCircle(cyan.copy(alpha = .30f), outer, style = Stroke(1.5.dp.toPx(),
                                pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 8.dp.toPx()))))
                            drawCircle(gold, 3.5.dp.toPx(), Offset(center.x, center.y - outer))
                            drawCircle(cyan, 3.dp.toPx(), Offset(center.x, center.y + outer))
                        }
                        val ring = Size(d * .76f, d * .76f)
                        val start = Offset(d * .12f, d * .12f)
                        for ((i, color) in listOf(gold, cyan, blue).withIndex()) {
                            drawArc(color, i * 120f - orbit * 2, if (i == 0) 68f else 39f, false,
                                start, ring, style = Stroke(2.5.dp.toPx(), cap = StrokeCap.Round))
                        }
                        drawCircle(Color(0xFFE2F1F8), d * .305f, style = Stroke(4.dp.toPx()))
                        drawArc(Brush.linearGradient(listOf(blue, cyan)), orbit * 3 - 90f, 92f, false,
                            Offset(d * .195f, d * .195f), Size(d * .61f, d * .61f), style = Stroke(4.dp.toPx(), cap = StrokeCap.Round))
                    }
                    Image(painterResource(R.drawable.energy_emblem), null, Modifier.fillMaxSize(.80f).graphicsLayer {
                        rotationZ = 3f * sin(sweep * 2f * Math.PI.toFloat())
                    })
                }
            }
            Column(Modifier.widthIn(max = 320.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(if (checkingVersion) "Memeriksa versi aplikasi..." else "Membuka sesi petugas...", color = blue, fontSize = 12.sp)
                    Text(if (checkingVersion) "1 / 2" else "2 / 2", color = blue, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(8.dp))
                Canvas(Modifier.fillMaxWidth().height(7.dp).clip(CircleShape).background(Color(0xFFDCEAF1))
                    .semantics { progressBarRangeInfo = ProgressBarRangeInfo.Indeterminate }) {
                    val length = size.width * .48f
                    val left = (size.width + length) * sweep - length
                    drawRect(Brush.horizontalGradient(listOf(blue, cyan, gold), left, left + length), Offset(left, 0f), Size(length, size.height))
                }
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    listOf(blue, cyan, gold).forEachIndexed { i, color ->
                        Spacer(Modifier.size(6.dp).graphicsLayer {
                            translationY = -2.dp.toPx() * sin((sweep - i / 6f) * 2f * Math.PI.toFloat())
                        }.background(color, CircleShape))
                    }
                }
                Text("Versi " + BuildConfig.VERSION_NAME, Modifier.padding(top = 5.dp), color = Color(0xFF526878), fontSize = 11.sp)
            }
        }
    }
}
