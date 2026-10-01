"""The Write page's Publish button: a Lambda behind the staging site's load balancer.

    GET  /api/writer/me          who the load balancer signed in, and whether they may publish
    POST /api/writer/uploads     {"name": "<bundle>.zip"} -> a presigned S3 POST into incoming/
    POST /api/writer/publishes   {"key": "incoming/<...>.zip"} -> starts pipelines/ingest-bundle.yml
    GET  /api/writer/runs/<id>   how that run is getting on, through to the staging deploy

The page is static, so it can't hold AWS or Azure DevOps credentials. This
does the two things that need them: it lets a signed-in writer upload a
bundle straight to S3 (the load balancer passes a Lambda at most 1 MB, and a
bundle can be 25 MB), and it starts the ingest pipeline with a PAT. Who is
publishing comes from the load balancer's sign-in, never from the page: the
x-amzn-oidc-data header, a JWT the load balancer signs, is checked against
its public key and its ARN. POSTs must carry X-Writer: 1, which another site
can't send without a CORS preflight that this never answers.

The run's progress:
    queued     the pipeline hasn't started yet
    checking   ingest-bundle is checking the bundle and building the site
    merging    its pull request is open, waiting for main's policies
    deploying  merged; the staging pipeline is publishing it
    live       on staging
    merged     merged (STAGING_PIPELINE_ID isn't set, so no further news)
    failed     with the reason, from the run's errors where there are any

Python 3.12, standard library and boto3 (in the Lambda runtime) only, so the
file can be pasted into the console as it is.

── Setup, once, in the AWS console ─────────────────────────────────────────

1. A bucket for bundles, separate from the site's: whatever is in the site's
   bucket may be served. Block all public access. Permissions > CORS, so the
   Write page can upload to it (use the staging site's address):

     [{"AllowedOrigins": ["https://xyz.com"], "AllowedMethods": ["POST"],
       "AllowedHeaders": ["*"], "MaxAgeSeconds": 3000}]

   A lifecycle rule that expires incoming/ after 7 days and processed/ and
   failed/ after 90 keeps it tidy. pipelines/ingest-bundle.yml reads the same
   bucket (its bucket and awsRegion variables).

2. A PAT for Azure DevOps, from an account meant for automation (User
   settings > Personal access tokens), with Build (Read & execute) and Code
   (Read). Store it in Secrets Manager as a plaintext secret: just the token,
   or {"pat": "<token>"}. PATs expire (a year at most): note the date.

3. The function: Lambda > Create function, Python 3.12, and paste this file
   over lambda_function.py (handler lambda_function.lambda_handler).
   Configuration > General: timeout 20 seconds, 256 MB. Keep it out of a VPC,
   or give its subnets a NAT gateway: it calls dev.azure.com and the load
   balancer's public key service. Environment variables:

     ALB_ARN              the load balancer's ARN (its Details tab); tokens
                          signed by anything else are refused
     WRITERS              who may publish: email addresses and @domains,
                          separated by commas, or * for anyone who can sign in
     BUNDLE_BUCKET        the bucket from step 1
     BUNDLE_PREFIX        incoming (the pipeline's incomingPrefix, without the /)
     ADO_ORGANIZATION     https://dev.azure.com/<organization>
     ADO_PROJECT          the project the docs repository is in
     ADO_PAT_SECRET       the secret's name or ARN, from step 2
     INGEST_PIPELINE_ID   ingest-bundle's number (definitionId= in its address)
     STAGING_PIPELINE_ID  the staging pipeline's number, so the page can say
                          when the change is live (optional)
     API_PREFIX           /api/writer, unless the listener rule uses another path

   Its role (Configuration > Permissions) needs, besides the basic execution
   role Lambda gives it, the policy below. The presigned uploads are signed
   with the role's own credentials, hence PutObject; HeadObject needs
   GetObject, to check who uploaded a bundle before it's published:

     {"Version": "2012-10-17", "Statement": [
       {"Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject"],
        "Resource": "arn:aws:s3:::<bundle bucket>/incoming/*"},
       {"Effect": "Allow", "Action": "secretsmanager:GetSecretValue",
        "Resource": "<the secret's ARN>"}]}

   (A bucket encrypted with its own KMS key also needs kms:GenerateDataKey
   and kms:Decrypt on that key.)

4. The load balancer: EC2 > Target groups > Create, type Lambda function,
   pointing at this function (the console grants it permission to invoke).
   Then on the HTTPS listener, add a rule above the ones for the site:
   path /api/writer/*, actions "Authenticate" (Entra ID, with the same
   settings as the staging site's rule, and scope "openid email profile" so
   the token carries the email address and name) then "Forward to" the new
   target group. Leave multi-value headers off on the target group.

5. mkdocsstaging.yml: extra.writer.api: /api/writer. Only staging has the
   Write page, so only staging needs it.

6. Check it: sign in to the staging site, then open /api/writer/me. It shows
   your email address and whether you may publish. CloudWatch Logs has the
   function's log if it doesn't.

── Entra ID and email addresses ────────────────────────────────────────────

The load balancer takes the user's claims from Entra's userinfo endpoint,
which gives email only when the account has an email address (Exchange, or
the mail attribute). Anyone without one is told so and can't publish.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import re
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request

log = logging.getLogger()
log.setLevel(logging.INFO)

MB = 1024 * 1024
MAX_BUNDLE = 25 * MB         # as tools/ingest_bundle.py and the Write page
UPLOAD_SECONDS = 600
CLOCK_SKEW = 60
API_VERSION = "7.1"


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


# ── The load balancer's token ──────────────────────────────────────────────
#
# ES256: ECDSA on P-256 with SHA-256. The runtime has no crypto library, so
# the check is done here; it's a verify only, with a public key, so there are
# no secrets to leak through timing.

_P = 0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF
_A = _P - 3
_B = 0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B
_N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551
_G = (
    0x6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296,
    0x4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5,
)
_P256_OID = bytes.fromhex("2a8648ce3d030107")


def _point_add(p1, p2):
    """Points are (x, y), or None for the point at infinity."""
    if p1 is None:
        return p2
    if p2 is None:
        return p1
    (x1, y1), (x2, y2) = p1, p2
    if x1 == x2:
        if (y1 + y2) % _P == 0:
            return None
        slope = (3 * x1 * x1 + _A) * pow(2 * y1, -1, _P) % _P
    else:
        slope = (y2 - y1) * pow(x2 - x1, -1, _P) % _P
    x3 = (slope * slope - x1 - x2) % _P
    return x3, (slope * (x1 - x3) - y1) % _P


def _point_mul(k: int, point):
    result = None
    for bit in bin(k)[2:]:
        result = _point_add(result, result)
        if bit == "1":
            result = _point_add(result, point)
    return result


def _on_curve(point) -> bool:
    x, y = point
    return 0 <= x < _P and 0 <= y < _P and (y * y - x * x * x - _A * x - _B) % _P == 0


def _public_key(pem: str):
    """The point in a P-256 public key, as the load balancer serves it (PEM)."""
    body = "".join(line for line in pem.strip().splitlines() if not line.startswith("-----"))
    der = base64.b64decode(body)
    if _P256_OID not in der or len(der) < 65 or der[-65] != 4:
        raise ApiError(401, "The sign-in's key isn't a P-256 key.")
    point = (int.from_bytes(der[-64:-32], "big"), int.from_bytes(der[-32:], "big"))
    if not _on_curve(point):
        raise ApiError(401, "The sign-in's key isn't a P-256 key.")
    return point


def _signature(sig: bytes):
    """(r, s) from a JWS signature: 64 bytes, or DER as some signers send."""
    if len(sig) == 64:
        return int.from_bytes(sig[:32], "big"), int.from_bytes(sig[32:], "big")
    try:
        if sig[0] != 0x30:
            raise ValueError
        at = 2
        values = []
        for _ in range(2):
            if sig[at] != 0x02:
                raise ValueError
            length = sig[at + 1]
            values.append(int.from_bytes(sig[at + 2:at + 2 + length], "big"))
            at += 2 + length
        return values[0], values[1]
    except (IndexError, ValueError):
        raise ApiError(401, "The sign-in's token has a malformed signature.") from None


def _es256_verify(key, message: bytes, sig: bytes) -> bool:
    r, s = _signature(sig)
    if not (1 <= r < _N and 1 <= s < _N):
        return False
    e = int.from_bytes(hashlib.sha256(message).digest(), "big")
    w = pow(s, -1, _N)
    point = _point_add(_point_mul(e * w % _N, _G), _point_mul(r * w % _N, key))
    return point is not None and point[0] % _N == r


def _b64decode(text: str) -> bytes:
    # The load balancer's tokens are base64url, with padding.
    text = text.replace("-", "+").replace("_", "/")
    return base64.b64decode(text + "=" * (-len(text) % 4))


_keys: dict[str, tuple] = {}


def fetch_key(region: str, kid: str) -> str:
    url = f"https://public-keys.auth.elb.{region}.amazonaws.com/{kid}"
    with urllib.request.urlopen(url, timeout=5) as response:
        return response.read().decode("ascii")


def verify_token(token: str, alb_arn: str, now: float | None = None) -> dict:
    """The claims in x-amzn-oidc-data, once its signature, signer and expiry check out."""
    now = time.time() if now is None else now
    parts = token.split(".")
    if len(parts) != 3:
        raise ApiError(401, "The sign-in's token isn't a JWT.")
    try:
        header = json.loads(_b64decode(parts[0]))
        claims = json.loads(_b64decode(parts[1]))
        sig = _b64decode(parts[2])
    except (ValueError, UnicodeDecodeError):
        raise ApiError(401, "The sign-in's token can't be read.") from None
    if header.get("alg") != "ES256":
        raise ApiError(401, "The sign-in's token isn't ES256.")
    if not alb_arn or header.get("signer") != alb_arn:
        raise ApiError(401, "The sign-in's token wasn't signed by this site's load balancer (ALB_ARN).")
    kid = str(header.get("kid", ""))
    if not re.fullmatch(r"[A-Za-z0-9-]{1,128}", kid):
        raise ApiError(401, "The sign-in's token has no key id.")
    region = alb_arn.split(":")[3]
    if kid not in _keys:
        try:
            _keys[kid] = _public_key(fetch_key(region, kid))
        except (urllib.error.URLError, OSError, ValueError) as error:
            raise ApiError(502, f"Couldn't get the load balancer's public key ({error}).") from None
    if not _es256_verify(_keys[kid], f"{parts[0]}.{parts[1]}".encode("ascii"), sig):
        raise ApiError(401, "The sign-in's token has a bad signature.")
    expires = claims.get("exp", header.get("exp"))
    if not isinstance(expires, (int, float)) or expires + CLOCK_SKEW < now:
        raise ApiError(401, "Your sign-in has expired. Reload the page to sign in again.")
    return claims


def writer(headers: dict) -> dict:
    """The signed-in person: {"email", "name"}; refused unless WRITERS lets them publish."""
    token = headers.get("x-amzn-oidc-data")
    if not token:
        raise ApiError(401, "No sign-in reached the function: the listener rule needs the Authenticate action.")
    claims = verify_token(token, env("ALB_ARN"))
    email = str(claims.get("email") or "").strip()
    if not re.fullmatch(r"[^@\s<>]+@[^@\s<>]+\.[A-Za-z]{2,}", email):
        raise ApiError(403, "Your account has no email address, which publishing needs. Ask for one to be set in Entra ID.")
    name = re.sub(r"[\x00-\x1f<>]+", "", str(claims.get("name") or "")).strip()[:100]
    return {"email": email, "name": name or email, "allowed": allowed(email)}


def allowed(email: str) -> bool:
    email = email.lower()
    for entry in (e.strip().lower() for e in env("WRITERS").split(",")):
        if entry == "*" or entry == email or (entry.startswith("@") and email.endswith(entry)):
            return True
    return False


# ── S3 ─────────────────────────────────────────────────────────────────────

_s3 = None


def s3():
    global _s3
    if _s3 is None:
        import boto3
        from botocore.config import Config

        region = env("BUNDLE_REGION") or env("AWS_REGION")
        _s3 = boto3.client(
            "s3",
            region_name=region,
            endpoint_url=f"https://s3.{region}.amazonaws.com",
            config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
        )
    return _s3


def prefix() -> str:
    return (env("BUNDLE_PREFIX") or "incoming").strip("/")


def create_upload(who: dict, body: dict) -> dict:
    name = str(body.get("name") or "")
    stem = re.sub(r"[^a-z0-9-]+", "-", re.sub(r"\.zip$", "", name.lower())).strip("-")[:80] or "page"
    key = f"{prefix()}/{stem}-{secrets.token_hex(3)}.zip"
    post = s3().generate_presigned_post(
        Bucket=env("BUNDLE_BUCKET"),
        Key=key,
        Fields={"Content-Type": "application/zip", "x-amz-meta-publisher": who["email"]},
        Conditions=[
            {"Content-Type": "application/zip"},
            {"x-amz-meta-publisher": who["email"]},
            ["content-length-range", 1, MAX_BUNDLE],
        ],
        ExpiresIn=UPLOAD_SECONDS,
    )
    return {"key": key, "url": post["url"], "fields": post["fields"], "max": MAX_BUNDLE}


# ── Azure DevOps ───────────────────────────────────────────────────────────

_pat = None


def pat() -> str:
    global _pat
    if _pat is None:
        import boto3

        value = boto3.client("secretsmanager").get_secret_value(SecretId=env("ADO_PAT_SECRET"))["SecretString"].strip()
        if value.startswith("{"):
            value = json.loads(value)["pat"]
        _pat = value
    return _pat


def ado(method: str, path: str, body: dict | None = None, query: dict | None = None) -> dict:
    global _pat
    params = dict(query or {}, **{"api-version": API_VERSION})
    url = (
        env("ADO_ORGANIZATION").rstrip("/") + "/" + urllib.parse.quote(env("ADO_PROJECT"))
        + "/_apis/" + path + "?" + urllib.parse.urlencode(params)
    )
    request = urllib.request.Request(
        url,
        method=method,
        data=json.dumps(body).encode("utf-8") if body is not None else None,
        headers={
            "Authorization": "Basic " + base64.b64encode(f":{pat()}".encode()).decode(),
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        if error.code in (401, 403):
            _pat = None  # a new token in the secret is picked up next time
        detail = error.read()[:300].decode("utf-8", "replace")
        log.error("Azure DevOps %s %s: %s %s", method, path, error.code, detail)
        raise ApiError(502, f"Azure DevOps refused the request ({error.code}). The function's log has the detail.") from None
    except (urllib.error.URLError, OSError) as error:
        raise ApiError(502, f"Couldn't reach Azure DevOps ({error}).") from None


def start_publish(who: dict, body: dict) -> dict:
    key = str(body.get("key") or "")
    if not re.fullmatch(re.escape(prefix()) + r"/[a-z0-9-]+\.zip", key):
        raise ApiError(400, "That isn't the key of an uploaded bundle.")
    try:
        head = s3().head_object(Bucket=env("BUNDLE_BUCKET"), Key=key)
    except Exception as error:  # botocore's ClientError, without importing botocore here
        if "404" in str(error) or "Not Found" in str(error):
            raise ApiError(404, "The bundle isn't in the bucket: it was published already, or the upload didn't finish. Publish again.") from None
        raise
    if (head.get("Metadata") or {}).get("publisher", "").lower() != who["email"].lower():
        raise ApiError(403, "Someone else uploaded that bundle.")
    run = ado(
        "POST",
        f"pipelines/{int(env('INGEST_PIPELINE_ID'))}/runs",
        {
            "resources": {"repositories": {"self": {"refName": "refs/heads/main"}}},
            "templateParameters": {"bundleKey": key, "publisherName": who["name"], "publisherEmail": who["email"]},
        },
    )
    log.info("%s published %s as run %s", who["email"], key, run.get("id"))
    return {"runId": run["id"], "runUrl": ((run.get("_links") or {}).get("web") or {}).get("href", "")}


def _errors(run_id: int) -> str:
    """What went wrong, from the run's error messages, the generic ones last."""
    timeline = ado("GET", f"build/builds/{run_id}/timeline")
    messages = []
    for record in timeline.get("records") or []:
        for issue in record.get("issues") or []:
            text = str(issue.get("message") or "").strip()
            if issue.get("type") == "error" and text and text not in messages:
                messages.append(text)
    specific = [m for m in messages if not re.search(r"exited with code|failed with exit code", m)]
    return " ".join((specific or messages)[:4])[:1500]


