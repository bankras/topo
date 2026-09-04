/* Oefenprogramma: leren, aanwijzen, benoemen en een toets. */

const CAT_NAAM = {
  plaatsen: 'Plaats',
  provincies: 'Provincie',
  water: 'Water',
  eilanden: 'Eiland / gemeente',
  gebieden: 'Gebied',
  bouwwerken: 'Bouwwerk',
  bergen: 'Berg',
  overig: 'Overig',
};

const CAT_ORDE = ['provincies', 'plaatsen', 'water', 'eilanden', 'gebieden', 'bouwwerken', 'bergen', 'overig'];

const OPSLAG_SELECTIE = 'topo.selectie';
const OPSLAG_VOORTGANG = 'topo.voortgang';

/* ---------- data ---------- */

const alleItems = [
  ...window.TOPO_DATA.items,
  ...((window.TOPO_EXTRA && window.TOPO_EXTRA.items) || []),
].sort((a, b) => CAT_ORDE.indexOf(a.cat) - CAT_ORDE.indexOf(b.cat)
  || a.naam.localeCompare(b.naam, 'nl'));

const itemsPerId = new Map(alleItems.map((i) => [i.id, i]));

/* ---------- opslag ---------- */

function laadJson(key, standaard) {
  try {
    const ruw = localStorage.getItem(key);
    return ruw ? JSON.parse(ruw) : standaard;
  } catch (e) {
    return standaard;
  }
}

function bewaarJson(key, waarde) {
  try {
    localStorage.setItem(key, JSON.stringify(waarde));
  } catch (e) { /* privémodus: dan onthouden we het gewoon niet */ }
}

const staat = {
  mode: 'leren',
  selectie: new Set(laadJson(OPSLAG_SELECTIE, null) || []),
  voortgang: laadJson(OPSLAG_VOORTGANG, {}),
  huidig: null,
  vorige: null,
  wachtOpVolgende: false,
  score: { leren: null, aanwijzen: { goed: 0, fout: 0 }, benoemen: { goed: 0, fout: 0 } },
  toets: null,
};

function bewaarSelectie() {
  bewaarJson(OPSLAG_SELECTIE, [...staat.selectie]);
}

function bewaarVoortgang() {
  bewaarJson(OPSLAG_VOORTGANG, staat.voortgang);
}

function gekozenItems() {
  return alleItems.filter((i) => staat.selectie.has(i.id));
}

function stand(id) {
  if (!staat.voortgang[id]) staat.voortgang[id] = { goed: 0, fout: 0 };
  return staat.voortgang[id];
}

/* ---------- kaart ---------- */

const svg = document.getElementById('kaart');
const kaart = new Kaart(svg, window.TOPO_KAART);
kaart.tekenRivieren(alleItems);

/* ---------- elementen ---------- */

const $ = (id) => document.getElementById(id);
const schermKaart = $('scherm-kaart');
const schermLijst = $('scherm-lijst');
const melding = $('kaart-melding');

/* ---------- helpers ---------- */

