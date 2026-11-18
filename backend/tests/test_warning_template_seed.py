"""
Standard warning letter templates (one per level), per-subdivision seeding, and the cleanup script.

  1. The four templates come from the seed data file (not code), are valid, and follow the scope: no Barangay steps, no fines.
  2. Every subdivision created through the app gets its OWN four templates; editing one subdivision's never touches another's.
  3. The seeding is idempotent; opening the template list never seeds; the startup safety net only seeds a subdivision that has
     no template rows at all (archived ones count), so nothing removed or archived on purpose comes back.
  4. A template for another level is refused (Notice/Final for the complaint flow's 1st and 2nd Warning).
  5. scripts/clean_warning_templates.py: dry run changes nothing; --apply needs a real backup; a template an issued letter uses is
     never deleted (the whole run is refused); issued letters and kept templates are untouched; running it twice changes nothing more.

Run from the backend folder:
    python tests/test_warning_template_seed.py
"""
import _isolated_db  # noqa: F401  (FIRST: throwaway SQLite DB, offline env)

import json
import os
import re
import sys
import tempfile
from types import SimpleNamespace

from fastapi import HTTPException

from app.database import SessionLocal
from app.models.user import Subdivision, User
from app.models.warning_letter import GeneratedWarningLetter, WarningLetterTemplate, WarningLetterTemplateVersion
from app.routes import warning_letters as wl_routes
from app.services import warning_letters as WL   # registers the "new subdivision gets its templates" hook

PASSED = 0
LEVELS = ["Notice", "1st Warning", "2nd Warning", "Final Notice / Escalation"]


def check(label: str, cond: bool, info: object = "") -> None:
    global PASSED
    if not cond:
        raise AssertionError(f"[FAIL] {label} {info}")
    PASSED += 1
    print(f"[PASS] {label}")


def _req():
    return SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"), headers={}, state=SimpleNamespace())


def refused(fn, status: int) -> bool:
    try:
        fn()
    except HTTPException as exc:
        return exc.status_code == status
    return False


def rows(db, sub_id, status=None):
    q = db.query(WarningLetterTemplate).filter(WarningLetterTemplate.subdivision_id == sub_id)
    return q.filter(WarningLetterTemplate.status == status).all() if status else q.all()


def run_script(*argv) -> int:
    """Runs scripts/clean_warning_templates.py main() with these arguments; returns its exit code (0 = ran to the end)."""
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))
    import clean_warning_templates as script
    old = sys.argv
    sys.argv = ["clean_warning_templates.py", *argv]
    try:
        script.main()
        return 0
    except SystemExit as exc:
        return exc.code if isinstance(exc.code, int) else 1
    finally:
        sys.argv = old


