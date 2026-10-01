"""Tests for tools/writer_api/lambda_function.py, with S3 and Azure DevOps faked.

    python -m unittest discover tests
"""

import base64
import hashlib
import importlib.util
import json
import os
import secrets
import sys
import time
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("lambda_function", ROOT / "tools" / "writer_api" / "lambda_function.py")
api = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = api
spec.loader.exec_module(api)

ALB = "arn:aws:elasticloadbalancing:eu-west-2:123456789012:loadbalancer/app/docs/abc"
KID = "0f6e1a2b-3c4d-5e6f-7a8b-9c0d1e2f3a4b"
PRIVATE = secrets.randbelow(api._N - 1) + 1
PUBLIC = api._point_mul(PRIVATE, api._G)
# A SubjectPublicKeyInfo for a P-256 key, as the load balancer serves it.
PEM = "-----BEGIN PUBLIC KEY-----\n" + base64.b64encode(
    bytes.fromhex("3059301306072a8648ce3d020106082a8648ce3d030107034200")
    + b"\x04" + PUBLIC[0].to_bytes(32, "big") + PUBLIC[1].to_bytes(32, "big")
).decode() + "\n-----END PUBLIC KEY-----\n"

ENV = {
    "ALB_ARN": ALB,
    "WRITERS": "sam@example.com, @writers.example.com",
    "BUNDLE_BUCKET": "docs-bundles",
    "BUNDLE_PREFIX": "incoming",
    "ADO_ORGANIZATION": "https://dev.azure.com/org",
    "ADO_PROJECT": "Docs",
    "ADO_PAT_SECRET": "docs/ado-pat",
    "INGEST_PIPELINE_ID": "42",
    "STAGING_PIPELINE_ID": "7",
}


def b64(data):
    # As the load balancer writes them: base64url with padding.
    return base64.urlsafe_b64encode(data).decode()


def sign(message, key=PRIVATE):
    e = int.from_bytes(hashlib.sha256(message).digest(), "big")
    while True:
        k = secrets.randbelow(api._N - 1) + 1
        r = api._point_mul(k, api._G)[0] % api._N
        s = pow(k, -1, api._N) * (e + r * key) % api._N
        if r and s:
            return r.to_bytes(32, "big") + s.to_bytes(32, "big")


def token(claims=None, header=None, key=PRIVATE):
    head = {"alg": "ES256", "kid": KID, "signer": ALB, "iss": "https://login.microsoftonline.com/t/v2.0", "exp": time.time() + 60}
    head.update(header or {})
    body = {"sub": "abc", "name": "Sam Writer", "email": "sam@example.com", "exp": time.time() + 60}
    body.update(claims or {})
    signed = b64(json.dumps(head).encode()) + "." + b64(json.dumps(body).encode())
    return signed + "." + b64(sign(signed.encode(), key))


def event(method, path, body=None, tok=None, headers=None):
    h = {"x-amzn-oidc-data": tok if tok is not None else token()}
    if method == "POST":
        h["x-writer"] = "1"
    h.update(headers or {})
    return {"httpMethod": method, "path": path, "headers": {k: v for k, v in h.items() if v is not None}, "body": json.dumps(body) if body is not None else None, "isBase64Encoded": False}


class FakeS3:
    def __init__(self, publisher="sam@example.com", missing=False):
        self.publisher, self.missing, self.posts = publisher, missing, []

    def generate_presigned_post(self, **kwargs):
        self.posts.append(kwargs)
        return {"url": "https://docs-bundles.s3.eu-west-2.amazonaws.com/", "fields": dict(kwargs["Fields"], key=kwargs["Key"])}

    def head_object(self, Bucket, Key):
        if self.missing:
            raise Exception("An error occurred (404) when calling the HeadObject operation: Not Found")
        return {"ContentLength": 1000, "Metadata": {"publisher": self.publisher}}


