"""
Clean up warning letter templates and give each subdivision its own four standard templates (one per warning level).

Safe by design:
  * DRY RUN by default: it prints what it would do and changes nothing. Add --apply to do it.
  * --apply needs --backup <file>: a database backup that must already exist (the script checks it is a real dump of the three
    warning letter tables) before it changes anything.
  * It NEVER deletes a template that an issued letter points to (by template or by one of its versions); such an id is refused and
    the script stops without changing anything. Issued letters, their snapshots and audit logs are never touched.
  * Safe to run more than once: ids that are already gone are skipped, templates already archived stay archived, and a level that
    already has an active template is not seeded again.
  * One transaction: if anything fails, nothing is changed.

Usage (from the backend folder):
  python scripts/clean_warning_templates.py --subdivisions 1 --delete 2,3,4,5,6,8 --archive 1,7                       # dry run
  python scripts/clean_warning_templates.py --subdivisions 1 --delete 2,3,4,5,6,8 --archive 1,7 --apply \
      --backup ../database_backups/warning_templates_before_cleanup_2026-11-18.sql
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal  # noqa: E402
from app.models.user import Subdivision  # noqa: E402
from app.models.warning_letter import GeneratedWarningLetter, WarningLetterTemplate, WarningLetterTemplateVersion  # noqa: E402
from app.services import warning_letters as WL  # noqa: E402
from app.utils.audit import log_activity  # noqa: E402

TABLES = ("warning_letter_templates", "warning_letter_template_versions", "generated_warning_letters")


def ids(text: str) -> list[int]:
    return [int(x) for x in text.split(",") if x.strip()]


def check_backup(path: str) -> None:
    if not os.path.isfile(path) or os.path.getsize(path) < 1000:
        sys.exit(f"Backup not found or empty: {path}. Nothing was changed.")
    with open(path, encoding="utf-8", errors="replace") as fh:
        text = fh.read()
    missing = [t for t in TABLES if f"CREATE TABLE `{t}`" not in text]
    if missing or "Dump completed" not in text:
        sys.exit(f"Backup {path} is not a complete dump of {', '.join(TABLES)}. Nothing was changed.")
    print(f"Backup verified: {path} ({os.path.getsize(path):,} bytes, all three tables, dump completed).")


def references(db, tpl: WarningLetterTemplate) -> list[int]:
    version_ids = [v.version_id for v in db.query(WarningLetterTemplateVersion).filter(WarningLetterTemplateVersion.template_id == tpl.template_id)]
    q = db.query(GeneratedWarningLetter.letter_id).filter(GeneratedWarningLetter.template_id == tpl.template_id)
    found = {r[0] for r in q}
    if version_ids:
        found |= {r[0] for r in db.query(GeneratedWarningLetter.letter_id).filter(GeneratedWarningLetter.template_version_id.in_(version_ids))}
    return sorted(found)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--delete", default="", help="template ids to delete (only if no issued letter references them)")
    ap.add_argument("--archive", default="", help="template ids to keep but archive")
    ap.add_argument("--subdivisions", default="", help="subdivision ids to give the four standard templates. Only the ones you name are seeded, "
                    "so a subdivision that archived its templates on purpose is never given new ones by accident")
    ap.add_argument("--apply", action="store_true", help="make the changes (default is a dry run)")
    ap.add_argument("--backup", default="", help="path of the verified backup (required with --apply)")
    args = ap.parse_args()

    if args.apply:
        if not args.backup:
            sys.exit("--apply needs --backup <file>. Nothing was changed.")
        check_backup(args.backup)
    print(("APPLYING" if args.apply else "DRY RUN (nothing will be changed)") + "\n")

    db = SessionLocal()
    try:
        # 0. Check every delete id first: one referenced template stops the whole run.
        to_delete, blocked = [], []
        for tid in ids(args.delete):
            tpl = db.get(WarningLetterTemplate, tid)
            if tpl is None:
                print(f"  delete #{tid}: already gone, skipped")
                continue
            refs = references(db, tpl)
            if refs:
                blocked.append((tid, refs))
            else:
                to_delete.append(tpl)
        if blocked:
            for tid, refs in blocked:
                print(f"  REFUSED #{tid}: issued letters {refs} use it. It must be kept (archive it instead).")
            sys.exit("Nothing was changed.")

        # 1. Archive what is kept.
        for tid in ids(args.archive):
            tpl = db.get(WarningLetterTemplate, tid)
            if tpl is None:
                print(f"  archive #{tid}: not found, skipped")
            elif tpl.status == "archived" and not tpl.is_default:
                print(f"  archive #{tid} '{tpl.name}': already archived, kept as it is")
            else:
                print(f"  archive #{tid} '{tpl.name}' (kept, with its versions and issued letters)")
                if args.apply:
                    tpl.status, tpl.is_default = "archived", False
                    log_activity(db=db, action="WARNING_TEMPLATE_ARCHIVED", target_table="warning_letter_templates", target_id=tid,
                                 description=f"Template '{tpl.name}' archived by the warning template cleanup (kept for history).", commit=False)

        # 2. Delete the obsolete, unreferenced ones.
        for tpl in to_delete:
            n_versions = db.query(WarningLetterTemplateVersion).filter(WarningLetterTemplateVersion.template_id == tpl.template_id).count()
            print(f"  delete #{tpl.template_id} '{tpl.name}' ({tpl.warning_level or 'all levels'}, {tpl.status}, {n_versions} version(s), no issued letters)")
            if args.apply:
                log_activity(db=db, action="WARNING_TEMPLATE_DELETED", target_table="warning_letter_templates", target_id=tpl.template_id,
                             description=f"Obsolete template '{tpl.name}' deleted by the warning template cleanup (backed up first).", commit=False)
                db.delete(tpl)

        # 3. Seed last, so it sees the final state: an old template that was just archived or deleted no longer counts as "already there".
        sub_ids = ids(args.subdivisions)
        if not sub_ids:
            print("  no --subdivisions given: no standard templates are added")
        going = {t.template_id for t in to_delete} | set(ids(args.archive))
        for sub_id in sub_ids:
            if db.get(Subdivision, sub_id) is None:
                sys.exit(f"Subdivision {sub_id} does not exist. Nothing was changed.")
            if args.apply:
                db.flush()
                created = WL.seed_standard_templates(db.connection(), sub_id)
                names = [i["name"] for i in WL.load_standard_templates() if db.query(WarningLetterTemplate).filter(
                    WarningLetterTemplate.template_id.in_(created), WarningLetterTemplate.warning_level == i["warning_level"]).first()] if created else []
            else:
                have = {t.warning_level for t in db.query(WarningLetterTemplate).filter(
                    WarningLetterTemplate.subdivision_id == sub_id, WarningLetterTemplate.status == "active",
                    ~WarningLetterTemplate.template_id.in_(going or [0]))}
                names = [i["name"] for i in WL.load_standard_templates() if i["warning_level"] not in have]
            print(f"  subdivision {sub_id}: " + (f"adds {len(names)} standard template(s): {', '.join(names)}" if names else "already has its standard templates, nothing to add"))
        db.expire_all()

        if args.apply:
            db.commit()
            print("\nDone. Committed.")
        else:
            db.rollback()
            print("\nDry run finished: nothing was changed. Add --apply --backup <file> to apply.")

        print("\nTemplates now:" if args.apply else "\nTemplates today:")
        for t in db.query(WarningLetterTemplate).order_by(WarningLetterTemplate.template_id).all():
            print(f"  #{t.template_id} sub={t.subdivision_id} '{t.name}' level={t.warning_level or 'all'} {t.status} suggested={t.is_default}")
    except SystemExit:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
