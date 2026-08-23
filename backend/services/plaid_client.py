"""
Thin, environment-aware wrapper around the Plaid Python SDK.

Everything here deals in *plaintext* access tokens — encryption/decryption
happens at the call sites in routers/plaid.py and services/plaid_sync.py,
right before/after these functions are called, so this module never touches
the database and stays easy to test against Plaid's Sandbox.

Nothing here is called unless config.PLAID_CONFIGURED is true; callers are
expected to check that (or let PlaidNotConfigured propagate as a clear 503)
before reaching into this module.
"""

from functools import lru_cache
from typing import Optional

import plaid
from plaid.api import plaid_api
from plaid.model.accounts_get_request import AccountsGetRequest
from plaid.model.country_code import CountryCode
from plaid.model.investments_holdings_get_request import InvestmentsHoldingsGetRequest
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.item_remove_request import ItemRemoveRequest
from plaid.model.liabilities_get_request import LiabilitiesGetRequest
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.link_token_create_request_update import LinkTokenCreateRequestUpdate
from plaid.model.products import Products
from plaid.model.transactions_sync_request import TransactionsSyncRequest
from plaid.model.transactions_sync_request_options import TransactionsSyncRequestOptions
from plaid.model.transactions_refresh_request import TransactionsRefreshRequest
from plaid.model.webhook_verification_key_get_request import WebhookVerificationKeyGetRequest

from config import (
    PLAID_CLIENT_ID,
    PLAID_CONFIGURED,
    PLAID_ENV,
    PLAID_REDIRECT_URI,
    PLAID_SECRET,
    PLAID_WEBHOOK_URL,
)

# A single, fixed client_user_id is fine here — Ledger is single-user by
# design (see PLAID_INTEGRATION_PLAN.md), so there's only ever one "user"
# from Plaid's point of view.
CLIENT_USER_ID = "ledger-owner"


class PlaidNotConfigured(RuntimeError):
    def __init__(self):
        super().__init__(
            "Plaid isn't configured yet. Set PLAID_CLIENT_ID, PLAID_SECRET, "
            "and PLAID_TOKEN_ENCRYPTION_KEY in the environment first."
        )


@lru_cache(maxsize=1)
def _client() -> plaid_api.PlaidApi:
    if not PLAID_CONFIGURED:
        raise PlaidNotConfigured()

    host = {
        "sandbox": plaid.Environment.Sandbox,
        "production": plaid.Environment.Production,
    }.get(PLAID_ENV, plaid.Environment.Sandbox)

    configuration = plaid.Configuration(
        host=host,
        api_key={"clientId": PLAID_CLIENT_ID, "secret": PLAID_SECRET},
    )
    api_client = plaid.ApiClient(configuration)
    return plaid_api.PlaidApi(api_client)


def create_link_token(update_item_access_token: Optional[str] = None) -> dict:
    """
    Create a Link token. Pass `update_item_access_token` to create an
    "update mode" Link session instead (used to fix a login_required Item
    without going through the full add-account flow again).
    """
    kwargs = dict(
        client_name="Ledger",
        language="en",
        country_codes=[CountryCode("US")],
        user=LinkTokenCreateRequestUser(client_user_id=CLIENT_USER_ID),
    )
    if PLAID_WEBHOOK_URL:
        kwargs["webhook"] = PLAID_WEBHOOK_URL
    if PLAID_REDIRECT_URI:
        # Required for OAuth institutions (Wells Fargo and most large banks)
        # to reliably return control to the app — see PLAID_REDIRECT_URI's
        # comment in config.py. Applies to both a fresh Link session and an
        # update-mode reconnect below; OAuth institutions can require the
        # bank-login handoff again on reconnect too.
        kwargs["redirect_uri"] = PLAID_REDIRECT_URI

    if update_item_access_token:
        kwargs["access_token"] = update_item_access_token
        kwargs["update"] = LinkTokenCreateRequestUpdate()
    else:
        kwargs["products"] = [Products("transactions")]
        kwargs["optional_products"] = [
            Products("investments"),
            Products("liabilities"),
        ]

    request = LinkTokenCreateRequest(**kwargs)
    response = _client().link_token_create(request)
    return response.to_dict()


def exchange_public_token(public_token: str) -> dict:
    request = ItemPublicTokenExchangeRequest(public_token=public_token)
    response = _client().item_public_token_exchange(request)
    return response.to_dict()


def get_accounts(access_token: str) -> dict:
    request = AccountsGetRequest(access_token=access_token)
    response = _client().accounts_get(request)
    return response.to_dict()


def sync_transactions(access_token: str, cursor: Optional[str] = None) -> dict:
    """
    One page of /transactions/sync. Callers loop while has_more is true,
    feeding each response's next_cursor back in until it's exhausted.
    """
    kwargs = dict(
        access_token=access_token,
        options=TransactionsSyncRequestOptions(include_personal_finance_category=True),
    )
    if cursor:
        kwargs["cursor"] = cursor
    request = TransactionsSyncRequest(**kwargs)
    response = _client().transactions_sync(request)
    return response.to_dict()


def refresh_transactions(access_token: str) -> None:
    """Ask Plaid to go re-poll the institution now, ahead of the next sync."""
    request = TransactionsRefreshRequest(access_token=access_token)
    _client().transactions_refresh(request)


def get_investment_holdings(access_token: str) -> dict:
    request = InvestmentsHoldingsGetRequest(access_token=access_token)
    response = _client().investments_holdings_get(request)
    return response.to_dict()


def get_liabilities(access_token: str) -> dict:
    request = LiabilitiesGetRequest(access_token=access_token)
    response = _client().liabilities_get(request)
    return response.to_dict()


def remove_item(access_token: str) -> None:
    request = ItemRemoveRequest(access_token=access_token)
    _client().item_remove(request)


def get_webhook_verification_key(key_id: str) -> dict:
    request = WebhookVerificationKeyGetRequest(key_id=key_id)
    response = _client().webhook_verification_key_get(request)
    return response.to_dict()
