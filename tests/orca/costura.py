"""Salto da costura do maior laço externo entre camadas vizinhas. uso: python3 -I seamjump.py arq.gcode"""
import sys, math, collections
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from analyze import parse
P = parse(sys.argv[1]); loops = collections.defaultdict(list); cur = None; prev = None
for m in P['moves']:
    if not m['body']: continue
    if m['k'] == 'E' and m['t'] == 'Outer wall':
        if prev is None or prev['k'] != 'E' or prev['t'] != 'Outer wall': cur = [m['x0'], m['y0'], 0.0]; loops[m['l']].append(cur)
        cur[2] += m['d']
    if m['k'] in ('E', 'T', 'W'): prev = m
seq = []
for l in sorted(loops):
    if l == 0: continue
    b = max(loops[l], key=lambda c: c[2]); seq.append((l, b[0], b[1], b[2]))
j = [math.hypot(seq[i][1] - seq[i - 1][1], seq[i][2] - seq[i - 1][2]) for i in range(1, len(seq)) if abs(seq[i][3] - seq[i - 1][3]) < 0.15 * seq[i][3]]
j.sort(); n = len(j)
print('camadas comparadas %d | mediana %.3f mm | p90 %.2f mm | saltos > 1 mm: %d (%.0f%%) | > 5 mm: %d' % (n, j[n // 2], j[int(n * 0.9)], sum(1 for v in j if v > 1), 100 * sum(1 for v in j if v > 1) / n, sum(1 for v in j if v > 5)))
