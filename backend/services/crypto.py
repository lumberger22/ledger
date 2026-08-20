"""
Application-level encryption for Plaid access tokens at rest.

An access token is a live credential — anyone holding it can pull real
transaction/balance data for the linked account for as long as it's valid.
We never send it to the frontend, and we don't store it in SQLite in the
clear either: it's encrypted here with a symmetric key (Fernet, from the
`cryptography` package) that only ever lives in the EC2 environment as
PLAID_TOKEN_ENCRYPTION_KEY — never in the database, never in git.

This does not protect against someone with both shell access to the server
and the env var (that's an accepted risk for a single-user personal box —
see PLAID_INTEGRATION_PLAN.md §5), but it does mean the SQLite file alone
(e.g. a copied backup zip) isn't enough to use the tokens.

Generate a key once with:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
and set it as PLAID_TOKEN_ENCRYPTION_KEY. Losing this key makes every stored
access token permanently undecryptable — every Item would need to be
re-linked. Back it up somewhere durable, outside the repo.
"""

from functools import lru_cache

from config import PLAID_TOKEN_ENCRYPTION_KEY


class EncryptionNotConfigured(RuntimeError):
    def __init__(self):
        super().__init__(
            "PLAID_TOKEN_ENCRYPTION_KEY is not set. Generate one with "
            "`python -c \"from cryptography.fernet import Fernet; "
            'print(Fernet.generate_key().decode())"` and set it in the '
            "environment before linking a Plaid account."
        )


@lru_cache(maxsize=1)
def _fernet():
    if not PLAID_TOKEN_ENCRYPTION_KEY:
        raise EncryptionNotConfigured()
    from cryptography.fernet import Fernet

    try:
        return Fernet(PLAID_TOKEN_ENCRYPTION_KEY.encode())
    except Exception as exc:  # noqa: BLE001 - surface a clear config error
        raise RuntimeError(
            "PLAID_TOKEN_ENCRYPTION_KEY is not a valid Fernet key. Generate a "
            "fresh one (see services/crypto.py docstring)."
        ) from exc


def encrypt_token(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    return _fernet().decrypt(ciphertext.encode()).decode()
