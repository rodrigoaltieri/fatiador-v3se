import json, sys, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
# uso: plot.py arquivo.json saida.png camada[,camada...] [x0,y0,x1,y1]
d=json.load(open(sys.argv[1])); pos=d['pos']; col=d['col']; ends=d['ends']
layers=[int(v) for v in sys.argv[3].split(',')]
box=[float(v) for v in sys.argv[4].split(',')] if len(sys.argv)>4 else None
n=len(layers); cols_=min(n,3); rows=(n+cols_-1)//cols_
fig,axs=plt.subplots(rows,cols_,figsize=(11*cols_,8*rows),squeeze=False)
for ax,l in zip(axs.flat,layers):
    s=ends[l-1] if l>0 else 0; e=ends[l]
    segs=[((pos[i*6],pos[i*6+1]),(pos[i*6+3],pos[i*6+4])) for i in range(s,e)]
    cs=[(col[i*6]/255,col[i*6+1]/255,col[i*6+2]/255) for i in range(s,e)]
    ax.add_collection(LineCollection(segs,colors=cs,linewidths=1.6))
    if box: ax.set_xlim(box[0],box[2]); ax.set_ylim(box[1],box[3])
    else: ax.autoscale()
    ax.set_aspect('equal'); ax.set_title(f'camada {l} ({e-s} segs)'); ax.set_facecolor('#1c1c1c')
plt.savefig(sys.argv[2],dpi=60,bbox_inches='tight')