class Api(unittest.TestCase):
    def setUp(self):
        patches = [
            mock.patch.dict(os.environ, ENV),
            mock.patch.object(api, "fetch_key", lambda region, kid: PEM),
            mock.patch.object(api, "_keys", {}),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.s3 = FakeS3()
        api._s3 = self.s3
        self.addCleanup(setattr, api, "_s3", None)
        self.calls = []
        self.ado = {}
        p = mock.patch.object(api, "ado", self.fake_ado)
        p.start()
        self.addCleanup(p.stop)

    def fake_ado(self, method, path, body=None, query=None):
        self.calls.append((method, path, body, query))
        return self.ado[path]

    def call(self, *args, **kwargs):
        response = api.lambda_handler(event(*args, **kwargs))
        return response["statusCode"], json.loads(response["body"])

    # ── Who's asking ──

    def test_me(self):
        status, body = self.call("GET", "/api/writer/me")
        self.assertEqual(status, 200, body)
        self.assertEqual(body, {"email": "sam@example.com", "name": "Sam Writer", "allowed": True})

    def test_domain_in_writers(self):
        status, body = self.call("GET", "/api/writer/me", tok=token({"email": "alex@writers.example.com"}))
        self.assertTrue(body["allowed"])

    def test_not_a_writer(self):
        tok = token({"email": "pat@example.com"})
        status, body = self.call("GET", "/api/writer/me", tok=tok)
        self.assertEqual((status, body["allowed"]), (200, False))
        status, body = self.call("POST", "/api/writer/uploads", {"name": "a.zip"}, tok=tok)
        self.assertEqual(status, 403)
        self.assertIn("pat@example.com can't publish", body["error"])

    def test_tampered_claims(self):
        head, claims, sig = token().split(".")
        forged = b64(json.dumps({"email": "boss@example.com", "exp": time.time() + 60}).encode())
        status, body = self.call("GET", "/api/writer/me", tok=f"{head}.{forged}.{sig}")
        self.assertEqual(status, 401)
        self.assertIn("bad signature", body["error"])

    def test_other_key(self):
        status, body = self.call("GET", "/api/writer/me", tok=token(key=PRIVATE + 1))
        self.assertEqual(status, 401)

    def test_other_signer(self):
        status, body = self.call("GET", "/api/writer/me", tok=token(header={"signer": ALB + "x"}))
        self.assertEqual(status, 401)
        self.assertIn("ALB_ARN", body["error"])

    def test_expired(self):
        status, body = self.call("GET", "/api/writer/me", tok=token({"exp": time.time() - 3600}))
        self.assertEqual(status, 401)
        self.assertIn("expired", body["error"])

    def test_no_token(self):
        status, body = self.call("GET", "/api/writer/me", headers={"x-amzn-oidc-data": None}, tok="")
        self.assertEqual(status, 401)

    def test_der_signature(self):
        head, claims, raw = token().split(".")
        sig = base64.urlsafe_b64decode(raw)

        def integer(b):
            b = b.lstrip(b"\x00")
            if b[0] & 0x80:
                b = b"\x00" + b
            return b"\x02" + bytes([len(b)]) + b
        der = integer(sig[:32]) + integer(sig[32:])
        der = b"\x30" + bytes([len(der)]) + der
        status, body = self.call("GET", "/api/writer/me", tok=f"{head}.{claims}.{b64(der)}")
        self.assertEqual(status, 200, body)

    def test_no_email(self):
        status, body = self.call("GET", "/api/writer/me", tok=token({"email": None}))
        self.assertEqual(status, 403)
        self.assertIn("no email address", body["error"])

    # ── Uploading and publishing ──

    def test_upload(self):
        status, body = self.call("POST", "/api/writer/uploads", {"name": "Security-Rotate Key-20260930-1015.zip"})
        self.assertEqual(status, 200, body)
        self.assertRegex(body["key"], r"^incoming/security-rotate-key-20260930-1015-[0-9a-f]{6}\.zip$")
        post = self.s3.posts[0]
        self.assertEqual(post["Bucket"], "docs-bundles")
        self.assertIn({"x-amz-meta-publisher": "sam@example.com"}, post["Conditions"])
        self.assertIn(["content-length-range", 1, 25 * 1024 * 1024], post["Conditions"])

    def test_post_needs_the_writer_header(self):
        status, body = self.call("POST", "/api/writer/uploads", {"name": "a.zip"}, headers={"x-writer": None})
        self.assertEqual(status, 403)

    def test_publish(self):
        self.ado["pipelines/42/runs"] = {"id": 901, "_links": {"web": {"href": "https://dev.azure.com/org/Docs/_build/results?buildId=901"}}}
        status, body = self.call("POST", "/api/writer/publishes", {"key": "incoming/rotate-key-abc123.zip"})
        self.assertEqual(status, 200, body)
        self.assertEqual(body["runId"], 901)
        method, path, sent, _ = self.calls[0]
        self.assertEqual(sent["templateParameters"], {"bundleKey": "incoming/rotate-key-abc123.zip", "publisherName": "Sam Writer", "publisherEmail": "sam@example.com"})

    def test_publish_someone_elses_bundle(self):
        api._s3 = FakeS3(publisher="alex@example.com")
        status, body = self.call("POST", "/api/writer/publishes", {"key": "incoming/rotate-key-abc123.zip"})
        self.assertEqual(status, 403)
        self.assertEqual(self.calls, [])

    def test_publish_bad_key(self):
        for key in ("processed/a.zip", "incoming/../a.zip", "incoming/a.zip.exe", ""):
            status, body = self.call("POST", "/api/writer/publishes", {"key": key})
            self.assertEqual(status, 400, key)

    def test_publish_missing_bundle(self):
        api._s3 = FakeS3(missing=True)
        status, body = self.call("POST", "/api/writer/publishes", {"key": "incoming/rotate-key-abc123.zip"})
        self.assertEqual(status, 404)

    # ── Following the run ──

    def build(self, status="completed", result="succeeded", tags=(), definition=42):
        self.ado["build/builds/901"] = {"id": 901, "status": status, "result": result, "tags": list(tags), "definition": {"id": definition}, "_links": {"web": {"href": "run-901"}}}

    def test_run_in_progress(self):
        self.build(status="inProgress", result=None)
        status, body = self.call("GET", "/api/writer/runs/901")
        self.assertEqual(body["stage"], "checking")

    def test_run_of_another_pipeline(self):
        self.build(definition=3)
        status, body = self.call("GET", "/api/writer/runs/901")
        self.assertEqual(status, 404)

    def test_run_refused(self):
        self.build(result="failed")
        self.ado["build/builds/901/timeline"] = {"records": [
            {"issues": [{"type": "error", "message": "Bash exited with code '1'."}]},
            {"issues": [{"type": "error", "message": "The bundle was refused: docs/a.md has changed since you opened it"}]},
            {"issues": None},
        ]}
        status, body = self.call("GET", "/api/writer/runs/901")
        self.assertEqual(body["stage"], "failed")
        self.assertEqual(body["message"], "The bundle was refused: docs/a.md has changed since you opened it")

    def test_waiting_for_policies(self):
        self.build(tags=["pr-15"])
        self.ado["git/pullrequests/15"] = {"status": "active", "mergeStatus": "succeeded", "autoCompleteSetBy": {"id": "x"}, "repository": {"webUrl": "https://dev.azure.com/org/Docs/_git/docs"}}
        status, body = self.call("GET", "/api/writer/runs/901")
        self.assertEqual((body["stage"], body["prUrl"]), ("merging", "https://dev.azure.com/org/Docs/_git/docs/pullrequest/15"))

    def test_merge_conflict(self):
        self.build(tags=["pr-15"])
        self.ado["git/pullrequests/15"] = {"status": "active", "mergeStatus": "conflicts", "repository": {"webUrl": "w"}}
        status, body = self.call("GET", "/api/writer/runs/901")
        self.assertEqual(body["stage"], "failed")

    def test_live_on_staging(self):
        self.build(tags=["pr-15"])
        self.ado["git/pullrequests/15"] = {"status": "completed", "closedDate": "2026-09-30T10:20:00Z", "lastMergeCommit": {"commitId": "abc"}, "repository": {"webUrl": "w"}}
        self.ado["build/builds"] = {"value": [{"status": "inProgress", "_links": {"web": {"href": "staging-1"}}}]}
        status, body = self.call("GET", "/api/writer/runs/901")
        self.assertEqual((body["stage"], body["stagingUrl"]), ("deploying", "staging-1"))
        self.assertEqual(self.calls[-1][3]["minTime"], "2026-09-30T10:20:00Z")

        self.ado["build/builds"] = {"value": [{"status": "completed", "result": "succeeded", "_links": {"web": {"href": "staging-1"}}}]}
        status, body = self.call("GET", "/api/writer/runs/901")
        self.assertEqual(body["stage"], "live")

    def test_unknown_route(self):
        self.assertEqual(self.call("GET", "/api/writer/nothing")[0], 404)
        self.assertEqual(self.call("DELETE", "/api/writer/uploads")[0], 405)


if __name__ == "__main__":
    unittest.main()