function normaliseer(tekst) {
  return tekst
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function afstandTekst(eenheden) {
  const km = kaart.naarKm(eenheden);
  return km < 1 ? 'minder dan 1 km' : `ongeveer ${Math.round(km)} km`;
}

/** Kies een item, met voorkeur voor wat nog niet goed gaat. */
function kiesItem(pool, nietDezelfde) {
  const kandidaten = pool.filter((i) => pool.length === 1 || i.id !== nietDezelfde);
  const gewichten = kandidaten.map((item) => {
    const s = stand(item.id);
    const gezien = s.goed + s.fout;
    let gewicht = 1 + s.fout * 2.5;
    if (gezien === 0) gewicht += 1.5;          // nieuwe punten eerst
    gewicht -= Math.min(s.goed, 4) * 0.35;     // wat al zit, minder vaak
    return Math.max(0.25, gewicht);
  });
  const totaal = gewichten.reduce((a, b) => a + b, 0);
  let trek = Math.random() * totaal;
  for (let i = 0; i < kandidaten.length; i += 1) {
    trek -= gewichten[i];
    if (trek <= 0) return kandidaten[i];
  }
  return kandidaten[kandidaten.length - 1];
}

function schud(lijst) {
  const uit = [...lijst];
  for (let i = uit.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [uit[i], uit[j]] = [uit[j], uit[i]];
  }
  return uit;
}

/* ---------- modes ---------- */

function zetMode(mode) {
  staat.mode = mode;
  document.querySelectorAll('#tabs .tab').forEach((b) => {
    b.classList.toggle('actief', b.dataset.mode === mode);
  });
  const opLijst = mode === 'lijst';
  schermLijst.hidden = !opLijst;
  schermKaart.hidden = opLijst;
  document.querySelectorAll('.paneel-blok').forEach((blok) => {
    blok.hidden = !blok.dataset.voor.split(' ').includes(mode);
  });
  melding.hidden = true;
  kaart.wisMarkering();

  if (opLijst) {
    toonKeuzelijst();
    return;
  }
  if (mode === 'leren') startLeren();
  if (mode === 'aanwijzen') startAanwijzen();
  if (mode === 'benoemen') startBenoemen();
  if (mode === 'toets') startToets();
}

function tekenKaartVoorMode() {
  const items = gekozenItems();
  const labels = staat.mode === 'leren' && $('toon-namen').checked;
  kaart.tekenPunten(staat.mode === 'leren' ? items : [], { labels });
}

/* ---------- leren ---------- */

function startLeren() {
  tekenKaartVoorMode();
  vulLeerlijst();
}

function vulLeerlijst() {
  const zoek = normaliseer($('zoek').value);
  const items = gekozenItems().filter((i) => !zoek || normaliseer(i.naam).includes(zoek));
  const doel = $('leerlijst');
  doel.textContent = '';
  if (!items.length) {
    doel.innerHTML = '<p class="uitleg">Niets gevonden.</p>';
    return;
  }
  for (const cat of CAT_ORDE) {
    const groep = items.filter((i) => i.cat === cat);
    if (!groep.length) continue;
    const kop = document.createElement('h3');
    kop.textContent = `${CAT_NAAM[cat]} (${groep.length})`;
    doel.appendChild(kop);
    const ul = document.createElement('ul');
    for (const item of groep) {
      const li = document.createElement('li');
      const knop = document.createElement('button');
      knop.type = 'button';
      knop.className = 'lijst-knop';
      knop.textContent = item.naam;
      const s = stand(item.id);
      if (s.goed || s.fout) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = `${s.goed}/${s.goed + s.fout}`;
        badge.title = `${s.goed} goed, ${s.fout} fout`;
        knop.appendChild(badge);
      }
      knop.addEventListener('click', () => {
        kaart.wisMarkering();
        kaart.markeer(item, 'kijk', true);
        doel.querySelectorAll('.lijst-knop').forEach((k) => k.classList.remove('actief'));
        knop.classList.add('actief');
      });
      li.appendChild(knop);
      ul.appendChild(li);
    }
    doel.appendChild(ul);
  }
}

/* ---------- aanwijzen en toets ---------- */

function startAanwijzen() {
  staat.score.aanwijzen = { goed: 0, fout: 0 };
  staat.toets = null;
  $('oefen-titel').textContent = 'Aanwijzen';
  $('oefen-uitleg').textContent = 'Waar ligt dit? Klik op de kaart.';
  $('toets-voortgang-regel').hidden = true;
  $('btn-weetniet').hidden = false;
  tekenKaartVoorMode();
  volgendeVraag();
}

function startToets() {
  const items = gekozenItems();
  if (!items.length) return toonLeegMelding();
  staat.toets = { rij: schud(items), gedaan: 0, fout: [], totaal: items.length };
  staat.score.aanwijzen = { goed: 0, fout: 0 };
  $('oefen-titel').textContent = 'Toets';
  $('oefen-uitleg').textContent = `Alle ${items.length} punten, één keer. Klik op de kaart.`;
  $('toets-voortgang-regel').hidden = false;
  $('btn-weetniet').hidden = false;
  tekenKaartVoorMode();
  volgendeVraag();
}

function volgendeVraag() {
  const items = gekozenItems();
  if (!items.length) return toonLeegMelding();
  kaart.wisMarkering();
  melding.hidden = true;
  staat.wachtOpVolgende = false;
  $('btn-verder').hidden = true;
  $('oefen-feedback').textContent = '';
  $('oefen-feedback').className = 'feedback';

  if (staat.toets) {
    if (staat.toets.gedaan >= staat.toets.rij.length) return toonToetsUitslag();
    staat.huidig = staat.toets.rij[staat.toets.gedaan];
    $('toets-voortgang').textContent = `${staat.toets.gedaan + 1} / ${staat.toets.totaal}`;
  } else {
    staat.huidig = kiesItem(items, staat.vorige);
  }
  staat.vorige = staat.huidig.id;
  $('opdracht-cat').textContent = CAT_NAAM[staat.huidig.cat];
  $('opdracht-naam').textContent = staat.huidig.naam;
  werkScoreBij();
}

