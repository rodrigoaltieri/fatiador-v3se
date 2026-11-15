"""Analisa um G-code (Orca, nosso motor ou three-slicer) por tipo de trecho.
uso: python3 -I analyze.py arquivo.gcode [--json saida.json]"""
import sys, re, math, json, collections
FIL = math.pi * 0.875 ** 2
def parse(path):
    x = y = z = 0.0; e_abs = 0.0; rel = False; f = 0.0; accP = accT = None
    typ = 'Custom'; layer = -1; width = None; body = False
    moves = []  # dict por movimento
    ev = collections.Counter(); fan = []; temps = []; lines_hdr = []; m204 = collections.Counter()
    wipe = False; ret = 0.0; own = False
    n = 0
    for raw in open(path, encoding='utf8', errors='replace'):
        n += 1
        L = raw.rstrip('\n')
        if L.startswith(';'):
            if L.startswith(';TYPE:'): typ = L[6:].strip()
            elif L.startswith(';LAYER:'): layer = int(L[7:]); body = True; own = True
            elif L.startswith(';LAYER_CHANGE') or L.startswith('; LAYER '):
                if not own: layer += 1
                body = True
            elif L.startswith(';WIDTH:'): width = float(L[7:])
            elif L.startswith(';WIPE_START'): wipe = True
            elif L.startswith(';WIPE_END'): wipe = False
            elif L.startswith('; walls'): typ = 'walls'
            elif L.startswith('; gap-fill'): typ = 'Gap infill'
            elif L.startswith('; bridge'): typ = 'Bridge'
            elif L.startswith('; skirt'): typ = 'Skirt'
            elif L.startswith(';FIM') or L.startswith('; filament end gcode') or L.startswith('; EXECUTABLE_BLOCK_END'): body = False
            continue
        c = L.split(';')[0].strip()
        if not c: continue
        p = c.split(); cmd = p[0]
        if cmd == 'M83': rel = True; continue
        if cmd == 'M82': rel = False; continue
        if cmd == 'G92':
            for t in p[1:]:
                if t[0] == 'E': e_abs = float(t[1:])
            continue
        if cmd == 'M204':
            for t in p[1:]:
                if t[0] == 'P': accP = float(t[1:])
                if t[0] == 'T': accT = float(t[1:])
                if t[0] == 'S': accP = accT = float(t[1:])
            if body: m204[' '.join(t for t in p[1:] if t[0] in 'PTSR')] += 1
            continue
        if cmd in ('M106', 'M107'):
            s = 0.0
            if cmd == 'M106':
                s = 255.0
                for t in p[1:]:
                    if t[0] == 'S': s = float(t[1:])
            fan.append((layer, s)); continue
        if cmd in ('M104', 'M109', 'M140', 'M190'):
            temps.append((layer, c)); continue
        if cmd not in ('G0', 'G1', 'G2', 'G3'): 
            if not body: lines_hdr.append(c)
            continue
        nx, ny, nz, de = x, y, z, 0.0; hasE = False
        for t in p[1:]:
            k = t[0]
            try: v = float(t[1:])
            except ValueError: continue
            if k == 'X': nx = v
            elif k == 'Y': ny = v
            elif k == 'Z': nz = v
            elif k == 'F': f = v
            elif k == 'E':
                hasE = True
                if rel: de = v
                else: de = v - e_abs; e_abs = v
        d = math.hypot(nx - x, ny - y); dz = nz - z
        kind = None
        if d > 1e-6 and de > 1e-9: kind = 'E'
        elif d > 1e-6 and de < -1e-9: kind = 'W'      # limpeza com retração
        elif d > 1e-6: kind = 'T'
        elif de < -1e-9: kind = 'R'
        elif de > 1e-9: kind = 'U'
        elif abs(dz) > 1e-9: kind = 'Z'
        if kind:
            moves.append(dict(k=kind, t=typ, l=layer, x0=x, y0=y, x1=nx, y1=ny, z0=z, z1=nz, d=d, e=de, f=f, aP=accP, aT=accT, w=width, body=body, wipe=wipe, cmd=cmd, n=n))
        x, y, z = nx, ny, nz
    return dict(moves=moves, fan=fan, temps=temps, hdr=lines_hdr, m204=m204)
