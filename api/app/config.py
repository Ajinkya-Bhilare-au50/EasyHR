from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://easyhr:easyhr@localhost:5432/easyhr"
    jwt_secret: str = "change-me-in-production"
    jwt_expire_minutes: int = 720
    base_domain: str = "localhost"
    cookie_name: str = "easyhr_session"


settings = Settings()