def main() -> None:
    seed = _isolated_db.create_schema_and_seed()
    db = SessionLocal()
    try:
        leader = db.get(User, seed["leader"])

        # ---- 1. The seed data ---------------------------------------------------------------------------------------------
        items = WL.load_standard_templates()
        check("the seed file has exactly one template per level", sorted(i["warning_level"] for i in items) == sorted(LEVELS), [i["warning_level"] for i in items])
        check("the seed file lives outside the code (no letter wording constants in the service)", not hasattr(WL, "DEFAULT_STANDARD_BODY") and not hasattr(WL, "DEFAULT_SUMMONS_BODY"))
        text = " ".join(i["subject_template"] + " " + i["body_template"] + " " + i["description"] for i in items)
        check("no Barangay wording", "barangay" not in text.lower())
        check("no fines or money", not re.search(r"\bfines?\b|₱|\bpesos?\b|\bPHP\b|\$|\bpayment\b|\bpay\b", text, re.I), re.findall(r"\bfines?\b|₱|\bpesos?\b", text, re.I))
        check("every placeholder in the seed is a supported one", all(k in WL.PLACEHOLDER_LABELS for i in items for k in WL.extract_placeholders(i["subject_template"], i["body_template"])))
        names = {i["warning_level"]: i["name"] for i in items}
        check("the four letters are clearly distinct by level", len(set(names.values())) == 4 and "First" in names["1st Warning"] and "Second" in names["2nd Warning"] and "Final" in names["Final Notice / Escalation"] and "Notice" in names["Notice"], names)
        second = next(i for i in items if i["warning_level"] == "2nd Warning")
        check("only the 2nd Warning letter has the summons", all(("summons" in i["body_template"].lower()) == (i is second) for i in items))

        # ---- 2. Per-subdivision, independent sets --------------------------------------------------------------------------
        sub_a = Subdivision(subdivision_name="Alpha Homes", barangay_id=1)
        sub_b = Subdivision(subdivision_name="Beta Homes", barangay_id=1)
        db.add_all([sub_a, sub_b])
        db.commit()
        sub_a_id, sub_b_id = sub_a.subdivision_id, sub_b.subdivision_id   # plain ids: the objects go away when the session is replaced below
        ids_a = {t.template_id for t in rows(db, sub_a_id)}
        ids_b = {t.template_id for t in rows(db, sub_b_id)}
        check("a subdivision created through the app gets its four templates automatically",
              sorted(t.warning_level for t in rows(db, sub_a_id)) == sorted(LEVELS) and len(ids_a) == 4)
        check("each subdivision has its own rows: nothing is shared", ids_a.isdisjoint(ids_b) and len(ids_b) == 4)
        check("no template is left without a subdivision", db.query(WarningLetterTemplate).filter(WarningLetterTemplate.subdivision_id.is_(None)).count() == 0)
        t_a = next(t for t in rows(db, sub_a_id) if t.warning_level == "1st Warning")
        v = db.get(WarningLetterTemplateVersion, t_a.current_version_id)
        check("each is an ordinary template: active, Suggested, editor source, version 1 with the saved text",
              t_a.status == "active" and t_a.is_default and t_a.source_type == "editor" and v.version_number == 1 and v.template_id == t_a.template_id
              and "{{resident_name}}" in v.body_template and v.placeholders_used, (t_a.status, v.version_number))
        check("each level has exactly one Suggested template in a subdivision", all(sum(1 for t in rows(db, sub_a_id) if t.warning_level == lv and t.is_default) == 1 for lv in LEVELS))

        # editing is the normal editor: a new version; another subdivision is untouched
        b_first = next(t for t in rows(db, sub_b_id) if t.warning_level == "1st Warning")
        b_text = db.get(WarningLetterTemplateVersion, b_first.current_version_id).body_template
        leader_a = User(name="Alpha Leader", email="alpha.leader@isolated.test", password="x", role_id=2, is_verified=True, status="Active",
                        subdivision_id=sub_a_id, barangay_id=1)
        db.add(leader_a)
        db.commit()
        edited = wl_routes.update_template(
            template_id=t_a.template_id,
            body=wl_routes.TemplateUpdateIn(subject_template="Edited {{warning_level}}", body_template="Edited letter for {{resident_name}} about {{policy_reference}}."),
            req=_req(), db=db, current_user=leader_a)
        db.expire_all()
        check("a Leader edits a standard template in the normal editor: version 2 is added", edited["current_version_number"] == 2 and edited["version_count"] == 2)
        check("...and the original version 1 is kept", db.query(WarningLetterTemplateVersion).filter(WarningLetterTemplateVersion.template_id == t_a.template_id, WarningLetterTemplateVersion.version_number == 1).count() == 1)
        check("...and another subdivision's same-level template is unchanged",
              db.get(WarningLetterTemplateVersion, db.get(WarningLetterTemplate, b_first.template_id).current_version_id).body_template == b_text
              and db.query(WarningLetterTemplateVersion).filter(WarningLetterTemplateVersion.template_id == b_first.template_id).count() == 1)
        check("a Leader cannot edit another subdivision's template (403)", refused(lambda: wl_routes.update_template(
            template_id=b_first.template_id, body=wl_routes.TemplateUpdateIn(subject_template="x y", body_template="Hijacked letter text for everyone."),
            req=_req(), db=db, current_user=leader_a), 403))

        # ---- 3. Idempotent; no lazy seeding; the startup safety net ---------------------------------------------------------
        check("seeding again adds nothing", WL.seed_standard_templates(db.connection(), sub_a_id) == [])
        count_before = db.query(WarningLetterTemplate).count()
        wl_routes.list_templates(status="all", subdivision_id=None, db=db, current_user=leader_a)
        check("opening the template list creates nothing", db.query(WarningLetterTemplate).count() == count_before)

        for t in rows(db, sub_b_id):                       # a subdivision that archived all of its templates on purpose
            t.status, t.is_default = "archived", False
        db.commit()
        check("the safety net does not recreate templates in a subdivision that has template rows (archived ones count)",
              WL.seed_new_subdivisions(db.connection()) == [] and len(rows(db, sub_b_id)) == 4)
        db.rollback()
        # a subdivision created outside the app (raw SQL: no mapper event)
        sub_c_id = db.execute(Subdivision.__table__.insert().values(subdivision_name="Gamma Homes", barangay_id=1)).inserted_primary_key[0]
        db.commit()
        check("a subdivision created by raw SQL starts with no templates", len(rows(db, sub_c_id)) == 0)
        seeded = WL.seed_new_subdivisions(db.connection())
        db.commit()
        check("the startup safety net gives it its four templates", seeded == [sub_c_id] and len(rows(db, sub_c_id, "active")) == 4, seeded)
        check("...and runs again without adding more", WL.seed_new_subdivisions(db.connection()) == [] and len(rows(db, sub_c_id)) == 4)

        # ---- 4. Level compatibility with the seeded templates --------------------------------------------------------------
        a_notice = next(t for t in rows(db, sub_a_id, "active") if t.warning_level == "Notice")
        a_final = next(t for t in rows(db, sub_a_id, "active") if t.warning_level == "Final Notice / Escalation")
        a_second = next(t for t in rows(db, sub_a_id, "active") if t.warning_level == "2nd Warning")
        resolve = lambda tid, level: WL.resolve_template_for_issuance(db, sub_a_id, tid, level)  # noqa: E731
        check("the Notice template is refused for the complaint flow's 1st Warning letter", refused(lambda: resolve(a_notice.template_id, "1st Warning"), 409))
        check("the Final Notice template is refused for the complaint flow's 2nd Warning letter", refused(lambda: resolve(a_final.template_id, "2nd Warning"), 409))
        check("the 2nd Warning template works for a 2nd Warning, and the owner flow can use every level",
              resolve(a_second.template_id, "2nd Warning")[0].template_id == a_second.template_id
              and all(resolve(next(t for t in rows(db, sub_a_id, "active") if t.warning_level == lv).template_id, lv) for lv in LEVELS))

        # ---- 5. The cleanup script ---------------------------------------------------------------------------------------
        sid = sub_a_id
        keep_used = WarningLetterTemplate(subdivision_id=sid, name="Old used letter", status="active", source_type="editor", is_default=False)
        dupe1 = WarningLetterTemplate(subdivision_id=sid, name="Old duplicate", status="archived", source_type="editor", is_default=False)
        dupe2 = WarningLetterTemplate(subdivision_id=sid, name="Old duplicate", status="active", source_type="editor", is_default=False)
        upload = WarningLetterTemplate(subdivision_id=sid, name="Uploaded reference", status="archived", source_type="docx_import", is_default=False)
        db.add_all([keep_used, dupe1, dupe2, upload])
        db.flush()
        for tpl in (keep_used, dupe1, dupe2, upload):
            ver = WarningLetterTemplateVersion(template_id=tpl.template_id, version_number=1, subject_template="S {{resident_name}}",
                                               body_template="Body {{resident_name}} for the old template.", placeholders_used=["resident_name"],
                                               source_docx_bytes=b"PKdocx" if tpl is upload else None)
            db.add(ver)
            db.flush()
            tpl.current_version_id = ver.version_id
        used_ver = db.get(WarningLetterTemplateVersion, keep_used.current_version_id)
        used_ver_id = used_ver.version_id
        letter = GeneratedWarningLetter(warning_reference="WARN-TEST-0001", subdivision_id=sid, case_reference="SS-2026-0001", recipient_name="Resident",
                                        warning_level="1st Warning", template_id=keep_used.template_id, template_name=keep_used.name,
                                        template_version_id=used_ver_id, template_version_number=1, rendered_subject="S", rendered_body="B",
                                        rendered_html="<p>B</p>", issued_by_name="Leader")
        db.add(letter)
        db.commit()
        letter_id, used_id, d1, d2, up = letter.letter_id, keep_used.template_id, dupe1.template_id, dupe2.template_id, upload.template_id

        snapshot = lambda: sorted((t.template_id, t.status, t.is_default) for t in db.query(WarningLetterTemplate).all())  # noqa: E731
        before = snapshot()
        db.close()
        db = SessionLocal()
        check("dry run: nothing changes", run_script("--subdivisions", str(sid), "--delete", f"{d1},{d2}", "--archive", f"{used_id},{up}") == 0 and snapshot() == before)
        check("--apply without a backup is refused and changes nothing", run_script("--delete", f"{d1}", "--apply") != 0 and snapshot() == before)
        fake = os.path.join(tempfile.mkdtemp(), "bad.sql")
        open(fake, "w").write("not a backup" * 200)
        check("--apply with a file that is not a real backup is refused and changes nothing", run_script("--delete", f"{d1}", "--apply", "--backup", fake) != 0 and snapshot() == before)
        good = os.path.join(tempfile.mkdtemp(), "good.sql")
        open(good, "w").write("-- dump\n" + "".join(f"CREATE TABLE `{t}` (id int);\n" for t in
                              ("warning_letter_templates", "warning_letter_template_versions", "generated_warning_letters")) + "x" * 1200 + "\n-- Dump completed on now\n")
        check("a template an issued letter uses is never deleted: the whole run is refused, nothing changes",
              run_script("--delete", f"{d1},{used_id}", "--apply", "--backup", good) != 0 and snapshot() == before)

        check("apply (verified backup): runs to the end", run_script("--subdivisions", str(sid), "--delete", f"{d1},{d2}", "--archive", f"{used_id},{up}", "--apply", "--backup", good) == 0)
        db.expire_all()
        check("...the unreferenced duplicates are deleted, with their versions",
              db.get(WarningLetterTemplate, d1) is None and db.get(WarningLetterTemplate, d2) is None
              and db.query(WarningLetterTemplateVersion).filter(WarningLetterTemplateVersion.template_id.in_([d1, d2])).count() == 0)
        used = db.get(WarningLetterTemplate, used_id)
        check("...the template the letter uses is kept, archived, with its version", used is not None and used.status == "archived" and db.get(WarningLetterTemplateVersion, used_ver_id) is not None)
        check("...the uploaded reference template is kept, archived, DOCX intact",
              db.get(WarningLetterTemplate, up).status == "archived" and db.query(WarningLetterTemplateVersion).filter(WarningLetterTemplateVersion.template_id == up).first().source_docx_bytes == b"PKdocx")
        kept = db.get(GeneratedWarningLetter, letter_id)
        check("...the issued letter is untouched, still pointing at its template and version",
              kept is not None and kept.template_id == used_id and kept.template_version_id == used_ver_id and kept.warning_reference == "WARN-TEST-0001")
        check("...the subdivision named keeps exactly its four active standard templates (none added twice)", len(rows(db, sid, "active")) == 4)
        check("...a subdivision that was not named is not given new templates (Beta archived its four on purpose)",
              len(rows(db, sub_b_id)) == 4 and len(rows(db, sub_b_id, "active")) == 0)
        after_first = snapshot()
        check("running it again changes nothing (idempotent)", run_script("--subdivisions", str(sid), "--delete", f"{d1},{d2}", "--archive", f"{used_id},{up}", "--apply", "--backup", good) == 0 and snapshot() == after_first)
        check("naming a subdivision that does not exist is refused", run_script("--subdivisions", "9999", "--apply", "--backup", good) != 0 and snapshot() == after_first)
        # the real-world case: an old ACTIVE template for a level is deleted, and that level must still end with a standard template
        sub_e_id = db.execute(Subdivision.__table__.insert().values(subdivision_name="Epsilon Homes", barangay_id=1)).inserted_primary_key[0]
        old = WarningLetterTemplate(subdivision_id=sub_e_id, name="Old second warning", warning_level="2nd Warning", status="active", source_type="editor", is_default=False)
        db.add(old)
        db.flush()
        oldv = WarningLetterTemplateVersion(template_id=old.template_id, version_number=1, subject_template="S", body_template="Old second warning text.")
        db.add(oldv)
        db.flush()
        old.current_version_id = oldv.version_id
        db.commit()
        old_id = old.template_id
        code = run_script("--subdivisions", str(sub_e_id), "--delete", str(old_id), "--apply", "--backup", good)
        db.expire_all()
        check("an old active 2nd Warning template is deleted by the script and the standard four are added (the level is not skipped)",
              code == 0 and db.query(WarningLetterTemplate).filter(WarningLetterTemplate.name == "Old second warning").count() == 0   # by name: SQLite reuses ids
              and sorted(t.warning_level for t in rows(db, sub_e_id, "active")) == sorted(LEVELS),
              (code, [(t.template_id, t.warning_level, t.status) for t in rows(db, sub_e_id)]))
        check("...and running it again changes nothing", run_script("--subdivisions", str(sub_e_id), "--delete", str(old_id), "--apply", "--backup", good) == 0 and len(rows(db, sub_e_id)) == 4)

        print(f"\nALL {PASSED} CHECKS PASSED SUCCESSFULLY!")
    finally:
        db.close()


if __name__ == "__main__":
    main()
