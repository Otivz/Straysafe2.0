"""Compose a respondent video: dark-navy HUD, recorded footage, captions, narration, ambient music. Usage: compose.py <config.json>"""
import json, os, sys, subprocess, wave, textwrap, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__))
FF = os.path.join(HERE, 'vid', 'Lib', 'site-packages', 'imageio_ffmpeg', 'binaries', 'ffmpeg-win-x86_64-v9.0.2.exe')
W, H = 1920, 1080
LOGO = r"C:\Users\user\Straysafe2.0\frontend\public\SSLOGO.png"
def font(n, s): return ImageFont.truetype(os.path.join(r'C:\Windows\Fonts', n), s)
HEAD, HEADB, BODY, BODYB = 'bahnschrift.ttf', 'bahnschrift.ttf', 'segoeui.ttf', 'segoeuib.ttf'
BLUE = (47, 123, 255); CYAN = (90, 190, 255); WHITE = (235, 242, 255); DIM = (140, 160, 195)
OUT = os.path.join(HERE, 'out'); os.makedirs(OUT, exist_ok=True)
TMP = os.path.join(HERE, 'tmp'); os.makedirs(TMP, exist_ok=True)

def make_bg():
    y = np.linspace(0, 1, H)[:, None]; x = np.linspace(0, 1, W)[None, :]
    base = np.zeros((H, W, 3), np.float32)
    c1 = np.array([3, 6, 16], np.float32); c2 = np.array([8, 20, 48], np.float32)
    t = np.clip(0.55 * y + 0.45 * (1 - x), 0, 1)[..., None]
    base = c1 * (1 - t) + c2 * t
    for cx, cy, r, a in [(0.15, 0.2, 0.45, 40), (0.85, 0.85, 0.5, 34)]:
        d = np.sqrt(((x - cx) * 1.6) ** 2 + (y - cy) ** 2)
        base += (np.clip(1 - d / r, 0, 1) ** 2)[..., None] * np.array([20, 70, 170], np.float32) * (a / 120)
    im = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).convert('RGBA')
    g = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(g)
    for gx in range(0, W, 60): d.line([(gx, 0), (gx, H)], fill=(60, 120, 220, 12))
    for gy in range(0, H, 60): d.line([(0, gy), (W, gy)], fill=(60, 120, 220, 12))
    im = Image.alpha_composite(im, g)
    return im.convert('RGB')

def brackets(d, box, col=BLUE, ln=34, w=3):
    x0, y0, x1, y1 = box
    for (x, y, sx, sy) in [(x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)]:
        d.line([(x, y), (x + sx * ln, y)], fill=col, width=w); d.line([(x, y), (x, y + sy * ln)], fill=col, width=w)

def glow_rect(img, box, col=BLUE, r=18, blur=18):
    g = Image.new('RGBA', img.size, (0, 0, 0, 0)); d = ImageDraw.Draw(g)
    d.rounded_rectangle(box, r, outline=col + (200,), width=6)
    g = g.filter(ImageFilter.GaussianBlur(blur)); img.alpha_composite(g)

def pill(d, xy, text, f, active=False):
    x, y = xy; tw = d.textlength(text, font=f); pad = 16
    box = (x, y, x + tw + 2 * pad, y + 38)
    d.rounded_rectangle(box, 19, fill=(47, 123, 255, 230) if active else (14, 30, 66, 200), outline=(90, 160, 255, 200 if active else 90), width=2)
    d.text((x + pad, y + 6), text, font=f, fill=WHITE if active else DIM)
    return box[2] + 10

