from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
import argparse, json, math, shutil, subprocess, wave, struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description='Reference-only renderer for T01 layout validation.')
parser.add_argument('--timeline', default=str(ROOT/'examples'/'fixtures'/'timeline-demo.json'))
parser.add_argument('--preview', default='/mnt/data/eian-paper-ui-broll-preview-stage2.png')
parser.add_argument('--video', default='/mnt/data/eian-paper-ui-broll-demo-stage2.mp4')
parser.add_argument('--frames-dir', default=str(ROOT/'temp'/'reference_frames_stage2'))
parser.add_argument('--start-frame', type=int, default=0, help='Global timeline start frame (inclusive).')
parser.add_argument('--end-frame', type=int, default=None, help='Global timeline end frame (exclusive).')
parser.add_argument('--background-state', default=None, help='Resolved BackgroundRenderState JSON. Optional for legacy T01 regression.')
args = parser.parse_args()

TIMELINE = json.loads(Path(args.timeline).read_text())
BACKGROUND_STATE = json.loads(Path(args.background_state).read_text()) if args.background_state else None
W=720
H=1280
FPS=int(TIMELINE.get('fps',24))
if FPS != 24: raise ValueError('T01 V1 is locked to 24fps')
FRAMES = Path(args.frames_dir)
OUT_PREVIEW = Path(args.preview)
OUT_VIDEO = Path(args.video)
START_FRAME=max(0,int(args.start_frame or 0))
END_FRAME=int(args.end_frame) if args.end_frame is not None else int(TIMELINE.get('durationInFrames',0))
END_FRAME=min(int(TIMELINE.get('durationInFrames',0)),END_FRAME)
if END_FRAME <= START_FRAME: raise ValueError('end-frame must be greater than start-frame')
SEGMENT_DURATION=END_FRAME-START_FRAME
OUT_AUDIO = FRAMES.parent/'ui-stage2.wav'
FRAMES.mkdir(parents=True, exist_ok=True)

FONT='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
MONO='/usr/share/fonts/truetype/noto/NotoSansMono-Regular.ttf'
FONT_BOLD='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
if not Path(FONT_BOLD).exists(): FONT_BOLD=FONT
f_task=ImageFont.truetype(FONT_BOLD, 20)
f_body=ImageFont.truetype(FONT, 20)
f_mono=ImageFont.truetype(MONO, 17)

BG=(227,226,221); CARD=(252,252,250); PANEL=(249,250,246); PANEL_BORDER=(218,218,211)
USER=(24,24,23); ASSIST=(218,219,214); TYPE_BG=(242,242,238); TEXT=(31,31,29)
TEXT_LIGHT=(249,248,245); MUTED=(164,163,157); MONO_TEXT=(116,115,109)
TRACK=(215,215,209); TRACK_FILL=(166,166,160); ORANGE=(239,74,15)
outer=(58,105,662,1175); top_panel=(76,137,644,397); chat_panel=(76,505,644,1048)

speckles=[]; seed=1987
for _ in range(1800):
    seed=(1103515245*seed+12345)&0x7fffffff; x=seed%W
    seed=(1103515245*seed+12345)&0x7fffffff; y=seed%H
    seed=(1103515245*seed+12345)&0x7fffffff; a=1+(seed%2)
    speckles.append((x,y,a))

def ease_out(t): t=max(0,min(1,t)); return 1-(1-t)**3

def text_width(draw, text, font): return draw.textlength(text,font=font)

def wrap_words(text, draw, font, maxw):
    paras=text.split('\n'); lines=[]
    for para in paras:
        if para=='': lines.append(''); continue
        # Mixed-language wrapper: greedily accumulate tokens, falling back to character wrapping.
        words=para.split(' ')
        cur=''
        for w in words:
            trial=w if not cur else cur+' '+w
            if text_width(draw,trial,font)<=maxw:
                cur=trial; continue
            if cur: lines.append(cur); cur=''
            if text_width(draw,w,font)<=maxw: cur=w
            else:
                tmp=''
                for ch in w:
                    tt=tmp+ch
                    if text_width(draw,tt,font)<=maxw or not tmp: tmp=tt
                    else: lines.append(tmp); tmp=ch
                cur=tmp
        if cur: lines.append(cur)
    return lines

def draw_multiline(draw, xy, lines, font, fill, line_gap=5):
    x,y=xy; asc,desc=font.getmetrics(); lh=asc+desc
    for ln in lines:
        draw.text((x,y),ln,font=font,fill=fill); y += lh+line_gap
    return y

def _hex_rgb(value):
    value=str(value).lstrip('#')
    if len(value)!=6: raise ValueError(f'Invalid background color: {value}')
    return tuple(int(value[i:i+2],16) for i in (0,2,4))

