package com.elitelevelfundraising.team;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.os.SystemClock;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    // True only while super.onCreate() runs. BridgeActivity.load() calls onNewIntent(getIntent())
    // from inside onCreate; that delivery is the launch intent, already handled by the cold path.
    private boolean inCreate = false;
    private String lastHandledDestination = null;
    private long lastHandledAtMs = 0;

    /**
     * Deep links (App Links for /join, /coach-activate, /reset-password, /staff-invite).
     *
     * Cold start: Capacitor always loads server.url and discards the launch URI, so before
     * super.onCreate() builds the bridge, a CapConfig whose server.appStartPath is the validated
     * destination is assigned to the protected `config` field. The very first loadUrl then already
     * targets the deep link (no root/login flash, no post-load handoff, no timing dependency).
     * Warm / backgrounded: onNewIntent() navigates the existing WebView.
     *
     * Only DeepLinkValidator output, appended to the fixed origin, is ever loaded. The incoming URI
     * (which carries a one-time token) is never logged, toasted or put into an exception message.
     */
    private static boolean launchedFromHistory(Intent intent) {
        return (intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0;
    }

    /** Capacitor's config with server.appStartPath replaced; null (= normal startup) if anything is off. */
    private CapConfig configWithStartPath(String destination) {
        try (InputStream in = getAssets().open("capacitor.config.json")) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[4096];
            int read;
            while ((read = in.read(chunk)) != -1) buffer.write(chunk, 0, read);
            JSONObject json = new JSONObject(buffer.toString("UTF-8"));

            JSONObject server = json.getJSONObject("server");
            String serverUrl = server.optString("url", "");
            if (serverUrl.endsWith("/")) serverUrl = serverUrl.substring(0, serverUrl.length() - 1);
            if (!DeepLinkValidator.ORIGIN.equals(serverUrl)) return null;
            server.put("appStartPath", destination);

            // The public JSON constructor treats the app as non-debuggable, so pin what depends on
            // that: keep DevTools available in debug builds only, and keep Capacitor's own
            // "Loading app at <url>" line off so the start path (token) is never logged.
            JSONObject android = json.optJSONObject("android");
            if (android == null) {
                android = new JSONObject();
                json.put("android", android);
            }
            boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
            android.put("webContentsDebuggingEnabled", debuggable);
            android.put("loggingBehavior", "none");
            return new CapConfig(getAssets(), json);
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); // Capacitor plugins still receive every intent
        if (inCreate || intent == null) return;

        setIntent(intent);
        String destination = launchedFromHistory(intent) ? null : DeepLinkValidator.destinationFor(intent.getDataString());
        intent.setData(null); // consumed: a redelivery of this Intent can never navigate again
        if (destination == null) return;

        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;

        long now = SystemClock.elapsedRealtime();
        String target = DeepLinkValidator.urlFor(destination);
        if (DeepLinkValidator.isDuplicate(lastHandledDestination, lastHandledAtMs, destination, now)) return;
        if (target.equals(webView.getUrl())) return;

        lastHandledDestination = destination;
        lastHandledAtMs = now;
        webView.loadUrl(target);
    }

    /**
     * Capacitor's core Android bridge (v8) does not intercept the system back button on its
     * own -- with no handler here, back falls through to the default Activity behavior and
     * exits the app immediately, even when a web-side overlay (e.g. the profile dropdown) is
     * open. This asks the page whether an overlay is open before deciding what back should do.
     *
     * Registered through AndroidX's OnBackPressedDispatcher (not an onBackPressed() override):
     * on Android 16 / targetSdk 36 predictive back is on by default and the legacy
     * Activity.onBackPressed() / KEYCODE_BACK callbacks are no longer invoked. The dispatcher is
     * the single supported path across API 24-36 (it bridges to OnBackInvokedCallback on 33+).
     */
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Intent launchIntent = getIntent();
        // A recreated activity (savedInstanceState != null) or a relaunch from Recents must not replay the link.
        if (savedInstanceState == null && launchIntent != null && !launchedFromHistory(launchIntent)) {
            String destination = DeepLinkValidator.destinationFor(launchIntent.getDataString());
            if (destination != null) {
                CapConfig deepLinkConfig = configWithStartPath(destination);
                if (deepLinkConfig != null) {
                    this.config = deepLinkConfig;
                    lastHandledDestination = destination;
                    lastHandledAtMs = SystemClock.elapsedRealtime();
                }
            }
        }

        inCreate = true;
        super.onCreate(savedInstanceState);
        inCreate = false;
        if (launchIntent != null) launchIntent.setData(null); // consumed; Capacitor already read it during onCreate

        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().addJavascriptInterface(new AndroidFileBridge(this), AndroidFileBridge.JS_NAME);
        }

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView == null) {
                    // Bridge not ready yet: nothing to ask the page. Same outcome as the
                    // no-history case below; deliberately not re-dispatching to the
                    // dispatcher, which would re-enter this callback.
                    moveTaskToBack(false);
                    return;
                }

                webView.evaluateJavascript(
                    "(function(){return !!(window.__elfHasOpenOverlay && window.__elfHasOpenOverlay());})();",
                    overlayOpenResult -> {
                        if ("true".equals(overlayOpenResult)) {
                            webView.evaluateJavascript("window.dispatchEvent(new Event('elfAndroidBackButton'));", null);
                        } else if (webView.canGoBack()) {
                            webView.goBack();
                        } else {
                            moveTaskToBack(false);
                        }
                    }
                );
            }
        });
    }
}
