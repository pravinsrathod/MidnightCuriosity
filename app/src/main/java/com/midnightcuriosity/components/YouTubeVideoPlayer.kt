package com.midnightcuriosity.components

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.delay

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun YouTubeVideoPlayer(
    modifier: Modifier = Modifier,
    videoId: String,
    isPlaying: Boolean,
    onProgressUpdate: (Float) -> Unit,
    onVideoComplete: () -> Unit
) {
    val context = LocalContext.current
    var webView: WebView? by remember { mutableStateOf(null) }

    // Constants for JS Injection
    val bridgeName = "AndroidBridge"

    // Initial HTML content to load the IFrame API
    val htmlContent = """
        <!DOCTYPE html>
        <html>
          <body style="margin:0;padding:0;background-color:black;">
            <div id="player"></div>
            <script>
              var tag = document.createElement('script');
              tag.src = "https://www.youtube.com/iframe_api";
              var firstScriptTag = document.getElementsByTagName('script')[0];
              firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

              var player;
              function onYouTubeIframeAPIReady() {
                player = new YT.Player('player', {
                  height: '100%',
                  width: '100%',
                  videoId: '$videoId',
                  playerVars: {
                    'playsinline': 1,
                    'controls': 0,
                    'rel': 0,
                    'fs': 0
                  },
                  events: {
                    'onReady': onPlayerReady,
                    'onStateChange': onPlayerStateChange
                  }
                });
              }

              function onPlayerReady(event) {
                 // Start polling for progress
                 setInterval(updateProgress, 500);
              }

              function onPlayerStateChange(event) {
                if (event.data == YT.PlayerState.ENDED) {
                   $bridgeName.onVideoComplete();
                }
              }

              function updateProgress() {
                if (player && player.getCurrentTime && player.getDuration) {
                  var current = player.getCurrentTime();
                  var total = player.getDuration();
                  if (total > 0) {
                     var p = (current / total) * 100;
                     $bridgeName.onProgress(p);
                  }
                }
              }
              
              function playVideo() { player.playVideo(); }
              function pauseVideo() { player.pauseVideo(); }
            </script>
          </body>
        </html>
    """.trimIndent()

    // Interface to receive calls from JS
    class WebAppInterface {
        @JavascriptInterface
        fun onProgress(percentage: Float) {
            onProgressUpdate(percentage)
        }

        @JavascriptInterface
        fun onVideoComplete() {
            onVideoComplete()
        }
    }

    LaunchedEffect(isPlaying, webView) {
        if (webView != null) {
            if (isPlaying) {
                webView?.evaluateJavascript("playVideo();", null)
            } else {
                webView?.evaluateJavascript("pauseVideo();", null)
            }
        }
    }

    AndroidView(
        factory = {
            WebView(context).apply {
                layoutParams = FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
                settings.javaScriptEnabled = true
                settings.mediaPlaybackRequiresUserGesture = false
                settings.cacheMode = WebSettings.LOAD_NO_CACHE
                
                webChromeClient = WebChromeClient()
                webViewClient = object : WebViewClient() {
                    override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                        super.onPageStarted(view, url, favicon)
                    }
                }
                
                addJavascriptInterface(WebAppInterface(), bridgeName)
                loadDataWithBaseURL("https://www.youtube.com", htmlContent, "text/html", "UTF-8", null)
                
                webView = this
            }
        },
        modifier = modifier
    )
}
