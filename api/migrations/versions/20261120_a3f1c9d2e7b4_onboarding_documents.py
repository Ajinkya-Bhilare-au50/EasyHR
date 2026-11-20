"""onboarding documents checklist

Revision ID: a3f1c9d2e7b4
Revises: 267c6422b269
Create Date: 2026-11-20 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'a3f1c9d2e7b4'
down_revision: Union[str, Sequence[str], None] = '267c6422b269'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('onboarding_docs', postgresql.JSONB(astext_type=sa.Text()),
                                     server_default=sa.text("'{}'::jsonb"), nullable=False))


def downgrade() -> None:
    op.drop_column('users', 'onboarding_docs')
