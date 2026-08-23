# Python service image — same principles as the Node one:
# slim base, dependency layer cached before the code layer, non-root user.
FROM python:3.12-slim

WORKDIR /app

# Dependencies first -> this layer is cached until requirements.txt changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Non-root user, like the Node image.
RUN useradd --system --no-create-home appuser
USER appuser

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
