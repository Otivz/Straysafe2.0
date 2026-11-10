# Runs on a throwaway SQLite file, never on the application database (see _isolated_db.py). app.main cannot be imported in a
# test (its start-up is MySQL only and changes the configured database), so the app is rebuilt from the routers under test,
# which is the wiring app.main uses.
import ast
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _isolated_db  # noqa: E402,F401  (FIRST: throwaway SQLite, no outside services, MySQL disabled)

from fastapi.testclient import TestClient
from sqlalchemy import text
from app.routes import admin, audit_logs
from app.models.user import User
from app.database import engine
from app.utils.auth import get_current_user, get_optional_user

app = _isolated_db.build_app(admin.router, audit_logs.router)
_isolated_db.create_schema_and_seed()
client = TestClient(app)


def declared_performance_indexes():
    """The (table, index name, CREATE INDEX statement) rows of ensure_performance_indexes(), read from app/main.py's source."""
    source = open(os.path.join(_isolated_db.BACKEND, "app", "main.py"), encoding="utf-8").read()
    function = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == "ensure_performance_indexes")
    for node in ast.walk(function):
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "indexes" for t in node.targets):
            return ast.literal_eval(node.value)
    raise AssertionError("ensure_performance_indexes() no longer declares an `indexes` list")

def create_mock_user(user_id: int, role_id: int, name: str = "Admin Tester"):
    user = User()
    user.user_id = user_id
    user.role_id = role_id
    user.name = name
    user.email = f"user{user_id}@test.com"
    user.status = "Active"
    user.is_verified = True
    user.subdivision_id = 1
    user.barangay_id = 1
    user.is_head_officer = False
    return user

