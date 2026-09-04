# Taken

## Klaar

- [x] Uitzoeken hoe topomania.net de opdracht opbouwt (privé JSON-api `/tpmjsapi`,
      kaart "Basiskaart Nederland" = kaart 319)
- [x] Importeur voor de punten van topomania (`tools/import_map.py`) → `data/items.js`
- [x] Provinciegrenzen los importeren van CBS/cartomap (`tools/import_basemap.py`)
      → `data/kaart.js`, zodat alleen land als land getekend wordt
- [x] Rivieren afknippen op Nederland (Rijn liep tot Zwitserland, Maas tot Frankrijk)
- [x] Drie fouten in de brongegevens rechtgezet: Waddeneilanden zonder
      coördinaat, labelpunt van de Rijn in de Noordzee, Waddeneilanden-punt op 0,0
- [x] Kaart tekenen in SVG zonder bibliotheken (werkt ook offline)
- [x] Lijst van school overnemen in `data/lijst.js`, inclusief tikfouten
- [x] Heerhugowaard met de hand toevoegen (`data/extra.js`): staat niet in kaart 319
- [x] Namen opzoeken met correctie voor hoofdletters en tikfouten
      (Lelystade → Lelystad, Schiermoonnikook → Schiermonnikoog, ...)
- [x] Namen die bij twee punten horen (Groningen, Utrecht) selecteren stad én provincie
- [x] Vier onderdelen: Leren, Aanwijzen, Benoemen, Toets
- [x] Voortgang en lijstkeuze bewaren in de browser
- [x] Klikken eerlijk beoordelen: vlakken van binnen, rivieren met een paar km
      marge, punten met een straal. Onterechte treffers weg (Breda gold als Maas,
      Den Helder als Texel, IJsselmeer als Noord-Holland)
- [x] Alle 56 punten getest met een echte muisklik op hun eigen plek: allemaal goed
- [x] Aanwijzen, Benoemen en Toets doorgeklikt in de browser, inclusief
      "Weet ik niet", "dichter bij ...", water-op-land, toetsuitslag en
      "Oefen de foute punten"
- [x] Marge voor vlakken van 0 naar 6 eenheden: één beeldpunt is bijna 2 eenheden,
      dus een klik midden op Schiermonnikoog werd onterecht afgekeurd
- [x] Labels van Rotterdam en 's-Hertogenbosch werden weggelaten door
      plaatsgebrek; meer plekken geprobeerd en anders toch tekenen
- [x] In Leren het kleinste ding aanwijzen: klik op het stipje van Maastricht
      geeft Maastricht, niet Limburg
- [x] De toetsteller ("Vraag 1 / 56") bleef bij Aanwijzen staan: een eigen
      `display: flex` won van het hidden-attribuut. Opgelost met een
      `[hidden]`-regel in de css
- [x] Dubbele uitleg in het plakverslag ("Utrecht → provincie + plaats" twee keer)
- [x] README met uitleg over starten, opnieuw importeren en de lijst aanpassen
- [x] Online gezet op GitHub Pages: https://bankras.github.io/topo/
      (bankras/topo, deploy vanaf `main`, `.nojekyll` erbij zodat Jekyll de
      bestanden niet aanraakt). Live nagekeken: kaart, 56 punten en tien keer
      goed aanwijzen.

## Nog te doen / te bespreken

- [ ] De lijst van school bevat **56** punten, niet 58. Welke twee ontbreken?
- [ ] Nakijken of "Almere Stad" (naam in topomania) als "Almere" op de toets komt

## Losse eindjes (mag blijven zoals het is)

- Een paar terechte dubbelingen bij het beoordelen: een klik op Assen geldt ook
  als Drenthe, op Nijmegen ook als de Waal. Dat is aardrijkskundig gewoon waar;
  bij Aanwijzen wordt altijd één punt gevraagd, dus het levert geen fout op.
