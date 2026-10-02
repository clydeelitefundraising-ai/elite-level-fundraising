// Test-only stand-in for "next/server", used solely by a module resolution
// hook (nextStubLoader.mjs) registered from within roster-import route test
// files. Never imported by production code.
//
// The real NextRequest/NextResponse are thin wrappers around the standard
// Fetch API Request/Response, and the roster-import routes only ever call
// standard Request methods (formData/json/headers) and NextResponse.json —
// so plain global Request/Response cover everything actually exercised here.
export class NextRequest extends Request {}

export class NextResponse extends Response {
  static json(data, init) {
    return Response.json(data, init);
  }
}
