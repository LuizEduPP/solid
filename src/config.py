from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openai_api_key: str = Field(validation_alias="OPENAI_API_KEY")
    openai_base_url: str = Field(
        default="https://api.openai.com/v1",
        validation_alias="OPENAI_BASE_URL",
    )
    model: str = Field(default="gpt-4o-mini", validation_alias="DEEPSEARCH_MODEL")

    target_score: float = Field(default=90.0, validation_alias="DEEPSEARCH_TARGET_SCORE")
    max_iterations: int = Field(default=10, validation_alias="DEEPSEARCH_MAX_ITERATIONS")
    min_score: float = Field(default=0.01, validation_alias="DEEPSEARCH_MIN_SCORE")
    results_per_query: int = Field(default=5, validation_alias="DEEPSEARCH_RESULTS_PER_QUERY")

    host: str = Field(default="0.0.0.0", validation_alias="DEEPSEARCH_HOST")
    port: int = Field(default=8787, validation_alias="DEEPSEARCH_PORT")


def load_settings() -> Settings:
    return Settings()
