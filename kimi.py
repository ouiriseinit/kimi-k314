							
							
# ============================================================================							
# LLM Knowledge Map Generator — Complete Python Code							
# ============================================================================							
# Part 1: Data Generation							
# -----------------------							
import numpy as np							
import pandas as pd							
import networkx as nx							
import random							
							
np.random.seed(42)							
random.seed(42)							
							
N_PAPERS = 1000							
YEARS = range(2018, 2026)							
CLUSTERS = {							
    0: "Transformer Architecture", 1: "BERT & Pre-training",							
    2: "GPT & Autoregressive", 3: "Large-scale Training",							
    4: "RLHF & Alignment", 5: "Multimodal Models",							
    6: "Prompt Engineering", 7: "Efficiency & Compression",							
    8: "Reasoning & Agents", 9: "Safety & Ethics",							
    10: "Code Generation", 11: "Long Context",							
}							
							
def generate_papers(n=1000):							
    papers = []							
    for i in range(n):							
        year = np.random.choice(list(YEARS), p=[0.08,0.12,0.15,0.18,0.20,0.15,0.08,0.04])							
        cluster = np.random.choice(range(12), p=[0.08,0.10,0.12,0.10,0.12,0.08,0.10,0.08,0.08,0.06,0.04,0.04])							
        citations = int(np.random.exponential(150) + 20)							
        if year <= 2020: citations = int(citations * 1.8)							
        papers.append({							
            'id': i, 'year': year, 'cluster': cluster,							
            'citation_count': min(citations, 8000),							
            'betweenness': 0, 'burst_strength': np.random.exponential(1.5) + 0.2							
        })							
    return pd.DataFrame(papers)							
							
df = generate_papers(1000)							
							
# Part 2: Network Construction							
# ----------------------------							
G = nx.Graph()							
for _, row in df.iterrows():							
    G.add_node(row['id'], year=row['year'], cluster=row['cluster'],							
               citation_count=row['citation_count'])							
							
# Intra-cluster edges							
for c in range(12):							
    nodes = df[df['cluster']==c]['id'].tolist()							
    for i, p1 in enumerate(nodes):							
        for p2 in nodes[i+1:]:							
            if random.random() < 0.15:							
                G.add_edge(p1, p2, weight=random.uniform(1,10))							
							
# Cross-cluster edges							
for _, r1 in df.iterrows():							
    for _, r2 in df.iterrows():							
        if r1['id'] >= r2['id']: continue							
        if abs(r1['cluster']-r2['cluster']) <= 2 and random.random() < 0.02:							
            G.add_edge(r1['id'], r2['id'], weight=random.uniform(0.5,4))							
        elif random.random() < 0.003:							
            G.add_edge(r1['id'], r2['id'], weight=random.uniform(0.1,2))							
							
# Part 3: Louvain Clustering							
# --------------------------							
import community as community_louvain							
							
partition = community_louvain.best_partition(G, weight='weight', resolution=1.0)							
modularity_q = community_louvain.modularity(partition, G, weight='weight')							
df['cluster'] = df['id'].map(partition)							
							
betweenness = nx.betweenness_centrality(G, weight='weight', k=500)							
df['betweenness'] = df['id'].map(betweenness)							
							
# Part 4: Force-Directed Layout & Visualization (8000x6000)							
# ----------------------------------------------------------							
import matplotlib.pyplot as plt							
from matplotlib.patches import Circle							
import matplotlib.patches as mpatches							
							
pos = nx.spring_layout(G, k=2.5/np.sqrt(G.number_of_nodes()),							
                       iterations=150, weight='weight', seed=42)							
							
# Normalize positions							
x_vals = [p[0] for p in pos.values()]; y_vals = [p[1] for p in pos.values()]							
x_min, x_max = min(x_vals), max(x_vals); y_min, y_max = min(y_vals), max(y_vals)							
margin = 0.08							
for nid in pos:							
    pos[nid] = (margin + (pos[nid][0]-x_min)/(x_max-x_min)*(1-2*margin),							
                margin + (pos[nid][1]-y_min)/(y_max-y_min)*(1-2*margin))							
							
# Year color map (rainbow: blue 2018 -> red 2025)							
year_colors = {							
    2017:'#0066ff', 2018:'#2e9999', 2019:'#66cc66', 2020:'#cccc00',							
    2021:'#ffcc00', 2022:'#ff6600', 2023:'#ff0000', 2024:'#cc0066', 2025:'#6600cc'							
}							
							
fig, ax = plt.subplots(figsize=(80,60), dpi=100)							
ax.set_xlim(0,1); ax.set_ylim(0,1); ax.axis('off')							
							
# Draw edges							
for u,v,d in G.edges(data=True):							
    x1,y1 = pos[u]; x2,y2 = pos[v]							
    ax.plot([x1,x2],[y1,y2], color='#aaaaaa', linewidth=0.3, alpha=0.2)							
							
# Draw nodes (CiteSpace-style small dots)							
max_cite = df['citation_count'].max()							
for _,row in df.iterrows():							
    x,y = pos[row['id']]							
    ratio = row['citation_count'] / max_cite							
    if ratio < 0.01: d = random.uniform(3,4.5)							
    elif ratio < 0.05: d = 4 + ratio*100							
    elif ratio < 0.15: d = 5 + ratio*40							
    elif ratio < 0.4: d = 7 + ratio*15							
    else: d = 10 + np.sqrt(ratio)*16							
    r = d/2 * 0.00036  # scale for 8000x6000							
    color = year_colors.get(row['year'], '#888888')							
    circle = Circle((x,y), r, facecolor=color, alpha=0.9, edgecolor='none', zorder=3)							
    ax.add_patch(circle)							
							
plt.savefig('knowledge_map.png', dpi=100, bbox_inches='tight', facecolor='white')							
							
# Part 5: Excel Workbook Assembly (LVMH-style luxury palette)							
# -----------------------------------------------------------							
from openpyxl import Workbook							
from openpyxl.chart import BarChart, AreaChart, Reference							
from openpyxl.drawing.image import Image as XLImage							
from openpyxl.formatting.rule import ColorScaleRule							
							
wb = Workbook()							
ws = wb.active; ws.title = "Knowledge Map"							
img = XLImage('knowledge_map.png'); img.width = 1920; img.height = 1440							
ws.add_image(img, 'A3')							
wb.save('LLM_Knowledge_Map_2018_2025.xlsx')							
							
