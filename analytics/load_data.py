"""
Loads and joins Question/Problem/Review data from MongoDB.

Schema note (checked against backend/models/ rather than assumed): Question
documents have no userId field at all. Ownership runs the other way —
User.questions is an array of Question _ids. So attributing a Question to a
user means exploding User.questions and joining that back to Question on
_id, not reading a userId column that doesn't exist.

Also note Question has its own "questionId" field (a redundant
auto-generated id, unrelated to the value used to join here) distinct from
its Mongo "_id" — only "_id" is what User.questions actually references.

Every read below passes an explicit schema rather than relying on the
connector's default sampling-based inference. This isn't just style: an
empty collection (e.g. a fresh install with no Review documents yet, since
those only appear once the scheduling-service consumer has processed at
least one submission) has nothing to sample, so inferred-schema reads
silently come back with zero columns and any .select() on them throws
"UNRESOLVED_COLUMN" — verified by hitting this exact crash against a
deliberately minimal test dataset while building this pipeline.
"""

from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, IntegerType, DoubleType, ArrayType

USERS_SCHEMA = StructType([
    StructField("_id", StringType(), True),
    StructField("questions", ArrayType(StringType()), True),
])

QUESTIONS_SCHEMA = StructType([
    StructField("_id", StringType(), True),
    StructField("titleSlug", StringType(), True),
    StructField("status", StringType(), True),
])

PROBLEMS_SCHEMA = StructType([
    StructField("titleSlug", StringType(), True),
    StructField("topicTags", ArrayType(StringType()), True),
    StructField("difficulty", StringType(), True),
])

REVIEWS_SCHEMA = StructType([
    StructField("userId", StringType(), True),
    StructField("questionId", StringType(), True),
    StructField("easeFactor", DoubleType(), True),
    StructField("repetitions", IntegerType(), True),
    StructField("intervalDays", IntegerType(), True),
])


def load_questions(spark):
    users_df = (
        spark.read.format("mongodb").schema(USERS_SCHEMA).option("collection", "users").load()
    )
    user_questions = users_df.select(
        F.col("_id").alias("userId"),
        F.explode_outer("questions").alias("questionId"),
    )

    questions_df = (
        spark.read.format("mongodb").schema(QUESTIONS_SCHEMA).option("collection", "questions").load()
        .select(F.col("_id").alias("questionId"), "titleSlug", "status")
    )

    return user_questions.join(questions_df, on="questionId", how="inner")


def load_problems(spark):
    return (
        spark.read.format("mongodb").schema(PROBLEMS_SCHEMA).option("collection", "problems").load()
    )


def load_reviews(spark):
    return (
        spark.read.format("mongodb").schema(REVIEWS_SCHEMA).option("collection", "reviews").load()
    )


def join_features(spark):
    questions = load_questions(spark)  # userId, questionId, titleSlug, status
    problems = load_problems(spark)  # titleSlug, topicTags, difficulty
    reviews = load_reviews(spark)  # userId, questionId, easeFactor, repetitions, intervalDays

    joined = questions.join(problems, on="titleSlug", how="inner")
    exploded = joined.withColumn("tag", F.explode("topicTags"))

    # Left join: most questions won't have a Review yet (never scheduled for
    # spaced repetition), and those should still count toward solveRate —
    # they just get null easeFactor/repetitions, handled in features.py.
    result = exploded.join(reviews, on=["userId", "questionId"], how="left")

    return result.select(
        "userId", "titleSlug", "tag", "status", "easeFactor", "repetitions", "intervalDays"
    )
