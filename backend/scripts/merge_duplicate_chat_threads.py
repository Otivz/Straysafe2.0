"""
Merge duplicate case conversations: one Report thread per report, one Direct (match) thread per match.

Before report threads were created under a lock, two requests at the same moment could each create a thread for the
same report. The app reads the oldest one, so messages in a newer duplicate were invisible. For every duplicate this
script moves its messages into the oldest thread, then removes the (now empty) duplicate. No message is deleted.

Run from the backend folder, after backing up the database:
    ..\\.venv\\Scripts\\python.exe scripts/merge_duplicate_chat_threads.py            # dry run: prints, saves nothing
    ..\\.venv\\Scripts\\python.exe scripts/merge_duplicate_chat_threads.py --apply    # saves
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import SessionLocal  # noqa: E402
from app.models.chat import ChatMessage, ChatThread  # noqa: E402

THREAD_TYPES = ("Report", "Direct")


def duplicate_groups(db):
    """[(thread_type, related_id, [thread ids, oldest first])] for every conversation that exists more than once."""
    groups = (db.query(ChatThread.thread_type, ChatThread.related_id)
              .filter(ChatThread.thread_type.in_(THREAD_TYPES), ChatThread.related_id.isnot(None))
              .group_by(ChatThread.thread_type, ChatThread.related_id)
              .having(func.count(ChatThread.thread_id) > 1).all())
    out = []
    for thread_type, related_id in groups:
        ids = [tid for (tid,) in db.query(ChatThread.thread_id).filter(
            ChatThread.thread_type == thread_type, ChatThread.related_id == related_id).order_by(ChatThread.thread_id).all()]
        out.append((thread_type, related_id, ids))
    return out


def merge(db, keep_id, duplicate_ids):
    """Move the duplicates' messages into keep_id, then remove the duplicates. Returns the number of messages moved."""
    keep = db.get(ChatThread, keep_id)
    moved = 0
    for dup_id in duplicate_ids:
        dup = db.get(ChatThread, dup_id)
        moved += db.query(ChatMessage).filter(ChatMessage.thread_id == dup_id).update(
            {ChatMessage.thread_id: keep_id}, synchronize_session=False)
        if dup.updated_at and (keep.updated_at is None or dup.updated_at > keep.updated_at):
            keep.updated_at = dup.updated_at
        db.flush()
        db.delete(dup)
    return moved


def main(apply: bool) -> int:
    db = SessionLocal()
    try:
        groups = duplicate_groups(db)
        for thread_type, related_id, ids in groups:
            counts = {tid: db.query(ChatMessage).filter(ChatMessage.thread_id == tid).count() for tid in ids}
            print(f"{thread_type} #{related_id}: keep thread {ids[0]} ({counts[ids[0]]} messages); merge "
                  + ", ".join(f"thread {tid} ({counts[tid]} messages)" for tid in ids[1:]))
            if apply:
                merge(db, ids[0], ids[1:])
        print(f"\n{len(groups)} duplicated conversation(s) found.")
        if apply:
            db.commit()
            print("Saved.")
        else:
            db.rollback()
            print("Dry run: nothing saved. Back up the database, then run again with --apply.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main("--apply" in sys.argv[1:]))
