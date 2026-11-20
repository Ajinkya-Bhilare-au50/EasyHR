from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_JWT_SECRET = "change-me-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # "development" (local) or "production" (hosted). Production refuses the default JWT secret
    # and marks the session cookie Secure (HTTPS only).
    environment: str = "development"

    database_url: str = "postgresql+psycopg://easyhr:easyhr@localhost:5432/easyhr"
    jwt_secret: str = DEFAULT_JWT_SECRET
    jwt_expire_minutes: int = 720
    base_domain: str = "localhost"
    cookie_name: str = "easyhr_session"
    cookie_secure: bool | None = None  # None = Secure in production, not in development

    # First-run setup on a fresh database (python -m app.bootstrap).
    master_admin_email: str | None = None
    master_admin_password: str | None = None
    seed_demo: bool = False  # load the Alphabet Inc. demo company and its demo logins

    @field_validator("database_url")
    @classmethod
    def _use_psycopg_driver(cls, v: str) -> str:
        # Hosts such as Railway hand out postgres:// or postgresql:// URLs; SQLAlchemy needs the
        # driver named explicitly to use psycopg 3.
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @model_validator(mode="after")
    def _production_checks(self):
        if self.cookie_secure is None:
            self.cookie_secure = self.is_production
        if self.is_production and (self.jwt_secret == DEFAULT_JWT_SECRET or len(self.jwt_secret) < 32):
            raise ValueError("JWT_SECRET must be set to a random value of at least 32 characters in production")
        return self

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


settings = Settings()
