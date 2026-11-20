"""Profile photos: upload, serve and remove.

The browser crops to a square and shrinks the image before upload (~30 KB), and sends it as a data
URL in JSON. The server never trusts the declared type: it checks the file signature, caps the size,
and serves the bytes back with `nosniff`, so an upload can only ever be displayed as an image.
"""

import base64
import binascii
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..common import CamelModel, brief, resolve_user
from ..db import get_db
from ..deps import Ctx, get_ctx
from ..models import User, UserPhoto

router = APIRouter(prefix="/api/people", tags=["photos"])

MAX_BYTES = 1_000_000  # after decoding; client-side resizing keeps real uploads far below this
_DATA_URL = re.compile(r"^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$")


def _signature_type(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _target(db: Session, ctx: Ctx, user_ref: str) -> User:
    """The user whose photo is being changed: yourself, or anyone in your company if you are HR."""
    u = ctx.user if user_ref == "me" else resolve_user(db, user_ref)
    if u.id != ctx.user.id and not ctx.can("employees.manage"):
        raise HTTPException(403, "You can only change your own photo")
    return u


class PhotoIn(CamelModel):
    data_url: str


@router.put("/{user_ref}/photo")
def upload_photo(user_ref: str, body: PhotoIn, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    u = _target(db, ctx, user_ref)
    m = _DATA_URL.match(body.data_url.strip())
    if not m:
        raise HTTPException(400, "Upload a JPEG, PNG or WebP image")
    try:
        data = base64.b64decode(m.group(2), validate=False)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "The image could not be read")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "The photo is too large (max 1 MB after resizing)")
    actual = _signature_type(data)
    if not actual:
        raise HTTPException(400, "That file is not a JPEG, PNG or WebP image")

    photo = db.scalar(select(UserPhoto).where(UserPhoto.user_id == u.id))
    if not photo:
        photo = UserPhoto(user_id=u.id, company_id=u.company_id)
        db.add(photo)
    photo.content_type, photo.data = actual, data
    now = datetime.now(timezone.utc)
    photo.updated_at = now
    had_photo = u.photo_updated_at is not None
    u.photo_updated_at = now
    audit(db, company_id=u.company_id, actor_id=ctx.user.id, action="employee.photo_updated", entity="user",
          entity_id=u.id, new={"replaced": had_photo, "bytes": len(data), "type": actual})
    db.commit()
    return brief(u)


@router.delete("/{user_ref}/photo")
def remove_photo(user_ref: str, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    u = _target(db, ctx, user_ref)
    photo = db.scalar(select(UserPhoto).where(UserPhoto.user_id == u.id))
    if photo:
        db.delete(photo)
    if u.photo_updated_at:
        u.photo_updated_at = None
        audit(db, company_id=u.company_id, actor_id=ctx.user.id, action="employee.photo_removed", entity="user",
              entity_id=u.id)
    db.commit()
    return brief(u)


@router.get("/{user_id}/photo")
def get_photo(user_id: uuid.UUID, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    # Tenant scoping applies here too: another company's photo is simply not found.
    photo = db.scalar(select(UserPhoto).where(UserPhoto.user_id == user_id))
    if not photo:
        raise HTTPException(404, "No photo")
    return Response(
        content=photo.data,
        media_type=photo.content_type,
        headers={
            # URLs carry ?v=<upload time>, so each one never changes: cache it in this browser for a year.
            "Cache-Control": "private, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'",
        },
    )
