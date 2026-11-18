#!/usr/bin/env python3
"""Semilla nacional v1.6 · Central de Operaciones
Fuentes:
  - dcr.pkl (Shop Sales Query nov-2026)      → tiendas, zonas, asesores por tienda
  - target_Noviembre_2026_1.0.xlsx           → HC, target por referencia, ROI base, KPI $400.000 / $700.000
  - Seguimiento ... Noviembre 2026.xlsx      → asesores y meta por asesor (Valle, Eje, Santander)  [CSV ya extraídos]
  - INVENTARIO_VALLE_EJE_Y_SANTANDER.xlsx    → inventario por tienda y referencia, HC de la competencia [CSV ya extraídos]
Regla de oro: solo las 7 cadenas (Éxito, Alkosto, Ktronix, Falabella, Cencosud, WOM, Olímpica). IR y demás se ignoran.
Las cédulas NO se escriben en la semilla (el código es público): llegan con la data DCR.
"""
import json, re, csv, unicodedata, pandas as pd, openpyxl, sys
SRC = '/home/claude/src'
old = json.load(open(f'{SRC}/old_seed.json'))
OLD = {s['shopId']: s for s in old['S']}

def norm(s):
    s = str(s or '').replace('ñ', '\x00').replace('Ñ', '\x00')
    s = unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', re.sub(r'[^A-Z0-9\x00 ]', ' ', s.replace('\x00', 'Ñ').upper())).strip()
def slug(s): return re.sub(r'_+', '_', re.sub(r'[^a-z0-9]+', '_', norm(s).lower().replace('ñ', 'n'))).strip('_')
def title(s):
    out = ' '.join(w.capitalize() for w in re.sub(r'\s+', ' ', str(s).strip()).split(' '))
    return re.sub(r'\b(De|Del|La|Las|Los|Y)\b', lambda m: m.group(1).lower(), out)
def parse_up(u):
    u = str(u).strip()
    m = re.match(r'^(\d{5,})\s+(.+)$', u)
    if m: return title(m.group(2)), m.group(1)
    m = re.match(r'^(.+?)\s*-\s*(\d{5,})$', u)
    if m: return title(m.group(1)), m.group(2)
    return title(u), ''

REG = {'Central': 'CENTRO', 'Northwest': 'ANTIOQUIA', 'Costa': 'COSTA', 'Southwest': 'SUROCCIDENTE'}
def chain(alias, name):
    a, n = norm(alias), norm(name)
    if a.startswith('IR') or a == '': return None
    if 'KTRONIX' in n: return 'ktronix', 'KTRONIX'
    if a.startswith('ALKOSTO'): return 'alkosto', 'ALKOSTO'
    if a.startswith('EXITO'): return 'exito', 'EXITO'
    if a.startswith('FALABELLA'): return 'falabella', 'FALABELLA'
    if a.startswith('CENCOSUD'): return 'cencosud', 'CENCOSUD'
    if a == 'WOM': return 'wom', 'WOM'
    if a.startswith('OLIMPICA'): return 'olimpica', 'OLIMPICA'
    return None

# ---------------------------------------------------------------- 1) Tiendas desde la DCR + semilla anterior
df = pd.read_pickle('/home/claude/build/dcr.pkl')
df = df[df['Sales Channel'] != 'IR']
stores = {}
for s in old['S']:
    if s['logoKey'] == 'otro': continue
    stores[s['shopId']] = {k: s[k] for k in ['id', 'shopId', 'cadena', 'tienda', 'usuario', 'zona', 'regional', 'ciudad', 'depto', 'canal', 'logoKey']}
    stores[s['shopId']]['asesoresSeed'] = list(s.get('asesoresSeed') or [])
