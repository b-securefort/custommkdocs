# Publish from the Write page: spike and findings

Status: **parked** (30 September 2026). The spike code is in the working tree, uncommitted, and inactive while `extra.writer.api` is empty. This note records what was built, what we learnt, and the options for picking it up again.

## The goal

One click on the Write page (on staging) should take a new or changed page all the way to the staging site:

**Write page → Publish → change reaches main → staging pipeline → live on staging**

Production stays behind its existing gate: someone runs the production pipeline by hand, after review.

## How things work today

- The docs live in an Azure DevOps (ADO) repo. Both sites build from `main`.
- **Staging pipeline:** starts on every push to `main`.
  `mkdocs build --config-file ./mkdocsstaging.yml`, then `aws s3 sync` to `s3://xyz.com/staging`.
- **Production pipeline:** started by hand. `mkdocs build`, then `aws s3 sync` to `s3://xyz.com`.
  Neither sync uses `--delete`, and nobody plans to add it.
- Staging is served from a folder in the production bucket, behind the ALB's Entra sign-in.
- **Publishing from the Write page today is manual:**
  1. download the bundle (.zip);
  2. upload it to S3 `incoming/`;
  3. start `pipelines/ingest-bundle.yml`, which checks it, builds, and opens a PR;
  4. a person merges the PR, which starts the staging pipeline.
- **An existing path to Azure:** ALB → a Lambda proxy (which forwards the sign-in) → an Azure App Service that has a managed identity. The docs portal already uses it to fetch Azure details.

## `draft: prod` (Staging only) and when to use it

`draft: prod` keeps a page out of production builds and includes it in staging builds. It is never set automatically; the writer picks **Staging only** under Visibility.

- **New pages that aren't ready for readers:** set it. Production runs skip the page, and nothing that's already live is affected.
- **Changes to live pages:** don't set it. After the merge, staging shows the change, and production keeps the old version until someone runs the production pipeline. Setting `draft: prod` on a live page would drop it from production's menu, search and sitemap at the next production run. Because the sync doesn't delete, the old HTML would stay in S3 as an orphan.
- **Limitation:** a production run ships everything on `main`. One change to a live page can't be held back while other changes go out. If that's ever needed, the answer is a separate staging branch (not requested).
- **Review before production:** reviewers look at everything merged since the last production run. Tagging each production run gives them a fixed point to compare against. Add this at the end of the production pipeline; it needs `persistCredentials: true` on checkout and permission to create tags:

  ```yaml
  - bash: |
      git tag "prod/$(date -u +%Y%m%d-%H%M)" && git push origin --tags
  ```

  Reviewers then run `git diff <last prod tag>..main`.

## What the spike built (option A below)

None of this is committed. Files and what each does:

| Area | Files | What it does |
|---|---|---|
| Conflict check | `tools/ingest_bundle.py`, `tests/test_ingest_bundle.py`, `docs/javascripts/writer.js` | When a page is opened on the Write page, a hash of its Markdown is kept. The bundle's manifest carries it as `page.base_sha256`. The ingest step refuses an update if the file on `main` no longer matches, instead of silently overwriting someone else's change. Line endings and byte order marks are normalised, so Windows checkouts match. |
| Publish API (S3 design) | `tools/writer_api/lambda_function.py`, `tests/test_writer_api.py` | A Lambda behind the staging ALB, pasteable into the console (standard library and boto3 only). It verifies the ALB's signed `x-amzn-oidc-data` token (ES256, checked in pure Python and cross-checked against OpenSSL), restricts publishing to a `WRITERS` list, and hands out presigned S3 POSTs. It then starts the ingest pipeline with a PAT and reports progress: checking, merging, deploying, live or failed. Setup steps are in the file's header. |
| Pipeline | `pipelines/ingest-bundle.yml` | `publisherName`/`publisherEmail` parameters make the publisher the commit author. PRs auto-complete and delete their branch. Each run is tagged `pr-<id>` so the API can find its PR. Refusals and `mkdocs build --strict` warnings are logged as errors, so the writer sees the real reason. |
| Write page | `docs/javascripts/writer.js`, `docs/stylesheets/writer.css` | When `extra.writer.api` is set: a **Publish** toolbar button and a **Publish to staging** tab with five progress steps (with links to the run, the PR, the staging run and the page). Progress survives a reload. Sign-in expiry and conflicts are handled; a conflict offers "Open the latest version". **Staging only** is suggested for new pages, and there's a warning (also in Checks) against using it on a live page. When the setting is empty, the page is unchanged. |
| Config | `hooks/writer.py`, `mkdocs.yml`, `mkdocsstaging.yml` | A new `extra.writer.api` setting (empty in both configs). |

