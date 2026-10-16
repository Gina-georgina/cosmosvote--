import base64
import json
from urllib.parse import urlsplit, urlunsplit

MAX_REPORT_BYTES = 16_384


def _safe_location(value):
    if not isinstance(value, str):
        return None
    if value in ("inline", "eval", "self"):
        return value
    parsed = urlsplit(value)
    if not parsed.scheme or not parsed.netloc:
        return value[:128]
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))[:512]


def handler(event, _context):
    body = event.get("body") or ""
    if event.get("isBase64Encoded"):
        try:
            body = base64.b64decode(body, validate=True).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            return {"statusCode": 400, "body": "Invalid report encoding"}

    if len(body.encode("utf-8")) > MAX_REPORT_BYTES:
        return {"statusCode": 413, "body": "Report too large"}

    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, TypeError):
        return {"statusCode": 400, "body": "Invalid JSON report"}

    if isinstance(payload, dict):
        payload = payload.get("csp-report", payload)
    if not isinstance(payload, dict):
        return {"statusCode": 400, "body": "Invalid CSP report"}

    report = {
        "event": "csp_violation",
        "document_uri": _safe_location(payload.get("document-uri", payload.get("documentURL"))),
        "blocked_uri": _safe_location(payload.get("blocked-uri", payload.get("blockedURL"))),
        "effective_directive": payload.get("effective-directive", payload.get("effectiveDirective")),
        "violated_directive": payload.get("violated-directive", payload.get("violatedDirective")),
        "source_file": _safe_location(payload.get("source-file", payload.get("sourceFile"))),
        "status_code": payload.get("status-code", payload.get("statusCode")),
    }
    print(json.dumps(report, separators=(",", ":")))
    return {"statusCode": 204, "body": ""}