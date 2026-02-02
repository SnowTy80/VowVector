from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "vowvector_dev"

    qdrant_host: str = "localhost"
    qdrant_port: int = 6333

    ollama_base_url: str = "http://localhost:11434"
    embedding_model: str = "nomic-embed-text:v1.5"
    embedding_dim: int = 768

    class Config:
        env_file = ".env"


settings = Settings()
