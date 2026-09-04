# Topo Nederland - oefenen

Een klein oefenprogramma voor de topografietoets: de punten van de lijst van
school op de kaart van Nederland. Geen bibliotheken, geen build, geen internet
nodig - gewoon HTML, CSS en JavaScript.

De punten komen uit de kaart die school gebruikt: **Basiskaart Nederland** op
[topomania.net](https://www.topomania.net/map/Basiskaart%20Nederland) (kaart 319).
De provinciegrenzen komen van het CBS (via cartomap), omdat de vormen van
topomania het IJsselmeer en de Waddenzee als land meerekenen.

## Starten

Dubbelklikken op `index.html` werkt, maar met een servertje is het betrouwbaarder:

```bash
python3 -m http.server 8123
```

Ga dan naar http://localhost:8123.

## De vier onderdelen

| Onderdeel | Wat het doet |
| --- | --- |
| **Leren** | Klik op een naam en zie waar het ligt, of klik op de kaart en zie hoe het heet. |
| **Aanwijzen** | De naam staat er, jij klikt de plek aan. Blijft doorgaan en vraagt vaker wat je fout doet. |
| **Benoemen** | Een plek is gemarkeerd, kies de juiste naam uit vier. |
| **Toets** | Alle punten van je lijst één keer, in willekeurige volgorde, met een uitslag. Daarna kun je alleen de foute punten nog eens doen. |

De voortgang en je lijst worden in de browser bewaard (localStorage). Onder
**Mijn lijst** staat *Voortgang wissen* om schoon te beginnen.

## De lijst aanpassen

Drie manieren, van makkelijk naar blijvend:

1. **Plakken.** Ga naar *Mijn lijst* → *Lijst plakken...* en plak de namen
   (één per regel of met komma's). Nummers ervoor mogen blijven staan.
   Hoofdletters en tikfouten worden gecorrigeerd: `Lelystade` → Lelystad,
   `Schiermoonnikook` → Schiermonnikoog, `Noodzeekanaal` → Noordzeekanaal.
   Namen die bij twee punten horen (Groningen, Utrecht) vinken stad **en**
   provincie aan.
2. **Aanvinken.** In *Mijn lijst* staan alle 127 punten van de kaart; vink aan
   wat je wilt.
3. **Vastzetten.** Zet de lijst in `data/lijst.js`. Dat is de lijst achter de
   knop *Lijst van school*, en die wordt de eerste keer automatisch aangevinkt.

Staat een punt niet op de kaart van topomania? Zet het in `data/extra.js`, met
naam, categorie en coördinaten. Zo staat Heerhugowaard er nu in: dat punt zit
niet in Basiskaart Nederland.

## Opnieuw importeren

Alleen nodig als school een andere kaart gebruikt of topomania iets wijzigt.

```bash
python3 tools/import_map.py 319
```

Dat haalt de punten en vormen op en schrijft `data/items.js`. In plaats van een
nummer mag ook een naam: `python3 tools/import_map.py "Basiskaart Nederland"`.
Wat het script onderweg rechtzet:

- vormen worden afgeknipt op Nederland (de Rijn liep door tot in Zwitserland);
- vormen worden vereenvoudigd, zodat het bestand klein blijft;
- punten zonder coördinaat (de Waddeneilanden) krijgen een punt op hun eigen vorm;
- het labelpunt van de Rijn lag in de Noordzee en is met de hand op Lobith gezet
  (zie `PUNT_CORRECTIES` in het script);
- provincievormen worden overgeslagen, die komen uit `data/kaart.js`.

De provinciegrenzen los ophalen:

```bash
python3 tools/import_basemap.py 2025
```

## Hoe het in elkaar zit

```
index.html          de vier tabbladen en het zijpaneel
css/stijl.css
js/kaart.js         kaart tekenen, projectie, klikken beoordelen
js/app.js           de oefenonderdelen, score, lijstbeheer
data/kaart.js       provinciegrenzen (CBS)            } gegenereerd
data/items.js       127 punten van topomania          } gegenereerd
data/extra.js       punten die op de kaart missen     } met de hand
data/lijst.js       de lijst van school               } met de hand
tools/              de twee importeurs
```

De gegevens staan in `.js`-bestanden als `window.TOPO_*` en niet in `.json`,
zodat het ook werkt als je het bestand rechtstreeks vanaf de schijf opent.

## Hoe een klik beoordeeld wordt

Op deze kaart is één beeldpunt ongeveer 600 meter, dus millimeterwerk kan niet.
Daarom hangt de marge af van wat je aanwijst (zie de bovenkant van `js/kaart.js`):

- **provincies, eilanden, gebieden**: je moet erin klikken, met een kleine marge
  van ongeveer 2 km voor de dikte van je muisaanwijzer;
- **rivieren en kanalen**: tot ongeveer 5 km ernaast mag;
- **steden en grote wateren zonder vorm**: een straal om het punt, ruimer voor de
  Noordzee dan voor een stad.

Daarbovenop: het antwoord moet dichter bij het gevraagde punt liggen dan bij een
ander punt uit dezelfde categorie, en een zee of meer keur je af als je op het
land klikt. Zo geldt een klik op Breda niet als de Maas, en Den Helder niet als
Texel.
