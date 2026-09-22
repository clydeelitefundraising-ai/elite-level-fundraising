package com.elitelevelfundraising.team;

import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import org.json.JSONObject;

/**
 * Exposed to the page as window.ElfAndroidFiles. The Android WebView has no download manager,
 * no Web Share API and no PDF renderer, so the web layer hands file bytes (base64) here; they are
 * written to the app cache and handed to the system share sheet (saveAndShare) or to an installed
 * viewer (openWithViewer). Every method returns a JSON string {"ok":true|false,"error":"..."} and
 * never throws into JavaScript.
 *
 * Threading: @JavascriptInterface methods run on WebView's JavaBridge thread, so decoding and
 * file I/O happen there (off the UI thread). Anything touching the WebView, Toast or
 * startActivity is posted to the UI thread and awaited with a timeout.
 *
 * Exposure: addJavascriptInterface objects are visible to every frame in the page, so each call
 * first checks that the top-level page is https and on the configured server host. A third-party
 * frame embedded in an ELF page could still call it; the impact is limited to opening a share
 * sheet / viewer for a file the caller supplied itself (nothing is read from the device and
 * nothing is sent anywhere).
 */
public class AndroidFileBridge {

    static final String JS_NAME = "ElfAndroidFiles";
    private static final String CACHE_SUBDIR = "shared_files";
    private static final long MAX_BYTES = 25L * 1024 * 1024;
    private static final long STALE_MS = 24L * 60 * 60 * 1000;
    private static final int MAX_NAME_LENGTH = 100;
    private static final long UI_TIMEOUT_SECONDS = 5;
    private static final Pattern MIME_PATTERN = Pattern.compile("^[a-z0-9][a-z0-9.+-]*/[a-z0-9][a-z0-9.+-]*$");
    private static final Set<String> ALLOWED_MIME = new HashSet<>(Arrays.asList(
        "application/pdf",
        "text/csv",
        "text/calendar",
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "application/octet-stream"
    ));

    private final MainActivity activity;

    AndroidFileBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public String saveAndShare(String base64Data, String fileName, String mimeType) {
        return handle(base64Data, fileName, mimeType, false);
    }

    @JavascriptInterface
    public String openWithViewer(String base64Data, String fileName, String mimeType) {
        return handle(base64Data, fileName, mimeType, true);
    }

    private String handle(String base64Data, String fileName, String mimeType, boolean view) {
        try {
            if (!isTrustedOrigin()) return error("forbidden_origin");

            String mime = normalizeMimeType(mimeType);
            if (mime == null) return error("bad_mime");
            if (base64Data == null || base64Data.isEmpty()) return error("empty_data");
            if (base64Data.length() > (MAX_BYTES * 4 / 3) + 16) return error("too_large");

            byte[] bytes;
            try {
                bytes = Base64.decode(base64Data, Base64.DEFAULT);
            } catch (IllegalArgumentException e) {
                return error("bad_data");
            }
            if (bytes.length == 0) return error("empty_data");
            if (bytes.length > MAX_BYTES) return error("too_large");

            String safeName = sanitizeFileName(fileName, mime);
            File file;
            try {
                file = writeToCache(bytes, safeName);
            } catch (IOException | SecurityException e) {
                return error("io_error");
            }

            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", file);
            // A file with no usable type cannot be "viewed" (the platform accepts the intent but shows
            // nothing), so it goes to the share/save sheet instead of failing silently.
            boolean asView = view && !"application/octet-stream".equals(mime);
            return runOnUi(() -> launch(uri, safeName, mime, asView), error("launch_failed"));
        } catch (Throwable t) {
            return error("io_error");
        }
    }

    // Runs on the UI thread.
    private String launch(Uri uri, String name, String mime, boolean view) {
        try {
            if (view) {
                Intent open = new Intent(Intent.ACTION_VIEW);
                open.setDataAndType(uri, mime);
                open.setClipData(ClipData.newRawUri(name, uri));
                open.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try {
                    activity.startActivity(open);
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(
                        activity,
                        "No app installed to open this file. Try saving it instead.",
                        Toast.LENGTH_LONG
                    ).show();
                    return error("no_handler");
                }
            } else {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType(mime);
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.setClipData(ClipData.newRawUri(name, uri));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                activity.startActivity(Intent.createChooser(send, "Share or save file"));
            }
            JSONObject ok = new JSONObject();
            ok.put("ok", true);
            ok.put("fileName", name);
            return ok.toString();
        } catch (Throwable t) {
            return error("launch_failed");
        }
    }