ZONE_FIX = {'ZONA NARIÑO': 'NARIÑO'}
ids = {s['id'] for s in stores.values()}
new_from_dcr = []
for (sid, name), g in df.groupby(['Shop ID', 'Shop Name'], sort=False):
    c = chain(g.iloc[0]['Shop Alias'], name)
    if not c: continue
    ases = []
    for u in g[g['Position'] == 'Promoter']['Uploader'].drop_duplicates():
        n, _ = parse_up(u)
        if n and n not in ases: ases.append(n)
    if sid in stores:
        st = stores[sid]
        for a in ases:
            if a not in st['asesoresSeed']: st['asesoresSeed'].append(a)
        continue
    r = g.iloc[0]
    zona = norm(r['Supervisor Name']) or 'SIN ZONA'
    zona = ZONE_FIX.get(zona, zona)
    if re.match(r'^\d{6,}', zona): continue                       # zonas de IR (supervisor con cédula)
    i = slug(name); i = i if i not in ids else f'{i}_{sid.lower()}'; ids.add(i)
    stores[sid] = {'id': i, 'shopId': sid, 'cadena': c[1], 'tienda': name.strip(), 'usuario': norm(name), 'zona': zona,
                   'regional': REG.get(r['Sales Region 3'], 'CENTRO'), 'ciudad': norm(r['City']), 'depto': norm(r['State']),
                   'canal': r['Sales Channel'], 'logoKey': c[0], 'asesoresSeed': ases}
    new_from_dcr.append((zona, name))
print('Tiendas nuevas desde la DCR:', len(new_from_dcr), new_from_dcr[:30])

def find_store(name, chain_hint=None, zona_hint=None):
    n = norm(name).replace('TIENDA ', '').replace('EXITO ', 'EXITO ').strip()
    n = n.replace('ALKOSTO FLORIDABLANCA', 'ALKOSTO FLORIDA')
    cands = list(stores.values())
    n = n.replace('BUACARAMANGA', 'BUCARAMANGA')
    if zona_hint:
        r = find_store(name, chain_hint, None) if not any(norm(s['zona']) == norm(zona_hint) for s in cands) else None
        zc = [s for s in cands if norm(s['zona']) == norm(zona_hint)]
        if zc:
            hit = find_store_in(n, zc, chain_hint)
            return hit or find_store_in(n, cands, chain_hint)
    return find_store_in(n, cands, chain_hint)

def find_store_in(n, cands, chain_hint):
    if chain_hint: cands = [s for s in cands if s['logoKey'] in chain_hint] or cands
    best, bs = None, 0
    for s in cands:
        t = norm(s['tienda']).replace('TIENDA ', '')
        if t == n: return s
        sc = 0
        if n and (n in t or t in n): sc = 80 + min(len(n), len(t)) / 10
        else:
            a, b = set(t.split()), [w for w in n.split() if len(w) > 2]
            hit = sum(1 for w in b if w in a)
            if hit: sc = 40 + hit * 12 - abs(len(a) - len(b)) * 2
        if sc > bs: best, bs = s, sc
    return best if bs >= 60 else None

MODEL = {'SMART 20': 'smart-20', 'HOT 70': 'hot-70', 'HOT 70 PRO 5G': 'hot-70-pro-5g', 'NOTE EDGE': 'note-edge', 'NOTE 60': 'note-60',
         'NOTE 60 PRO': 'note-60-pro', 'GT 50 PRO': 'gt-50-pro', 'NOTE 60 ULTRA': 'note-60-ultra', 'HOT 60 PRO': 'hot-60-pro'}
def model_key(h):
    n = norm(h).replace('PR0', 'PRO').replace('70PRO', '70 PRO').replace('+', '')
    n = re.sub(r'\b(INFINIX|CELULAR|\d+ ?GB|\d+ \d+ GB|5G|4GB|RAM)\b', ' ', n); n = re.sub(r'\s+', ' ', n).strip()
    if n.startswith('HOT 70 PRO'): return 'hot-70-pro-5g'
    if n.startswith('HOT 60 PRO'): return 'hot-60-pro'
    if n.startswith('NOT 60 PRO') or n.startswith('NOTE 60 PRO'): return 'note-60-pro'
    if n.startswith('NOTE 60 ULTRA'): return 'note-60-ultra'
    for k in sorted(MODEL, key=len, reverse=True):
        if n.startswith(k): return MODEL[k]
    return None