function werkScoreBij() {
  $('score-goed').textContent = staat.score.aanwijzen.goed;
  $('score-fout').textContent = staat.score.aanwijzen.fout;
}

function verwerkKaartKlik(event) {
  const plek = kaart.klikPlek(event);

  if (staat.mode === 'leren') {
    const geraakt = kaart.raakItem(gekozenItems(), plek.x, plek.y);
    kaart.wisMarkering();
    if (geraakt) kaart.markeer(geraakt, 'kijk', true);
    return;
  }
  if (staat.mode !== 'aanwijzen' && staat.mode !== 'toets') return;
  if (staat.wachtOpVolgende || !staat.huidig) return;

  const doel = staat.huidig;
  const uitslag = kaart.beoordeel(doel, plek.x, plek.y, gekozenItems());
  const fb = $('oefen-feedback');
  staat.wachtOpVolgende = true;
  kaart.wisMarkering();

  if (uitslag.goed) {
    stand(doel.id).goed += 1;
    staat.score.aanwijzen.goed += 1;
    kaart.markeer(doel, 'goed', true);
    fb.textContent = 'Goed!';
    fb.className = 'feedback goed';
  } else {
    stand(doel.id).fout += 1;
    staat.score.aanwijzen.fout += 1;
    if (staat.toets) staat.toets.fout.push(doel.id);
    kaart.markeerKlik(plek.lat, plek.lng, 'fout');
    kaart.markeer(doel, 'goed', true);
    fb.className = 'feedback fout';
    if (uitslag.opLand) {
      fb.textContent = `Je klikte op het land. ${doel.naam} is water - `
        + 'kijk waar het nu gemarkeerd staat.';
    } else if (uitslag.dichterbij) {
      fb.textContent = `Net niet - dat is dichter bij ${uitslag.dichterbij.naam}. `
        + `${doel.naam} is nu gemarkeerd.`;
    } else {
      fb.textContent = `Mis, je zat er ${afstandTekst(uitslag.afstand)} naast. `
        + `${doel.naam} is nu gemarkeerd.`;
    }
  }
  bewaarVoortgang();
  werkScoreBij();
  if (staat.toets) staat.toets.gedaan += 1;
  $('btn-verder').hidden = false;
  $('btn-verder').focus();
}

function weetNiet() {
  if (!staat.huidig || staat.wachtOpVolgende) return;
  const doel = staat.huidig;
  stand(doel.id).fout += 1;
  staat.score.aanwijzen.fout += 1;
  if (staat.toets) {
    staat.toets.fout.push(doel.id);
    staat.toets.gedaan += 1;
  }
  bewaarVoortgang();
  werkScoreBij();
  staat.wachtOpVolgende = true;
  kaart.wisMarkering();
  kaart.markeer(doel, 'kijk', true);
  const fb = $('oefen-feedback');
  fb.className = 'feedback kijk';
  fb.textContent = `${doel.naam} ligt hier. Kijk goed en ga verder.`;
  $('btn-verder').hidden = false;
}

function toonToetsUitslag() {
  const t = staat.toets;
  const goed = t.totaal - t.fout.length;
  const procent = Math.round((goed / t.totaal) * 100);
  const foutItems = t.fout.map((id) => itemsPerId.get(id)).filter(Boolean);
  melding.hidden = false;
  melding.innerHTML = '';
  const kop = document.createElement('h2');
  kop.textContent = `Toets klaar: ${goed} van ${t.totaal} goed (${procent}%)`;
  melding.appendChild(kop);
  if (foutItems.length) {
    const p = document.createElement('p');
    p.textContent = 'Deze gingen mis:';
    melding.appendChild(p);
    const ul = document.createElement('ul');
    for (const item of foutItems) {
      const li = document.createElement('li');
      li.textContent = item.naam;
      ul.appendChild(li);
    }
    melding.appendChild(ul);
  } else {
    const p = document.createElement('p');
    p.textContent = 'Alles goed. Top!';
    melding.appendChild(p);
  }
  const knoppen = document.createElement('div');
  knoppen.className = 'knoppen';
  if (foutItems.length) {
    const oefen = document.createElement('button');
    oefen.className = 'knop primair';
    oefen.textContent = 'Oefen de foute punten';
    oefen.addEventListener('click', () => {
      staat.toets = {
        rij: schud(foutItems), gedaan: 0, fout: [], totaal: foutItems.length,
      };
      staat.score.aanwijzen = { goed: 0, fout: 0 };
      $('oefen-uitleg').textContent = `${foutItems.length} punten die misgingen.`;
      volgendeVraag();
    });
    knoppen.appendChild(oefen);
  }
  const opnieuw = document.createElement('button');
  opnieuw.className = 'knop';
  opnieuw.textContent = 'Hele toets opnieuw';
  opnieuw.addEventListener('click', startToets);
  knoppen.appendChild(opnieuw);
  melding.appendChild(knoppen);
  $('opdracht-naam').textContent = '-';
  $('opdracht-cat').textContent = '';
}

