#!/usr/bin/env python3
"""Importeer een TopoMania-kaart naar data/items.js.

Gebruik:
    python3 tools/import_map.py 319

De kaart-id staat in de URL van de kaart op topomania.net (bijv.
https://www.topomania.net/map/319). Namen werken ook:
https://topomania.net/map/Basiskaart%20Nederland -> die pagina bevat "mapId":319.

Schrijft data/items.js met per item: naam, categorie, lat/lng en (waar
TopoMania die heeft) een vereenvoudigde vorm om rivieren en gebieden te
kunnen tonen.
"""

import json
import re
import sys
import urllib.parse
import urllib.request
import http.cookiejar
from pathlib import Path

BASE = "https://www.topomania.net"
ROOT = Path(__file__).resolve().parent.parent

# featureType van TopoMania -> categorie in de app
CATEGORIES = {
    "Place": "plaatsen",
    "Admin1": "provincies",
    "Admin2": "eilanden",
    "Area": "gebieden",
    "Water": "water",
    "Structure": "bouwwerken",
    "Mountain": "bergen",
}


def opener_with_token(map_id):
    """Haal een sessiecookie + CSRF-token op; die eist de API."""
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.addheaders = [("User-Agent", "topo-study-importer/1.0")]
    # unquote eerst, zodat zowel "Basiskaart Nederland" als "Basiskaart%20Nederland" werkt
    slug = urllib.parse.quote(urllib.parse.unquote(str(map_id)))
    with opener.open(f"{BASE}/map/{slug}") as resp:
        html = resp.read().decode("utf-8", "replace")
    token = re.search(r'name="csrf-token" content="([^"]+)"', html)
    if not token:
        sys.exit("Geen CSRF-token gevonden - is de kaart-id juist?")
    # Een naam-URL lost op naar een numerieke id; die hebben we nodig voor de API.
    resolved = re.search(r'mapId"\s*:\s*"?(\d+)', html)
    title = re.search(r"<title>([^<]*)</title>", html)
    return opener, token.group(1), (resolved.group(1) if resolved else str(map_id)), (
        title.group(1).strip() if title else ""
    )


def api(opener, token, payload):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{BASE}/tpmjsapi",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRF-TOKEN": token,
        },
    )
    with opener.open(req) as resp:
        raw = resp.read()
    return json.loads(raw) if raw else None


def rdp(points, eps):
    """Ramer-Douglas-Peucker: gooi punten weg die de vorm niet veranderen."""
    if len(points) < 3:
        return points
    ax, ay = points[0]
    bx, by = points[-1]
    dx, dy = bx - ax, by - ay
    norm = (dx * dx + dy * dy) ** 0.5
    worst, index = -1.0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        if norm == 0:
            dist = ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
        else:
            dist = abs(dy * (px - ax) - dx * (py - ay)) / norm
        if dist > worst:
            worst, index = dist, i
    if worst <= eps:
        return [points[0], points[-1]]
    return rdp(points[: index + 1], eps)[:-1] + rdp(points[index:], eps)


def simplify_ring(ring, eps, digits=4):
    pts = [(round(p[0], digits), round(p[1], digits)) for p in ring]
    # dubbele punten na afronden weghalen
    dedup = [pts[0]]
    for p in pts[1:]:
        if p != dedup[-1]:
            dedup.append(p)
    small = rdp(dedup, eps)
    return [[x, y] for x, y in small] if len(small) >= 3 else None


# Handmatige correcties op de brondata.
# De vorm van de Rijn in TopoMania is de hele Rijn (tot in Zwitserland); het
# Nederlandse stuk is maar klein en het labelpunt lag in de Noordzee. We zetten
# het punt op Lobith, waar de Rijn Nederland binnenkomt.
PUNT_CORRECTIES = {
    "Rijn": (51.855, 6.105),
}

# Ruime bounding box om Nederland; alles daarbuiten hoort niet op de kaart.
# De Maas en de Rijn lopen in de brondata door tot in Frankrijk en Zwitserland.
NL_BOX = (3.20, 50.68, 7.32, 53.62)  # lng min, lat min, lng max, lat max


def clip_ring(ring, box):
    """Sutherland-Hodgman: knip een ring af op de rechthoek."""
    x0, y0, x1, y1 = box
    edges = (
        lambda p: p[0] >= x0, lambda p: p[0] <= x1,
        lambda p: p[1] >= y0, lambda p: p[1] <= y1,
    )
    cuts = (
        lambda a, b: (x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0])),
        lambda a, b: (x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0])),
        lambda a, b: (a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0),
        lambda a, b: (a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1),
    )
    poly = [tuple(p[:2]) for p in ring]
    for inside, cut in zip(edges, cuts):
        if not poly:
            return []
        out = []
        for i, cur in enumerate(poly):
            prev = poly[i - 1]
            cur_in, prev_in = inside(cur), inside(prev)
            if cur_in:
                if not prev_in:
                    out.append(cut(prev, cur))
                out.append(cur)
            elif prev_in:
                out.append(cut(prev, cur))
        poly = out
    return poly


