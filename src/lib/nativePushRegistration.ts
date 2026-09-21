// Native push registration decisions for NativePushRegistrar (iOS APNs and
// Android FCM). Kept free of React and Capacitor imports so the whole flow can
// be unit-tested with an injected plugin. iOS behavior is intentionally the
// exact sequence NativePushRegistrar performed before Android existed:
// listeners -> checkPermissions -> (prompt) requestPermissions -> register.
import { isSafeInternalPath } from "./internalUrl.ts";
import type { NativeDevicePlatform } from "./nativePushDevice.ts";

/** Must equal FCM_ANDROID_CHANNEL_ID in src/lib/fcm.ts (pinned by a test). */
export const ANDROID_PUSH_CHANNEL_ID = "elf_default";

// Importance 4 (HIGH) shows heads-up alerts for team announcements, messages
// and requests; 3 (DEFAULT) would land silently in the shade.
export const ANDROID_PUSH_CHANNEL = {
  id: ANDROID_PUSH_CHANNEL_ID,
  name: "ELF Notifications",
  description: "Team announcements, messages, events and requests",
  importance: 4 as const,
};

const PERMISSION_PROMPTED_KEY = "elf_native_push_permission_prompted";

export type PushPermissionState = "prompt" | "prompt-with-rationale" | "granted" | "denied";

type ListenerHandle = { remove: () => Promise<void> | void };

/** The subset of @capacitor/push-notifications this flow uses. */
export interface PushPluginLike {
  addListener(event: "registration", cb: (token: { value: string }) => void): Promise<ListenerHandle>;
  addListener(event: "registrationError", cb: (error: unknown) => void): Promise<ListenerHandle>;
  addListener(
    event: "pushNotificationActionPerformed",
    cb: (action: { notification?: { data?: { url?: unknown } } }) => void,
  ): Promise<ListenerHandle>;
  checkPermissions(): Promise<{ receive: string }>;
  requestPermissions(): Promise<{ receive: string }>;
  register(): Promise<void>;
  createChannel(channel: typeof ANDROID_PUSH_CHANNEL): Promise<void>;
}

/** Remembers, for the current app session, that the Android permission
 *  prompt was already shown so page mounts and navigation never nag. */
export interface PermissionPromptSession {
  wasPrompted(): boolean;
  markPrompted(): void;
}

let memoryPrompted = false;

/** In-memory flag backed by sessionStorage when available, so it also
 *  survives full document loads inside the same WebView session. */
export const defaultPermissionPromptSession: PermissionPromptSession = {
  wasPrompted() {
    if (memoryPrompted) return true;
    try {
      return typeof sessionStorage !== "undefined" && sessionStorage.getItem(PERMISSION_PROMPTED_KEY) === "1";
    } catch {
      return false;
    }
  },
  markPrompted() {
    memoryPrompted = true;
    try {
      if (typeof sessionStorage !== "undefined") sessionStorage.setItem(PERMISSION_PROMPTED_KEY, "1");
    } catch {
      // sessionStorage unavailable -- the in-memory flag still applies.
    }
  },
};

export interface NativePushRegistrationDeps {
  platform: NativeDevicePlatform;
  plugin: PushPluginLike;
  registerToken: (platform: NativeDevicePlatform, token: string) => Promise<void>;
  navigate: (url: string) => void;
  isCancelled: () => boolean;
  promptSession?: PermissionPromptSession;
}

/**
 * Attaches the listeners, resolves notification permission and registers.
 * Resolves with a function that removes the listeners (called by the caller's
 * effect cleanup). Never logs tokens or error payloads.
 */
export async function startNativePushRegistration(deps: NativePushRegistrationDeps): Promise<() => void> {
  const { platform, plugin, registerToken, navigate, isCancelled } = deps;
  const promptSession = deps.promptSession ?? defaultPermissionPromptSession;

  const [regHandle, errHandle, tapHandle] = await Promise.all([
    plugin.addListener("registration", token => {
      if (isCancelled()) return;
      void registerToken(platform, token.value);
    }),
    // Silent -- setup failures never surface to the user.
    plugin.addListener("registrationError", () => {}),
    // Tap routing for foreground, background and cold-start taps; only ever
    // follows a same-origin path already validated by isSafeInternalPath.
    // Deliberately NOT routed through the invite-only DeepLinkValidator.
    plugin.addListener("pushNotificationActionPerformed", action => {
      if (isCancelled()) return;
      const url = action.notification?.data?.url;
      if (isSafeInternalPath(url)) navigate(url);
    }),
  ]);
  const remove = () => {
    void regHandle.remove();
    void errHandle.remove();
    void tapHandle.remove();
  };

  if (platform === "ios") {
    let status = await plugin.checkPermissions();
    if (status.receive === "prompt") {
      status = await plugin.requestPermissions();
    }
    if (status.receive !== "granted") return remove;
    await plugin.register();
    return remove;
  }

  // Android. Effect already torn down while the listeners attached: the next
  // mount repeats this whole flow, so stop here instead of leaking listeners.
  if (isCancelled()) {
    remove();
    return remove;
  }

  let status = await plugin.checkPermissions();
  if (status.receive === "prompt" || status.receive === "prompt-with-rationale") {
    // Android 13+ runtime prompt, at most once per app session. Android 12
    // and below report "granted" and never reach this branch.
    if (promptSession.wasPrompted()) return remove;
    promptSession.markPrompted();
    status = await plugin.requestPermissions();
  }
  if (status.receive !== "granted") return remove;

  try {
    await plugin.createChannel(ANDROID_PUSH_CHANNEL); // idempotent on the native side
  } catch {
    // A channel failure must never block registration (FCM falls back to its default channel).
  }
  await plugin.register();
  return remove;
}

/** IO the token registration needs, injected so the rotation rules are testable. */
export interface TokenRegistrationIO {
  getSaved: () => string | null;
  save: (token: string) => void;
  /** POST JSON; resolves true only for a 2xx response. May reject on network failure. */
  post: (path: string, body: unknown) => Promise<boolean>;
}

/**
 * Saves the token locally (logout needs it even if the POST fails), registers
 * it, and -- Android only -- best-effort deactivates the PREVIOUS token after
 * a successful registration when FCM rotated it. The deactivate endpoint is
 * scoped server-side to (platform, token, the caller's own account), so a
 * stale token owned by anyone else simply matches zero rows.
 */
export async function registerDeviceTokenWithRotation(
  platform: NativeDevicePlatform,
  token: string,
  io: TokenRegistrationIO,
): Promise<void> {
  const previous = io.getSaved();
  io.save(token);
  let registered = false;
  try {
    registered = await io.post("/api/push/devices", { platform, device_token: token });
  } catch {
    // Silent -- push setup must never surface an error.
  }
  if (platform === "android" && registered && previous && previous !== token) {
    try {
      await io.post("/api/push/devices/deactivate", { platform, device_token: previous });
    } catch {
      // Best effort: a failed cleanup must never block or throw.
    }
  }
}
