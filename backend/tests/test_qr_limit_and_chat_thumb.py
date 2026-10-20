"""
SYSTEM_AUDIT.md 4.6: the public QR-scan form is rate-limited (10 a minute).
SYSTEM_AUDIT.md 4.5: a report's chat thread shows its main photo, not its first file (evidence, a document, a video).
Run from the backend folder:  python tests/test_qr_limit_and_chat_thumb.py
"""
import os
import sys
import tempfile
from types import SimpleNamespace as NS

_DB = os.path.join(tempfile.mkdtemp(), "qr_limit_chat_thumb_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-qr-limit-and-chat-thumb-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.routes import pet_qr  # noqa: E402
from app.routes.chat import _report_thumb  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api.include_router(pet_qr.router)
client = TestClient(api, raise_server_exceptions=False)
results = []


def check(label, ok, extra=""):
    results.append(bool(ok))
    print(("  ok   " if ok else "  FAIL ") + label + ("" if ok else f"  -> {extra}"))


# ---- 4.6 rate limit (a made-up tag: every request counts, found or not)
codes = [client.post("/pet/scan/no-such-tag/submit", json={"finder_name": "Spammer"}).status_code for _ in range(11)]
check("the first 10 scan submissions in a minute are handled normally", all(c == 404 for c in codes[:10]), codes)
check("the 11th within a minute is refused (429 Too Many Requests)", codes[10] == 429, codes)


# ---- 4.5 chat thread picture
def media(url, **kw):
    base = dict(file_url=url, media_type="Image", history_id=None, holding_log_id=None, is_evidence=False)
    base.update(kw)
    return NS(**base)


rep = NS(media=[media("https://x/signup-screenshot.png", is_evidence=True), media("https://x/letter.pdf", media_type="Document"),
                media("https://x/cat.jpg")])
check("the chat shows the main photo, not an evidence screenshot or a document listed first", _report_thumb(rep) == "https://x/cat.jpg",
      _report_thumb(rep))
rep2 = NS(media=[media("https://x/clip.mp4", media_type="Video"), media("https://x/later.jpg", history_id=7)])
check("with no main photo it falls back to another image, never a video", _report_thumb(rep2) == "https://x/later.jpg", _report_thumb(rep2))
check("a report with only a document has no chat picture",
      _report_thumb(NS(media=[media("https://x/endorsement.pdf", media_type="Document")])) is None)
check("a report with no files has no chat picture", _report_thumb(NS(media=[])) is None and _report_thumb(None) is None)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
