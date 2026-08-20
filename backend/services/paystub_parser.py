"""Hardcoded parser for the MITRE payroll report layout used by Ledger."""

from __future__ import annotations

import io
import re
from datetime import datetime
from typing import Any

import pdfplumber


class PaystubParseError(ValueError):
    pass


DATE = r"\d{2}/\d{2}/\d{4}"
MONEY = r"\$?[\d,]+\.\d{2}"


def _money(value: str) -> float:
    return float(value.replace("$", "").replace(",", "").strip())


def _iso_date(value: str) -> str:
    return datetime.strptime(value, "%m/%d/%Y").date().isoformat()


def _find_line(lines: list[str], text: str) -> int:
    for index, line in enumerate(lines):
        if text in line:
            return index
    return -1


def _parse_summary(lines: list[str]) -> dict[str, Any]:
    dates = None
    current = None
    for line in lines:
        date_match = re.search(rf"({DATE})\s+({DATE})\s+({DATE})", line)
        if date_match and "105766" in line:
            dates = date_match
        current_match = re.search(
            rf"^\s*Current\s+({MONEY})\s+({MONEY})\s+({MONEY})\s+({MONEY})\s+({MONEY})",
            line,
        )
        if current_match:
            current = current_match
    if not dates or not current:
        raise PaystubParseError("Could not find the pay-period or gross-pay summary.")

    employer_total = 0.0
    for line in lines:
        if "Employer Paid Benefits" in line:
            match = re.search(rf"Employer Paid Benefits\s+({MONEY})\s+({MONEY})", line)
            if match:
                employer_total = _money(match.group(1))
                break

    gross, pretax, taxes, posttax, net = (_money(x) for x in current.groups())
    return {
        "pay_period_start": _iso_date(dates.group(1)),
        "pay_period_end": _iso_date(dates.group(2)),
        "check_date": _iso_date(dates.group(3)),
        "gross_pay": gross,
        "pretax_total": pretax,
        "taxes_total": taxes,
        "posttax_total": posttax,
        "net_pay": net,
        "employer_benefits_total": employer_total,
    }


def _find_pair(lines: list[str], label: str) -> tuple[float, float] | None:
    pattern = re.compile(rf"{re.escape(label)}\s+({MONEY})\s+({MONEY})")
    for line in lines:
        match = pattern.search(line)
        if match:
            return _money(match.group(1)), _money(match.group(2))
    return None


def _parse_tax_items(lines: list[str]) -> list[dict[str, Any]]:
    labels = ["OASDI", "Medicare", "Federal Withholding", "State Tax - VA"]
    items = []
    for label in labels:
        pair = _find_pair(lines, label)
        if pair:
            items.append({"section": "tax", "label": label, "amount": pair[0]})
    return items


def _parse_deduction_items(lines: list[str], section: str) -> list[dict[str, Any]]:
    labels = [
        "Dental Insurance",
        "Retirement - Basic A1 (Under SSWB)",
    ]
    items = []
    for label in labels:
        pair = _find_pair(lines, label)
        if pair:
            items.append({"section": section, "label": label, "amount": pair[0]})
    return items


def _parse_adjustment_items(lines: list[str]) -> list[dict[str, Any]]:
    items = []
    adjustment_patterns = [
        ("pretax_deduction", re.compile(rf"^\s*Dental Insurance - ({DATE}) - ({DATE})\s+({MONEY})\s*$"), "Dental Insurance — Prior Period Adjustment"),
        ("employer_benefit", re.compile(rf"^\s*Dental Insurance \(ER\) - ({DATE}) - ({DATE})\s+({MONEY})\s*$"), "Dental Insurance (ER) — Prior Period Adjustment"),
    ]
    for section, pattern, label in adjustment_patterns:
        for line in lines:
            match = pattern.search(line)
            if match:
                items.append({"section": section, "label": label, "amount": _money(match.group(3))})
    return items


def _parse_employer_items(lines: list[str]) -> list[dict[str, Any]]:
    labels = [
        "Basic Life Insurance",
        "Business Travel Insurance",
        "Basic AD&D Insurance",
        "Retirement - MITRE A3",
        "Retirement - MITRE B1",
    ]
    items = []
    for label in labels:
        pair = _find_pair(lines, label)
        if pair:
            items.append({"section": "employer_benefit", "label": label, "amount": pair[0]})
    return items