    /** True only when the top-level page is https on the configured server host. */
    private boolean isTrustedOrigin() {
        return runOnUi(() -> {
            if (activity.getBridge() == null) return false;
            WebView webView = activity.getBridge().getWebView();
            String serverUrl = activity.getBridge().getServerUrl();
            if (webView == null || webView.getUrl() == null || serverUrl == null) return false;
            Uri page = Uri.parse(webView.getUrl());
            Uri server = Uri.parse(serverUrl);
            return "https".equalsIgnoreCase(page.getScheme())
                && page.getHost() != null
                && page.getHost().equalsIgnoreCase(server.getHost());
        }, false);
    }

    private <T> T runOnUi(Callable<T> task, T fallback) {
        FutureTask<T> future = new FutureTask<>(task);
        activity.runOnUiThread(future);
        try {
            return future.get(UI_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (Exception e) {
            return fallback;
        }
    }

    /** Writes into cache/shared_files/<unique>/<name>, after purging stale entries. */
    private File writeToCache(byte[] bytes, String safeName) throws IOException {
        File root = new File(activity.getCacheDir(), CACHE_SUBDIR);
        if (!root.exists() && !root.mkdirs()) throw new IOException("cache dir");
        purgeStale(root);

        File dir = new File(root, System.currentTimeMillis() + "-" + UUID.randomUUID().toString().substring(0, 8));
        if (!dir.mkdirs()) throw new IOException("cache subdir");
        File file = new File(dir, safeName);
        // The name is already sanitized; this is a second guard against escaping the cache dir.
        if (!file.getCanonicalPath().startsWith(root.getCanonicalPath() + File.separator)) {
            throw new IOException("path escape");
        }
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        return file;
    }

    private void purgeStale(File root) {
        File[] children = root.listFiles();
        if (children == null) return;
        long cutoff = System.currentTimeMillis() - STALE_MS;
        for (File child : children) {
            if (child.lastModified() < cutoff) deleteRecursively(child);
        }
    }

    private void deleteRecursively(File file) {
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) deleteRecursively(child);
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }

    static String sanitizeFileName(String raw, String mime) {
        String name = raw == null ? "" : raw;
        int slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        if (slash >= 0) name = name.substring(slash + 1);
        name = name.replaceAll("[^A-Za-z0-9._ -]", "_");
        name = name.replaceAll("\\.{2,}", ".");
        name = name.replaceAll("^[. ]+", "").trim();
        if (name.length() > MAX_NAME_LENGTH) {
            int dot = name.lastIndexOf('.');
            String ext = (dot > 0 && name.length() - dot <= 10) ? name.substring(dot) : "";
            name = name.substring(0, MAX_NAME_LENGTH - ext.length()) + ext;
        }
        if (name.isEmpty()) name = "file";
        if (!name.contains(".")) {
            String ext = extensionFor(mime);
            if (ext != null) name = name + "." + ext;
        }
        return name;
    }

    /** null = malformed; well-formed but unlisted types become application/octet-stream. */
    static String normalizeMimeType(String raw) {
        String base = raw == null ? "" : raw.split(";", 2)[0].trim().toLowerCase(Locale.US);
        if (base.isEmpty()) return "application/octet-stream";
        if (!MIME_PATTERN.matcher(base).matches()) return null;
        return ALLOWED_MIME.contains(base) ? base : "application/octet-stream";
    }

    private static String extensionFor(String mime) {
        switch (mime) {
            case "application/pdf": return "pdf";
            case "text/csv": return "csv";
            case "text/calendar": return "ics";
            case "image/png": return "png";
            case "image/jpeg": return "jpg";
            case "image/webp": return "webp";
            case "image/gif": return "gif";
            default: return null;
        }
    }

    private static String error(String code) {
        try {
            JSONObject json = new JSONObject();
            json.put("ok", false);
            json.put("error", code);
            return json.toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":\"" + code + "\"}";
        }
    }
}