CHAIN_HINT = {'ALKOSTO CENTRO': ['alkosto', 'ktronix'], 'ALKOSTO PASTO': ['alkosto'], 'EXITO': ['exito'], 'FALABELLA': ['falabella'],
              'CENCOSUD': ['cencosud'], 'WOM': ['wom'], 'OLIMPICA': ['olimpica']}
# ---------------------------------------------------------------- 2) Target nacional
wb = openpyxl.load_workbook('/mnt/user-data/uploads/9398336f-target_Noviembre_2026_1.0.xlsx', data_only=True)
ws = wb['Target noviembre 2026']
hdr = None; tg_miss = []; tg_ok = 0
num = lambda v: float(v) if isinstance(v, (int, float)) else float(re.sub(r'[^0-9.]', '', str(v)) or 0)
for r in ws.iter_rows(min_row=1, values_only=True):
    if r[1] == 'Zona': hdr = list(r); continue
    if not hdr or not r[1] or not r[3]: continue
    zona_t, cad_t, tienda = r[1], str(r[2]), str(r[3])
    zh = norm(zona_t)
    zh = {'ALKOSTO CENTRO NORTE': 'ALKOSTO CENTRO', 'ALKOSTO CENTRO SUR': 'ALKOSTO CENTRO'}.get(zh, zh)
    st = find_store(tienda, CHAIN_HINT.get(norm(cad_t)), zh if any(s['zona'] == zh for s in stores.values()) else None)
    if not st:
        tg_miss.append((zona_t, cad_t, tienda))
        zmap = {norm(s['zona']): (s['zona'], s['regional']) for s in stores.values()}
        z, rg = zmap.get(zh, (str(zona_t).upper(), 'CENTRO'))
        lk = {'EXITO': 'exito', 'FALABELLA': 'falabella', 'CENCOSUD': 'cencosud', 'WOM': 'wom', 'OLIMPICA': 'olimpica'}.get(norm(cad_t)) or ('ktronix' if 'KTRONIX' in norm(tienda) else 'alkosto')
        i = slug(tienda); i = i if i not in ids else f'{i}_{slug(z)}'; ids.add(i)
        st = stores['T:' + i] = {'id': i, 'shopId': '', 'cadena': norm(cad_t).replace('ALKOSTO CENTRO', 'KTRONIX' if lk == 'ktronix' else 'ALKOSTO'), 'tienda': tienda.strip().upper() if lk != 'falabella' else tienda.strip(),
                                 'usuario': norm(tienda), 'zona': z, 'regional': rg, 'ciudad': '', 'depto': '', 'canal': 'OR', 'logoKey': lk, 'asesoresSeed': []}
    tg_ok += 1
    metas = {}
    for j, h in enumerate(hdr):
        if j >= 11 and j <= 18 and h:
            mk = model_key(h)
            if mk: metas[mk] = round(num(r[j]) or 0)
    st['hc'] = {'INFINIX': r[4] if r[4] else 0}
    st['metas'] = metas
    st['metaMes'] = round(num(r[9]))
    st['kpi'] = {'base': int(num(r[5])), 'k400': int(num(r[6])), 'k700': int(num(r[7]))}
    st['capa'] = round(num(r[8]))
    st['target'] = True
print('Target:', tg_ok, 'cruzadas · sin cruzar:', tg_miss)

