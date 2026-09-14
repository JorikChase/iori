"""Download the hand-picked Wikimedia Commons reference photos into iris-engine/ref/.
Selection indices refer to iris-engine/study/refs-human.json (survey output, sorted by pixel count).
Re-run to refresh; existing files are skipped."""
import json, os, re, time, urllib.request, urllib.parse, html, sys
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
good=json.load(open(os.path.join(ROOT,'study','refs-human.json')))
# idx: (slug, colour category, note, max px)
SEL={
 6:('green-amber-ring-isolated','green','isolated iris on black, ring-flash, amber pupillary zone, contraction furrows',4096),
 7:('grey-green-isolated','grey-green','isolated iris on black, amber collarette, fine stroma, few crypts',4096),
 17:('green-crypts-isolated','green','isolated iris on black, very large Fuchs crypts in the ciliary zone',4096),
 24:('blue-green-isolated','blue-green','isolated iris on black, warm collarette wisps, mid crypts',4096),
 83:('brown-extreme-macro','brown','extreme macro of a brown iris: crypts, pupillary ruff, radial furrows',4096),
 106:('brown-extreme-macro-2','brown','extreme macro, brown iris, dense pupillary zone, crypt ring, eyelashes over cornea',4096),
 43:('grey-blue-extreme-macro','grey-blue','extreme macro through the cornea: pigment ruff, collarette zigzag, radial fibres',4096),
 1:('hazel-whole-eye','hazel','whole eye, twin light, hazel with amber pupillary zone and green ciliary zone',2048),
 11:('green-crypts-eye','green','whole eye, green with crypts, softbox catchlight, upper-lid shadow',2048),
 12:('dark-blue-eye','dark-blue','whole eye, dark blue, wide pupil, bright twin catchlight',2048),
 13:('grey-blue-nevus-eye','grey-blue','whole eye, grey-blue with pigment nevus and warm collarette',2048),
 14:('blue-eye','blue','whole eye, light blue, dilated, radial fibres',2048),
 22:('dark-blue-nevus-eye','dark-blue','whole eye, dark blue, nevus, oblique light',2048),
 15:('brown-central-het-eye','brown','side view, brown with faint central heterochromia, lashes',2048),
 19:('amber-light-brown-eye','amber','light brown / amber, sphincter ring visible, phone macro',2048),
 25:('dark-brown-baby-eye','dark-brown','baby, dark brown, scene reflected in cornea, dilated',2048),
 29:('brown-eye-phone','brown','medium brown, phone macro, crypt ring visible',2048),
 30:('dark-brown-older-eye','dark-brown','older Filipino eye, dark brown, twin flash rectangles',2048),
 36:('blue-lisch-nodules','blue','blue iris with Lisch nodules and freckles, ring flash (pathology)',2048),
 40:('hazel-brown-macro','hazel','hazel-brown macro, crypts and furrows, hard light',2048),
 47:('central-heterochromia-pronounced','central-heterochromia','amber ring on green, pronounced central heterochromia',2048),
 48:('central-heterochromia-grey','central-heterochromia','grey-blue with amber central ring, daylight',2048),
 50:('brown-pair-processed','brown','two brown irises isolated on black (processed image, structure only)',2048),
 53:('grey-orange-collarette','grey','grey iris with orange collarette, ring-light catchlight',2048),
 61:('green-macro-crypts','green','green macro, crypts, sphincter ring',2048),
 79:('light-blue-central-het','central-heterochromia','light blue with amber central ring',2048),
 82:('amber-eye-dark','amber','amber iris, low light, bright specular',2048),
 87:('brown-sectoral-het','sectoral-heterochromia','brown with a lighter sector',2048),
 100:('central-heterochromia-blue','central-heterochromia','blue-grey with amber ring, sclera vessels',2048),
 101:('arcus-senilis','pathology','arcus senilis: grey ring inside the limbus (pathology)',2048),
 102:('green-eye-macro','green','green, sharp macro, pigment spots',2048),
 110:('hazel-furrows','hazel','hazel with contraction furrows and crypt ring',2048),
 115:('dark-brown-dilated','dark-brown','dark brown, dilated in dim light',2048),
 118:('kayser-fleischer-ring','pathology','Kayser-Fleischer ring at the limbus (pathology, slit lamp)',2048),
 135:('amber-wet','amber','amber, wet cornea, bright catchlight, lashes',2048),
 143:('blue-amber-ring-girl-left','blue','blue with amber ring, left eye',2048),
 148:('iris-coloboma','pathology','iris coloboma, keyhole pupil (pathology)',2048),
 150:('green-yellow-eye','green','green-yellow, strong fibres',2048),
 152:('blue-girl-right','blue','blue, right eye, crypts',2048),
 154:('amber-eye-sun','amber','amber in sunlight, lash shadows on the iris',2048),
 156:('hazel-green-eye','hazel','hazel-green, phone macro',2048),
 160:('grey-blue-eye','grey-blue','grey-blue, mild conjunctival vessels',2048),
 161:('complete-heterochromia','complete-heterochromia','one green, one brown eye',2048),
}
UA={'User-Agent':'iris-engine-ref-survey/1.0 (jorikchase@gmail.com)'}
out=os.path.join(ROOT,'ref'); os.makedirs(out,exist_ok=True)
rows=[]
for n,(i,(slug,cat,note,px)) in enumerate(sorted(SEL.items(), key=lambda kv: kv[1][1])):
    v=good[i]; title=v['file'][5:]
    fname=f"{n+1:02d}-{slug}.jpg"; path=os.path.join(out,fname)
    author=re.sub('<[^>]+>','',html.unescape(v['author'])).strip()
    rows.append(dict(file=fname,commons=title,source='https://commons.wikimedia.org/wiki/File:'+title.replace(' ','_'),
        original=v['url'].split('?')[0],width=v['width'],height=v['height'],license=v['license'],author=author,colour=cat,note=note,stored_max_px=px))
    if os.path.exists(path) and os.path.getsize(path)>50000: continue
    if max(v['width'],v['height'])<=px: url=v['url'].split('?')[0]
    else: url='https://commons.wikimedia.org/w/index.php?title=Special:FilePath/'+urllib.parse.quote(title)+f'&width={px}'
    for attempt in range(4):
        try:
            d=urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=120).read()
            if d[:6]==b'<!DOCT' or len(d)<50000: raise Exception('got html/short')
            open(path,'wb').write(d); print('ok',fname,len(d)//1024,'KB'); break
        except Exception as e:
            print('retry',fname,e); time.sleep(5*(attempt+1))
    time.sleep(1.5)
json.dump(rows,open(os.path.join(out,'refs.json'),'w'),indent=1,ensure_ascii=False)
with open(os.path.join(out,'ATTRIBUTION.md'),'w') as f:
    f.write("# Reference photographs — attribution\n\nAll files in this folder come from Wikimedia Commons and are used under the licence stated per file (CC0 / public domain / CC BY / CC BY-SA). They are stored downscaled (long side ≤ 2048 px, or ≤ 4096 px for the isolated-iris macros); the `source` link leads to the full-resolution original and the licence text. CC BY-SA files: any derivative published with them must carry the same licence.\n\n| File | Colour | Commons source | Author | Licence | Original px | Note |\n|---|---|---|---|---|---|---|\n")
    for r in rows: f.write(f"| `{r['file']}` | {r['colour']} | [{r['commons']}]({r['source']}) | {r['author']} | {r['license']} | {r['width']}×{r['height']} | {r['note']} |\n")
print('done',len(rows))
