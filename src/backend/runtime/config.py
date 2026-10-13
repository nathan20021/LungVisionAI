import json
import os

from botocore.config import Config as aws_config
from dotenv import load_dotenv

load_dotenv()  # take environment variables from .env.


def _zitadel_setting(key, default=None):
    """Read a Zitadel setting from the environment, then from the file written by
    scripts/zitadel_bootstrap.py (ZITADEL_CONFIG_FILE)."""
    if os.getenv(key):
        return os.getenv(key)
    path = os.getenv("ZITADEL_CONFIG_FILE")
    if path and os.path.exists(path):
        with open(path) as f:
            return json.load(f).get(key, default)
    return default


class Config:
    def __init__(self):
        config = {
            "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY", default=None),
            "FRONTEND_URL": os.getenv("FRONTEND_URL", default="http://localhost:3000"),
            "AWS_ACCESS_KEY_ID": os.getenv("AWS_ACCESS_KEY_ID", default=None),
            "AWS_SECRET_ACCESS_KEY": os.getenv("AWS_SECRET_ACCESS_KEY", default=None),
            # dev default: the backend-db compose service, reached from the host
            "DATABASE_URL": os.getenv(
                "DATABASE_URL", default="postgresql://root:password@localhost:5432/lungvisionAI"
            ),
            "ZITADEL_ISSUER": _zitadel_setting("ZITADEL_ISSUER"),
            "ZITADEL_API_URL": _zitadel_setting(
                "ZITADEL_API_URL", default=_zitadel_setting("ZITADEL_ISSUER")
            ),
            "ZITADEL_ORGANIZATION_ID": _zitadel_setting("ZITADEL_ORGANIZATION_ID"),
            "ZITADEL_PROJECT_ID": _zitadel_setting("ZITADEL_PROJECT_ID"),
            "ZITADEL_CLIENT_ID": _zitadel_setting("ZITADEL_CLIENT_ID"),
            "ZITADEL_SERVICE_USER_TOKEN": _zitadel_setting("ZITADEL_SERVICE_USER_TOKEN"),
            # role given to users on their first SSO sign-in: doctor, patient or none
            "ZITADEL_SSO_DEFAULT_ROLE": os.getenv("ZITADEL_SSO_DEFAULT_ROLE", default="doctor"),
            "AWS_CONFIG": aws_config(
                region_name=os.getenv("AWS_REGION", default="us-east-2"),
                signature_version="v4",
                retries={"max_attempts": 5, "mode": "standard"},
            ),
            "MODELS": {
                "TORCH_XRAY_VISION_MODEL_URL": os.getenv(
                    "TORCHXRAYVISION_MODEL_URL", default="http://localhost:8889"
                ),
                "NEURALANALYZER_MODEL_URL": os.getenv(
                    "NEURALANALYZER_MODEL_URL", default="http://localhost:8890"
                ),
            },
        }
        for c in config:
            if config[c] is None:
                raise ValueError(f"Config {c} is not set")
        self.config = config

    def get_config(self):
        return self.config

    def get(self, key):
        if key not in self.config:
            return None
        return self.config.get(key)
