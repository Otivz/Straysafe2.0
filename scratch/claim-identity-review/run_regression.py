import sys,runpy,os,tempfile
from pathlib import Path
import sqlalchemy
from sqlalchemy.pool import StaticPool
from unittest.mock import patch
os.environ['DATABASE_URL']='sqlite://'
sys.path.insert(0,str(Path('backend').resolve()))
tempfile.tempdir=str(Path('scratch/claim-identity-review').resolve())
original=sqlalchemy.create_engine
sqlalchemy.create_engine=lambda *a,**k:original('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
with patch('app.utils.ai_jobs.enqueue_backfill',return_value=None):
    runpy.run_path(sys.argv[1],run_name='__main__')