# ---------------------------------------------------------------- 3) Asesores y meta por asesor (Seguimiento › Por pmt)
pmt_ok, pmt_miss = 0, []
cur_cad, cur_zona = None, None
ZMAP = {'VALLE': 'VALLE', 'SANTANDER': 'SANTANDER', 'EJE CAFETERO': 'EJE CAFETERO'}
for r in csv.reader(open(f'{SRC}/seg_Por_pmt.csv')):
    if len(r) < 7: continue
    if r[0].startswith('ZONA'):
        m = re.match(r'ZONA ([A-Z ]+?)\s*:', norm(r[0]).replace(' :', ':') + ':')
        z = norm(r[0]).split(' ')[1:]
        z = ' '.join(z).split('  ')[0]
        for k in ZMAP:
            if norm(r[0]).startswith('ZONA ' + k): cur_zona = ZMAP[k]
    if r[1].strip() and 'Total' not in r[1]: cur_cad = r[1].strip()
    if not r[2].strip() or not r[3].strip() or 'Total' in (r[1] + r[0]): continue
    nombre, ced = parse_up(r[3])
    if not ced or 'VACANTE' in norm(r[3]): continue
    hint = CHAIN_HINT.get(norm(cur_cad).replace('ALKOSTO Y KTRONIX', 'ALKOSTO CENTRO').replace('EXITO ', 'EXITO'), None)
    pdv = r[2].replace('/ CENTRO', '').strip()
    st = find_store(pdv, hint, cur_zona)
    if not st: pmt_miss.append((cur_zona, r[2], nombre)); continue
    pmt_ok += 1
    st.setdefault('asesoresPmt', [])
    meta = round(num(r[5])) if r[5] not in ('', None) else 0
    st['asesoresPmt'].append({'nombre': nombre, 'meta': meta, 'hc': num(r[4]) if r[4] else 0})
print('Por pmt:', pmt_ok, 'asesores · sin tienda:', pmt_miss)

# ---------------------------------------------------------------- 4) Inventario por tienda (línea nueva)
inv, inv_src = {}, {}
def put(name, mk, q, hint, src, zona=None):
    if not mk or q in ('', None): return
    st = find_store(name, hint, zona)
    if not st: inv_src.setdefault('miss', set()).add(name); return
    d = inv.setdefault(st['id'], {})
    d[mk] = d.get(mk, 0) + int(round(float(q)))
    inv_src[st['id']] = src
def blocks(path):
    return [r for r in csv.reader(open(path))]
# Éxito: bloques "INVENTARIO EXITO ZONA X AL ..." · fila TIENDA · fila de modelos
rows = blocks(f'{SRC}/inv_INV_EXITO.csv'); i = 0; zona = None
while i < len(rows):
    r = rows[i]
    if r[0].startswith('INVENTARIO EXITO ZONA'):
        zona = norm(r[0]).split('ZONA ')[1].split(' AL ')[0]; zona = {'NARIÑO': 'NARIÑO'}.get(zona, zona)
        models = rows[i + 2]; j = i + 3
        while j < len(rows) and not rows[j][0].startswith('Total'):
            if not rows[j][0].startswith('CEDI'):
                for c, h in enumerate(models):
                    if c and c <= 10 and h: put(rows[j][0], model_key(h), rows[j][c], ['exito'], 'exito')
            j += 1
        i = j
    i += 1
# Alkosto y Ktronix (Valle, Eje, Santander)
rows = blocks(f'{SRC}/inv_INV_ALKOSTO_Y_KTRONIX.csv'); models = rows[2]
for r in rows[3:]:
    if norm(r[0]).startswith('TOTAL') or not r[0].strip(): break
    for c in range(1, 9): put(r[0], model_key(models[c]), r[c], ['alkosto', 'ktronix'], 'alkosto')
# Falabella
rows = blocks(f'{SRC}/inv_INV_FALA.csv'); models = rows[1]
for r in rows[2:]:
    if not r[0].strip() or norm(r[0]).startswith('TOTAL') or norm(r[0]) == 'TIENDA': break
    n = {'LA CAROLA': 'Carola', 'JARDIN PLAZA': 'Jdnplz', 'WTC CALI': 'Wtccali', 'PARQUE ARBOLEDA': 'Parboled'}.get(norm(r[0]), r[0])
    for c in range(1, 8): put(n, model_key(models[c]), r[c], ['falabella'], 'falabella')
# Cencosud (tabla a la derecha: TIENDA, NOTE 60, NOTE EDGE, SMART 20, HOT 70)
rows = blocks(f'{SRC}/inv_INV_CENCO.csv'); hdr_c = None
for r in rows:
    if len(r) > 9 and norm(r[4]) == 'TIENDA': hdr_c = r[4:9]; continue
    if hdr_c and len(r) > 9 and r[4].strip() and not norm(r[4]).startswith('TOTAL'):
        n = r[4].replace('DEL LILI', 'DE LILI')
        for c in range(1, 5): put(n, model_key(hdr_c[c]), r[4 + c], ['cencosud'], 'cencosud')
    if hdr_c and len(r) > 4 and norm(r[4]).startswith('TOTAL'): break
