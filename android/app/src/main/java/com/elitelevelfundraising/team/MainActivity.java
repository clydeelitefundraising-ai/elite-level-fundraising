package com.elitelevelfundraising.team;

import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Capacitor's core Android bridge (v8) does not intercept the hardware back button on its
     * own -- with no override here, back falls through to the default Activity behavior and
     * exits the app immediately, even when a web-side overlay (e.g. the profile dropdown) is
     * open. This asks the page whether an overlay is open before deciding what back should do.
     */
    @Override
    public void onBackPressed() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            super.onBackPressed();
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
}
