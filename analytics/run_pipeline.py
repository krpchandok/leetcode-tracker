"""Entry point: load -> features -> cluster -> write, run manually.

Scheduling this as a recurring job is future work, not part of this script.
"""

import os
import uuid

from dotenv import load_dotenv

from logging_config import configure_logging, get_run_logger
from spark_session import get_spark_session
from load_data import join_features
from features import compute_features
from cluster_weak_areas import cluster_weak_areas
from write_results import write_results


def main():
    load_dotenv()
    configure_logging()
    run_id = str(uuid.uuid4())
    log = get_run_logger(__name__, run_id)

    mongo_uri = os.environ["MONGODB_URI"]

    log.info("[1/5] Starting Spark session...")
    spark = get_spark_session(mongo_uri)

    try:
        log.info("[2/5] Loading and joining Question/Problem/Review collections...")
        joined_df = join_features(spark)

        log.info("[3/5] Engineering per-(userId, tag) features...")
        features_df = compute_features(joined_df)
        log.info("%d (userId, tag) rows produced.", len(features_df))

        log.info("[4/5] Clustering into weak/medium/strong with scikit-learn...")
        clustered_df = cluster_weak_areas(features_df, log)

        log.info("[5/5] Writing results to the weak_areas collection...")
        write_results(mongo_uri, clustered_df, log)

        log.info("Done.")
    finally:
        spark.stop()


if __name__ == "__main__":
    main()
