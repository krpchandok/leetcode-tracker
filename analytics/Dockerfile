# The official apache/spark-py images (checked on Docker Hub before writing
# this) top out at v3.4.0 — older than the pyspark==3.5.9 pinned in
# requirements.txt (see spark_session.py for why that version specifically:
# it's the one confirmed compatible with the mongo-spark-connector release
# in use). Rather than fight a version mismatch between a bundled Spark and
# a pip-installed one, this borrows a JRE from an official Docker Hub image
# and lets pip install PySpark itself — the same combination already
# verified working locally (JRE/JDK 17; JDK 21+/24 hit real
# incompatibilities with Spark's bundled Hadoop client, see
# spark_session.py's docstring).
#
# The JRE is copied in from eclipse-temurin's own image via a build stage,
# not apt-get or a direct curl/tar download: this build environment's
# network cannot reach Debian's package mirrors or GitHub's release-asset
# CDN, but registry-based Docker image pulls work reliably, so borrowing
# a runtime from another official image is the one dependency-fetch path
# actually available here — and is a reasonably idiomatic multi-stage
# pattern regardless of that constraint.
FROM eclipse-temurin:17-jre-jammy AS jre

FROM python:3.11-slim-bookworm

COPY --from=jre /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="${JAVA_HOME}/bin:${PATH}"

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Runs as a Kubernetes CronJob, not a long-running service — no port to
# expose, no process to keep alive between runs.
CMD ["python", "run_pipeline.py"]