# WOM (bloques de inventario Valle y Santander)
rows = blocks(f'{SRC}/inv_INV_WOM.csv'); i = 0
while i < len(rows):
    if rows[i][0].startswith('INVENTARIO WOM'):
        models = rows[i + 1]; j = i + 2
        while j < len(rows) and not rows[j][0].startswith('Total'):
            for c in range(1, len(models)):
                if models[c] and not norm(models[c]).startswith('TOTAL'): put(rows[j][0], model_key(models[c]), rows[j][c], ['wom'], 'wom')
            j += 1
        i = j
    i += 1
# Alkosto Nariño
rows = blocks(f'{SRC}/inv_INV_ALKOSTO_NARIÑO.csv'); hdr_n = None
for r in rows:
    if r[0] == 'CADENA': hdr_n = r; continue
    if hdr_n and r[0] == 'ALKOSTO':
        for c in range(2, 9):
            mk = model_key(hdr_n[c]); put('ALKOSTO ' + r[1], mk, r[c], ['alkosto'], 'alkosto_narino')
print('Inventario: tiendas', len([k for k in inv]), '· sin cruzar:', inv_src.get('miss'))
for k, v in inv.items():
    for s in stores.values():
        if s['id'] == k: s['inventario'] = v

# HC de la competencia (encuesta)
HC_COLS = ['INFINIX', 'SAMSUNG', 'XIAOMI', 'MOTOROLA', 'HONOR', 'REALME', 'OPPO', 'VIVO', 'TECNO', 'ZTE']
hc_ok = 0
for r in csv.reader(open(f'{SRC}/inv_HC.csv')):
    if len(r) < 12 or not r[1].strip() or r[1].startswith('SELECCIONA') or not re.match(r'^[\d.]+$', r[2] or ''): continue
    st = find_store(r[1].replace('ALKOSTO CENTRO', 'ALKOSTO CENTRO PASTO') if r[0] == 'ALKOSTO NARIÑO' else r[1], None)
    if not st: continue
    hc = st.setdefault('hc', {})
    for j, b in enumerate(HC_COLS):
        if b == 'INFINIX': continue
        try: hc[b] = float(r[2 + j])
        except: pass
    hc_ok += 1
print('HC competencia:', hc_ok)

# ---------------------------------------------------------------- 5) Ensamble final
out_st = []
for s in stores.values():
    pm = s.pop('asesoresPmt', None)
    if pm:
        s['asesoresSeed'] = [a['nombre'] for a in pm if a['hc'] > 0] + [a['nombre'] for a in pm if a['hc'] <= 0]
        s['metasAsesor'] = {a['nombre']: a['meta'] for a in pm}
        s['asesoresApoyo'] = [a['nombre'] for a in pm if a['hc'] <= 0]          # sin meta propia este mes (apoyo/temporada)
    s['isConfigured'] = bool(s.get('target'))
    s.pop('target', None)
    out_st.append(s)
# Tienda que el target trae y la DCR no (WOM Bucaramanga Centro): ya creada desde el target
if False and not any(norm(s['tienda']) == 'TIENDA BUCARAMANGA CENTRO' for s in out_st):
    ws = wb['Target noviembre 2026']
    for r in ws.iter_rows(min_row=5, values_only=True):
        if r[3] == 'Tienda Bucaramanga Centro':
            metas = {model_key(hdr[j]): round(num(r[j])) for j in range(11, 19) if model_key(hdr[j])}
            out_st.append({'id': 'wom_bucaramanga_centro', 'shopId': '', 'cadena': 'WOM', 'tienda': 'TIENDA BUCARAMANGA CENTRO', 'usuario': 'TIENDA BUCARAMANGA CENTRO',
                           'zona': 'SANTANDER', 'regional': 'SUROCCIDENTE', 'ciudad': 'BUCARAMANGA', 'depto': 'SANTANDER', 'canal': 'OR', 'logoKey': 'wom',
                           'asesoresSeed': ['Andres Felipe Beltran Rueda'], 'hc': {'INFINIX': r[4]}, 'metas': metas, 'metaMes': round(num(r[9])),
                           'kpi': {'base': int(num(r[5])), 'k400': int(num(r[6])), 'k700': int(num(r[7]))}, 'capa': round(num(r[8])),
                           'inventario': inv.get('wom_bucaramanga_centro', {'hot-70': 5, 'note-60': 5, 'note-edge': 15}), 'isConfigured': True})
