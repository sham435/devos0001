FROM python:3.12-slim AS builder

WORKDIR /install
COPY pyproject.toml .
RUN pip install --no-cache-dir --prefix=/install .

FROM python:3.12-slim AS runtime

RUN addgroup --system appuser && adduser --system --ingroup appuser appuser

COPY --from=builder /install /usr/local

WORKDIR /app
COPY --chown=appuser:appuser app/ app/
COPY --chown=appuser:appuser alembic/ alembic/
COPY --chown=appuser:appuser alembic.ini .
COPY --chown=appuser:appuser docker/entrypoint.sh ./docker/entrypoint.sh

RUN chmod +x docker/entrypoint.sh
USER appuser
EXPOSE 8000

CMD ["./docker/entrypoint.sh"]
