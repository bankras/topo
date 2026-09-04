/* Tekent de kaart van Nederland als SVG en rekent klikken om naar plekken.
   Geen bibliotheken: alles werkt ook zonder internet, direct vanaf schijf. */

const SVG_NS = 'http://www.w3.org/2000/svg';

// Kaartvenster in SVG-eenheden. Nederland is ~310 km hoog, dus met een hoogte
// van 1000 is 1 eenheid ongeveer 310 meter. Tolveranties hieronder gebruiken
// diezelfde eenheid.
const HOOGTE = 1000;
const RAND = 14;

/* Hoe nauwkeurig moet een klik zijn? Dat hangt af van wat je aanwijst.
   1 SVG-eenheid is ongeveer 340 meter.

   - Vlakken (provincie, eiland, gebied): de klik moet er vrijwel binnen
     liggen. Niet helemaal exact: één beeldpunt is bijna 2 eenheden, en
     Schiermonnikoog is nauwelijks breder dan dat. Zonder die kleine marge zou
     een klik midden op het eiland alsnog "mis" zijn. De marge is klein genoeg
     dat Den Helder niet als Texel geldt (13 eenheden ertussen); bij een
     provinciegrens vangt de "dichterbij"-controle hieronder het af.
   - Rivieren en kanalen zijn dun; daar mag je er een paar kilometer naast
     zitten, maar niet 20 km (anders geldt Breda als de Maas).
   - Punten zonder vorm (steden, en grote wateren als de Noordzee) krijgen een
     straal om het punt heen. */
const TOL_VLAK = 6;
const TOL_LIJN = 14;

// Van klein naar groot: welk vlak bedoel je als er meerdere overlappen?
const VLAK_RANG = { eilanden: 0, gebieden: 1, provincies: 2 };

const TOL_PUNT = {
  plaatsen: 32,
  bergen: 32,
  bouwwerken: 36,
  water: 95,
  gebieden: 70,
  eilanden: 45,
  overig: 50,
};

function el(naam, attrs) {
  const node = document.createElementNS(SVG_NS, naam);
  for (const key in attrs) {
    if (attrs[key] === null || attrs[key] === undefined) continue;
    node.setAttribute(key, attrs[key]);
  }
  return node;
}

class Kaart {
  constructor(svg, kaartData) {
    this.svg = svg;
    this.kaartData = kaartData;
    this._bereken();
    this._bouw();
    this.puntNodes = new Map();
  }

  /* ---- projectie (web-mercator, zodat de vorm klopt) ---- */

  // Mercator rekent in radialen; x en y moeten dezelfde eenheid hebben,
  // anders wordt de kaart uitgerekt.
  _mercX(lng) {
    return (lng * Math.PI) / 180;
  }

  _mercY(lat) {
    return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  }

