"""Per-route request body limits for endpoints that accept public uploads."""

from starlette.responses import JSONResponse


class _RequestBodyTooLarge(Exception):
    pass


class RequestBodyLimitMiddleware:
    """Reject oversized request bodies before FastAPI parses or buffers them."""

    def __init__(self, app, limits: dict[str, int]):
        self.app = app
        self.limits = limits

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        max_bytes = self.limits.get(scope.get("path", ""))
        if max_bytes is None:
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        content_length = headers.get(b"content-length")
        if content_length is not None:
            try:
                declared_size = int(content_length)
            except ValueError:
                await JSONResponse(
                    {"detail": "Invalid Content-Length"}, status_code=400
                )(scope, receive, send)
                return
            if declared_size < 0 or declared_size > max_bytes:
                await self._too_large(scope, receive, send)
                return

        received_bytes = 0

        async def limited_receive():
            nonlocal received_bytes
            message = await receive()
            if message["type"] == "http.request":
                received_bytes += len(message.get("body", b""))
                if received_bytes > max_bytes:
                    raise _RequestBodyTooLarge
            return message

        response_started = False

        async def track_response(message):
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, track_response)
        except _RequestBodyTooLarge:
            if not response_started:
                await self._too_large(scope, receive, send)

    @staticmethod
    async def _too_large(scope, receive, send):
        await JSONResponse(
            {"detail": "Request body too large"}, status_code=413
        )(scope, receive, send)
