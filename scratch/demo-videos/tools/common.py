B="http://127.0.0.1:5180"
PW="DemoPass#2026"
def login_leader(pg):
    pg.goto(B+"/login"); pg.wait_for_selector('input[type=password]')
    pg.fill('input[type=email]',"demo.leader@straysafe.demo"); pg.fill('input[type=password]',PW)
    pg.keyboard.press('Enter'); pg.wait_for_url('**/dashboard'); pg.wait_for_timeout(1500)
def login_res(pg,email="demo.resident@straysafe.demo"):
    pg.goto(B+"/resident-app/login"); pg.wait_for_selector('input[type=password]')
    pg.fill('input[placeholder*=example]',email); pg.fill('input[type=password]',PW)
    pg.keyboard.press('Enter'); pg.wait_for_url('**/home'); pg.wait_for_timeout(1500)
