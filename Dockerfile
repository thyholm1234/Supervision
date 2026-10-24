# Supervisionsregnskab – én uvicorn-proces, kører som ikke-root bruger.
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    SUPERVISION_DATA_DIR=/data

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt \
 && useradd --system --uid 10001 --home-dir /nonexistent --shell /usr/sbin/nologin supervision \
 && mkdir /data && chown supervision /data

COPY server ./server
COPY static ./static

USER supervision
VOLUME ["/data"]
EXPOSE 9473

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import urllib.request,sys; sys.exit(urllib.request.urlopen('http://127.0.0.1:9473/api/health', timeout=4).status != 200)"

# Proxy-headere stoles kun på fra adresserne i $FORWARDED_ALLOW_IPS (sættes i docker-compose.yml).
ENV FORWARDED_ALLOW_IPS=127.0.0.1
CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "9473", "--proxy-headers", "--no-server-header"]
