"""
Shared upload-size enforcement for the CSV and paystub-PDF upload endpoints.

Both pandas.read_csv (services/csv_parser.py) and pdfplumber (services/
paystub_parser.py) hold the entire file in memory with no size cap of their
own, so without this an oversized or maliciously crafted file could exhaust
memory/CPU on the EC2 host (see SECURITY_HARDENING_PLAN.md SS7).
"""

from fastapi import HTTPException, Request, UploadFile, status


async def read_upload_within_limit(
    request: Request, file: UploadFile, max_bytes: int
) -> bytes:
    """Read `file` into memory, rejecting it with 413 if it exceeds max_bytes."""
    # Fast pre-check: reject an obviously-oversized request before reading
    # anything, using the client-supplied Content-Length header. This is
    # advisory only -- a client can lie about it or omit it entirely (e.g.
    # chunked transfer-encoding) -- so it's a cheap early exit, not the real
    # enforcement.
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > max_bytes:
                _too_large(max_bytes)
        except ValueError:
            pass

    # Hard cap: read one byte past the limit so an over-limit file can be
    # distinguished from one exactly at the limit without ever buffering
    # more than max_bytes + 1 into memory.
    contents = await file.read(max_bytes + 1)
    if len(contents) > max_bytes:
        _too_large(max_bytes)
    return contents


def _too_large(max_bytes: int) -> None:
    raise HTTPException(
        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        detail=f"File too large (max {max_bytes // (1024 * 1024)} MB)",
    )
