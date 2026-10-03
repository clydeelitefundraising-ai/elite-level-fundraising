// Test-only stand-in for "next/server", used solely by nextStubLoader.mjs's
// module resolution hook. Never imported by production code.
//
// The real NextRequest/NextResponse are thin wrappers around the standard
// Fetch API Request/Response, and the route handlers tested via this stub
// only ever call standard Request methods (json/formData/headers/nextUrl)
// and NextResponse.json — so plain global Request/Response, plus a tiny
// nextUrl shim, cover everything actually exercised here.
export class NextRequest extends Request {
  get nextUrl() {
    return new URL(this.url);
  }
}

export class NextResponse extends Response {
  static json(data, init) {
    return Response.json(data, init);
  }
}