def _cover_image(im):
    sw,sh=im.size; sr=sw/sh; tr=W/H
    if sr>tr:
        cw=sh*tr; x=(sw-cw)/2; box=(x,0,x+cw,sh)
    else:
        ch=sw/tr; y=(sh-ch)/2; box=(0,y,sw,y+ch)
    return im.crop(box).resize((W,H),Image.Resampling.LANCZOS)

BACKGROUND_FRAME_CACHE=None

def background_frame():
    global BACKGROUND_FRAME_CACHE
    if BACKGROUND_FRAME_CACHE is not None:
        return BACKGROUND_FRAME_CACHE.copy()
    if BACKGROUND_STATE is None:
        im=Image.new('RGBA',(W,H),BG+(255,)); d=ImageDraw.Draw(im)
        for x,y,a in speckles: d.point((x,y),fill=(225,224,219,255))
        BACKGROUND_FRAME_CACHE=im
        return im.copy()
    kind=BACKGROUND_STATE.get('type')
    source=BACKGROUND_STATE.get('source') or {}
    if kind=='solid':
        BACKGROUND_FRAME_CACHE=Image.new('RGBA',(W,H),_hex_rgb(source.get('color','#F3EFE7'))+(255,))
        return BACKGROUND_FRAME_CACHE.copy()
    asset=source.get('asset')
    if not asset or not Path(asset).exists():
        raise FileNotFoundError(f'BACKGROUND_ASSET_MISSING:{asset}')
    src=Image.open(asset).convert('RGBA')
    if kind=='image':
        crop=((BACKGROUND_STATE.get('transform') or {}).get('crop') or {})
        x=float(crop.get('x',0)); y=float(crop.get('y',0))
        cw=float(crop.get('width',src.width)); ch=float(crop.get('height',src.height))
        src=src.crop((x,y,x+cw,y+ch)).resize((W,H),Image.Resampling.LANCZOS)
        BACKGROUND_FRAME_CACHE=src
        return src.copy()
    BACKGROUND_FRAME_CACHE=_cover_image(src)
    return BACKGROUND_FRAME_CACHE.copy()

def base_frame():
    im=background_frame(); d=ImageDraw.Draw(im)
    shadow=Image.new('RGBA',(W,H),(0,0,0,0)); sd=ImageDraw.Draw(shadow)
    x1,y1,x2,y2=outer
    sd.rounded_rectangle((x1,y1+8,x2,y2+8),radius=13,fill=(35,33,28,46))
    shadow=shadow.filter(ImageFilter.GaussianBlur(18)); im.alpha_composite(shadow)
    d=ImageDraw.Draw(im)
    d.rounded_rectangle(outer,radius=12,fill=CARD+(255,),outline=(190,190,184,70),width=1)
    d.rounded_rectangle(top_panel,radius=10,fill=PANEL+(255,),outline=PANEL_BORDER+(200,),width=1)
    d.rounded_rectangle(chat_panel,radius=10,fill=PANEL+(255,),outline=PANEL_BORDER+(200,),width=1)
    return im

def draw_task_panel(im, frame):
    d=ImageDraw.Draw(im); txt=TIMELINE.get('taskText','')
    lines=wrap_words(txt,d,f_task,520)[:3]
    draw_multiline(d,(92,151),lines,f_task,TEXT,5)
    d.text((92,264),TIMELINE.get('taskMeta','20 MIN ELAPSED'),font=f_mono,fill=MUTED)
    d.rounded_rectangle((92,305,202,340),radius=18,fill=(245,124,40,255))
    cycle_frames=24
    for i in range(4):
        cx=118+i*20; cy=322; phase=(frame-i*6)%cycle_frames
        fill=(105,105,99,255) if phase < 6 else (180,180,173,255)
        d.ellipse((cx-5,cy-5,cx+5,cy+5),fill=fill)

def draw_rail(im, y, label, progress, accent=False):
    d=ImageDraw.Draw(im); d.text((76,y-10),label,font=f_mono,fill=MONO_TEXT)
    x1=304; x2=622; cy=y
    d.rounded_rectangle((x1,cy-4,x2,cy+4),radius=4,fill=TRACK+(255,))
    p=max(0,min(1,progress)); fillx=int(x1+(x2-x1)*p)
    if fillx>x1: d.rounded_rectangle((x1,cy-4,fillx,cy+4),radius=4,fill=(ORANGE if accent else TRACK_FILL)+(255,))
    dotx=640; d.ellipse((dotx-5,cy-5,dotx+5,cy+5),fill=((ORANGE if accent and p>0.96 else (183,183,176))+(255,)))