# Éxito Bucaramanga: siempre presente (target 0 si no llega)
for s in out_st:
    if s['id'] == 'tienda_bucaramanga_centro':
        s.update({'ciudad': 'BUCARAMANGA', 'depto': 'SANTANDER', 'asesoresSeed': ['Andres Felipe Beltran Rueda'], 'inventario': {'hot-70': 5, 'note-60': 5, 'note-edge': 15}})
    if s['id'] == 'exito_bucaramanga' and not s.get('metaMes'): s.update({'metas': {}, 'metaMes': 0, 'isConfigured': True})

zones = {}
for s in out_st: zones.setdefault(s['zona'], s['regional'])
zl = [{'id': slug(z), 'nombre': z, 'regional': r} for z, r in sorted(zones.items(), key=lambda x: (x[1], x[0]))]
for z in old['Z']:
    if z['nombre'] in zones and not any(x['nombre'] == z['nombre'] for x in zl): zl.append(z)
zid = {z['nombre']: z['id'] for z in old['Z']}
for z in zl: z['id'] = zid.get(z['nombre'], z['id'])
out_st.sort(key=lambda s: (s['regional'], s['zona'], s['tienda']))
CHAIN_ROI = {'exito': 75, 'wom': 65, 'falabella': 65, 'cencosud': 70, 'alkosto': 60, 'ktronix': 60, 'olimpica': 65}
o = ("// ============================================================================\n"
     "// SEMILLA NACIONAL v1.6 · generada por build/build_seed.py\n"
     "// Fuentes: DCR (Shop Sales Query 1-17 nov 2026), target noviembre 2026, seguimiento Valle/Eje/Santander\n"
     "// e inventarios al 17 de noviembre. Regla de oro: solo Éxito, Alkosto, Ktronix, Falabella, Cencosud, WOM y Olímpica.\n"
     "// Las cédulas no se publican aquí: llegan con la data DCR que se carga en Análisis de zona.\n"
     "// ============================================================================\n")
o += "const SEED_VERSION = 'nov2026-v1.6';\n"
o += "const SEED_MONTH = '2026-11';\n"
o += "const REGIONALES = %s;\n" % json.dumps(sorted(set(zones.values())), ensure_ascii=False)
o += "const INITIAL_ZONES_SEED = %s;\n" % json.dumps(zl, ensure_ascii=False)
o += "const CHAIN_ROI = %s;      // ROI de referencia por cadena (seguimiento por cuenta)\n" % json.dumps(CHAIN_ROI)
o += "const INITIAL_STORES_SEED = [\n" + ",\n".join('    ' + json.dumps(s, ensure_ascii=False) for s in out_st) + "\n];\n"
o += "const DEMO_SALES_MONTH = '2026-11', DEMO_SALES_CORTE = '2026-11-17';\nconst DEMO_SALES = {};\n"
open(sys.argv[1], 'w', encoding='utf-8').write(o)
by = {}
for s in out_st: by[s['logoKey']] = by.get(s['logoKey'], 0) + 1
print(len(o) // 1024, 'KB ·', len(zl), 'zonas ·', len(out_st), 'tiendas', by, '· con target', sum(1 for s in out_st if s.get('metaMes')), '· con inventario', sum(1 for s in out_st if s.get('inventario')))
san = [s for s in out_st if s['zona'] == 'SANTANDER']
for s in san: print(' ', s['tienda'], s.get('hc', {}).get('INFINIX'), s.get('metaMes'), s.get('kpi'), s.get('metasAsesor'), s.get('inventario'))
