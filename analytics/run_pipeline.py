"""Entry point: load -> features -> cluster -> write, run manually or as a
scheduled batch job (see render.yaml — this is the Render Cron Job command).

The live dashboard reads its most recent result straight from MongoDB's
weak_areas collection (GET /api/users/:userId/weak-areas) and never waits on
this script — so the one step that MUST succeed for this run to be useful is
the MongoDB write in step 6. S3 archival (steps 3b/5) is a nice-to-have
record of history, not something the dashboard depends on, so it's wrapped
to fail soft: a broken/missing AWS setup logs a warning and moves on rather
than taking down the whole run over an optional side effect.
"""

import os
import uuid

from dotenv import load_dotenv

from logging_config import configure_logging, get_run_logger
from spark_session import get_spark_session, s3_archival_enabled
from load_data import join_features
from features import compute_features_spark
from cluster_weak_areas import cluster_weak_areas
from write_results import write_results
from s3_archive import features_path, clusters_path, get_s3fs_storage_options


def main():
    load_dotenv()
    configure_logging()
    run_id = str(uuid.uuid4())
    log = get_run_logger(__name__, run_id)

    mongo_uri = os.environ["MONGODB_URI"]

    log.info("[1/6] Starting Spark session...")
    spark = get_spark_session(mongo_uri)

    try:
        log.info("[2/6] Loading and joining Question/Problem/Review collections...")
        joined_df = join_features(spark)

        log.info("[3/6] Engineering per-(userId, tag) features...")
        features_spark_df = compute_features_spark(joined_df)

        # Archived from the Spark DataFrame directly, via Spark's own
        # distributed writer, before the toPandas() conversion below — this
        # is deliberately not a pandas file write, so it still exercises
        # Spark's own write path (see s3_archive.py for why the scheme is
        # s3a:// here but s3:// for the clusters archive further down).
        if s3_archival_enabled():
            try:
                features_s3_path = features_path(run_id)
                features_spark_df.write.mode("overwrite").parquet(features_s3_path)
                log.info("Archived feature table to %s", features_s3_path)
            except Exception:
                log.exception("Feature table S3 archival failed (non-fatal) — continuing")
        else:
            log.info("AWS credentials not set — skipping feature table S3 archival")

        features_df = features_spark_df.toPandas()
        log.info("%d (userId, tag) rows produced.", len(features_df))

        log.info("[4/6] Clustering into weak/medium/strong with scikit-learn...")
        clustered_df = cluster_weak_areas(features_df, log)

        log.info("[5/6] Archiving clustering results to S3...")
        if s3_archival_enabled() and not clustered_df.empty:
            try:
                clusters_s3_path = clusters_path(run_id)
                clustered_df.to_parquet(clusters_s3_path, storage_options=get_s3fs_storage_options())
                log.info("Archived clustering results to %s", clusters_s3_path)
            except Exception:
                log.exception("Clustering results S3 archival failed (non-fatal) — continuing")
        elif not s3_archival_enabled():
            log.info("AWS credentials not set — skipping clustering results S3 archival")
        else:
            log.info("No clustering results to archive (empty run)")

        log.info("[6/6] Writing results to the weak_areas collection...")
        write_results(mongo_uri, clustered_df, log)

        log.info("Done.")
    finally:
        spark.stop()


if __name__ == "__main__":
    main()