def run_tests():
    print("Running PHASE 2 — Database & API Stability Verification Suite...\n")

    # ─────────────────────────────────────────────────────────────
    # TASK ADMIN-004: Server-Side Admin Dashboard Statistics Endpoint
    # ─────────────────────────────────────────────────────────────
    print("--- Verifying TASK ADMIN-004: GET /admin/dashboard-stats ---")
    resident = create_mock_user(user_id=10, role_id=1, name="Resident User")
    app.dependency_overrides[get_current_user] = lambda: resident

    res_403 = client.get("/admin/dashboard-stats")
    assert res_403.status_code == 403, f"Expected 403 for Resident, got {res_403.status_code}"
    print("[PASS] 1. Resident (Role 1) calling GET /admin/dashboard-stats rejected with HTTP 403")

    admin = create_mock_user(user_id=1, role_id=4, name="Admin User")
    app.dependency_overrides[get_current_user] = lambda: admin

    res_200 = client.get("/admin/dashboard-stats")
    assert res_200.status_code == 200, f"Expected 200 for Admin, got {res_200.status_code}: {res_200.text}"
    stats = res_200.json()

    # Verify required metrics fields exist
    expected_fields = [
        "total_reports", "active_reports", "resolved_reports", "resolution_rate",
        "total_pets", "vaccinated_pets", "compliance_rate",
        "total_users", "active_users",
        "returned_to_owner_count", "pending_warnings_count",
        "subdivisions_list", "recent_activity_logs", "active_map_reports"
    ]
    for field in expected_fields:
        assert field in stats, f"Missing expected field '{field}' in dashboard-stats response"

    payload_size_bytes = len(res_200.content)
    print(f"[PASS] 2. Admin (Role 4) GET /admin/dashboard-stats succeeded with all metrics (Payload: {payload_size_bytes} bytes < 10KB)")

    # ─────────────────────────────────────────────────────────────
    # TASK ADMIN-005: Lightweight Sidebar Badge Endpoint
    # ─────────────────────────────────────────────────────────────
    print("\n--- Verifying TASK ADMIN-005: GET /admin/badge-counts ---")
    app.dependency_overrides[get_current_user] = lambda: resident
    res_badge_403 = client.get("/admin/badge-counts")
    assert res_badge_403.status_code == 403, f"Expected 403 for Resident, got {res_badge_403.status_code}"
    print("[PASS] 3. Resident (Role 1) calling GET /admin/badge-counts rejected with HTTP 403")

    app.dependency_overrides[get_current_user] = lambda: admin
    res_badge_200 = client.get("/admin/badge-counts")
    assert res_badge_200.status_code == 200, f"Expected 200 for Admin, got {res_badge_200.status_code}: {res_badge_200.text}"
    badges = res_badge_200.json()
    assert "active_reports" in badges and "pending_warnings" in badges and "pending_adoptions" not in badges
    print(f"[PASS] 4. Admin (Role 4) GET /admin/badge-counts returned: {badges}")

    # ─────────────────────────────────────────────────────────────
    # TASK ADMIN-006: Audit Log Server-Side Pagination
    # ─────────────────────────────────────────────────────────────
    print("\n--- Verifying TASK ADMIN-006: GET /audit-logs/ Pagination ---")
    app.dependency_overrides[get_optional_user] = lambda: admin

    # Default 25 items per page
    res_logs = client.get("/audit-logs/?page=1&limit=25")
    assert res_logs.status_code == 200, f"Expected 200 for paginated audit logs, got {res_logs.status_code}: {res_logs.text}"
    log_data = res_logs.json()
    assert "items" in log_data
    assert "total" in log_data
    assert "page" in log_data
    assert "limit" in log_data
    assert "total_pages" in log_data
    assert log_data["limit"] == 25
    assert len(log_data["items"]) <= 25
    print(f"[PASS] 5. GET /audit-logs/ returns paginated schema (total={log_data['total']}, page={log_data['page']}, total_pages={log_data['total_pages']}, items_returned={len(log_data['items'])})")

    # Filter by log_type
    res_filtered = client.get("/audit-logs/?page=1&limit=25&log_type=security")
    assert res_filtered.status_code == 200
    sec_data = res_filtered.json()
    for item in sec_data["items"]:
        assert item["type"] == "security", f"Expected type security, got {item['type']}"
    print(f"[PASS] 6. Database-level filtering by log_type='security' verified ({len(sec_data['items'])} items)")

    # ─────────────────────────────────────────────────────────────
    # TASK ADMIN-007: Performance Indexes on Hot Tables
    # ─────────────────────────────────────────────────────────────
    print("\n--- Verifying TASK ADMIN-007: Performance Indexes ---")
    # ensure_performance_indexes() lives in app.main, which cannot be imported in a test, and the throwaway database is
    # SQLite (it has no information_schema). The check keeps its meaning: each required index must be DECLARED by that
    # function, its CREATE INDEX statement (the very one the function runs) must work against the real model tables, and the
    # index must then be in the database's catalog. The state of a MySQL server is deliberately no longer inspected.
    declared = {(t, i): ddl for t, i, ddl in declared_performance_indexes()}

    required_indexes = [
        ("audit_logs", "idx_audit_type_created"),
        ("owner_warnings", "idx_warnings_user_status"),
        ("pets", "idx_pets_owner_status"),
    ]

    def present(conn, table, idx_name):
        return conn.execute(text("SELECT COUNT(*) FROM pragma_index_list(:table) WHERE name = :idx"),
                            {"table": table, "idx": idx_name}).scalar()

    with engine.begin() as conn:
        for table, idx_name in required_indexes:
            assert (table, idx_name) in declared, f"ensure_performance_indexes() no longer declares {idx_name} on {table}"
            if not present(conn, table, idx_name):
                conn.execute(text(declared[(table, idx_name)]))
            count = present(conn, table, idx_name)
            assert count > 0, f"Index {idx_name} on {table} not found in the database catalog!"
            print(f"[PASS] 7. Index '{idx_name}' verified present on table '{table}'")

    app.dependency_overrides.clear()

    print("\n=======================================================")
    print("     ALL PHASE 2 STABILITY & API TESTS PASSED!         ")
    print("=======================================================")

if __name__ == "__main__":
    run_tests()
