"""Entry point: load -> features -> cluster -> write, run manually.

Scheduling this as a recurring job is future work, not part of this script.
"""

import os

from dotenv import load_dotenv

from spark_session import get_spark_session
from load_data import join_features
from features import compute_features
from cluster_weak_areas import cluster_weak_areas
from write_results import write_results


def main():
    load_dotenv()
    mongo_uri = os.environ["MONGODB_URI"]

    print("[1/5] Starting Spark session...")
    spark = get_spark_session(mongo_uri)

    try:
        print("[2/5] Loading and joining Question/Problem/Review collections...")
        joined_df = join_features(spark)

        print("[3/5] Engineering per-(userId, tag) features...")
        features_df = compute_features(joined_df)
        print(f"    {len(features_df)} (userId, tag) rows produced.")

        print("[4/5] Clustering into weak/medium/strong with scikit-learn...")
        clustered_df = cluster_weak_areas(features_df)

        print("[5/5] Writing results to the weak_areas collection...")
        write_results(mongo_uri, clustered_df)

        print("Done.")
    finally:
        spark.stop()


if __name__ == "__main__":
    main()