def hud(cfg, scene_idx, region):
    """Transparent full-frame overlay: corner brackets, top bar with scene pills, bottom progress."""
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    brackets(d, (30, 30, W - 30, H - 30))
    logo = Image.open(LOGO).convert('RGBA'); logo.thumbnail((54, 54)); im.alpha_composite(logo, (60, 52))
    d.text((126, 52), 'STRAYSAFE', font=font(HEADB, 28), fill=WHITE)
    d.text((126, 84), cfg['role_tag'], font=font(BODY, 18), fill=CYAN)
    x = 560; f = font(BODY, 20)
    for i, (_, label) in enumerate(cfg['scene_labels']):
        x = pill(d, (x, 58), f'{i+1}  {label}', f, i == scene_idx)
    d.text((W - 360, 62), 'DEMONSTRATION ACCOUNTS', font=font(BODY, 17), fill=DIM)
    d.ellipse((W - 392, 70, W - 378, 84), fill=(60, 220, 140, 255))
    n = len(cfg['scene_labels']); bx0, bx1, by = 60, W - 60, H - 52
    d.line([(bx0, by), (bx1, by)], fill=(40, 70, 130, 160), width=4)
    d.line([(bx0, by), (bx0 + (bx1 - bx0) * (scene_idx + 1) / n, by)], fill=BLUE + (255,), width=4)
    return im

def phone_overlay(cfg, scene_idx, hint):
    im = hud(cfg, scene_idx, None)
    px, py, pw, ph = cfg['video_pos']
    # bezel: opaque frame with transparent screen hole
    bez = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(bez)
    pad = 16
    d.rounded_rectangle((px - pad, py - pad, px + pw + pad, py + ph + pad), 46, fill=(10, 16, 32, 255), outline=(70, 130, 255, 255), width=3)
    hole = Image.new('L', (W, H), 255); hd = ImageDraw.Draw(hole)
    hd.rounded_rectangle((px, py, px + pw, py + ph), 30, fill=0)
    a = np.array(bez); a[..., 3] = np.minimum(a[..., 3], np.array(hole)); bez = Image.fromarray(a)
    glow_rect(im, (px - pad, py - pad, px + pw + pad, py + ph + pad), r=46)
    im.alpha_composite(bez)
    return im

def info_panel(im, cfg, scene):
    d = ImageDraw.Draw(im); x = 110; y = 190
    d.text((x, y), scene['kicker'], font=font(HEAD, 24), fill=CYAN)
    d.text((x, y + 36), scene['title'], font=font(HEADB, 58), fill=WHITE)
    d.line([(x, y + 118), (x + 160, y + 118)], fill=BLUE + (255,), width=5)
    yy = y + 150
    for b in scene['bullets']:
        d.ellipse((x, yy + 13, x + 12, yy + 25), fill=BLUE + (255,))
        lines = textwrap.wrap(b, 44)
        for ln in lines:
            d.text((x + 30, yy), ln, font=font(BODY, 30), fill=(215, 226, 248)); yy += 42
        yy += 14

def caption_png(text, width, size=32, maxw=None):
    f = font(BODY, size); d0 = ImageDraw.Draw(Image.new('RGBA', (10, 10)))
    cols = max(20, int(width / (size * 0.52)))
    lines = textwrap.wrap(text, cols)
    lh = int(size * 1.35); h = lh * len(lines) + 36
    im = Image.new('RGBA', (width, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, width - 1, h - 1), 18, fill=(5, 12, 30, 215), outline=(60, 120, 230, 170), width=2)
    for i, ln in enumerate(lines):
        tw = d.textlength(ln, font=f); d.text(((width - tw) / 2, 18 + i * lh), ln, font=f, fill=WHITE)
    return im

def title_card(cfg, kind):
    im = make_bg().convert('RGBA'); d = ImageDraw.Draw(im)
    brackets(d, (60, 60, W - 60, H - 60), ln=60, w=4)
    logo = Image.open(LOGO).convert('RGBA'); logo.thumbnail((190, 190))
    g = Image.new('RGBA', (W, H), (0, 0, 0, 0)); gd = ImageDraw.Draw(g)
    gd.ellipse((W / 2 - 330, 260 - 40, W / 2 + 330, 260 + 330), fill=(47, 123, 255, 70)); g = g.filter(ImageFilter.GaussianBlur(70)); im.alpha_composite(g)
    im.alpha_composite(logo, (int(W / 2 - logo.width / 2), 190))
    d = ImageDraw.Draw(im)
    def c(text, y, f, col):
        tw = d.textlength(text, font=f); d.text(((W - tw) / 2, y), text, font=f, fill=col)
    c('STRAYSAFE', 420, font(HEADB, 110), WHITE)
    d.line([(W / 2 - 150, 560), (W / 2 + 150, 560)], fill=BLUE + (255,), width=5)
    c(cfg['title'], 590, font(HEADB, 50), CYAN)
    sub = cfg['intro_sub'] if kind == 'intro' else cfg['outro_sub']
    c(sub, 680, font(BODY, 32), DIM)
    c('Stray animal reporting and management for the subdivision', 960, font(BODY, 24), (110, 130, 170))
    return im.convert('RGB')