function toonLeegMelding() {
  melding.hidden = false;
  melding.innerHTML = '<h2>Je lijst is leeg</h2>'
    + '<p>Ga naar <strong>Mijn lijst</strong> en vink aan wat je moet leren.</p>';
}

/* ---------- benoemen ---------- */

function startBenoemen() {
  staat.score.benoemen = { goed: 0, fout: 0 };
  tekenKaartVoorMode();
  volgendeBenoemVraag();
}

function volgendeBenoemVraag() {
  const items = gekozenItems();
  if (!items.length) return toonLeegMelding();
  kaart.wisMarkering();
  $('benoem-feedback').textContent = '';
  $('benoem-feedback').className = 'feedback';
  $('btn-verder-benoem').hidden = true;
  staat.huidig = kiesItem(items, staat.vorige);
  staat.vorige = staat.huidig.id;
  kaart.markeer(staat.huidig, 'vraag', false);

  // Antwoordopties uit dezelfde categorie; anders is het te makkelijk.
  // Punten met dezelfde naam (stad Utrecht / provincie Utrecht) horen niet
  // samen in één vraag, want dan zijn twee antwoorden goed.
  const anders = (i) => i.id !== staat.huidig.id && i.naam !== staat.huidig.naam;
  const zelfdeCat = items.filter((i) => i.cat === staat.huidig.cat && anders(i));
  const vulAan = items.filter((i) => i.cat !== staat.huidig.cat && anders(i));
  const afleiders = schud(zelfdeCat).slice(0, 3);
  while (afleiders.length < 3 && vulAan.length) {
    const kandidaat = schud(vulAan)[0];
    if (!afleiders.some((a) => a.id === kandidaat.id)) afleiders.push(kandidaat);
    else break;
  }
  const opties = schud([staat.huidig, ...afleiders]);

  const vak = $('keuzes');
  vak.textContent = '';
  for (const optie of opties) {
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = 'knop keuze';
    knop.textContent = optie.naam;
    knop.addEventListener('click', () => beoordeelBenoem(optie, knop));
    vak.appendChild(knop);
  }
  werkBenoemScoreBij();
}

function beoordeelBenoem(gekozen, knop) {
  if ($('btn-verder-benoem').hidden === false) return;  // al beantwoord
  const doel = staat.huidig;
  const fb = $('benoem-feedback');
  const goed = gekozen.id === doel.id;
  if (goed) {
    stand(doel.id).goed += 1;
    staat.score.benoemen.goed += 1;
    knop.classList.add('goed');
    fb.textContent = 'Goed!';
    fb.className = 'feedback goed';
  } else {
    stand(doel.id).fout += 1;
    staat.score.benoemen.fout += 1;
    knop.classList.add('fout');
    fb.textContent = `Nee, dit is ${doel.naam}.`;
    fb.className = 'feedback fout';
    $('keuzes').querySelectorAll('.keuze').forEach((k) => {
      if (k.textContent === doel.naam) k.classList.add('goed');
    });
  }
  kaart.wisMarkering();
  kaart.markeer(doel, goed ? 'goed' : 'fout', true);
  bewaarVoortgang();
  werkBenoemScoreBij();
  $('btn-verder-benoem').hidden = false;
  $('btn-verder-benoem').focus();
}

function werkBenoemScoreBij() {
  $('bscore-goed').textContent = staat.score.benoemen.goed;
  $('bscore-fout').textContent = staat.score.benoemen.fout;
}

/* ---------- mijn lijst ---------- */

function werkTellerBij() {
  $('lijst-teller').textContent = `${staat.selectie.size} van ${alleItems.length} gekozen`;
}

