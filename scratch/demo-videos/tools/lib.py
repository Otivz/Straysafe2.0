import time, json, hashlib, wave, subprocess, os, math
from playwright.sync_api import sync_playwright
HERE=os.path.dirname(os.path.abspath(__file__))
CURSOR_JS = """
(() => {
  const mk = () => {
    if (document.getElementById('__cur')) return;
    const st = document.createElement('style');
    st.textContent = `#__cur{position:fixed;left:0;top:0;width:26px;height:26px;margin:-4px 0 0 -4px;z-index:2147483647;pointer-events:none;transition:transform .05s linear}
    #__cur svg{filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
    .__rip{position:fixed;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:3px solid #2f7bff;z-index:2147483646;pointer-events:none;animation:__rip .55s ease-out forwards}
    @keyframes __rip{to{transform:scale(4.2);opacity:0}}`;
    document.documentElement.appendChild(st);
    const c = document.createElement('div'); c.id='__cur';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M3 2l7 18 2.6-7.4L20 10z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    c.style.transform='translate(-100px,-100px)';
    document.documentElement.appendChild(c);
    addEventListener('mousemove', e => { c.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; }, true);
    addEventListener('mousedown', e => { const r=document.createElement('div'); r.className='__rip'; r.style.left=e.clientX+'px'; r.style.top=e.clientY+'px'; document.documentElement.appendChild(r); setTimeout(()=>r.remove(),600); }, true);
  };
  if (document.documentElement) mk(); else addEventListener('DOMContentLoaded', mk);
})();
"""

def tts_all(narr, voice="Microsoft Zira Desktop", rate=1):
    """narr: key->text. Returns key->(wav path, duration seconds). Offline Windows voice."""
    out={}; todo={}
    for k,t in narr.items():
        h=hashlib.md5((voice+str(rate)+t).encode()).hexdigest()[:12]
        p=os.path.join(HERE,'tts',f'{h}.wav'); out[k]=[p,0]
        if not os.path.exists(p): todo[p]=t
    if todo:
        jf=os.path.join(HERE,'tts','todo.json'); json.dump(todo,open(jf,'w',encoding='utf8'))
        ps=f"""Add-Type -AssemblyName System.Speech
$s=New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('{voice}'); $s.Rate={rate}
$d=Get-Content -Raw -Encoding UTF8 '{jf}' | ConvertFrom-Json
foreach($p in $d.PSObject.Properties){{ $s.SetOutputToWaveFile($p.Name); $s.Speak($p.Value); $s.SetOutputToNull() }}"""
        subprocess.run(['powershell','-NoProfile','-Command',ps],check=True)
    for k in out:
        w=wave.open(out[k][0]); out[k][1]=w.getnframes()/w.getframerate(); w.close()
    return out

class Stage:
    def __init__(self, narr, viewport, name, geo=True):
        self.tts=tts_all(narr); self.narr=narr; self.vp=viewport; self.name=name
        self.lines=[]; self.scenes=[]; self.say_end=0; self.pos=(viewport['width']//2, viewport['height']//2)
        self.pw=sync_playwright().start(); self.browser=self.pw.chromium.launch()
        self.vdir=os.path.join(HERE,'rec',name+'_'+time.strftime('%H%M%S'))
        kw=dict(viewport=viewport, record_video_dir=self.vdir, record_video_size=viewport)
        if geo: kw.update(geolocation={'latitude':14.8008,'longitude':121.0035}, permissions=['geolocation'])
        self.ctx=self.browser.new_context(**kw); self.ctx.add_init_script(CURSOR_JS)
        self.t0=time.time(); self.page=self.ctx.new_page(); self.pg=self.page
    def now(self): return time.time()-self.t0
    def mark(self,name): self.scenes.append((round(self.now(),2),name)); print(f'[{self.now():6.1f}] SCENE {name}',flush=True)
    def say(self,key):
        self.wait_say()
        d=self.tts[key][1]; self.lines.append((round(self.now(),2),key,round(d,2))); self.say_end=self.now()+d
        print(f'[{self.now():6.1f}] say {key} ({d:.1f}s)',flush=True)
    def wait_say(self,extra=0.35):
        r=self.say_end+extra-self.now()
        if r>0: time.sleep(r)
    def pause(self,s): time.sleep(s)
    def loc(self,t):
        return self.pg.locator(t) if isinstance(t,str) else t
    def glide(self,x,y):
        x0,y0=self.pos; dist=math.hypot(x-x0,y-y0); n=max(8,int(dist/18))
        for i in range(1,n+1):
            f=i/n; e=f*f*(3-2*f)
            self.pg.mouse.move(x0+(x-x0)*e,y0+(y-y0)*e); time.sleep(0.011)
        self.pos=(x,y)
    def click(self,t,pause=0.9,nth=None,pw=False,at=None):
        l=self.loc(t); l=l.first if nth is None else l.nth(nth)
        l.evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})"); time.sleep(0.35)
        b=l.bounding_box(); self.glide(b['x']+(at[0] if at else b['width']/2),b['y']+(at[1] if at else b['height']/2)); time.sleep(0.2)
        if pw: l.click()
        else:
            self.pg.mouse.down(); time.sleep(0.07); self.pg.mouse.up()
        time.sleep(pause)
    def type(self,t,text,delay=55,pause=0.5):
        self.click(t,pause=0.25); self.pg.keyboard.type(text,delay=delay); time.sleep(pause)
    def upload(self,button,path,pause=3):
        l=self.loc(button).first; l.evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})"); time.sleep(.4)
        b=l.bounding_box(); self.glide(b['x']+b['width']/2,b['y']+b['height']/2); time.sleep(.2)
        with self.pg.expect_file_chooser() as fc:
            self.pg.mouse.down(); time.sleep(.07); self.pg.mouse.up()
        fc.value.set_files(path); time.sleep(pause)
    def scroll(self,dy,steps=24,pause=0.6):
        self.pg.mouse.move(*self.pos)
        for i in range(steps): self.pg.mouse.wheel(0,dy/steps); time.sleep(0.02)
        time.sleep(pause)
    def goto_ready(self,url,selector,wait=1.2):
        self.pg.goto(url); self.pg.wait_for_selector(selector,state='visible',timeout=30000); time.sleep(wait)
    def goto(self,url,wait=2.5):
        self.pg.goto(url); time.sleep(wait)
    def finish(self):
        self.wait_say(0.8); total=self.now()
        self.ctx.close(); self.browser.close(); self.pw.stop()
        vid=[f for f in os.listdir(self.vdir) if f.endswith('.webm')][0]
        tl={'video':os.path.join(self.vdir,vid),'duration':total,'scenes':self.scenes,
            'lines':[{'t':t,'key':k,'dur':d,'text':self.narr[k],'wav':self.tts[k][0]} for t,k,d in self.lines]}
        json.dump(tl,open(os.path.join(HERE,'rec',self.name+'_timeline.json'),'w'),indent=1)
        print('saved',tl['video'],total); return tl
    def snap(self,name):
        self.pg.screenshot(path=os.path.join(HERE,'shots',name+'.png'))
