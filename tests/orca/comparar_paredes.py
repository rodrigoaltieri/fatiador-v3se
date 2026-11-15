"""Compara trecho a trecho (paredes) dois G-codes. uso: python3 -I cmpwalls.py ref.gcode nosso.gcode [tol_mm]"""
import sys, math, collections
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from analyze import parse
tol = float(sys.argv[3]) if len(sys.argv) > 3 else 0.003
def segs(path):
    out = collections.defaultdict(list)
    for m in parse(path)['moves']:
        if m['k'] == 'E' and m['body'] and m['t'] in ('Outer wall', 'Inner wall'):
            a = (m['x0'], m['y0']); b = (m['x1'], m['y1'])
            out[(m['l'], m['t'])].append((a, b, m['e'] / m['d'], m['f'] / 60, m['aP'], m['d']))
    return out
A = segs(sys.argv[1]); B = segs(sys.argv[2])
tot = collections.Counter(); worst = 0.0
def dist_pt_seg(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]; l2 = dx * dx + dy * dy
    t = 0 if l2 < 1e-12 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
    return math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t)
for key in sorted(set(A) | set(B)):
    l, t = key
    if l == 0: continue
    sa, sb = A.get(key, []), B.get(key, [])
    la = sum(s[5] for s in sa); lb = sum(s[5] for s in sb)
    tot[t + ' comprimento ref'] += la; tot[t + ' comprimento nosso'] += lb
    # cada ponto do nosso laço deve estar sobre algum trecho da referência
    for s in sb:
        for p in (s[0], s[1], ((s[0][0] + s[1][0]) / 2, (s[0][1] + s[1][1]) / 2)):
            d = min((dist_pt_seg(p, r[0], r[1]) for r in sa), default=9)
            worst = max(worst, d)
            if d > tol: tot[t + ' pontos fora'] += 1
            else: tot[t + ' pontos ok'] += 1
    ea = sum(s[2] * s[5] for s in sa); eb = sum(s[2] * s[5] for s in sb)
    tot[t + ' E ref'] += ea; tot[t + ' E nosso'] += eb
    fa = collections.Counter(round(s[3], 1) for s in sa); fb = collections.Counter(round(s[3], 1) for s in sb)
    if set(fa) != set(fb): tot[t + ' camadas com velocidade diferente'] += 1
    aa = set(s[4] for s in sa); ab = set(s[4] for s in sb)
    if aa != ab: tot[t + ' camadas com aceleração diferente'] += 1
for k in sorted(tot): print('%-45s %s' % (k, round(tot[k], 3)))
print('maior desvio de posição: %.4f mm' % worst)