function toonKeuzelijst() {
  const doel = $('keuzelijst');
  doel.textContent = '';
  for (const cat of CAT_ORDE) {
    const groep = alleItems.filter((i) => i.cat === cat);
    if (!groep.length) continue;
    const blok = document.createElement('div');
    blok.className = 'keuze-groep';
    const kop = document.createElement('h3');
    kop.textContent = CAT_NAAM[cat];
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = 'knop mini';
    knop.textContent = 'alles / niets';
    knop.addEventListener('click', () => {
      const allesAan = groep.every((i) => staat.selectie.has(i.id));
      groep.forEach((i) => (allesAan ? staat.selectie.delete(i.id) : staat.selectie.add(i.id)));
      bewaarSelectie();
      toonKeuzelijst();
      werkTellerBij();
    });
    kop.appendChild(knop);
    blok.appendChild(kop);
    for (const item of groep) {
      const label = document.createElement('label');
      label.className = 'vink';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = staat.selectie.has(item.id);
      box.addEventListener('change', () => {
        if (box.checked) staat.selectie.add(item.id);
        else staat.selectie.delete(item.id);
        bewaarSelectie();
        werkTellerBij();
      });
      label.appendChild(box);
      label.appendChild(document.createTextNode(item.naam));
      blok.appendChild(label);
    }
    doel.appendChild(blok);
  }
  werkTellerBij();
}

/** Levenshtein, voor tikfouten als "Nieuw Maas" tegenover "Nieuwe Maas". */
function afstandTekstVergelijk(a, b) {
  const rij = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let vorige = rij[0];
    rij[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tijdelijk = rij[j];
      rij[j] = Math.min(
        rij[j] + 1,
        rij[j - 1] + 1,
        vorige + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      vorige = tijdelijk;
    }
  }
  return rij[b.length];
}

/**
 * Zoek de punten die bij een geschreven naam horen.
 * "Utrecht" past op twee punten (de stad en de provincie) - dan geven we ze
 * beide terug, want zulke namen staan op de lijst ook voor beide.
 */
function zoekItems(naam) {
  const genormaliseerd = normaliseer(naam);
  if (!genormaliseerd) return { items: [], precies: true };
  const exact = alleItems.filter((i) => normaliseer(i.naam) === genormaliseerd);
  if (exact.length) return { items: exact, precies: true };
  // begin van de naam, bijvoorbeeld "den bosch" hoeft niet voluit
  const begint = alleItems.filter((i) => normaliseer(i.naam).startsWith(genormaliseerd)
    || genormaliseerd.startsWith(normaliseer(i.naam)));
  if (begint.length === 1) return { items: begint, precies: false };
  let beste = null;
  let besteAfstand = Infinity;
  for (const item of alleItems) {
    const d = afstandTekstVergelijk(genormaliseerd, normaliseer(item.naam));
    if (d < besteAfstand) {
      besteAfstand = d;
      beste = item;
    }
  }
  const drempel = genormaliseerd.length <= 6 ? 1 : 3;
  return besteAfstand <= drempel
    ? { items: [beste], precies: false }
    : { items: [], precies: true };
}

/** Zet een lijst met namen om in een selectie, met verslag van wat er gebeurde. */
function selecteerNamen(namen) {
  const gevonden = new Map();
  const gecorrigeerd = [];
  const nietGevonden = [];
  for (const naam of namen) {
    const { items, precies } = zoekItems(naam);
    if (!items.length) {
      nietGevonden.push(naam);
      continue;
    }
    items.forEach((item) => gevonden.set(item.id, item));
    if (!precies) {
      gecorrigeerd.push(`${naam} → ${items[0].naam}`);
    } else if (items.length > 1) {
      gecorrigeerd.push(`${naam} → ${items.map((i) => CAT_NAAM[i.cat].toLowerCase()).join(' + ')}`);
    }
  }
  // Staat een naam twee keer op de lijst (Utrecht, Groningen), dan hoeft de
  // uitleg erover ook maar één keer in het verslag.
  return { ids: [...gevonden.keys()], gecorrigeerd: [...new Set(gecorrigeerd)], nietGevonden };
}

function pasPlaklijstToe() {
  const regels = $('plak-tekst').value
    .split(/[\n,;]+/)
    .map((r) => r.replace(/^\s*\d+[.)]\s*/, '').trim())   // "1. Waddenzee" -> "Waddenzee"
    .filter(Boolean);
  const uitslag = $('plak-uitslag');
  if (!regels.length) {
    uitslag.className = 'feedback fout';
    uitslag.textContent = 'Er staat nog niets in het vak.';
    return;
  }
  const verslag = selecteerNamen(regels);
  staat.selectie = new Set(verslag.ids);
  bewaarSelectie();
  toonKeuzelijst();
  toonPlakVerslag(verslag, regels.length);
}