def make_music(dur, path):
    sr = 44100; t = np.arange(int(dur * sr)) / sr
    chords = [(110.0, 164.8, 220.0, 261.6), (87.3, 130.8, 174.6, 220.0), (98.0, 146.8, 196.0, 246.9), (82.4, 123.5, 164.8, 207.7)]
    out = np.zeros_like(t)
    seg = 8.0
    for i in range(int(dur / seg) + 1):
        a, b = int(i * seg * sr), min(int((i + 1) * seg * sr), len(t))
        if a >= len(t): break
        tt = t[a:b]; env = np.minimum(1, np.minimum((tt - tt[0]) / 1.5, (tt[-1] - tt) / 1.5 + 0.0))
        env = np.clip(env, 0, 1)
        for f in chords[i % 4]:
            out[a:b] += np.sin(2 * np.pi * f * tt + 0.3 * np.sin(2 * np.pi * 0.2 * tt)) * env * 0.12
            out[a:b] += np.sin(2 * np.pi * f * 2.003 * tt) * env * 0.03
    out *= 0.5 * (1 + 0.08 * np.sin(2 * np.pi * 0.1 * t))
    out = np.clip(out / max(1e-6, np.abs(out).max()) * 0.8, -1, 1)
    st = (np.stack([out, np.roll(out, 900)], 1) * 32767).astype(np.int16)
    w = wave.open(path, 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes(st.tobytes()); w.close()

def wavdur(p):
    w = wave.open(p); d = w.getnframes() / w.getframerate(); w.close(); return d

def main(cfgpath):
    cfg = json.load(open(cfgpath, encoding='utf8')); tl = json.load(open(cfg['timeline']))
    name = cfg['name']; wd = os.path.join(TMP, name); os.makedirs(wd, exist_ok=True)
    intro_wav, outro_wav = cfg['intro_wav'], cfg['outro_wav']
    ti = wavdur(intro_wav) + 2.6; to = wavdur(outro_wav) + 3.0
    tr = tl['duration']; total = ti + tr + to
    print('intro', ti, 'rec', tr, 'outro', to, 'total', total)
    inputs = []; filt = []; idx = 0
    def add_input(args):
        nonlocal idx; inputs.extend(args); idx += 1; return idx - 1
    # 0: bg
    bgp = os.path.join(wd, 'bg.png'); make_bg().save(bgp)
    i_bg = add_input(['-loop', '1', '-framerate', '30', '-t', f'{total:.2f}', '-i', bgp])
    i_vid = add_input(['-i', tl['video']])
    vx, vy, vw, vh = cfg['video_pos']
    filt.append(f'[{i_vid}:v]fps=30,scale={vw}:{vh}:flags=lanczos,setpts=PTS-STARTPTS+{ti:.3f}/TB,trim=duration={ti+tr:.3f}[vv]')
    filt.append(f'[{i_bg}:v]format=rgba[b0]')
    filt.append(f'[b0][vv]overlay={vx}:{vy}:enable=\'between(t,{ti:.3f},{ti+tr:.3f})\':eof_action=pass[c0]')
    cur = 'c0'; n = 0
    def overlay(png, x, y, t0, t1, fade=None, loop=False):
        nonlocal cur, n
        args = ['-loop', '1', '-framerate', '30', '-t', f'{total:.2f}', '-i', png] if (fade or loop) else ['-i', png]
        ii = add_input(args); n += 1
        src = f'{ii}:v'
        if fade:
            filt.append(f'[{ii}:v]format=rgba,fade=t=in:st={t0:.2f}:d=0.8:alpha=1,fade=t=out:st={t1-0.8:.2f}:d=0.8:alpha=1[f{n}]'); src = f'f{n}'
        else:
            filt.append(f'[{ii}:v]format=rgba[f{n}]'); src = f'f{n}'
        filt.append(f'[{cur}][{src}]overlay={x}:{y}:enable=\'between(t,{t0:.3f},{t1:.3f})\':eof_action=repeat[o{n}]')
        cur = f'o{n}'
    # title cards
    ip = os.path.join(wd, 'intro.png'); title_card(cfg, 'intro').save(ip)
    op = os.path.join(wd, 'outro.png'); title_card(cfg, 'outro').save(op)
    overlay(ip, 0, 0, 0, ti, fade=True)
    overlay(op, 0, 0, ti + tr, total, fade=True)
    # scenes (HUD + panels)
    sc = tl['scenes']; labels = cfg['scene_labels']; key2i = {k: i for i, (k, _) in enumerate(labels)}
    for i, (t, key) in enumerate(sc):
        t1 = sc[i + 1][0] if i + 1 < len(sc) else tr
        si = key2i[key]
        im = (phone_overlay(cfg, si, None) if cfg['layout'] == 'phone' else hud(cfg, si, None))
        if cfg['layout'] == 'phone': info_panel(im, cfg, cfg['panels'][key])
        else:
            px, py, pw, ph = cfg['video_pos']; glow_rect(im, (px - 6, py - 6, px + pw + 6, py + ph + 6), r=10, blur=14)
            d = ImageDraw.Draw(im); d.rounded_rectangle((px - 4, py - 4, px + pw + 4, py + ph + 4), 8, outline=(70, 130, 255, 255), width=3)
            brackets(d, (px - 14, py - 14, px + pw + 14, py + ph + 14), col=CYAN, ln=26, w=3)
        p = os.path.join(wd, f'scene{i}.png'); im.save(p)
        overlay(p, 0, 0, ti + t, ti + t1 if i + 1 < len(sc) else ti + tr)
    # captions
    audio = []
    for ln in tl['lines']:
        a, b = ti + ln['t'], ti + ln['t'] + ln['dur'] + 0.2
        cw = cfg['caption_w']; cim = caption_png(ln['text'], cw, cfg.get('caption_size', 30))
        p = os.path.join(wd, f"cap_{ln['key']}.png"); cim.save(p)
        cx, cy = cfg['caption_pos']
        overlay(p, cx, cy - cim.height if cfg.get('caption_bottom_anchor', True) else cy, a, b)
        audio.append((a, ln['wav']))
    audio.append((0.8, intro_wav)); audio.append((ti + tr + 0.6, outro_wav))
    # audio inputs
    music = os.path.join(wd, 'music.wav'); make_music(total + 1, music)
    i_m = add_input(['-i', music])
    afilt = [f'[{i_m}:a]volume=0.55,afade=t=in:st=0:d=3,afade=t=out:st={total-4:.2f}:d=4[m]']
    labs = ['[m]']
    for k, (t, wav) in enumerate(audio):
        ai = add_input(['-i', wav]); ms = int(t * 1000)
        afilt.append(f'[{ai}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=1.9,adelay={ms}|{ms}[a{k}]'); labs.append(f'[a{k}]')
    afilt.append(''.join(labs) + f'amix=inputs={len(labs)}:normalize=0:duration=longest,alimiter=limit=0.95[aout]')
    fg = ';'.join(filt + afilt)
    fgp = os.path.join(wd, 'filter.txt'); open(fgp, 'w', encoding='utf8').write(fg)
    out = os.path.join(OUT, cfg['output'])
    cmd = [FF, '-y', '-loglevel', 'error', '-stats'] + inputs + ['-/filter_complex', fgp, '-map', f'[{cur}]', '-map', '[aout]', '-t', f'{total:.2f}',
           '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]
    print('running ffmpeg with', len(inputs), 'args'); subprocess.run(cmd, check=True)
    print('wrote', out)

if __name__ == '__main__': main(sys.argv[1])
