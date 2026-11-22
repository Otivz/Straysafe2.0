import os,re
from dotenv import load_dotenv
load_dotenv('../.env')
from sqlalchemy import create_engine,text
u=os.environ['DATABASE_URL']; base=u.rsplit('/',1)[0]
e=create_engine(base, isolation_level="AUTOCOMMIT")
with e.connect() as c:
    c.execute(text("DROP DATABASE IF EXISTS straysafe_demo"))
    c.execute(text("CREATE DATABASE straysafe_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
e=create_engine(base+'/straysafe_demo', isolation_level="AUTOCOMMIT")
sql=open('../Database3.4_subdivision.sql',encoding='utf8').read()
sql=re.sub(r'CREATE DATABASE[^;]*;','',sql); sql=re.sub(r'USE `[^`]*`;','',sql)
sql=re.sub(r'^--.*$','',sql,flags=re.M)
stmts=[s.strip() for s in re.split(r';\s*\n',sql) if s.strip()]
with e.raw_connection() as raw:
    cur=raw.cursor()
    for s in stmts:
        try: cur.execute(s)
        except Exception as ex: print('ERR',str(ex)[:100])
print('schema ok')
