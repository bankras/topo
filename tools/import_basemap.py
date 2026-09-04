#!/usr/bin/env python3
"""Haal de provinciegrenzen op en schrijf ze naar data/kaart.js.

Bron: https://cartomap.github.io/nl/ (vereenvoudigde CBS-grenzen, WGS84).
Deze grenzen zijn zonder water, dus IJsselmeer, Markermeer, Waddenzee en
Noordzee blijven automatisch open water op de kaart.

Gebruik:
    python3 tools/import_basemap.py [jaar]
"""

import json
import sys
import urllib.request
from pathlib import Path

from import_map import rdp, simplify_ring

ROOT = Path(__file__).resolve().parent.parent
BRON = "https://cartomap.github.io/nl/wgs84/provincie_{jaar}.geojson"

# CBS gebruikt de Friese naam; de topografielijst van school gebruikt Friesland.
NAAM = {"Fryslân": "Friesland"}


def main():
    jaar = sys.argv[1] if len(sys.argv) > 1 else "2025"
    url = BRON.format(jaar=jaar)
    with urllib.request.urlopen(url) as resp:
        data = json.load(resp)
    print(f"{url} -> {len(data['features'])} provincies")

    provincies = []
    for feat in data["features"]:
        naam = feat["properties"]["statnaam"]
        naam = NAAM.get(naam, naam)
        geom = feat["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        ringen = []
        for poly in polys:
            ring = simplify_ring(poly[0], eps=0.0015)
            # Heel kleine eilandjes en zandplaten laten we weg.
            if ring and len(ring) >= 5:
                ringen.append(ring)
        ringen.sort(key=len, reverse=True)
        provincies.append({"naam": naam, "ringen": ringen})
        print(f"  {naam:16s} {len(ringen)} ringen, {sum(len(r) for r in ringen)} punten")

    provincies.sort(key=lambda p: p["naam"])
    out = ROOT / "data" / "kaart.js"
    out.parent.mkdir(exist_ok=True)
    with out.open("w", encoding="utf-8") as fh:
        fh.write("// Automatisch gegenereerd door tools/import_basemap.py.\n")
        fh.write(f"// Bron: {url} (CBS/PDOK provinciegrenzen, zonder water)\n")
        fh.write("window.TOPO_KAART = ")
        json.dump({"bron": url, "provincies": provincies}, fh,
                  ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")
    print(f"-> {out.relative_to(ROOT)} ({out.stat().st_size // 1024} kB)")


if __name__ == "__main__":
    main()
