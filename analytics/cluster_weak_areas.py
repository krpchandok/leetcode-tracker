"""KMeans clustering of (userId, tag) rows into weak/medium/strong buckets.

Deliberately unsupervised: there's no real "this tag is weak" label
anywhere in the data to train a classifier against, so this clusters tags
by feature similarity and then ranks the resulting clusters by mean
solveRate to assign the weak/medium/strong names — it does not hardcode
which cluster index means what, since KMeans doesn't guarantee consistent
cluster ordering across runs.
"""

import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

# Matches the SM-2 defaults already used in the Node backend
# (backend/scheduling/sm2.js) for a question with no review history yet.
DEFAULT_EASE_FACTOR = 2.5
DEFAULT_REPETITIONS = 0

FEATURE_COLUMNS = ["solveRate", "avgEaseFactor", "avgRepetitions"]
RANK_LABELS = ["weak", "medium", "strong"]


def cluster_weak_areas(features_df: pd.DataFrame) -> pd.DataFrame:
    df = features_df.copy()
    df["avgEaseFactor"] = df["avgEaseFactor"].fillna(DEFAULT_EASE_FACTOR)
    df["avgRepetitions"] = df["avgRepetitions"].fillna(DEFAULT_REPETITIONS)

    n_samples = len(df)
    k = min(3, n_samples)

    if n_samples == 0:
        print("WARNING: no (userId, tag) rows to cluster - nothing to write.")
        return df.assign(cluster=pd.Series(dtype="object"))

    if k < 3:
        print(
            f"WARNING: only {n_samples} (userId, tag) row(s) available, need at least 3 "
            f"distinct rows for a real weak/medium/strong split. Falling back to k={k} "
            "cluster(s) - labels below are best-effort, not a meaningful 3-way split."
        )

    X = df[FEATURE_COLUMNS].to_numpy()
    X_scaled = StandardScaler().fit_transform(X)

    kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
    df["clusterIndex"] = kmeans.fit_predict(X_scaled)

    # Rank clusters by mean solveRate, ascending: the lowest-solve-rate
    # cluster is "weak", regardless of which raw index KMeans assigned it.
    cluster_means = df.groupby("clusterIndex")["solveRate"].mean().sort_values()
    ordered_indices = cluster_means.index.tolist()
    labels_by_rank = RANK_LABELS[:k] if k == 3 else (["weak", "strong"] if k == 2 else ["weak"])

    index_to_label = {cluster_idx: labels_by_rank[rank] for rank, cluster_idx in enumerate(ordered_indices)}
    df["cluster"] = df["clusterIndex"].map(index_to_label)

    return df[["userId", "tag", "cluster"] + FEATURE_COLUMNS]