**Verified:**
- 40 unit tests pass.
- Both sites build with `--strict`.
- In headless Chrome against a stand-in API and S3, these all worked with no page errors:
  - editing an existing page and publishing it through to "live";
  - reloading and still seeing the result;
  - a conflict refusal;
  - a new page with the Staging only suggestion;
  - an expired sign-in.
- The hash the browser recorded matched the repository file exactly.
- The real `ingest_bundle.py` accepted the uploaded bundles, and refused the one based on an out-of-date version.

## Findings

1. **An ALB passes a Lambda at most 1 MB**, of request body and of response. This is a fixed ALB limit with no setting. Lambda itself takes 6 MB per call, but not through an ALB. Bundles can be up to 25 MB (screenshots up to 5 MB, files up to 10 MB).
2. **A pipeline run can't be handed a file.** Its parameters are short strings, so a run must fetch the bundle from storage somewhere.
3. **A PAT belongs to one person.** Every run would show as requested by that person, publishing breaks if they leave or the token expires (a year at most), and the token is a long-lived secret. The pipeline's own push and PR use the build service identity, not the PAT.
4. **Managed identities only exist inside Azure.** An AWS Lambda can't have one. The nearest keyless equivalent in AWS is federating an AWS-issued token to an Entra app registration (for example through a Cognito identity pool). That works, but it's a lot of setup on both sides.
5. **The existing App Service does have a managed identity**, and can be added to ADO. But it sits behind the same ALB → Lambda proxy, so finding 1 applies to anything sent to it.
6. **Bundles must never go in the `xyz.com` bucket.** Anything in it may be served, possibly without sign-in. Any storage for bundles needs to be private.
7. **To check:** can `xyz.com/staging/`, the Write page and `_writer/src/` be reached through the production route without signing in? Staging shares the production bucket.

## Options

### A. S3 + a new Lambda + PAT (built in the spike)

The browser uploads to a private S3 bucket with a presigned POST. The Lambda starts the ingest pipeline with a PAT, and the pipeline opens an auto-completing PR.

- **For:** built and tested. The bundle is checked before anything touches the repo.
- **Against:** a new bucket (with CORS and a lifecycle rule), a new Lambda, a listener rule, IAM, and a PAT tied to one person. The flow has the most steps of the three.

### B. The browser commits to ADO directly, with the writer's own Entra token

The Write page signs the writer in to ADO with MSAL (already in the repo for chat). It pushes the files as a commit (ADO "Pushes" REST API) and opens the PR. A build-validation policy on `main` runs the checks and `mkdocs build --strict`.

- **For:** no AWS pieces, no service identity, no secret. The commit is authored by the real writer, and nothing sits in between to hit the 1 MB limit.
- **Against:**
  - Every writer needs Contribute, Create branch and Contribute to pull requests on the docs repo.
  - It needs a single-page-app registration in Entra, with the Azure DevOps delegated permission and admin consent.
  - Checks run after the branch is pushed, though nothing can merge until they pass.
- **To verify:** whether browser calls (CORS) to ADO work with this organization, and the Pushes API's size limit.

### C. App Service with its managed identity, uploading in chunks (recommended)

- **The upload.** The Write page sends the bundle in pieces of about 500 KB through the existing ALB → Lambda proxy → App Service path. After the ALB base64-encodes a piece, it's about 670 KB, under the 1 MB limit.
- **Reassembly.** The App Service stores the pieces under `/home` (shared by all its instances) and rebuilds the zip.
- **The checks.** It runs the `ingest_bundle.py` checks and the conflict check.
- **The commit.** It pushes an `ingest/…` branch with the managed identity, with the writer as the commit author, and opens the PR with auto-complete.
- **Validation.** A build-validation policy on `main` runs `mkdocs build --strict`. When it passes, the PR merges and the staging pipeline starts.

- **For:**
  - It uses only infrastructure that already exists and works.
  - No PAT, and no S3 or Lambda to add.
  - Writers don't need repo access.
  - The bundle is checked before anything is pushed.