def run_status(run_id: int) -> dict:
    build = ado("GET", f"build/builds/{run_id}")
    if (build.get("definition") or {}).get("id") != int(env("INGEST_PIPELINE_ID")):
        raise ApiError(404, "That isn't a run of the ingest pipeline.")
    out = {"runId": run_id, "runUrl": ((build.get("_links") or {}).get("web") or {}).get("href", "")}
    status, result = build.get("status"), build.get("result")
    if status != "completed":
        return dict(out, stage="queued" if status == "notStarted" else "checking")
    if result != "succeeded":
        return dict(out, stage="failed", message=_errors(run_id) or f"The ingest pipeline {result}.")

    tag = next((t for t in build.get("tags") or [] if re.fullmatch(r"pr-\d+", t)), None)
    if not tag:
        return dict(out, stage="failed", message="The ingest pipeline finished without opening a pull request.")
    pr_id = int(tag[3:])
    pr = ado("GET", f"git/pullrequests/{pr_id}")
    out["prUrl"] = f"{(pr.get('repository') or {}).get('webUrl', '')}/pullrequest/{pr_id}"
    if pr.get("status") == "abandoned":
        return dict(out, stage="failed", message="The pull request was abandoned.")
    if pr.get("status") != "completed":
        if pr.get("mergeStatus") == "conflicts":
            return dict(out, stage="failed", message="The pull request conflicts with main: someone changed the same files since. Open the page again to get the latest, and publish again.")
        waiting = "Waiting for main's policies." if pr.get("autoCompleteSetBy") else "Waiting for someone to complete the pull request."
        return dict(out, stage="merging", message=waiting)

    out["commit"] = (pr.get("lastMergeCommit") or {}).get("commitId", "")
    staging = env("STAGING_PIPELINE_ID")
    if not staging:
        return dict(out, stage="merged")
    # The first staging runs queued after the merge include it, whichever
    # commit each was started for.
    runs = ado(
        "GET",
        "build/builds",
        query={
            "definitions": int(staging),
            "branchName": "refs/heads/main",
            "minTime": pr.get("closedDate", ""),
            "queryOrder": "queueTimeAscending",
            "$top": 10,
        },
    ).get("value") or []
    done = [r for r in runs if r.get("status") == "completed"]
    link = lambda r: ((r.get("_links") or {}).get("web") or {}).get("href", "")  # noqa: E731
    good = [r for r in done if r.get("result") in ("succeeded", "partiallySucceeded")]
    if good:
        return dict(out, stage="live", stagingUrl=link(good[0]))
    busy = [r for r in runs if r.get("status") != "completed"]
    if busy:
        return dict(out, stage="deploying", stagingUrl=link(busy[0]))
    if done:
        return dict(out, stage="failed", stagingUrl=link(done[0]), message="The staging pipeline failed after the merge. Its log says why.")
    return dict(out, stage="deploying", message="Waiting for the staging pipeline to start.")


