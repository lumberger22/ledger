from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, File, HTTPException, UploadFile

from config import DATA_DIR
from db import get_connection
from models import PaystubConfirm
from services.analytics import resolve_period
from services.json_store import read_json
from services.paystub_parser import PaystubParseError, parse_paystub_pdf

router = APIRouter(prefix="/api/income", tags=["income"])

CATEGORIES_PATH = DATA_DIR / "income_categories.json"
DEFAULT_CATEGORIES = {
    "categories": [
        {"id": "taxes", "name": "Taxes", "color": "#B4483B"},
        {"id": "pretax_deductions", "name": "Pre-tax Deductions", "color": "#C7902E"},
        {"id": "posttax_deductions", "name": "Post-tax Deductions", "color": "#6C5B7B"},
        {"id": "take_home", "name": "Take-Home Pay", "color": "#2A6F6A"},
        {"id": "retirement_personal", "name": "Retirement — Personal", "color": "#3F8C5F"},
        {"id": "retirement_employer", "name": "Retirement — Employer", "color": "#3D5A80"},
        {"id": "insurance", "name": "Insurance", "color": "#9C6644"},
        {"id": "other_benefits", "name": "Other Benefits", "color": "#5B7553"},
        {"id": "other", "name": "Other", "color": "#9CA3AF"},
    ],
    "mappings": [
        {"match": "OASDI", "category_id": "taxes"},
        {"match": "Medicare", "category_id": "taxes"},
        {"match": "Federal Withholding", "category_id": "taxes"},
        {"match": "State Tax", "category_id": "taxes"},
        {"match": "Retirement - Basic A1", "category_id": "retirement_personal"},
        {"match": "Retirement Plan Matched Roth A2", "category_id": "retirement_personal"},
        {"match": "Retirement - MITRE A3", "category_id": "retirement_employer"},
        {"match": "Retirement - MITRE B1", "category_id": "retirement_employer"},
        {"match": "Insurance", "category_id": "insurance"},
        {"match": "Life Insurance", "category_id": "insurance"},
        {"match": "AD&D", "category_id": "insurance"},
        {"match": "Dental Insurance", "category_id": "insurance"},
    ],
}


def _category_config():
    return read_json(CATEGORIES_PATH, DEFAULT_CATEGORIES)


def _mapped_category(label: str, section: str, config: dict) -> str:
    lower = label.lower()
    for mapping in config.get("mappings", []):
        if mapping.get("match", "").lower() in lower:
            return mapping["category_id"]
    if section == "tax":
        return "taxes"
    if section == "pretax_deduction":
        return "pretax_deductions"
    if section == "posttax_deduction":
        return "posttax_deductions"
    if section == "employer_benefit":
        return "insurance" if "insurance" in lower or "ad&d" in lower else "other_benefits"
    return "other"


def _period(period: str, start: str | None, end: str | None):
    return resolve_period(period, start, end)


def _fetch_paystubs(conn, start: str, end: str):
    rows = conn.execute(
        "SELECT * FROM paystubs WHERE check_date >= ? AND check_date <= ? ORDER BY check_date DESC, id DESC",
        (start, end),
    ).fetchall()
    return [dict(r) for r in rows]


def _attach_details(conn, paystubs: list[dict]):
    if not paystubs:
        return []
    ids = [p["id"] for p in paystubs]
    placeholders = ",".join("?" for _ in ids)
    line_rows = conn.execute(
        f"SELECT * FROM paystub_line_items WHERE paystub_id IN ({placeholders}) ORDER BY id",
        ids,
    ).fetchall()
    payment_rows = conn.execute(
        f"SELECT * FROM paystub_payments WHERE paystub_id IN ({placeholders}) ORDER BY id",
        ids,
    ).fetchall()
    lines = defaultdict(list)
    payments = defaultdict(list)
    for row in line_rows:
        lines[row["paystub_id"]].append(dict(row))
    for row in payment_rows:
        payments[row["paystub_id"]].append(dict(row))
    return [{**p, "line_items": lines[p["id"]], "payments": payments[p["id"]]} for p in paystubs]


