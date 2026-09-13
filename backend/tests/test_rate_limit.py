"""
services/rate_limit.py's SlidingWindowLimiter backs both the general
per-IP throughput limit and the auth-failure lockout — pure in-memory
logic, so it's cheap to cover directly rather than only through the auth
endpoints that use it.
"""

from services.rate_limit import SlidingWindowLimiter


def test_allows_requests_up_to_the_limit():
    limiter = SlidingWindowLimiter(max_events=3, window_seconds=60)
    for _ in range(3):
        allowed, retry_after = limiter.hit("1.2.3.4")
        assert allowed
        assert retry_after == 0.0


def test_blocks_once_the_limit_is_reached():
    limiter = SlidingWindowLimiter(max_events=2, window_seconds=60)
    limiter.hit("1.2.3.4")
    limiter.hit("1.2.3.4")
    allowed, retry_after = limiter.hit("1.2.3.4")
    assert not allowed
    assert retry_after > 0


def test_keys_are_tracked_independently():
    limiter = SlidingWindowLimiter(max_events=1, window_seconds=60)
    limiter.hit("ip-a")
    allowed, _ = limiter.hit("ip-b")
    assert allowed


def test_record_failure_counts_without_checking_the_limit():
    """auth.py's lockout only wants failed attempts to count — a correct key
    shouldn't add to (or be blocked by) this counter."""
    limiter = SlidingWindowLimiter(max_events=2, window_seconds=60)
    limiter.record_failure("ip")
    limiter.record_failure("ip")
    blocked, retry_after = limiter.is_blocked("ip")
    assert blocked
    assert retry_after > 0


def test_is_blocked_does_not_itself_consume_budget():
    limiter = SlidingWindowLimiter(max_events=2, window_seconds=60)
    limiter.hit("ip")
    for _ in range(5):
        limiter.is_blocked("ip")
    allowed, _ = limiter.hit("ip")
    assert allowed