def simplify_geometry(geom, eps=0.004):
    """Alleen de buitenringen; gaten en minivlekjes zijn hier niet nodig."""
    kind = geom["type"]
    polys = geom["coordinates"] if kind == "MultiPolygon" else [geom["coordinates"]]
    out = []
    for poly in polys:
        clipped = clip_ring(poly[0], NL_BOX)
        if len(clipped) < 4:
            continue
        ring = simplify_ring(clipped, eps)
        if ring and len(ring) >= 4:
            out.append(ring)
    return out or None


def representative_point(rings):
    """Punt op de vorm zelf, als vervanger voor een ontbrekend of verdwaald labelpunt.

    Het middelpunt van een kronkelende rivier ligt vaak naast de rivier, dus we
    pakken het hoekpunt dat het dichtst bij dat middelpunt ligt.
    """
    biggest = max(rings, key=len)
    cx = sum(p[0] for p in biggest) / len(biggest)
    cy = sum(p[1] for p in biggest) / len(biggest)
    best = min(biggest, key=lambda p: (p[0] - cx) ** 2 + (p[1] - cy) ** 2)
    return round(best[0], 5), round(best[1], 5)


def bbox(rings):
    xs = [p[0] for r in rings for p in r]
    ys = [p[1] for r in rings for p in r]
    return min(xs), min(ys), max(xs), max(ys)


def main():
    map_id = sys.argv[1] if len(sys.argv) > 1 else "319"
    opener, token, numeric_id, title = opener_with_token(map_id)
    print(f"Kaart: {title} (id {numeric_id})")

    data = api(opener, token, {
        "ri": 102, "ti": "0", "mi": numeric_id, "ln": "nl",
        "shapes": 1, "gp": 4326, "scores": 0,
    })
    if not data or not data.get("mapItems"):
        sys.exit("Geen items ontvangen van de API.")

    raw_items = data["mapItems"]
    shapes = data.get("shapes") or []

    # De API stuurt shapes in dezelfde volgorde als de items met isShape=True.
    shaped = [i for i in raw_items if i.get("isShape")]
    if len(shaped) != len(shapes):
        print(f"  let op: {len(shaped)} vormitems maar {len(shapes)} vormen")
    geoms = {}
    for item, fc in zip(shaped, shapes):
        # Provincievormen komen uit data/kaart.js (die zijn zonder water en
        # passen dus precies op de achtergrondkaart).
        if item["featureType"] == "Admin1":
            continue
        rings = simplify_geometry(fc["features"][0]["geometry"])
        if rings:
            geoms[id(item)] = rings

    items = []
    verplaatst = []
    for item in raw_items:
        name = (item.get("tname") or item.get("labelText") or "").strip()
        if not name:
            continue
        lat, lng = item["latitude"], item["longitude"]
        rings = geoms.get(id(item))
        if rings:
            x0, y0, x1, y1 = bbox(rings)
            margin = 0.2
            binnen = x0 - margin <= lng <= x1 + margin and y0 - margin <= lat <= y1 + margin
            # Waddeneilanden heeft helemaal geen punt; Rijn heeft er een die
            # kilometers van zijn eigen loop ligt. Beide op de vorm zetten.
            if not binnen or (lat == 0 and lng == 0):
                lng, lat = representative_point(rings)
                verplaatst.append(name)
        if name in PUNT_CORRECTIES:
            lat, lng = PUNT_CORRECTIES[name]
        entry = {
            "id": str(item.get("tpmId") or item.get("geonameId")),
            "naam": name,
            "cat": CATEGORIES.get(item["featureType"], "overig"),
            "lat": round(lat, 5),
            "lng": round(lng, 5),
        }
        if rings:
            entry["vorm"] = rings
        items.append(entry)
    if verplaatst:
        print(f"  labelpunt op de vorm gezet voor: {', '.join(verplaatst)}")

    zonder_punt = [i["naam"] for i in items if i["lat"] == 0 or i["lng"] == 0]
    if zonder_punt:
        print(f"  LET OP - nog steeds zonder locatie: {', '.join(zonder_punt)}")

    items.sort(key=lambda i: (i["cat"], i["naam"]))

    out = ROOT / "data" / "items.js"
    out.parent.mkdir(exist_ok=True)
    payload = {
        "bron": f"TopoMania kaart {numeric_id} - {title}",
        "items": items,
    }
    with out.open("w", encoding="utf-8") as fh:
        fh.write("// Automatisch gegenereerd door tools/import_map.py - niet met de hand aanpassen.\n")
        fh.write(f"// Bron: {payload['bron']}\n")
        fh.write("window.TOPO_DATA = ")
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")

    per_cat = {}
    for i in items:
        per_cat[i["cat"]] = per_cat.get(i["cat"], 0) + 1
    print(f"{len(items)} items -> {out.relative_to(ROOT)} ({out.stat().st_size // 1024} kB)")
    for cat, n in sorted(per_cat.items()):
        print(f"  {cat:12s} {n}")


if __name__ == "__main__":
    main()
