from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from django.core.files.storage import default_storage
from .celery_ingest_task import ingest_uploaded_file


class DocumentUploadView(APIView):
    parser_classes = [MultiPartParser]

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({"error": "No file"}, status=400)

        s3_path = default_storage.save(f"uploads/{request.user.id}/{file.name}", file)
        ingest_uploaded_file.delay(
            user_id=str(request.user.id),
            s3_path=s3_path,
            filename=file.name
        )
        return Response({"status": "accepted", "filename": file.name}, status=202)
