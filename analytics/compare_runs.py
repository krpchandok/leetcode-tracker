"""Standalone script: diff two archived pipeline runs' clustering results.

Usage: python compare_runs.py <run_id_a> <run_id_b>

This is what actually makes the S3 archival useful rather than decorative —
it answers "did anything improve since last time?" by reporting which
(userId, tag) pairs changed cluster label (weak/medium/strong) between two
runs, reading both runs' clusters.parquet straight from S3.
"""

import sys

import pandas as pd
from dotenv import load_dotenv

from s3_archive import clusters_path, get_s3fs_storage_options


def load_run(run_id: str) -> pd.DataFrame:
    path = clusters_path(run_id)
    return pd.read_parquet(path, storage_options=get_s3fs_storage_options())


def diff_runs(run_a: str, run_b: str) -> pd.DataFrame:
    df_a = load_run(run_a).set_index(["userId", "tag"])[["cluster"]].rename(columns={"cluster": "before"})
    df_b = load_run(run_b).set_index(["userId", "tag"])[["cluster"]].rename(columns={"cluster": "after"})

    # Outer join: a (userId, tag) pair present in only one run (a newly
    # attempted tag, say) counts as a change too, not just label flips on
    # pairs common to both.
    merged = df_a.join(df_b, how="outer")
    return merged[merged["before"] != merged["after"]]


def main():
    load_dotenv()

    if len(sys.argv) != 3:
        print("Usage: python compare_runs.py <run_id_a> <run_id_b>")
        sys.exit(1)

    run_a, run_b = sys.argv[1], sys.argv[2]

    print(f"Comparing run {run_a} -> run {run_b}...")
    changed = diff_runs(run_a, run_b)

    if changed.empty:
        print("No (userId, tag) pairs changed cluster assignment between these two runs.")
        return

    print(f"{len(changed)} (userId, tag) pair(s) changed cluster assignment:\n")
    for (user_id, tag), row in changed.iterrows():
        before = row["before"] if pd.notna(row["before"]) else "(not present)"
        after = row["after"] if pd.notna(row["after"]) else "(not present)"
        print(f"  user={user_id} tag={tag}: {before} -> {after}")


if __name__ == "__main__":
    main()
