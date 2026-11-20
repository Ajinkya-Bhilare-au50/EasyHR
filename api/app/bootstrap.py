"""Production start-up step, run before the API starts (see api/Dockerfile).

    python -m app.bootstrap

Safe to run on every deploy:
1. Applies pending Alembic migrations.
2. Creates or refreshes the built-in permissions and roles.
3. On a database with no master admin, creates one from MASTER_ADMIN_EMAIL / MASTER_ADMIN_PASSWORD.
   The master admin then creates companies (and each company's first HR admin) at /master.
4. Only if SEED_DEMO=true: loads the Alphabet Inc. demo company with its well-known demo logins.
"""

import sys

from sqlalchemy import select

from .config import settings
from .db import SessionLocal
from .models import User
from .security import hash_password
from .seed import migrate, seed, seed_rbac


def ensure_master_admin() -> None:
    with SessionLocal() as db:
        seed_rbac(db)
        if db.scalar(select(User).where(User.is_master_admin.is_(True))):
            db.commit()
            print("bootstrap: master admin already exists")
            return
        email, password = settings.master_admin_email, settings.master_admin_password
        if not email or not password:
            db.commit()
            print("bootstrap: WARNING no master admin yet. Set MASTER_ADMIN_EMAIL and MASTER_ADMIN_PASSWORD "
                  "and redeploy to create one.", file=sys.stderr)
            return
        if len(password) < 12:
            raise SystemExit("bootstrap: MASTER_ADMIN_PASSWORD must be at least 12 characters")
        db.add(User(company_id=None, name="Platform Admin", email=email.strip().lower(), is_master_admin=True,
                    password_hash=hash_password(password)))
        db.commit()
        print(f"bootstrap: created master admin {email.strip().lower()}")


def main() -> None:
    migrate()
    print("bootstrap: migrations applied")
    ensure_master_admin()
    if settings.seed_demo:
        seed()  # idempotent: skips if the demo company already exists
        print("bootstrap: demo data checked")


if __name__ == "__main__":
    main()
