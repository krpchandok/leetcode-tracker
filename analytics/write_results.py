"""Upserts clustered weak-area results into MongoDB via pymongo directly —
simpler and more reliable than routing this small final write back through
the Spark connector."""

from datetime import datetime, timezone

import pandas as pd
from pymongo import MongoClient, UpdateOne

from spark_session import get_database_name


def write_results(mongo_uri: str, clustered_df: pd.DataFrame) -> None:
    if clustered_df.empty:
        print("No weak-area rows to write.")
        return

    client = MongoClient(mongo_uri)
    try:
        db = client[get_database_name(mongo_uri)]
        collection = db["weak_areas"]

        now = datetime.now(timezone.utc)
        operations = [
            UpdateOne(
                {"userId": row.userId, "tag": row.tag},
                {
                    "$set": {
                        "userId": row.userId,
                        "tag": row.tag,
                        "cluster": row.cluster,
                        "solveRate": float(row.solveRate),
                        "avgEaseFactor": float(row.avgEaseFactor),
                        "avgRepetitions": float(row.avgRepetitions),
                        "computedAt": now,
                    }
                },
                upsert=True,
            )
            for row in clustered_df.itertuples(index=False)
        ]

        result = collection.bulk_write(operations)
        print(
            f"weak_areas: {result.upserted_count} inserted, "
            f"{result.modified_count} updated, {len(operations)} total rows processed."
        )
    finally:
        client.close()