# ── The handler ────────────────────────────────────────────────────────────


def respond(status: int, body: dict) -> dict:
    reasons = {200: "OK", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 502: "Bad Gateway"}
    return {
        "statusCode": status,
        "statusDescription": f"{status} {reasons.get(status, '')}".strip(),
        "isBase64Encoded": False,
        "headers": {"Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
        "body": json.dumps(body),
    }


def lambda_handler(event, context=None):
    try:
        headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
        method = event.get("httpMethod", "GET")
        base = env("API_PREFIX", "/api/writer").rstrip("/")
        path = event.get("path", "")
        if not path.startswith(base + "/"):
            raise ApiError(404, "Not found.")
        route = path[len(base):].rstrip("/")

        who = writer(headers)
        if route == "/me" and method == "GET":
            return respond(200, who)
        if not who["allowed"]:
            raise ApiError(403, f"{who['email']} can't publish from the Write page. Ask for your address to be added to WRITERS.")

        if method == "POST":
            if headers.get("x-writer") != "1":
                raise ApiError(403, "Publishing only works from the Write page.")
            raw = event.get("body") or "{}"
            if event.get("isBase64Encoded"):
                raw = base64.b64decode(raw).decode("utf-8")
            try:
                body = json.loads(raw)
            except ValueError:
                raise ApiError(400, "The request isn't JSON.") from None
            if not isinstance(body, dict):
                raise ApiError(400, "The request isn't a JSON object.")
            if route == "/uploads":
                return respond(200, create_upload(who, body))
            if route == "/publishes":
                return respond(200, start_publish(who, body))
        run = re.fullmatch(r"/runs/(\d{1,12})", route)
        if run and method == "GET":
            return respond(200, run_status(int(run.group(1))))
        if route in ("/me", "/uploads", "/publishes") or run:
            raise ApiError(405, "Not allowed.")
        raise ApiError(404, "Not found.")
    except ApiError as error:
        return respond(error.status, {"error": error.message})
    except Exception:
        log.exception("writer API")
        return respond(502, {"error": "The publish service failed. The function's log has the detail."})
