"""
Toolchain requirements for this pipeline (verified against a real Windows
+ JDK setup while building this, not just assumed):

- Java (JDK) must be installed locally for PySpark to run at all — PySpark
  starts a real JVM under the hood. JDK 11 or 17 is the safe choice; PySpark
  3.5.x bundles a Hadoop client that is NOT compatible with very new JDKs
  (JDK 21+ can be hit-or-miss, JDK 24 fails outright with
  "java.lang.UnsupportedOperationException: getSubject is not supported"
  since Hadoop's UserGroupInformation relies on a javax.security.auth API
  that newer JDKs removed). JDK 17 is confirmed working.
- On Windows specifically, Hadoop's Shell class needs winutils.exe even for
  a purely local Spark session with no HDFS involved at all (it's invoked
  just to fetch/chmod the connector jar). Download a matching build (e.g.
  the community-maintained https://github.com/cdarlint/winutils, a
  hadoop-3.3.x build is close enough for the hadoop-client 3.3.4 PySpark
  3.5.x bundles) and point HADOOP_HOME at the folder containing its bin/.
  Without this, you'll see "HADOOP_HOME and hadoop.home.dir are unset."
- The MongoDB Spark Connector jar (org.mongodb.spark:mongo-spark-connector,
  see MONGO_SPARK_CONNECTOR_PACKAGE below) is not vendored — Spark resolves
  it from Maven Central via spark.jars.packages the first time a
  SparkSession using it is created, and caches it locally after that. This
  means the very first run of this pipeline needs internet access; later
  runs work offline from the local Ivy cache.

Version choice: mongo-spark-connector_2.12:10.5.0 is the current release as
of writing, and its release notes explicitly list support for Spark 3.3,
3.4, and 3.5 (not Spark 4.x yet) — pinned pyspark==3.5.9 in requirements.txt
to match, both verified against current Maven/PyPI metadata rather than
assumed.

S3 archival (see s3_archive.py) is optional, not required for this pipeline
to do its actual job (compute weak-area clusters, write them to MongoDB —
the read path the live dashboard depends on). If AWS_ACCESS_KEY_ID/
AWS_SECRET_ACCESS_KEY aren't set, the S3-related Spark packages and config
below are simply skipped — the Mongo-writing part of the pipeline must keep
working on a Render Cron Job even if S3 archival isn't configured or is
having a bad day, rather than the whole run failing on account of a
nice-to-have. When S3 *is* configured: needs org.apache.hadoop:hadoop-aws,
and hadoop-aws is version-sensitive to the Hadoop client Spark itself
bundles — mismatches here are a common source of confusing runtime errors
(missing classes, NoSuchMethodError). Checked directly rather than assumed:
this venv's pyspark==3.5.9 bundles hadoop-client-api/runtime 3.3.4 (see the
.jar filenames under .venv/.../pyspark/jars/), and hadoop-aws:3.3.4's own
Maven POM (inherited from the hadoop-project:3.3.4 parent) pins its
aws-java-sdk-bundle dependency at exactly 1.12.262 — so that's the pair
used below, not a guessed "latest" version of either.
"""

import os
import sys

from pymongo import uri_parser
from pyspark.sql import SparkSession

MONGO_SPARK_CONNECTOR_PACKAGE = "org.mongodb.spark:mongo-spark-connector_2.12:10.5.0"
HADOOP_AWS_PACKAGE = "org.apache.hadoop:hadoop-aws:3.3.4"
AWS_JAVA_SDK_PACKAGE = "com.amazonaws:aws-java-sdk-bundle:1.12.262"

# 10.5 made AutoBucketPartitioner the default batch-read partitioner, which
# runs a $bucketAuto aggregation to size partitions — and $bucketAuto
# rejects a computed bucket count of 0, which is exactly what happens on
# a small collection (verified by hitting "Command failed with error
# 40243: 'The $bucketAuto buckets field must be greater than 0, but found:
# 0'" against this project's own tiny test data). Every collection here
# (Question/Problem/Review for a single personal tracker) is small enough
# that a single partition is not just a safe fallback but the actually
# correct choice — there's no real parallelism to gain either way.
MONGO_READ_PARTITIONER = "com.mongodb.spark.sql.connector.read.partitioner.SinglePartitionPartitioner"

# Matches the MongoDB Node.js driver's (and therefore Mongoose's) own
# default database name when a connection URI doesn't specify one.
DEFAULT_DATABASE = "test"


def get_database_name(mongo_uri: str) -> str:
    parsed = uri_parser.parse_uri(mongo_uri, validate=False)
    return parsed.get("database") or DEFAULT_DATABASE


def s3_archival_enabled() -> bool:
    return bool(os.environ.get("AWS_ACCESS_KEY_ID") and os.environ.get("AWS_SECRET_ACCESS_KEY"))


def get_spark_session(mongo_uri: str) -> SparkSession:
    # PySpark's worker processes need to be told which Python to use; on
    # Windows this isn't reliably auto-detected and silently hangs
    # (Py4JJavaError: SocketTimeoutException: Accept timed out) instead of
    # failing clearly, so always pin it to whichever interpreter is running
    # this script (i.e. the analytics/.venv/ one).
    os.environ.setdefault("PYSPARK_PYTHON", sys.executable)
    os.environ.setdefault("PYSPARK_DRIVER_PYTHON", sys.executable)

    if sys.platform == "win32" and not os.environ.get("HADOOP_HOME"):
        raise RuntimeError(
            "HADOOP_HOME is not set. On Windows, Spark needs winutils.exe "
            "even for a local-only session (see the module docstring in "
            "spark_session.py for where to get one and how to point "
            "HADOOP_HOME at it)."
        )

    database = get_database_name(mongo_uri)

    packages = [MONGO_SPARK_CONNECTOR_PACKAGE]
    if s3_archival_enabled():
        packages += [HADOOP_AWS_PACKAGE, AWS_JAVA_SDK_PACKAGE]

    builder = (
        SparkSession.builder.appName("leetcode-tracker-analytics")
        .master("local[*]")
        .config("spark.jars.packages", ",".join(packages))
        .config("spark.mongodb.read.connection.uri", mongo_uri)
        .config("spark.mongodb.read.database", database)
        .config("spark.mongodb.read.partitioner", MONGO_READ_PARTITIONER)
        .config("spark.mongodb.write.connection.uri", mongo_uri)
        .config("spark.mongodb.write.database", database)
    )

    if s3_archival_enabled():
        builder = (
            builder.config("spark.hadoop.fs.s3a.access.key", os.environ["AWS_ACCESS_KEY_ID"])
            .config("spark.hadoop.fs.s3a.secret.key", os.environ["AWS_SECRET_ACCESS_KEY"])
            .config("spark.hadoop.fs.s3a.endpoint.region", os.environ.get("AWS_REGION", "us-east-1"))
        )

    return builder.getOrCreate()