def bubble_metrics(text, side):
    temp=Image.new('RGB',(10,10)); d=ImageDraw.Draw(temp)
    # The Remotion master uses a ratio-specific safe maximum width. This
    # reference renderer is 720px wide for the 9:16 validation canvas, so the
    # 620px production safe width scales to ~413px here. User bubbles remain
    # content-driven below that ceiling and wrap only after reaching it.
    maxw=413 if side=='user' else 360
    px=20 if side=='user' else 18; py=17 if side=='user' else 13
    lines=wrap_words(text,d,f_body,maxw-2*px)
    asc,desc=f_body.getmetrics(); lh=asc+desc
    tw=max([text_width(d,l,f_body) for l in lines] or [0]); th=len(lines)*lh+max(0,len(lines)-1)*3
    natural=int(tw+2*px)
    bw=min(maxw,natural) if side=='user' else min(maxw,max(112,natural))
    bh=int(th+2*py)
    return lines,bw,bh,px,py,lh

def draw_bubble(layer, text, side, x_anchor, y, alpha=255, tx=0, name=None):
    d=ImageDraw.Draw(layer); name_h=0
    if name:
        name_h=22
    lines,bw,bh,px,py,lh=bubble_metrics(text,side)
    if side=='user': x2=x_anchor+tx; x1=x2-bw; fill=USER; tfill=TEXT_LIGHT; radius=24
    else: x1=x_anchor+tx; x2=x1+bw; fill=ASSIST; tfill=(54,53,49); radius=22
    if name: d.text((x1+8,y),name,font=f_mono,fill=(119,118,111,alpha)); y += name_h
    d.rounded_rectangle((x1,y,x2,y+bh),radius=radius,fill=fill+(alpha,))
    ty=y+py
    for ln in lines:
        d.text((x1+px,ty),ln,font=f_body,fill=tfill+(alpha,)); ty += lh+3
    return (x1,y-name_h,x2,y+bh), bh+name_h

def draw_typing(layer, y, frame, start, name=None):
    d=ImageDraw.Draw(layer)
    if name: d.text((114,y),name,font=f_mono,fill=(119,118,111,255)); y += 22
    x1=106; y1=y; x2=210; y2=y+52
    d.rounded_rectangle((x1,y1,x2,y2),radius=26,fill=TYPE_BG+(255,)); p=max(0,frame-start)
    for i in range(3):
        phase=(p-i*3)%18; a=190 if 0<=phase<8 else 58; cx=139+i*22; cy=y1+26
        d.ellipse((cx-4,cy-4,cx+4,cy+4),fill=(119,118,112,a))

def reveal_count(text, frame, start, duration):
    if frame<=start: return 0
    if frame>=start+duration: return len(text)
    chunks=[]; i=0; patt=(3,2,4,3,2,4); pi=0
    while i<len(text): i=min(len(text),i+patt[pi%len(patt)]); pi+=1; chunks.append(i)
    idx=max(0,min(len(chunks)-1,int((frame-start)/duration*len(chunks))))
    return chunks[idx]

def render_chat_content(frame):
    layer=Image.new('RGBA',(W,H),(0,0,0,0)); items=[]
    for m in TIMELINE['messages']:
        name=m.get('name')
        name_h=22 if name else 0
        if m['speaker']=='user':
            s=m.get('startFrame',0)
            if frame < s: continue
            t=ease_out((frame-s)/max(1,m.get('enterFrames',6)))
            _,_,bh,_,_,_=bubble_metrics(m['text'],'user')
            items.append({'kind':'bubble','side':'user','text':m['text'],'name':name,'height':bh+name_h,'alpha':int(255*t),'tx':int(16*(1-t))})
            continue
        ts=m.get('typingStartFrame',0); rs=m.get('revealStartFrame',ts+m.get('typingFrames',15))
        if frame < ts: continue
        if frame < rs: items.append({'kind':'typing','height':52+name_h,'start':ts,'name':name})
        else:
            cnt=reveal_count(m['text'],frame,rs,m.get('revealFrames',24)); shown=m['text'][:cnt]; measure_text=shown if shown else ' '
            _,_,bh,_,_,_=bubble_metrics(measure_text,'assistant'); t=ease_out((frame-rs)/5)
            items.append({'kind':'bubble','side':'assistant','text':shown,'name':name,'height':bh+name_h,'alpha':int(255*t),'tx':int(-12*(1-t))})
    gap=22; cursor=chat_panel[3]-14; placed=[]
    for item in reversed(items): y=cursor-item['height']; placed.append((item,y)); cursor=y-gap
    placed.reverse()
    for item,y in placed:
        if item['kind']=='typing': draw_typing(layer,y,frame,item['start'],item.get('name'))
        elif item['side']=='user': draw_bubble(layer,item['text'],'user',618,y,item['alpha'],item['tx'],item.get('name'))
        else: draw_bubble(layer,item['text'],'assistant',92,y,item['alpha'],item['tx'],item.get('name'))
    clip=Image.new('L',(W,H),0); cd=ImageDraw.Draw(clip); cd.rounded_rectangle(chat_panel,radius=10,fill=255)
    fade_h=42; y1=chat_panel[1]
    for yy in range(y1,min(y1+fade_h,H)): cd.rectangle((chat_panel[0],yy,chat_panel[2],yy),fill=int(255*(yy-y1)/max(1,fade_h-1)))
    layer.putalpha(ImageChops.multiply(layer.getchannel('A'),clip)); return layer

