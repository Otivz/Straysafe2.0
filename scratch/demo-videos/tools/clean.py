import os,sys
sys.path.insert(0,'.')
from dotenv import load_dotenv
load_dotenv('../.env')
os.environ['DATABASE_URL']=os.environ['DATABASE_URL'].rsplit('/',1)[0]+'/straysafe_demo'
assert os.environ['DATABASE_URL'].endswith('/straysafe_demo')
from app.database import SessionLocal
from sqlalchemy import text
db=SessionLocal()
r=db.execute(text("delete from users where email not like '%@straysafe.demo'")); db.commit(); print('removed',r.rowcount)
for r in db.execute(text("select user_id,email from users")): print(tuple(r))
