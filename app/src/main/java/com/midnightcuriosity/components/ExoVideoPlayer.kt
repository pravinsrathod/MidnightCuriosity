package com.midnightcuriosity.components

import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.annotation.OptIn
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.delay
import java.util.regex.Pattern

@Composable
fun UniversalVideoPlayer(
    modifier: Modifier = Modifier,
    videoUrl: String,
    isPlaying: Boolean,
    onProgressUpdate: (Float) -> Unit,
    onVideoComplete: () -> Unit
) {
    val youTubeId = extractYouTubeVideoId(videoUrl)
    
    if (youTubeId != null) {
        YouTubePlayer(
            modifier = modifier,
            videoId = youTubeId,
            isPlaying = isPlaying, // Note: WebView control is limited without JS Bridge, but autoplay works
            onVideoComplete = onVideoComplete // Detection is harder on Web, might need mock
        )
    } else {
        NativeVideoPlayer(
            modifier = modifier,
            videoUrl = videoUrl,
            isPlaying = isPlaying,
            onProgressUpdate = onProgressUpdate,
            onVideoComplete = onVideoComplete
        )
    }
}

@OptIn(UnstableApi::class)
@Composable
fun NativeVideoPlayer(
    modifier: Modifier = Modifier,
    videoUrl: String,
    isPlaying: Boolean,
    onProgressUpdate: (Float) -> Unit,
    onVideoComplete: () -> Unit
) {
    val context = LocalContext.current
    
    val exoPlayer = remember {
        ExoPlayer.Builder(context).build().apply {
            val mediaItem = MediaItem.fromUri(videoUrl)
            setMediaItem(mediaItem)
            prepare()
        }
    }

    LaunchedEffect(isPlaying) {
        if (isPlaying) {
            exoPlayer.play()
        } else {
            exoPlayer.pause()
        }
    }

    LaunchedEffect(exoPlayer) {
        while (true) {
            if (exoPlayer.isPlaying) {
                val duration = exoPlayer.duration
                val position = exoPlayer.currentPosition
                if (duration > 0) {
                    val progressPercent = (position.toFloat() / duration.toFloat()) * 100f
                    onProgressUpdate(progressPercent)
                }
            }
            delay(500)
        }
    }
    
    DisposableEffect(exoPlayer) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED) {
                    onVideoComplete()
                }
            }
        }
        exoPlayer.addListener(listener)
        onDispose {
            exoPlayer.removeListener(listener)
            exoPlayer.release()
        }
    }

    AndroidView(
        factory = {
            PlayerView(context).apply {
                player = exoPlayer
                useController = true // Enable controls!
                setShowNextButton(false)
                setShowPreviousButton(false)
                layoutParams = FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            }
        },
        modifier = modifier
    )
}

@Composable
fun YouTubePlayer(
    modifier: Modifier = Modifier,
    videoId: String,
    isPlaying: Boolean,
    onVideoComplete: () -> Unit
) {
    AndroidView(
        modifier = modifier,
        factory = { context ->
            WebView(context).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.mediaPlaybackRequiresUserGesture = false // FIX Autoplay
                webChromeClient = WebChromeClient() // Fullscreen still requires custom view implementation for full immersion
                webViewClient = WebViewClient()
                loadData(
                    """
                    <body style="margin:0;padding:0;background:black">
                    <iframe width="100%" height="100%" 
                    src="https://www.youtube.com/embed/$videoId?autoplay=1&controls=1&fs=1&modestbranding=1&rel=0" 
                    frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                    allowfullscreen></iframe>
                    </body>
                    """.trimIndent(),
                    "text/html",
                    "utf-8"
                )
            }
        }
    )
}

fun extractYouTubeVideoId(url: String): String? {
    // Handles https://www.youtube.com/watch?v=ID and https://youtu.be/ID
    var vId: String? = null
    val pattern = Pattern.compile(
        "^.*(youtu.be\\/|v\\/|u\\/\\w\\/|embed\\/|watch\\?v=|&v=)([^#&?]*).*",
        Pattern.CASE_INSENSITIVE
    )
    val matcher = pattern.matcher(url)
    if (matcher.matches()) {
        vId = matcher.group(2)
    }
    return if (!vId.isNullOrEmpty() && vId.length == 11) vId else null
}
