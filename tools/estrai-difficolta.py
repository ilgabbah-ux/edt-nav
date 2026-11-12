# EDT Nav: estrae le sterrate (highway=track) con il loro grado di difficoltà dall'estratto OSM
# e le divide in tasselli z12 (~10 km) come file JSON piccoli da servire su GitHub Pages.
import osmium, json, math, os, sys, collections
Z = 12
SMOOTH = {'excellent':1,'good':1,'intermediate':2,'bad':3,'very_bad':4,'horrible':5,'very_horrible':5,'impassable':5}
SURF = {'asphalt':1,'paved':1,'concrete':1,'paving_stones':1,'sett':1,
        'compacted':2,'fine_gravel':2,
        'gravel':3,'pebblestone':3,'unpaved':3,'ground':3,'dirt':3,'earth':3,
        'grass':4,'grass_paver':2,'mud':4,'sand':4,'rock':4,'stone':4}
def grade(t):
    tt = t.get('tracktype','')
    if tt.startswith('grade') and tt[5:] in '12345' and len(tt)==6: return int(tt[5]), 't'
    s = t.get('smoothness')
    if s in SMOOTH: return SMOOTH[s], 's'
    f = t.get('surface')
    if f in SURF: return SURF[f], 'f'
    return 0, ''
def tx(lon): return int((lon+180)/360*2**Z)
def ty(lat):
    r = math.radians(lat); return int((1-math.log(math.tan(r)+1/math.cos(r))/math.pi)/2*2**Z)
tiles = collections.defaultdict(list); stats = collections.Counter()
class H(osmium.SimpleHandler):
    def way(self, w):
        if w.tags.get('highway') != 'track': return
        t = {k: w.tags.get(k) for k in ('tracktype','smoothness','surface') if w.tags.get(k)}
        g, src = grade(t); stats['tot'] += 1; stats[src or 'nessuno'] += 1
        if not g: return
        try: c = [[round(n.lon,5), round(n.lat,5)] for n in w.nodes]
        except osmium.InvalidLocationError: return
        if len(c) < 2: return
        ks = {(tx(x), ty(y)) for x, y in c}
        f = {'type':'Feature','properties':{'g':g} if src!='f' else {'g':g,'s':1},'geometry':{'type':'LineString','coordinates':c}}
        for k in ks: tiles[k].append(f)
H().apply_file(sys.argv[1], locations=True, idx='flex_mem')
out = sys.argv[2]; n = 0
for (x, y), fs in tiles.items():
    d = os.path.join(out, str(x)); os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, f'{y}.json'), 'w') as fh: json.dump({'type':'FeatureCollection','features':fs}, fh, separators=(',',':'))
    n += 1
json.dump({'z':Z,'tiles':sorted(f'{x}/{y}' for x,y in tiles)}, open(os.path.join(out,'index.json'),'w'), separators=(',',':'))
print('tasselli', n, dict(stats))
