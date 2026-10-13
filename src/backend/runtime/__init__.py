from psycopg_pool import ConnectionPool

from .config import Config
from .data.zitadel import ZitadelIdentityProvider
from .data.prediction_services import PredictionService as PS
from .data.postgres.medical_record_service import MedicalRecordService as MRS
from .data.postgres.medical_prescription_service import MedicalPrescriptionService as MPS
from .data.report_generation_service import ReportGenerationService as RGS
from .data.aws_s3 import S3PresignedURLHandler as s3
from .logger import Logger

RuntimeConfig = Config()

IdentityProvider = ZitadelIdentityProvider(
    issuer=RuntimeConfig.get("ZITADEL_ISSUER"),
    api_url=RuntimeConfig.get("ZITADEL_API_URL"),
    organization_id=RuntimeConfig.get("ZITADEL_ORGANIZATION_ID"),
    project_id=RuntimeConfig.get("ZITADEL_PROJECT_ID"),
    client_id=RuntimeConfig.get("ZITADEL_CLIENT_ID"),
    service_token=RuntimeConfig.get("ZITADEL_SERVICE_USER_TOKEN"),
    sso_default_role=RuntimeConfig.get("ZITADEL_SSO_DEFAULT_ROLE"),
)

# app.py opens the pool, so importing runtime needs no database
DatabasePool = ConnectionPool(RuntimeConfig.get("DATABASE_URL"), open=False)

PredictionService = PS()
MedicalRecordService = MRS(DatabasePool)
MedicalPrescriptionService = MPS(DatabasePool)
ReportGenerationService = RGS(IdentityProvider, PredictionService)
S3PresignedURLHandler = s3('neuralanalyzer-xrays')

RuntimeLogger = Logger().getLogger()
