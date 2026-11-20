import uuid
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy.orm import Session

from .models import AuditLog, Notification


def _jsonable(v):
    if isinstance(v, dict):
        return {k: _jsonable(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_jsonable(x) for x in v]
    if isinstance(v, (datetime, date, time)):
        return v.isoformat()
    if isinstance(v, (uuid.UUID, Decimal)):
        return str(v)
    return v


def audit(db: Session, *, company_id, actor_id, action: str, entity: str, entity_id=None,
          old=None, new=None) -> None:
    db.add(AuditLog(
        company_id=company_id, actor_id=actor_id, action=action, entity=entity,
        entity_id=entity_id, old_value=_jsonable(old), new_value=_jsonable(new),
    ))


def notify(db: Session, *, company_id, user_id, title: str, body: str = "", kind: str = "info",
           link: str | None = None) -> None:
    db.add(Notification(company_id=company_id, user_id=user_id, title=title, body=body, kind=kind, link=link))
