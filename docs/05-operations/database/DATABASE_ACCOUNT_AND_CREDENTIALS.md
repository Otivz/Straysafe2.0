# Database account and credential rotation

- **Status:** Current. Written on 2026-11-10 after the repository preparation findings. The finding about the shared MySQL account is a measured fact of the developer's machine, described here without naming the other projects.
- **Purpose:** How StraySafe connects to MySQL, how to change its database password without breaking anything else on the machine, and how the published demo credentials were handled.
- **Not covered:** the application's own accounts (Residents, Leaders): see [setup.md](../../../setup.md), section 4.

## What reads the database password

- The backend and the AI worker read **`DATABASE_URL`** in the root `.env` (`backend/app/database/session.py`). It is the only database setting the code reads.
- `DB_HOST`, `DB_USER`, `DB_PASSWORD` and `DB_NAME` appear in `.env.example` (and often in `.env`), but **no code reads them**. A copy of the password there is a second place for the same secret: delete `DB_PASSWORD` instead of keeping it in step.
- Anything else that stores the same account's password must be updated when it changes: saved connections in MySQL Workbench or another client, backup scripts, and any other project that uses the same account.
- The backend and the worker read `.env` only when they start. Restart both after a change.

## The shared-account rule

Before changing any MySQL account's password, find out who else uses it. On a development machine the application usually connects as `root`, the MySQL administrator: it can reach every database, and other projects on the same server often use it with the same password. Changing it for StraySafe's sake would break them.

**Finding, 2026-11-10 (the developer's machine).** StraySafe connected as `root@localhost`. That account has privileges on every database, the server holds 11 other databases, and another project's database had live `root` connections at the time. The account is therefore **shared, and its password was not changed**. The safe way to give StraySafe a credential of its own is a dedicated account.

## The helper

`C:\StraySafe-db-backups\tools\straysafe_db_account.py` is a local tool kept outside the repository, next to the backups. It is not part of the application, and nothing runs it automatically. It never takes a password from an argument, a file or the environment and never prints one: you type the new password yourself, twice, hidden. `create` and `rotate` refuse to run through a pipe or a chat tool.

| Command | What it does |
|---|---|
| `check` (read only) | Which account the application uses; whether it is shared, and why; the `.env` settings that nothing reads any more; whether any published demo credential is still accepted by a StraySafe account. |
| `create` | Creates a **dedicated** account (default name `straysafe_app`) with privileges on `straysafe_subdivision` only, points `.env` at it, checks that the application's own configuration connects with it, and undoes everything if any step fails. `root`, its password, and every other database and project are not touched. |
| `rotate` | Changes the password of the account StraySafe uses, **only if that account is exclusive** to StraySafe. It refuses `root` and any account that can reach other databases. |

The write paths were tested against a fake MySQL server and temporary `.env` files (54 checks, including every refusal, every injected failure and every rollback); against the real server only `check` was run. Before `.env` is changed, a copy is saved in `C:\StraySafe-db-backups\env-backups` (readable only by your Windows user). It holds the **old** password: delete it once everything works.

## Procedure: give StraySafe its own MySQL account

Run these in PowerShell or the VS Code terminal. `<repository>` is the project folder.

```powershell
& "<repository>\.venv\Scripts\python.exe" "C:\StraySafe-db-backups\tools\straysafe_db_account.py" check
& "<repository>\.venv\Scripts\python.exe" "C:\StraySafe-db-backups\tools\straysafe_db_account.py" create
```

1. **`check`** first. It should say the current account is shared.
2. **`create`**: press Enter to keep the name `straysafe_app` (or type another), type the new password twice, then type `CREATE`. The password needs at least 12 characters with an uppercase letter, a lowercase letter, a number and a special character; it may not be the current one.
3. **Restart** the backend and the AI worker (Ctrl+C, then start them again as usual). They read `.env` only at start-up.
4. **`check` again.** It should now say the account looks exclusive, that no obsolete setting is left in `.env`, and that none of the StraySafe accounts accepts a published demo credential.
5. Sign in to the app once to confirm, then delete the `.env` copy in `env-backups`.
6. Later, `rotate` changes that account's password the same way.

If a step fails, the tool undoes its own changes and says so. To undo by hand: copy the saved copy over `.env`, and run `DROP USER 'straysafe_app'@'localhost';` as the administrator.

## Manual alternative

At the `mysql` prompt, as the administrator (the `mysql` client does not keep statements that contain `IDENTIFIED` in its history by default):

```sql
CREATE USER 'straysafe_app'@'localhost' IDENTIFIED BY '<type the password here>';
GRANT ALL PRIVILEGES ON `straysafe_subdivision`.* TO 'straysafe_app'@'localhost';
```

Then edit `.env`: put the new user and password in `DATABASE_URL`, set `DB_USER`, and delete `DB_PASSWORD`. In `DATABASE_URL` every `@`, `:`, `/`, `#`, `?`, `%`, `&`, `+` and space in the password must be percent-encoded (`%40`, `%3A`, `%2F`, `%23`, `%3F`, `%25`, `%26`, `%2B`, `%20`), or the connection fails; a password made only of letters and digits avoids the problem. Restart the backend and the worker and check that signing in works.

## The administrator account's own password

The password of `root` is a separate decision with its own checklist. List every project, tool and saved connection that uses it (other projects' configuration, MySQL Workbench, XAMPP or phpMyAdmin settings). Change it at the `mysql` prompt (`ALTER USER 'root'@'localhost' IDENTIFIED BY '<type the password here>';`). Then update every item on the list. Do it in one sitting: until then those projects keep working with the old password. StraySafe no longer depends on it once `create` has been run.

## Published demo credentials

The demo accounts of the old seed (one shared default password, its hash and personal e-mail addresses) were published in Git history before they were removed from the files on 2026-11-10. History was not rewritten, so they are **treated as exposed**. What keeps them harmless:

- no StraySafe database holds an account that uses them (`check` verifies this: on 2026-11-10, none of the 3 accounts accepted the published password, used a published e-mail address or carried a published hash);
- no setting configures them, and no script has a default for them (`seed_admin.py` asks for what it needs);
- if the same password was ever used anywhere else, change it there.

Settings that nothing reads since 2026-11-10 and that should be deleted from the local `.env`: `CITIZEN_EMAIL`, `BRGY_STAFF_EMAIL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SUBD_LEADER_EMAIL` and `SEED_PASSWORD`. `check` lists the ones that are still there, and says if any of them still equals the published password.
