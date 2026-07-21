import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.elitelevelfundraising.team',
  appName: 'ELF Team',
  webDir: 'public',
  server: {
    url: 'https://app.elitelevelfundraising.com',
    cleartext: false,
    // Served locally (from webDir) on any main-frame navigation failure —
    // DNS/TLS/timeout/no-connectivity/cold-launch failures and HTTP 4xx/5xx —
    // identically on Android (BridgeWebViewClient) and iOS
    // (WebViewDelegationHandler). No native code needed for this.
    errorPath: 'offline.html',
    // Restricts in-app navigation to ELF's own domain (default is unrestricted '*').
    // Stripe Checkout redirects off-domain briefly during donation flow, so its
    // hosted checkout/success domains are explicitly allowed too.
    allowNavigation: [
      'elitelevelfundraising.com',
      '*.elitelevelfundraising.com',
      'checkout.stripe.com',
      '*.stripe.com'
    ]
  }
};

export default config;