def wavg(pairs):
    s = sum(w for _, w in pairs); return sum(v * w for v, w in pairs) / s if s else float('nan')
def dist(pairs, nmax=4):
    c = collections.Counter()
    for v, w in pairs: c[v] += w
    tot = sum(c.values()) or 1
    return ', '.join('%g (%d%%)' % (k, round(100 * v / tot)) for k, v in c.most_common(nmax))
def summarize(P, h=0.2, flow=0.98):
    mv = [m for m in P['moves'] if m['body']]
    types = collections.OrderedDict()
    for m in mv:
        if m['k'] != 'E': continue
        T = types.setdefault(m['t'], dict(len=0.0, e=0.0, time=0.0, F=[], A=[], Wd=[], n=0, first=dict(len=0.0, e=0.0, F=[])))
        tgt = T
        T['len'] += m['d']; T['e'] += m['e']; T['n'] += 1; T['time'] += m['d'] / (m['f'] / 60) if m['f'] else 0
        if m['l'] == 0: T['first']['len'] += m['d']; T['first']['e'] += m['e']; T['first']['F'].append((round(m['f'] / 60, 1), m['d']))
        else:
            T['F'].append((round(m['f'] / 60, 1), m['d'])); T['A'].append((m['aP'], m['d']))
            area = m['e'] * FIL / m['d'] / flow
            T['Wd'].append((round((area - math.pi * h * h / 4) / h + h, 2), m['d']))
    out = collections.OrderedDict()
    for t, T in types.items():
        out[t] = dict(comprimento_mm=round(T['len'], 1), filamento_mm=round(T['e'], 2), trechos=T['n'],
                      largura_media=round(wavg(T['Wd']), 3) if T['Wd'] else None, larguras=dist(T['Wd']),
                      vel_media=round(wavg(T['F']), 1) if T['F'] else None, velocidades=dist(T['F']), aceleracoes=dist(T['A']),
                      vel_1a_camada=dist(T['first']['F']))
    c = collections.Counter(m['k'] for m in mv)
    retr = [m for m in mv if m['k'] == 'R']; wipes = [m for m in mv if m['k'] == 'W']
    trav = [m for m in mv if m['k'] == 'T']
    zt = [m for m in trav if abs(m['z1'] - m['z0']) > 1e-9]
    tot_e = sum(m['e'] for m in mv if m['k'] == 'E')
    g = dict(camadas=max((m['l'] for m in mv), default=-1) + 1, movimentos=dict(c),
             filamento_m=round(tot_e / 1000, 3), gramas=round(tot_e * FIL * 1.24 / 1000, 2),
             retracoes=len(retr), retracao_mm=dist([(round(-m['e'], 3), 1) for m in retr]), vel_retracao=dist([(m['f'] / 60, 1) for m in retr]),
             limpezas=len(wipes), limpeza_mm=round(sum(m['d'] for m in wipes), 1), limpeza_retracao=dist([(round(-m['e'], 3), 1) for m in wipes]), vel_limpeza=dist([(round(m['f'] / 60, 1), m['d']) for m in wipes]),
             desretracoes=c['U'], vel_desretracao=dist([(m['f'] / 60, 1) for m in mv if m['k'] == 'U']),
             deslocamentos=len(trav), desloc_mm=round(sum(m['d'] for m in trav), 1), vel_desloc=dist([(round(m['f'] / 60, 1), m['d']) for m in trav]), acel_desloc=dist([(m['aT'], m['d']) for m in trav]),
             desloc_com_z=len(zt), z_puro=c['Z'], vel_z=dist([(round(m['f'] / 60, 1), 1) for m in mv if m['k'] == 'Z']),
             ventilador=[(l, s) for l, s in P['fan']][:12], n_ventilador=len(P['fan']), temperaturas=P['temps'][:10], m204=dict(P['m204'].most_common(8)))
    return dict(geral=g, tipos=out)
if __name__ == '__main__':
    P = parse(sys.argv[1]); S = summarize(P)
    if '--json' in sys.argv: json.dump(S, open(sys.argv[sys.argv.index('--json') + 1], 'w'), indent=1, ensure_ascii=False)
    print(json.dumps(S['geral'], indent=1, ensure_ascii=False))
    for t, v in S['tipos'].items(): print('%-22s' % t, json.dumps(v, ensure_ascii=False))
