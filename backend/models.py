"""Pydantic request/response models."""

from typing import Optional, List
from pydantic import BaseModel, Field

# ---------- Charges ----------


class ChargeUpdate(BaseModel):
    date: Optional[str] = None
    amount: Optional[float] = None
    source: Optional[str] = None
    nickname: Optional[str] = None
    category_id: Optional[str] = None
    recurring: Optional[bool] = None
    notes: Optional[str] = None


class ChargeCreate(BaseModel):
    date: str
    amount: float
    source: str
    nickname: Optional[str] = None
    category_id: Optional[str] = None
    recurring: bool = False
    notes: Optional[str] = None
    status: str = "confirmed"
    account_type: str = "credit_card"


class ChargeOut(BaseModel):
    id: int
    date: str
    amount: float
    source: str
    nickname: Optional[str] = None
    category_id: Optional[str] = None
    recurring: bool
    notes: Optional[str] = None
    status: str
    upload_batch_id: Optional[str] = None
    source_file: Optional[str] = None
    account_type: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# ---------- Budget ----------


class Category(BaseModel):
    id: str
    name: str
    monthly_target: float
    color: str
    created_at: Optional[str] = None
    archived: bool = False


class CategorySnapshot(BaseModel):
    effective_date: str
    categories: List[Category]


class Budget(BaseModel):
    categories: List[Category] = Field(default_factory=list)
    history: List[CategorySnapshot] = Field(default_factory=list)
    income: Optional[float] = None


class BudgetUpdate(BaseModel):
    categories: List[Category]
    income: Optional[float] = None


# ---------- Settings ----------


class CsvColumnMapping(BaseModel):
    date: str = "DATE"
    amount: str = "AMOUNT"
    description: str = "DESCRIPTION"


class Settings(BaseModel):
    data_folder: str
    currency: str = "USD"
    date_format: str = "MM/DD/YYYY"
    csv_column_mapping: CsvColumnMapping = Field(default_factory=CsvColumnMapping)
    checking_csv_column_mapping: CsvColumnMapping = Field(
        default_factory=lambda: CsvColumnMapping(
            date="Date", amount="Amount", description="Description"
        )
    )
    theme: str = "light"


# ---------- Plaid ----------


class LinkTokenRequest(BaseModel):
    # Set to re-link an existing, broken Item (e.g. login_required) in
    # Plaid's "update mode" instead of creating a brand-new connection.
    item_id: Optional[str] = None


class ExchangeTokenRequest(BaseModel):
    public_token: str
    institution_id: Optional[str] = None
    institution_name: Optional[str] = None


class AccountOut(BaseModel):
    id: int
    plaid_account_id: Optional[str] = None
    name: str
    official_name: Optional[str] = None
    mask: Optional[str] = None
    type: Optional[str] = None
    subtype: Optional[str] = None
    current_balance: Optional[float] = None
    available_balance: Optional[float] = None
    credit_limit: Optional[float] = None
    iso_currency_code: Optional[str] = None
    apr_percentage: Optional[float] = None
    minimum_payment: Optional[float] = None
    last_statement_balance: Optional[float] = None
    is_manual: bool = False
    is_hidden: bool = False
    last_balance_sync_at: Optional[str] = None
    institution_name: Optional[str] = None
    item_status: Optional[str] = None


class ManualAccountCreate(BaseModel):
    name: str
    type: str = "depository"
    subtype: Optional[str] = None
    current_balance: float = 0.0
    iso_currency_code: str = "USD"


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    is_hidden: Optional[bool] = None
    current_balance: Optional[float] = None


# ---------- Pending workflow ----------


class PendingUpdate(BaseModel):
    category_id: Optional[str] = None
    nickname: Optional[str] = None
    recurring: Optional[bool] = None
    notes: Optional[str] = None

# ---------- Income / Paystubs ----------

class PaystubLineItem(BaseModel):
    section: str
    label: str
    amount: float


class PaystubPayment(BaseModel):
    bank: str
    account_label: str
    account_last4: Optional[str] = None
    amount: float


class PaystubReview(BaseModel):
    pay_period_start: str
    pay_period_end: str
    check_date: str
    gross_pay: float
    net_pay: float
    pretax_total: float
    posttax_total: float
    taxes_total: float
    employer_benefits_total: float
    line_items: List[PaystubLineItem] = Field(default_factory=list)
    payments: List[PaystubPayment] = Field(default_factory=list)


class PaystubConfirm(BaseModel):
    paystubs: List[PaystubReview]