def assistant_progress(frame):
    assistants=[m for m in TIMELINE['messages'] if m['speaker']=='assistant']
    if not assistants: return 0.0
    completed=0; active=0.0
    for m in assistants:
        rs=m.get('revealStartFrame',0); rd=max(1,m.get('revealFrames',24))
        if frame >= rs+rd: completed += 1
        elif frame >= rs: active=max(active,(frame-rs)/rd)
    return max(0,min(1,(completed+active)/len(assistants)))

def render_frame(frame):
    # Locked rule: the final visual state must remain completely unchanged
    # for the 24-frame hold. Clamp every animated subsystem to the last
    # event frame so dots, rails and bubbles freeze together.
    freeze_frame=max(0,TIMELINE.get('durationInFrames',1)-TIMELINE.get('holdFrames',24))
    visual_frame=min(frame,freeze_frame)
    im=base_frame(); draw_task_panel(im, visual_frame)
    duration=max(1,freeze_frame)
    async_p=max(0,min(1,visual_frame/duration))
    draw_rail(im,452,'ASYNC RESEARCH',async_p,False); draw_rail(im,1103,'RESPONSES API',assistant_progress(visual_frame),True)
    im.alpha_composite(render_chat_content(visual_frame)); return im.convert('RGB')

def make_audio(duration_s):
    sr=48000; samples=[0.0]*int(sr*duration_s)
    def click(t,freq=720,amp=0.035,dur=0.035):
        st=int(t*sr); n=int(dur*sr)
        for i in range(n):
            if st+i>=len(samples): break
            env=(1-i/n)**3; samples[st+i]+=amp*env*math.sin(2*math.pi*freq*i/sr)
    for m in TIMELINE['messages']:
        event_frame=m.get('startFrame',0) if m['speaker']=='user' else m.get('revealStartFrame',0)
        if START_FRAME <= event_frame < END_FRAME:
            click((event_frame-START_FRAME)/FPS,610 if m['speaker']=='user' else 760)
    with wave.open(str(OUT_AUDIO),'w') as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(sr)
        for s in samples: wf.writeframesraw(struct.pack('<h',int(max(-1,min(1,s))*32767)))

def choose_preview_frame():
    # Representative GLOBAL frame inside the requested slice.
    assistants=[m for m in TIMELINE['messages'] if m['speaker']=='assistant']
    candidates=[]
    for m in assistants:
        rs=m.get('revealStartFrame',0); rd=m.get('revealFrames',24)
        pf=rs+max(1,int(rd*0.72))
        if START_FRAME <= pf < END_FRAME: candidates.append(pf)
    if candidates: return candidates[-1]
    return START_FRAME + max(0,(SEGMENT_DURATION-1)//2)

for f in FRAMES.glob('*.png'): f.unlink()
for local_i, global_i in enumerate(range(START_FRAME,END_FRAME)):
    render_frame(global_i).save(FRAMES/f'frame_{local_i:04d}.png',compress_level=2)
preview_global=choose_preview_frame(); preview_local=max(0,min(SEGMENT_DURATION-1,preview_global-START_FRAME))
OUT_PREVIEW.parent.mkdir(parents=True,exist_ok=True); OUT_VIDEO.parent.mkdir(parents=True,exist_ok=True)
shutil.copy2(FRAMES/f'frame_{preview_local:04d}.png',OUT_PREVIEW)
make_audio(SEGMENT_DURATION/FPS)
subprocess.run(['ffmpeg','-y','-loglevel','error','-framerate',str(FPS),'-i',str(FRAMES/'frame_%04d.png'),'-i',str(OUT_AUDIO),'-c:v','libx264','-pix_fmt','yuv420p','-r',str(FPS),'-c:a','aac','-b:a','96k','-shortest',str(OUT_VIDEO)],check=True)
print(f'global slice: {START_FRAME}-{END_FRAME} ({SEGMENT_DURATION/FPS:.2f}s)')
print(OUT_PREVIEW); print(OUT_VIDEO)