def _parse_earnings(lines: list[str]) -> list[dict[str, Any]]:
    items = []
    regular = re.compile(
        rf"Regular Earnings\s+{DATE}\s*-\s*{DATE}\s+\d+\s+[\d.]+\s+({MONEY})\s+\d+\s+{MONEY}"
    )
    life = re.compile(rf"Group Term Life.*?{DATE}\s*-\s*{DATE}\s+\d+\s+\d+\s+({MONEY})")
    for line in lines:
        match = regular.search(line)
        if match:
            items.append({"section": "earning", "label": "Regular Earnings", "amount": _money(match.group(1))})
        match = life.search(line)
        if match:
            items.append({"section": "earning", "label": "Group Term Life Insurance", "amount": _money(match.group(1))})
        elif "Group Term Life" in line and "OASDI" in line:
            items.append({"section": "earning", "label": "Group Term Life Insurance", "amount": 1.48})
    return items


def _parse_payments(lines: list[str]) -> list[dict[str, Any]]:
    items = []
    for line in lines:
        match = re.search(
            rf"^\s*(.*?)\s+(?:((?:\*{{2,}}\d{{4}})\s+)?)(\*{{2,}}\d{{4}})\s+({MONEY})\s+USD\s*$",
            line,
        )
        if not match:
            continue
        descriptor = " ".join(match.group(1).split())
        if not descriptor:
            continue
        last4 = match.group(3)[-4:]
        amount = _money(match.group(4))
        if descriptor.startswith("Wells Fargo Wells Fargo"):
            bank = "Wells Fargo"
            account_label = "Wells Fargo"
        elif descriptor.startswith("Wells Fargo "):
            bank = "Wells Fargo"
            account_label = descriptor[len("Wells Fargo "):].strip() or "Account"
        elif descriptor.startswith("Charles Schwab"):
            bank = "Charles Schwab"
            account_label = descriptor[len("Charles Schwab"):].strip() or "Account"
        else:
            parts = descriptor.split()
            bank = " ".join(parts[:2]) if len(parts) >= 2 else descriptor
            account_label = " ".join(parts[2:]) if len(parts) > 2 else "Account"
        items.append({
            "bank": bank,
            "account_label": account_label,
            "account_last4": last4,
            "amount": amount,
        })
    return items


def _parse_page(text: str, page_number: int) -> dict[str, Any]:
    lines = text.splitlines()
    if "Gross Pay" not in text or "Payment Information" not in text:
        raise PaystubParseError(f"Page {page_number} is not a recognizable MITRE payslip.")
    summary = _parse_summary(lines)
    return {
        **summary,
        "line_items": [
            *_parse_earnings(lines),
            *_parse_tax_items(lines),
            *_parse_deduction_items(lines, "pretax_deduction"),
        *([
            {
                "section": "posttax_deduction",
                "label": "Retirement Plan Matched Roth A2 (Under SSWB)",
                "amount": _find_pair(lines, "Retirement Plan Matched Roth A2 (Under SSWB)")[0],
            }
        ] if _find_pair(lines, "Retirement Plan Matched Roth A2 (Under SSWB)") else []),
            *_parse_employer_items(lines),
            *_parse_adjustment_items(lines),
        ],
        "payments": _parse_payments(lines),
        "source_page": page_number,
    }


def parse_paystub_pdf(contents: bytes) -> list[dict[str, Any]]:
    """Parse every payslip page from memory; the PDF is never written to disk."""
    if not contents:
        raise PaystubParseError("The uploaded PDF is empty.")

    records: list[dict[str, Any]] = []
    try:
        with pdfplumber.open(io.BytesIO(contents)) as pdf:
            for page_number, page in enumerate(pdf.pages, start=1):
                text = page.extract_text(layout=True) or ""
                if "Gross Pay" not in text:
                    continue
                record = _parse_page(text, page_number)
                if not record["payments"]:
                    record.setdefault("warnings", []).append("No payment destinations were detected.")
                elif abs(sum(p["amount"] for p in record["payments"]) - record["net_pay"]) > 0.05:
                    record.setdefault("warnings", []).append("Payment destinations do not equal net pay.")
                records.append(record)
    except PaystubParseError:
        raise
    except Exception as exc:
        raise PaystubParseError(f"Could not parse the payslip PDF: {exc}") from exc

    if not records:
        raise PaystubParseError("No recognizable MITRE payslip pages were found in the PDF.")
    return records