function toonPlakVerslag(verslag, aantalRegels) {
  const uitslag = $('plak-uitslag');
  uitslag.className = 'feedback';
  uitslag.innerHTML = '';
  const kop = document.createElement('p');
  kop.innerHTML = `<strong>${verslag.ids.length} punten</strong> aangevinkt `
    + `uit ${aantalRegels} regels.`;
  uitslag.appendChild(kop);
  if (verslag.gecorrigeerd.length) {
    const p = document.createElement('p');
    p.className = 'let-op';
    p.textContent = `Zo begrepen: ${verslag.gecorrigeerd.join(', ')}`;
    uitslag.appendChild(p);
  }
  if (verslag.nietGevonden.length) {
    const p = document.createElement('p');
    p.className = 'let-op fout';
    p.textContent = `Niet op de kaart gevonden: ${verslag.nietGevonden.join(', ')}. `
      + 'Zulke punten kun je toevoegen in data/extra.js.';
    uitslag.appendChild(p);
  }
}

/* ---------- knopen aan elkaar ---------- */

document.getElementById('tabs').addEventListener('click', (e) => {
  const knop = e.target.closest('.tab');
  if (knop) zetMode(knop.dataset.mode);
});

svg.addEventListener('click', verwerkKaartKlik);
$('toon-namen').addEventListener('change', tekenKaartVoorMode);
$('zoek').addEventListener('input', vulLeerlijst);
$('btn-verder').addEventListener('click', volgendeVraag);
$('btn-weetniet').addEventListener('click', weetNiet);
$('btn-herstart').addEventListener('click', () => {
  if (staat.mode === 'toets') startToets();
  else startAanwijzen();
});
$('btn-verder-benoem').addEventListener('click', volgendeBenoemVraag);

$('btn-alles').addEventListener('click', () => {
  staat.selectie = new Set(alleItems.map((i) => i.id));
  bewaarSelectie();
  toonKeuzelijst();
});
$('btn-niets').addEventListener('click', () => {
  staat.selectie = new Set();
  bewaarSelectie();
  toonKeuzelijst();
});
$('btn-plakken').addEventListener('click', () => {
  const vak = $('plak-vak');
  vak.hidden = !vak.hidden;
  if (!vak.hidden) $('plak-tekst').focus();
});
$('btn-plak-sluiten').addEventListener('click', () => { $('plak-vak').hidden = true; });
$('btn-plak-toepassen').addEventListener('click', pasPlaklijstToe);
$('btn-wis-voortgang').addEventListener('click', () => {
  if (!window.confirm('Alle scores en fouten wissen? Je lijst blijft staan.')) return;
  staat.voortgang = {};
  bewaarVoortgang();
  toonKeuzelijst();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (staat.mode === 'benoemen' && !$('btn-verder-benoem').hidden) volgendeBenoemVraag();
  else if (staat.wachtOpVolgende && !$('btn-verder').hidden) volgendeVraag();
});

function zetSchoollijst({ metVerslag = false } = {}) {
  const lijst = window.TOPO_LIJST;
  if (!lijst || !lijst.namen || !lijst.namen.length) return false;
  const verslag = selecteerNamen(lijst.namen);
  staat.selectie = new Set(verslag.ids);
  bewaarSelectie();
  toonKeuzelijst();
  if (metVerslag) {
    $('plak-vak').hidden = false;
    $('plak-tekst').value = lijst.namen.join('\n');
    toonPlakVerslag(verslag, lijst.namen.length);
  }
  return true;
}

$('btn-schoollijst').addEventListener('click', () => zetSchoollijst({ metVerslag: true }));
if (window.TOPO_LIJST && window.TOPO_LIJST.naam) {
  $('btn-schoollijst').textContent = window.TOPO_LIJST.naam;
}

$('bron-tekst').textContent = `Punten: ${window.TOPO_DATA.bron}. `;

// Eerste keer: begin met de lijst van school, zodat er meteen iets te oefenen is.
const eersteKeer = !localStorage.getItem(OPSLAG_SELECTIE);
if (eersteKeer) zetSchoollijst();
werkTellerBij();
zetMode(eersteKeer ? 'lijst' : 'leren');