def _summary(records: list[dict], config: dict):
    totals = {
        "gross": sum(r["gross_pay"] for r in records),
        "net": sum(r["net_pay"] for r in records),
        "pretax": sum(r["pretax_total"] for r in records),
        "posttax": sum(r["posttax_total"] for r in records),
        "taxes": sum(r["taxes_total"] for r in records),
        "employer_benefits": sum(r["employer_benefits_total"] for r in records),
    }

    line_breakdown = defaultdict(float)
    for record in records:
        for item in record["line_items"]:
            if item["section"] == "earning":
                continue
            line_breakdown[_mapped_category(item["label"], item["section"], config)] += item["amount"]

    payment_breakdown = defaultdict(float)
    for record in records:
        for payment in record["payments"]:
            payment_breakdown[f"{payment['bank']} — {payment['account_label']}"] += payment["amount"]

    category_meta = {c["id"]: c for c in config.get("categories", [])}
    line_item_breakdown = []
    for category_id, amount in line_breakdown.items():
        meta = category_meta.get(category_id, {"name": category_id, "color": "#9CA3AF"})
        line_item_breakdown.append({
            "category_id": category_id,
            "name": meta["name"],
            "color": meta.get("color"),
            "amount": round(amount, 2),
        })
    line_item_breakdown.sort(key=lambda x: x["amount"], reverse=True)

    flow_breakdown = [
        {"category_id": "taxes", "name": "Taxes", "color": category_meta["taxes"]["color"], "amount": round(totals["taxes"], 2)},
        {"category_id": "pretax_deductions", "name": "Pre-tax Deductions", "color": category_meta["pretax_deductions"]["color"], "amount": round(totals["pretax"], 2)},
        {"category_id": "posttax_deductions", "name": "Post-tax Deductions", "color": category_meta["posttax_deductions"]["color"], "amount": round(totals["posttax"], 2)},
        {"category_id": "take_home", "name": "Take-Home Pay", "color": category_meta["take_home"]["color"], "amount": round(totals["net"], 2)},
    ]

    payments = [
        {"name": name, "amount": round(amount, 2), "percent": round((amount / totals["net"] * 100) if totals["net"] else 0, 1)}
        for name, amount in sorted(payment_breakdown.items(), key=lambda x: x[1], reverse=True)
    ]

    personal_retirement = sum(
        item["amount"]
        for record in records
        for item in record["line_items"]
        if item["section"] in {"pretax_deduction", "posttax_deduction"}
        and _mapped_category(item["label"], item["section"], config) == "retirement_personal"
    )
    employer_retirement = sum(
        item["amount"]
        for record in records
        for item in record["line_items"]
        if item["section"] == "employer_benefit"
        and _mapped_category(item["label"], item["section"], config) == "retirement_employer"
    )
    take_home_savings = sum(
        payment["amount"]
        for record in records
        for payment in record["payments"]
        if "emergency" in payment["account_label"].lower()
        or "saving" in payment["account_label"].lower()
    )

    return {
        **{k: round(v, 2) for k, v in totals.items()},
        "effective_tax_rate": round((totals["taxes"] / totals["gross"] * 100) if totals["gross"] else 0, 2),
        "personal_retirement": round(personal_retirement, 2),
        "employer_retirement": round(employer_retirement, 2),
        "total_retirement": round(personal_retirement + employer_retirement, 2),
        "retirement_percent_of_gross": round(((personal_retirement + employer_retirement) / totals["gross"] * 100) if totals["gross"] else 0, 2),
        "retirement_personal_percent_of_gross": round((personal_retirement / totals["gross"] * 100) if totals["gross"] else 0, 2),
        "take_home_savings": round(take_home_savings, 2),
        "take_home_savings_percent": round((take_home_savings / totals["net"] * 100) if totals["net"] else 0, 2),
        "flow_breakdown": flow_breakdown,
        "line_item_breakdown": line_item_breakdown,
        "payment_destinations": payments,
    }


@router.post("/upload")
async def upload_paystub(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Upload a PDF payslip.")
    contents = await file.read()
    try:
        records = parse_paystub_pdf(contents)
    except PaystubParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        # Explicitly drop the in-memory bytes reference; no uploaded PDF is persisted.
        contents = b""
    return {"paystubs": records, "count": len(records)}


@router.post("/confirm")
def confirm_paystubs(payload: PaystubConfirm):
    conn = get_connection()
    try:
        for paystub in payload.paystubs:
            exists = conn.execute(
                "SELECT id FROM paystubs WHERE pay_period_start = ? AND pay_period_end = ? AND check_date = ?",
                (paystub.pay_period_start, paystub.pay_period_end, paystub.check_date),
            ).fetchone()
            if exists:
                raise HTTPException(
                    status_code=409,
                    detail=f"A paystub for {paystub.pay_period_start} through {paystub.pay_period_end} already exists.",
                )

            cursor = conn.execute(
                """INSERT INTO paystubs\n                (pay_period_start, pay_period_end, check_date, gross_pay, net_pay, pretax_total, posttax_total, taxes_total, employer_benefits_total, uploaded_at)\n                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    paystub.pay_period_start,
                    paystub.pay_period_end,
                    paystub.check_date,
                    paystub.gross_pay,
                    paystub.net_pay,
                    paystub.pretax_total,
                    paystub.posttax_total,
                    paystub.taxes_total,
                    paystub.employer_benefits_total,
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
            paystub_id = cursor.lastrowid
            conn.executemany(
                "INSERT INTO paystub_line_items (paystub_id, section, label, amount) VALUES (?, ?, ?, ?)",
                [(paystub_id, item.section, item.label, item.amount) for item in paystub.line_items],
            )
            conn.executemany(
                "INSERT INTO paystub_payments (paystub_id, bank, account_label, account_last4, amount) VALUES (?, ?, ?, ?, ?)",
                [(paystub_id, p.bank, p.account_label, p.account_last4, p.amount) for p in paystub.payments],
            )
        conn.commit()
    finally:
        conn.close()
    return {"saved": len(payload.paystubs)}


@router.get("")
def get_income(period: str = "this_month", start: str | None = None, end: str | None = None):
    start_d, end_d = _period(period, start, end)
    config = _category_config()
    conn = get_connection()
    try:
        paystubs = _attach_details(conn, _fetch_paystubs(conn, start_d, end_d))
        all_recent = _attach_details(conn, _fetch_paystubs(conn, "1900-01-01", "2999-12-31"))
    finally:
        conn.close()

    summary = _summary(paystubs, config)

    # Monthly trend over the latest 6 calendar months based on check date.
    trend = []
    for p in all_recent:
        month = p["check_date"][:7]
        existing = next((x for x in trend if x["month"] == month), None)
        if not existing:
            existing = {"month": month, "gross": 0.0, "net": 0.0, "taxes": 0.0}
            trend.append(existing)
        existing["gross"] += p["gross_pay"]
        existing["net"] += p["net_pay"]
        existing["taxes"] += p["taxes_total"]
    trend = sorted(trend, key=lambda x: x["month"])[-6:]
    for x in trend:
        for key in ("gross", "net", "taxes"):
            x[key] = round(x[key], 2)

    return {
        "period": {"start": start_d, "end": end_d},
        "paystub_count": len(paystubs),
        "summary": summary,
        "paystubs": paystubs,
        "trend": trend,
        "categories": config.get("categories", []),
    }
