package com.elitelevelfundraising.team;

/**
 * Validates incoming Android App Link URLs before the app navigates its WebView to them.
 *
 * Pure Java on purpose (no android.* imports): it is compiled and run by the JS test suite with a
 * plain JDK. It never logs, prints, or puts the input into an exception message, because the
 * path segment of an accepted link is a one-time invite / activation / reset / staff token.
 *
 * Accepted: https://app.elitelevelfundraising.com/<family>/<one non-empty segment>[/][?query]
 * where family is join, coach-activate, reset-password or staff-invite. Everything else returns null.
 */
final class DeepLinkValidator {

    static final String ORIGIN = "https://app.elitelevelfundraising.com";
    private static final String HOST = "app.elitelevelfundraising.com";
    private static final String[] FAMILIES = { "join", "coach-activate", "reset-password", "staff-invite" };

    private static final int MAX_URL_LENGTH = 2048;
    private static final int MAX_SEGMENT_LENGTH = 200;
    private static final int MAX_QUERY_LENGTH = 1024;
    static final long DUPLICATE_WINDOW_MS = 5000;

    private DeepLinkValidator() {}

    /**
     * @return "/family/segment" or "/family/segment?query" (a trailing slash is dropped, the query
     *         is preserved verbatim), or null when the URL is not an allowed ELF link.
     */
    static String destinationFor(String rawUri) {
        try {
            return validate(rawUri);
        } catch (RuntimeException e) {
            return null; // deliberately message-free: the input may contain a token
        }
    }

    /** The only URL the WebView is ever sent to: the fixed origin plus a validated destination. */
    static String urlFor(String destination) {
        return ORIGIN + destination;
    }

    /** True when the same destination was already handled a moment ago (double delivery / double tap). */
    static boolean isDuplicate(String lastDestination, long lastHandledAtMs, String destination, long nowMs) {
        if (lastDestination == null || destination == null || !lastDestination.equals(destination)) return false;
        long age = nowMs - lastHandledAtMs;
        return age >= 0 && age < DUPLICATE_WINDOW_MS;
    }

    private static String validate(String raw) {
        if (raw == null || raw.isEmpty() || raw.length() > MAX_URL_LENGTH) return null;

        // Whole-string character screen: printable ASCII only, and none of the characters that
        // enable fragments, userinfo, IPv6 hosts, backslash tricks or header/HTML injection.
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c <= 0x20 || c >= 0x7F) return null;
            switch (c) {
                case '\\':
                case '#':
                case '@':
                case '[':
                case ']':
                case '<':
                case '>':
                case '"':
                case '`':
                case '{':
                case '}':
                case '|':
                case '^':
                    return null;
                default:
            }
        }

        final String schemePrefix = "https://";
        if (raw.length() <= schemePrefix.length() || !raw.regionMatches(true, 0, schemePrefix, 0, schemePrefix.length())) {
            return null;
        }
        String rest = raw.substring(schemePrefix.length());

        int authorityEnd = rest.length();
        for (int i = 0; i < rest.length(); i++) {
            char c = rest.charAt(i);
            if (c == '/' || c == '?') {
                authorityEnd = i;
                break;
            }
        }
        String authority = rest.substring(0, authorityEnd);
        if (!authority.equalsIgnoreCase(HOST) && !authority.equalsIgnoreCase(HOST + ":443")) return null;

        String pathAndQuery = rest.substring(authorityEnd);
        if (!pathAndQuery.startsWith("/")) return null;

        String path = pathAndQuery;
        String query = null;
        int q = pathAndQuery.indexOf('?');
        if (q >= 0) {
            path = pathAndQuery.substring(0, q);
            query = pathAndQuery.substring(q + 1);
        }

        if (path.contains("//")) return null;

        String[] segments = path.substring(1).split("/", -1);
        boolean trailingSlash = segments.length == 3 && segments[2].isEmpty();
        if (segments.length != 2 && !trailingSlash) return null;

        String family = segments[0];
        boolean familyOk = false;
        for (String f : FAMILIES) {
            if (f.equals(family)) {
                familyOk = true;
                break;
            }
        }
        if (!familyOk) return null;

        String token = segments[1];
        if (!isSafeSegment(token)) return null;

        StringBuilder destination = new StringBuilder("/").append(family).append('/').append(token);

        if (query != null && !query.isEmpty()) {
            if (query.length() > MAX_QUERY_LENGTH || !hasWellFormedPercentEncoding(query, false)) return null;
            destination.append('?').append(query);
        }
        return destination.toString();
    }

    /** One path segment: unreserved characters and safe percent-encodings only. */
    private static boolean isSafeSegment(String s) {
        if (s.isEmpty() || s.length() > MAX_SEGMENT_LENGTH) return false;
        if (s.equals(".") || s.equals("..")) return false;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            boolean ok = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
                || c == '-' || c == '.' || c == '_' || c == '~' || c == '%';
            if (!ok) return false;
        }
        if (!hasWellFormedPercentEncoding(s, true)) return false;
        String decoded = decodeUnreserved(s);
        return !(decoded.equals(".") || decoded.equals(".."));
    }

    /**
     * Every '%' must be followed by two hex digits that decode to a safe printable character: never
     * a control character, space, '/', '\\', '%' (double encoding), '?' or '#'. In a path segment
     * anything other than an unreserved character is refused outright.
     */
    private static boolean hasWellFormedPercentEncoding(String s, boolean strictSegment) {
        for (int i = 0; i < s.length(); i++) {
            if (s.charAt(i) != '%') continue;
            if (i + 2 >= s.length()) return false;
            int hi = Character.digit(s.charAt(i + 1), 16);
            int lo = Character.digit(s.charAt(i + 2), 16);
            if (hi < 0 || lo < 0) return false;
            int value = hi * 16 + lo;
            if (value <= 0x20 || value >= 0x7F) return false;
            if (value == '/' || value == '\\' || value == '%' || value == '?' || value == '#') return false;
            if (strictSegment && !isUnreserved((char) value)) return false;
            i += 2;
        }
        return true;
    }

    private static boolean isUnreserved(char c) {
        return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
            || c == '-' || c == '.' || c == '_' || c == '~';
    }

    private static String decodeUnreserved(String s) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '%' && i + 2 < s.length()) {
                out.append((char) (Character.digit(s.charAt(i + 1), 16) * 16 + Character.digit(s.charAt(i + 2), 16)));
                i += 2;
            } else {
                out.append(c);
            }
        }
        return out.toString();
    }
}
