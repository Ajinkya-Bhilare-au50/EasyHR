"""Central tenant scoping (documentation.md §4.1).

Once a request's session is bound to a company (session.info["company_id"]), every ORM SELECT
is automatically filtered by company_id for every model that has that column. Handlers never
need to remember the filter, and a missing filter cannot leak another company's data.
"""

from functools import lru_cache

from sqlalchemy import event, or_
from sqlalchemy.orm import ORMExecuteState, Session, with_loader_criteria

from .db import Base
from .models import Role


@lru_cache(maxsize=1)
def _scoped_models() -> tuple[type, ...]:
    return tuple(
        m.class_ for m in Base.registry.mappers if "company_id" in m.columns and m.class_ is not Role
    )


@lru_cache(maxsize=1024)
def _tenant_options(cid) -> tuple:
    """Loader criteria for one company, built once per company and reused for every query
    (rebuilding them on each query cost about 0.5 ms; measured, see git history).

    `cid` MUST stay a closure variable of these lambdas, never a lambda default argument:
    SQLAlchemy caches lambda statements and re-extracts closure variables as bound parameters
    on each execution, but a default argument would be frozen at its first value and leak one
    company's filter into another. Each company also gets its own cached tuple.
    """
    opts = [with_loader_criteria(cls, lambda c: c.company_id == cid, include_aliases=True) for cls in _scoped_models()]
    # System roles (company_id NULL) are shared by all companies.
    opts.append(with_loader_criteria(Role, lambda c: or_(c.company_id == cid, c.company_id.is_(None)), include_aliases=True))
    return tuple(opts)


@event.listens_for(Session, "do_orm_execute")
def _add_tenant_filter(state: ORMExecuteState):
    cid = state.session.info.get("company_id")
    if cid is None or not state.is_select or state.execution_options.get("skip_tenant_scope"):
        return
    state.statement = state.statement.options(*_tenant_options(cid))


def bind_company(db: Session, company_id) -> None:
    db.info["company_id"] = company_id
