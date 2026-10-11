"""Run selected existing regression scripts in separate processes with isolated DBs."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[1]
backend = root / 'backend'
temp_root = root / 'scratch' / 'document_audit_tmp'
temp_root.mkdir(exist_ok=True)
tempfile.tempdir = str(temp_root)
names = [
    'test_session_security.py', 'test_report_privacy.py',
    'test_case_gating.py', 'test_case_closure.py', 'test_merge_pet_identity.py',
    'test_pet_owner_confirmation.py', 'test_owner_return.py',
    'test_adoption_authority.py', 'test_adoption_catalog_handover.py',
    'test_adoption_certificate.py', 'test_admin_001_users_rbac.py',
    'test_ai_confidence.py', 'test_ai_pipeline.py', 'test_ai_worker.py',
    'test_check_test_set.py', 'test_evaluate_ai.py',
]
env = dict(os.environ, PYTHONIOENCODING='utf-8', OTP_DEBUG='false',
           GEMINI_API_KEY='', SMTP_HOST='', SMTP_USER='', SMTP_PASSWORD='',
           TEMP=str(temp_root), TMP=str(temp_root), TMPDIR=str(temp_root))
env['DATABASE_URL'] = 'sqlite:///' + str(Path(tempfile.mkdtemp()) / 'audit_fallback.db')
env['JWT_SECRET_KEY'] = 'isolated-document-audit-test-secret-20261011'
results = []
for name in names:
    try:
        p = subprocess.run([sys.executable, str(backend / 'tests' / name)],
                           cwd=backend, env=env, capture_output=True,
                           text=True, encoding='utf-8', errors='replace', timeout=90)
        output = p.stdout + p.stderr
        (root / 'scratch' / ('document_audit_' + name + '.log')).write_text(output, encoding='utf-8')
        row = dict(script=name, exit_code=p.returncode,
                   pass_lines=output.count('[PASS]'), fail_lines=output.count('[FAIL]'))
        if p.returncode or row['fail_lines']:
            row['failure_tail'] = output[-3500:]
    except subprocess.TimeoutExpired:
        row = dict(script=name, exit_code='timeout')
    results.append(row)
    print(json.dumps({k: v for k, v in row.items() if k != 'failure_tail'}), flush=True)
(root / 'scratch' / 'document_audit_test_results.json').write_text(
    json.dumps(results, indent=2), encoding='utf-8')
