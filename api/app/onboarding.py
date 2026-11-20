"""Onboarding documents checklist.

HR ticks which documents a new joiner has handed over. Nothing is uploaded: we only record that a
document was provided and on which day it was marked (User.onboarding_docs = {key: "YYYY-MM-DD"}).
"""

from datetime import date

from fastapi import HTTPException

# Order is the display order. Keys are stored in the database: add new ones freely, but do not
# rename or remove a key without migrating the stored data.
ONBOARDING_DOCUMENTS: list[tuple[str, str]] = [
    ("offer", "Signed offer letter"),
    ("id_proof", "Government photo ID (Aadhaar / passport)"),
    ("pan", "PAN card"),
    ("address_proof", "Address proof"),
    ("education", "Education certificates"),
    ("experience", "Relieving / experience letter"),
    ("payslips", "Last 3 months' payslips"),
    ("bank", "Bank details / cancelled cheque"),
    ("nda", "Signed NDA and code of conduct"),
    ("emergency", "Emergency contact form"),
]
DOC_KEYS = {k for k, _ in ONBOARDING_DOCUMENTS}


def documents_catalog() -> list[dict]:
    return [{"key": k, "label": label} for k, label in ONBOARDING_DOCUMENTS]


def apply_documents(current: dict | None, provided: list[str], today: date) -> dict:
    """New stored value for a user's checklist. Keeps the original date for documents that stay
    ticked, stamps `today` on newly ticked ones and drops unticked ones."""
    unknown = set(provided) - DOC_KEYS
    if unknown:
        raise HTTPException(400, f"Unknown onboarding document: {', '.join(sorted(unknown))}")
    current = current or {}
    return {k: current.get(k) or today.isoformat() for k, _ in ONBOARDING_DOCUMENTS if k in provided}


def documents_status(stored: dict | None) -> dict:
    """Checklist as returned by the API: every document with its provided date (or None), plus totals."""
    stored = stored or {}
    items = [{"key": k, "label": label, "provided_on": stored.get(k)} for k, label in ONBOARDING_DOCUMENTS]
    return {"provided": sum(1 for i in items if i["provided_on"]), "total": len(items), "items": items}