  _bereken() {
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const prov of this.kaartData.provincies) {
      for (const ring of prov.ringen) {
        for (const [lng, lat] of ring) {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
    }
    this.grenzen = { minLng, maxLng, minLat, maxLat };
    // In mercator loopt y omhoog met de breedtegraad, op het scherm omlaag:
    // daarom rekenen we vanaf de bovenkant naar beneden.
    this._yBoven = this._mercY(maxLat);
    this._schaal = (HOOGTE - RAND * 2) / (this._yBoven - this._mercY(minLat));
    this._xLinks = this._mercX(minLng);
    this.breedte = (this._mercX(maxLng) - this._xLinks) * this._schaal + RAND * 2;
    this.hoogte = HOOGTE;
    this.svg.setAttribute('viewBox', `0 0 ${this.breedte.toFixed(1)} ${this.hoogte}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }

  naarXY(lat, lng) {
    return {
      x: (this._mercX(lng) - this._xLinks) * this._schaal + RAND,
      y: (this._yBoven - this._mercY(lat)) * this._schaal + RAND,
    };
  }

  naarLatLng(x, y) {
    const mx = (x - RAND) / this._schaal + this._xLinks;
    const my = this._yBoven - (y - RAND) / this._schaal;
    return {
      lat: ((Math.atan(Math.exp(my)) - Math.PI / 4) * 360) / Math.PI,
      lng: (mx * 180) / Math.PI,
    };
  }

  _pad(ringen) {
    let d = '';
    for (const ring of ringen) {
      ring.forEach(([lng, lat], i) => {
        const p = this.naarXY(lat, lng);
        d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      });
      d += 'Z';
    }
    return d;
  }

  /* ---- opbouw ---- */

  _bouw() {
    this.svg.textContent = '';

    const defs = el('defs');
    const clip = el('clipPath', { id: 'nl-land' });
    for (const prov of this.kaartData.provincies) {
      clip.appendChild(el('path', { d: this._pad(prov.ringen) }));
    }
    defs.appendChild(clip);
    this.svg.appendChild(defs);

    // zee / achtergrond
    this.svg.appendChild(el('rect', {
      x: 0, y: 0, width: this.breedte, height: this.hoogte, class: 'zee',
    }));

    // land per provincie
    this.landLaag = el('g', { class: 'land-laag' });
    this.provincieNodes = new Map();
    for (const prov of this.kaartData.provincies) {
      const path = el('path', { d: this._pad(prov.ringen), class: 'provincie' });
      this.provincieNodes.set(prov.naam, prov.ringen);
      this.landLaag.appendChild(path);
    }
    this.svg.appendChild(this.landLaag);

    // rivieren en gebieden worden afgeknipt op het land, zodat het Duitse deel
    // van de Rijn en het Belgische deel van de Maas niet buiten de kaart lopen
    this.waterLaag = el('g', { class: 'water-laag', 'clip-path': 'url(#nl-land)' });
    this.svg.appendChild(this.waterLaag);

    this.markeerLaag = el('g', { class: 'markeer-laag' });
    this.svg.appendChild(this.markeerLaag);

    this.puntLaag = el('g', { class: 'punt-laag' });
    this.svg.appendChild(this.puntLaag);

    this.labelLaag = el('g', { class: 'label-laag' });
    this.svg.appendChild(this.labelLaag);
  }

  /** Vaste rivieren als decor op de achtergrondkaart. */
  tekenRivieren(items) {
    this.waterLaag.textContent = '';
    for (const item of items) {
      if (item.cat !== 'water' || !item.vorm) continue;
      this.waterLaag.appendChild(el('path', {
        d: this._pad(item.vorm), class: 'rivier',
      }));
    }
  }

  /* ---- punten ---- */

  /**
   * Zet de punten van de gekozen items op de kaart.
   * @param {object[]} items
   * @param {{labels:boolean}} opties
   */
  tekenPunten(items, opties = {}) {
    this.puntLaag.textContent = '';
    this.labelLaag.textContent = '';
    this.puntNodes = new Map();
    for (const item of items) {
      const p = this.naarXY(item.lat, item.lng);
      const g = el('g', { class: `punt punt-${item.cat}`, 'data-id': item.id });
      g.appendChild(el('circle', { cx: p.x, cy: p.y, r: 5.5, class: 'punt-stip' }));
      g.appendChild(el('title'));
      g.lastChild.textContent = item.naam;
      this.puntLaag.appendChild(g);
      this.puntNodes.set(item.id, g);
    }
    if (opties.labels) this._tekenLabels(items);
  }

  /** Labels met een simpele botsingscontrole: vol is vol. */
  _tekenLabels(items) {
    const bezet = [];
    const past = (box) => !bezet.some((b) => (
      box.x < b.x + b.w && box.x + box.w > b.x
      && box.y < b.y + b.h && box.y + box.h > b.y
    ));
    // Grote gebieden eerst, die hebben het meeste recht op een label.
    const orde = { provincies: 0, water: 1, gebieden: 2, eilanden: 3 };
    const gesorteerd = [...items].sort(
      (a, b) => (orde[a.cat] ?? 9) - (orde[b.cat] ?? 9) || a.naam.localeCompare(b.naam),
    );
    for (const item of gesorteerd) {
      const p = this.naarXY(item.lat, item.lng);
      const provincie = item.cat === 'provincies';
      const grootte = provincie ? 15 : 12;
      // Provincienamen staan in kapitalen met extra letterafstand en zijn
      // daardoor flink breder per letter.
      const perLetter = provincie ? 0.82 : 0.55;
      const w = item.naam.length * grootte * perLetter + 8;
      const h = grootte + 5;
      const kandidaten = [
        { x: p.x + 9, y: p.y - h / 2, anchor: 'start' },
        { x: p.x - 9 - w, y: p.y - h / 2, anchor: 'end' },
        { x: p.x - w / 2, y: p.y - 9 - h, anchor: 'middle' },
        { x: p.x - w / 2, y: p.y + 9, anchor: 'middle' },
        // schuin, voor drukke hoeken als Rotterdam en 's-Hertogenbosch
        { x: p.x + 8, y: p.y + 7, anchor: 'start' },
        { x: p.x + 8, y: p.y - 7 - h, anchor: 'start' },
        { x: p.x - 8 - w, y: p.y + 7, anchor: 'end' },
        { x: p.x - 8 - w, y: p.y - 7 - h, anchor: 'end' },
      ];
      // Past het nergens? Dan toch de eerste plek: een naam die een andere
      // net raakt is beter dan een punt zonder naam.
      const plek = kandidaten.find((k) => past({ ...k, w, h })) || kandidaten[0];
      bezet.push({ x: plek.x, y: plek.y, w, h });
      const tx = plek.anchor === 'start' ? plek.x
        : plek.anchor === 'end' ? plek.x + w : plek.x + w / 2;
      const label = el('text', {
        x: tx.toFixed(1),
        y: (plek.y + h - 4).toFixed(1),
        class: `label label-${item.cat}`,
        'text-anchor': plek.anchor,
        'font-size': grootte,
      });
      label.textContent = item.naam;
      this.labelLaag.appendChild(label);
    }
  }

  /* ---- markeren ---- */

  wisMarkering() {
    this.markeerLaag.textContent = '';
  }

  /**
   * Markeer een item: de vorm als die er is, anders een ring om het punt.
   * @param {object} item
   * @param {string} soort  'goed' | 'fout' | 'vraag' | 'kijk'
   */
  markeer(item, soort = 'kijk', metNaam = false) {
    const vorm = this._vormVan(item);
    if (vorm) {
      this.markeerLaag.appendChild(el('path', {
        d: this._pad(vorm),
        class: `mark mark-vorm mark-${soort}`,
        'clip-path': item.cat === 'water' ? 'url(#nl-land)' : null,
      }));
    }
    const p = this.naarXY(item.lat, item.lng);
    this.markeerLaag.appendChild(el('circle', {
      cx: p.x, cy: p.y, r: vorm ? 7 : 11, class: `mark mark-ring mark-${soort}`,
    }));
    if (metNaam) {
      const label = el('text', {
        x: p.x, y: p.y - (vorm ? 14 : 18),
        class: `mark-label mark-${soort}`, 'text-anchor': 'middle',
      });
      label.textContent = item.naam;
      this.markeerLaag.appendChild(label);
    }
  }

  /** Een kruisje op de plek waar geklikt is. */
  markeerKlik(lat, lng, soort) {
    const p = this.naarXY(lat, lng);
    const g = el('g', { class: `mark mark-klik mark-${soort}` });
    const r = 7;
    g.appendChild(el('line', { x1: p.x - r, y1: p.y - r, x2: p.x + r, y2: p.y + r }));
    g.appendChild(el('line', { x1: p.x - r, y1: p.y + r, x2: p.x + r, y2: p.y - r }));
    this.markeerLaag.appendChild(g);
  }

  _vormVan(item) {
    if (item.vorm) return item.vorm;
    if (item.cat === 'provincies') return this.provincieNodes.get(item.naam) || null;
    return null;
  }

  /* ---- klikken beoordelen ---- */

  /** Waar op de kaart is geklikt (in lat/lng en SVG-eenheden)? */
  klikPlek(event) {
    const r = this.svg.getBoundingClientRect();
    // De SVG schaalt met preserveAspectRatio="meet": zelfde factor voor x en y.
    const factor = Math.min(r.width / this.breedte, r.height / this.hoogte);
    const offsetX = (r.width - this.breedte * factor) / 2;
    const offsetY = (r.height - this.hoogte * factor) / 2;
    const x = (event.clientX - r.left - offsetX) / factor;
    const y = (event.clientY - r.top - offsetY) / factor;
    return { x, y, ...this.naarLatLng(x, y) };
  }

  /** Afstand van een punt tot een item, in SVG-eenheden (0 = op de vorm). */
  afstandTot(item, x, y) {
    const vorm = this._vormVan(item);
    if (vorm) {
      const punten = this._projecteerRingen(`item:${item.id}`, vorm);
      if (punten.some((ring) => binnenRing(ring, x, y))) return 0;
      let best = Infinity;
      for (const ring of punten) {
        for (let i = 0; i < ring.length; i += 1) {
          const a = ring[i];
          const b = ring[(i + 1) % ring.length];
          best = Math.min(best, afstandTotLijn(x, y, a[0], a[1], b[0], b[1]));
        }
      }
      return best;
    }
    const p = this.naarXY(item.lat, item.lng);
    return Math.hypot(p.x - x, p.y - y);
  }

  /** 'vlak' = erin klikken, 'lijn' = dichtbij mag, 'punt' = straal om het punt. */
  _soort(item) {
    if (!this._vormVan(item)) return 'punt';
    return item.cat === 'water' ? 'lijn' : 'vlak';
  }

  /** Ringen omgerekend naar SVG-coördinaten, één keer per vorm. */
  _projecteerRingen(sleutel, ringen) {
    if (!this._ringCache) this._ringCache = new Map();
    let klaar = this._ringCache.get(sleutel);
    if (!klaar) {
      klaar = ringen.map((ring) => ring.map(([lng, lat]) => {
        const p = this.naarXY(lat, lng);
        return [p.x, p.y];
      }));
      this._ringCache.set(sleutel, klaar);
    }
    return klaar;
  }

  /** Ligt dit punt op het land van Nederland? */
  opLand(x, y) {
    for (const [naam, ringen] of this.provincieNodes) {
      const punten = this._projecteerRingen(`prov:${naam}`, ringen);
      if (punten.some((ring) => binnenRing(ring, x, y))) return true;
    }
    return false;
  }

  /** Hoeveel mag deze klik ernaast zitten? */
  tolerantieVoor(item) {
    const soort = this._soort(item);
    if (soort === 'vlak') return TOL_VLAK;
    if (soort === 'lijn') return TOL_LIJN;
    return TOL_PUNT[item.cat] ?? TOL_PUNT.overig;
  }

  /**
   * Is de klik goed voor dit item?
   * Streng genoeg om Schiedam en Rotterdam te onderscheiden: een klik moet
   * binnen de tolerantie liggen én dichter bij het doel dan bij een ander
   * item uit dezelfde categorie dat ook op de lijst staat.
   */
  beoordeel(doel, x, y, andere) {
    const afstand = this.afstandTot(doel, x, y);
    if (afstand > this.tolerantieVoor(doel)) {
      return { goed: false, afstand, dichterbij: null };
    }
    // Zeeën en meren zonder eigen vorm: je moet wel op het water klikken,
    // anders geldt een klik op Vlieland als de Waddenzee.
    if (doel.cat === 'water' && this._soort(doel) === 'punt' && this.opLand(x, y)) {
      return { goed: false, afstand, dichterbij: null, opLand: true };
    }
    let dichterbij = null;
    for (const item of andere) {
      if (item.id === doel.id || item.cat !== doel.cat) continue;
      if (this.afstandTot(item, x, y) < afstand) {
        dichterbij = item;
        break;
      }
    }
    return { goed: !dichterbij, afstand, dichterbij };
  }

  /**
   * Welk item hoort bij deze klik? Voor de leerstand.
   * Het kleinste ding wint: klik je op het stipje van Maastricht, dan wil je
   * Maastricht horen en niet Limburg (waar je immers ook in klikt). Alleen als
   * er niets kleins in de buurt is, valt het terug op het vlak eronder.
   */
  raakItem(items, x, y) {
    const RAAK_STIP = 12; // ongeveer de zichtbare stip, niet de ruime toets-marge
    let klein = null;
    let kleinAfstand = Infinity;
    let vlak = null;
    let vlakScore = [Infinity, Infinity];
    for (const item of items) {
      const a = this.afstandTot(item, x, y);
      if (this._soort(item) === 'vlak') {
        // gelijkspel binnen een vlak (een eiland ligt in een provincie):
        // dan het kleinere gebied.
        const score = [a, VLAK_RANG[item.cat] ?? 3];
        if (a <= this.tolerantieVoor(item)
          && (score[0] < vlakScore[0] || (score[0] === vlakScore[0] && score[1] < vlakScore[1]))) {
          vlak = item;
          vlakScore = score;
        }
      } else if (a <= Math.min(this.tolerantieVoor(item), RAAK_STIP) && a < kleinAfstand) {
        klein = item;
        kleinAfstand = a;
      }
    }
    return klein || vlak;
  }

  /** Afstand in kilometers, voor de feedback. */
  naarKm(eenheden) {
    // Bij mercator is de echte afstand per eenheid R * cos(breedtegraad).
    const middenLat = (this.grenzen.minLat + this.grenzen.maxLat) / 2;
    return (eenheden / this._schaal) * 6371 * Math.cos((middenLat * Math.PI) / 180);
  }
}

function binnenRing(ring, x, y) {
  let binnen = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      binnen = !binnen;
    }
  }
  return binnen;
}

function afstandTotLijn(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengte = dx * dx + dy * dy;
  if (lengte === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lengte;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