- **Against:**
  - Chunking to write: a typical page is 1–6 requests, the 25 MB maximum about 50, and each piece can be retried.
  - Stale uploads under `/home` need cleaning up.
  - The publish endpoints live in, or next to, the App Service.

**Variant C2:** the App Service issues a short-lived Azure Blob upload link (it can do so with its managed identity), and the browser uploads straight to Blob storage. There's no chunking, but it needs a storage account with CORS, which puts back the extra infrastructure A needed.

### Ways round the 1 MB limit, compared

| Approach | Size limit | Catch |
|---|---|---|
| Chunked upload through the existing path | None in practice | The service reassembles the zip. |
| Lambda function URL (skips the ALB) | 6 MB per request | Still needs chunking, and the ALB's sign-in doesn't cover it. |
| API Gateway | 10 MB | Same problems as a function URL. |
| Presigned upload to storage (S3 or Blob) | 5 GB | A storage account with CORS. |
| A container or VM (ECS, EC2, nginx) as the ALB target, instead of the Lambda proxy | None | New infrastructure to run and look after. |

Shrinking bundles is no answer. Screenshots are already compressed, and PDFs can be 10 MB.

## Setting up the managed identity in ADO (for option C)

1. **Check the tenant.** In ADO, Organization settings → Microsoft Entra shows the connected tenant. It must be the tenant of the App Service's subscription.
2. **Find the identity.** Azure portal → the App Service → Identity → System assigned: status **On**. The identity has the App Service's name; note its Object (principal) ID too.
3. **Add it to ADO.** Organization settings → Users → Add users:
   - pick the managed identity by name;
   - Access level: **Basic** (Stakeholder can't push code);
   - add it to the docs project in the **Readers** group;
   - leave email invites unticked.

   You need to be an organization admin to do this. Basic uses a paid licence, though the first five users in an organization are free.
4. **Give it the docs repo only.** Project settings → Repositories → the docs repo → Security. For the identity, allow **Contribute**, **Create branch** and **Contribute to pull requests**. It can't bypass `main`'s policies.
5. **Check it works** from the App Service console (Kudu/SSH):

   ```bash
   TOKEN=$(curl -s "$IDENTITY_ENDPOINT?resource=499b84ac-1321-427f-aa17-267ca6975798&api-version=2019-08-01" \
     -H "X-IDENTITY-HEADER: $IDENTITY_HEADER" | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")
   curl -s -H "Authorization: Bearer $TOKEN" "https://dev.azure.com/<org>/_apis/connectionData" | head -c 400
   ```

   `authenticatedUser` should show the App Service's name. A 401 means the identity isn't in the organization, or the tenants differ.

Whichever option, `main` must not require a reviewer, or the auto-completing PRs wait for one. Keep build validation; review happens before production is run.

## Open questions before resuming

1. **How does the proxy Lambda tell the App Service who the user is?** Does it forward the ALB's `x-amzn-oidc-data`, the user's access token, or something else? This decides the commit author and the writers check.
2. **Does the proxy pass any POST through unchanged?** That means arbitrary paths under the App Service, binary or base64 bodies, and custom headers such as `X-Writer`. Where is its code?
3. **What does the App Service run?** Which language, and where is its repo? If it's Python, `ingest_bundle.py` can be imported as it is.
4. **Where should the publish endpoints live:** in that app, or in a separate small app on the same App Service plan, with its own identity? A separate app keeps publish permissions apart from the portal's Azure lookups.
5. Can the staging route and `_writer/src/` be reached without signing in? (Finding 7.)

## When picking it up with option C

- **Keep:**
  - the conflict check;
  - the Staging only guidance and check;
  - the progress UI and its stages;
  - the ALB token check and status logic, moved from `lambda_function.py` into the App Service;
  - the bundle format and `ingest_bundle.py`'s checks;
  - the pipeline's readable error logging.
- **Rewrite:** the Write page's upload step (S3 POST → chunked upload), and the publish endpoints, in the App Service using the managed identity.
- **Drop:** `tools/writer_api/lambda_function.py` (S3 upload links, PAT). The pipeline's publisher and PR-tag parameters also go, since the service commits directly.
- **Turn `ingest-bundle.yml` into a build-validation pipeline for `main`** that runs `mkdocs build --strict`, and `ingest_bundle.py`-style checks on the changed files if the service's checks aren't enough on their own. The manual route (download, upload to S3, run the pipeline) can be kept for anyone publishing without the button, or retired.
