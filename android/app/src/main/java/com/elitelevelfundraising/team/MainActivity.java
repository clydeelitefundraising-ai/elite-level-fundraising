package com.elitelevelfundraising.team;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

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
        super.onCreate(savedInstanceState);

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
