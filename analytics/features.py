"""Per-(userId, tag) feature engineering, using Spark's DataFrame API."""

from pyspark.sql import functions as F


def compute_features_spark(joined_df):
    """The Spark DataFrame, pre-toPandas() — kept as its own step so
    run_pipeline.py can archive it to S3 via Spark's own distributed
    writer (see s3_archive.py) before crossing into pandas."""
    grouped = joined_df.groupBy("userId", "tag").agg(
        F.sum(F.when(F.col("status") == "solved", 1).otherwise(0)).alias("solvedCount"),
        F.count(F.lit(1)).alias("totalCount"),
        # avg() skips nulls by default, so tags with zero reviewed
        # questions correctly come out null here rather than skewing low.
        F.avg("easeFactor").alias("avgEaseFactor"),
        F.avg("repetitions").alias("avgRepetitions"),
    )

    result = grouped.withColumn("solveRate", F.col("solvedCount") / F.col("totalCount"))

    return result.select(
        "userId", "tag", "solvedCount", "totalCount", "solveRate", "avgEaseFactor", "avgRepetitions"
    )


def compute_features(joined_df):
    # This is the Spark -> pandas/scikit-learn boundary: one row per
    # (userId, tag) is a small result set (users x tags, not raw events),
    # so collecting it to the driver here is reasonable rather than trying
    # to run KMeans in a distributed way.
    return compute_features_spark(joined_df).toPandas()
