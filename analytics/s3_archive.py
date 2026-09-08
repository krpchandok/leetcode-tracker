"""Shared S3 path-building and credentials for archiving pipeline runs.

Two different S3 client stacks are involved on purpose (see run_pipeline.py):
Spark's own Hadoop-based s3a:// writer for the pre-clustering feature table
(Task 3, demonstrates Spark's distributed write path), and pandas' s3fs-based
s3:// writer for the small post-clustering result (Task 4). They need
credentials in different shapes (Spark via SparkConf, pandas/s3fs via a
storage_options dict), but should read from the same env vars and agree on
the same bucket/path layout — this module is that one shared source.
"""

import os


def get_bucket_name() -> str:
    bucket = os.environ.get("S3_BUCKET_NAME")
    if not bucket:
        raise RuntimeError(
            "S3_BUCKET_NAME is not set — see analytics/AWS_SETUP.md for how to create "
            "the bucket and add its name to analytics/.env."
        )
    return bucket


def get_s3fs_storage_options() -> dict:
    return {
        "key": os.environ["AWS_ACCESS_KEY_ID"],
        "secret": os.environ["AWS_SECRET_ACCESS_KEY"],
        "client_kwargs": {"region_name": os.environ.get("AWS_REGION", "us-east-1")},
    }


def features_path(run_id: str) -> str:
    # s3a:// — Spark/Hadoop's own S3 connector scheme, written via
    # DataFrame.write.parquet() directly (Task 3).
    return f"s3a://{get_bucket_name()}/runs/{run_id}/features.parquet"


def clusters_path(run_id: str) -> str:
    # s3:// — plain fsspec/s3fs scheme, written via pandas.to_parquet()
    # (Task 4). Same bucket and run-scoped prefix as features_path, just a
    # different URI scheme because it goes through a different client.
    return f"s3://{get_bucket_name()}/runs/{run_id}/clusters.parquet"
