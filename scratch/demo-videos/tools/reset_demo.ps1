$py="C:\Users\user\Straysafe2.0\.venv\Scripts\python.exe"
$S="C:\Users\user\AppData\Local\Temp\claude\43068804f5eb6323\e13ab15f-cab2-41ae-be75-49a7daf5317e\scratchpad"
# stop the demo API on 8100 only
Get-NetTCPConnection -LocalPort 8100 -State Listen -ErrorAction SilentlyContinue | % { Stop-Process -Id $_.OwningProcess -Force }
Start-Sleep 2
Set-Location C:\Users\user\Straysafe2.0\backend
& $py -I "$S\mkdemo.py"
& $py -I "$env:TEMP\applysql.py" migrations/2026-11-12_lost_found_alerts.sql migrations/2026-11-13_complaint_management.sql
$env:DATABASE_URL = (& $py -I -c "import os;from dotenv import load_dotenv;load_dotenv(r'C:\Users\user\Straysafe2.0\.env');print(os.environ['DATABASE_URL'].rsplit('/',1)[0]+'/straysafe_demo')")
Start-Process -FilePath $py -ArgumentList "-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8100" -WorkingDirectory C:\Users\user\Straysafe2.0\backend -RedirectStandardOutput "$env:TEMP\demo_api.log" -RedirectStandardError "$env:TEMP\demo_api.err" -WindowStyle Hidden
for($i=0;$i -lt 60;$i++){ Start-Sleep 3; try { $r=Invoke-WebRequest http://127.0.0.1:8100/ -UseBasicParsing -TimeoutSec 3; break } catch {} }
Write-Output "api up"
& $py -I "$env:TEMP\seed.py"
& $py -I "$S\clean.py"
