# AWS setup for pipeline-run archival

One-time manual setup — not scripted, since it's account-level infrastructure
you should be able to see and understand before granting a program access to
your AWS account. Do this once via the AWS Console (or CLI, if you prefer),
then never again unless you rotate keys.

## 1. Create the S3 bucket

1. AWS Console → S3 → **Create bucket**.
2. Pick a name, e.g. `leetcode-tracker-pipeline-runs`. **Bucket names are
   globally unique across all of AWS**, not just your account — if that
   exact name is taken, add a suffix (e.g. `leetcode-tracker-pipeline-runs-<yourname>`).
3. Region: pick whichever is closest to you; you'll need it again below.
   Everything else can stay at its default (Block Public Access **on** —
   this bucket has no reason to be public).
4. Note the exact bucket name and region — both go in `analytics/.env`.

## 2. Create a least-privilege IAM policy

Don't attach `AmazonS3FullAccess` or anything account-wide. This pipeline
only ever needs to write and read objects under one bucket's `runs/`
prefix, so that's almost all the policy grants.

1. IAM → Policies → **Create policy** → JSON tab, paste (replacing
   `YOUR-BUCKET-NAME`):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["s3:ListBucket"],
         "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME"
       },
       {
         "Effect": "Allow",
         "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
         "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/*"
       }
     ]
   }
   ```

2. Name it something like `leetcode-tracker-pipeline-runs-rw`.
3. Notice what's deliberately *not* here: no `Resource: "*"` on any
   statement (`ListBucket` is scoped to the exact bucket ARN, the object
   actions to that bucket's objects — never any other bucket), no IAM/EC2/
   anything-else permissions at all. Two of these three actions
   (`ListBucket`, `DeleteObject`) look unnecessary for what sounds like a
   pure write/read workload, but both are real, confirmed requirements —
   not guessed from the action names, discovered by actually running the
   pipeline and reading what got denied:
   - `s3:ListBucket` — Hadoop's S3A filesystem (Spark's own S3 writer,
     Task 3) calls `getFileStatus` on a path before writing to it, which
     is a bucket-level listing operation, not an object-level one.
   - `s3:DeleteObject` — S3 has no real atomic rename, so Hadoop's classic
     write-commit protocol implements "move the finished file into place"
     as copy-then-delete-the-temporary-copy. Without it, every write fails
     partway through cleanup, after the data is already durably written.
     (The newer S3A "magic committer" avoids this by committing via S3
     multipart uploads instead of rename — a real alternative to granting
     this permission at all, just not the one used here.)
   This is exactly what "least privilege" means in practice: grant what
   the pipeline's actual code path calls, confirmed by running it, not
   assumed from the two verbs ("Put"/"Get") that sound sufficient in
   the abstract.

## 3. Create the IAM user and attach the policy

1. IAM → Users → **Create user**. Name it e.g. `leetcode-tracker-pipeline`.
2. Do **not** grant console access — this user only ever authenticates via
   access keys from this script, never logs into the AWS Console.
3. Attach the policy you just created (`leetcode-tracker-pipeline-runs-rw`)
   directly to this user.

## 4. Generate access keys

1. Open the new user → **Security credentials** tab → **Create access key**.
2. Choose "Other" / "Application running outside AWS" as the use case.
3. Copy the **Access key ID** and **Secret access key** immediately — the
   secret is shown only once.

## 5. Add to `analytics/.env`

`analytics/.env` is already gitignored (confirmed — same rule as
`backend/.env`: `.gitignore` has `.env` / `.env.*` with `!.env.example`).
Add:

```
AWS_ACCESS_KEY_ID="<the access key id>"
AWS_SECRET_ACCESS_KEY="<the secret access key>"
AWS_REGION="<the region you picked in step 1, e.g. us-east-1>"
S3_BUCKET_NAME="<the exact bucket name from step 1>"
```

## Verifying the scoping actually works

Least privilege is only real if you've checked the denial side, not just
the allow side. With the AWS CLI configured to use these same keys
(`aws configure --profile leetcode-tracker-pipeline`, or export the four
env vars above with `AWS_DEFAULT_REGION` instead of `AWS_REGION`):

```bash
# Should succeed: PutObject and ListBucket on the one bucket this user is
# scoped to.
echo "test" | aws s3 cp - s3://YOUR-BUCKET-NAME/runs/manual-test/ping.txt
aws s3 ls s3://YOUR-BUCKET-NAME/runs/

# Should fail with AccessDenied: a *different* bucket, even one you own,
# is outside this policy's Resource ARNs (neither statement names it).
echo "test" | aws s3 cp - s3://some-other-bucket-you-own/ping.txt
aws s3 ls s3://some-other-bucket-you-own/

# Should fail with AccessDenied: this user has no IAM/EC2/anything-else
# permissions, only the four S3 actions on the one bucket.
aws iam list-users
```

If the second and third commands succeed instead of denying, the policy is
scoped too broadly — go back to step 2.
