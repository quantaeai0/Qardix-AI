from supabase import create_client, Client
from app.config import settings
import uuid


class SupabaseStorageService:
    def __init__(self):
        self.client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
        self.bucket = settings.ECG_BUCKET

    async def upload_ecg_image(self, file_bytes: bytes, original_filename: str) -> str:
        """
        Uploads image file bytes to Supabase Storage bucket.
        Returns the path within the bucket.
        """
        ext = original_filename.split(".")[-1] if "." in original_filename else "png"
        path = f"ecg_uploads/{uuid.uuid4()}.{ext}"

        # Upload to bucket with automatic bucket provision fallback
        try:
            self.client.storage.from_(self.bucket).upload(
                path=path,
                file=file_bytes,
                file_options={"content-type": f"image/{ext}"}
            )
        except Exception as e:
            if "Bucket not found" in str(e) or "NoSuchBucket" in str(e):
                try:
                    self.client.storage.create_bucket(self.bucket, options={"public": True})
                    self.client.storage.from_(self.bucket).upload(
                        path=path,
                        file=file_bytes,
                        file_options={"content-type": f"image/{ext}"}
                    )
                except Exception:
                    raise e
            else:
                raise e
        return path

    def get_public_url(self, path: str) -> str:
        """Returns signed or public URL for the ECG image"""
        return self.client.storage.from_(self.bucket).get_public_url(path)


storage_service = SupabaseStorageService()
