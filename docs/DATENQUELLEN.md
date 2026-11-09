# Datenquellen von ShopCalc – Prüfung und Ergebnis

Stand: November 2026. Geprüft wurde jede Quelle auf: **kostenlos** (ohne Testphase, Kreditkarte oder Abo), **erreichbar** (aus dem Browser bzw. der PWA) und **rechtlich nutzbar** (offizielle Schnittstelle oder offene Lizenz, keine Umgehung von Zugriffsschutz).

## Ergebnis auf einen Blick

| Quelle | Art | Kostenlos | Erreichbar | Rechtlich | In ShopCalc |
|---|---|---|---|---|---|
| ShopCalc lokal (IndexedDB) | Produkte + eigene Preise | ✓ | ✓ offline | ✓ | **Ja** – immer zuerst |
| Open Food / Beauty / Pet Food / Products Facts (`product_type=all`) | Produktdaten | ✓ | ✓ (CORS) | ✓ ODbL | **Ja** |
| Open Prices – Produktdaten (`/api/v1/products/code/{ean}`) | Produktdaten | ✓ | ✓ (CORS) | ✓ ODbL | **Ja** – Ausweichquelle |
| Open Prices – Preise (`/api/v1/prices`) | Filial- und Onlinepreise | ✓ | ✓ (CORS) | ✓ ODbL | **Ja** – nur Lebensmittel |
| REWE | Produkte/Preise | – | – | ✗ | **Nein** (siehe unten) |
| EDEKA | Produkte/Angebote | – | – | ✗ | **Nein** (siehe unten) |
| UPCitemdb | Produktdaten | Testkontingent | ✗ (CORS nur eigene Website) | eingeschränkt | Nein |
| Open EAN / opengtindb.org | Produktdaten | ✓ nach Registrierung | ✗ (kein CORS, persönliche Abfrage-ID nötig) | ✓ nicht-kommerziell | Nein |
| Anbieter wie Apify, Pepesto, parse.bot | Preise (Scraper/Wrapper) | ✗ kostenpflichtig | – | Scraping | Nein |

## REWE

- Es gibt **keine offizielle, öffentliche Entwickler-Schnittstelle** für Produkt- oder Preisdaten.
- Onlineshop und App nutzen interne, undokumentierte Endpunkte. Die App-Schnittstelle ist durch Client-Zertifikate geschützt, der Onlineshop durch Bot-Schutz; `robots.txt` sperrt zudem Suchseiten.
- Diese Endpunkte zu verwenden, hieße Zugriffsschutz zu umgehen bzw. zu scrapen – ausgeschlossen.
- Drittanbieter, die REWE-Preise anbieten, sind kostenpflichtig und beruhen auf Scraping – ausgeschlossen.
- Ein offizieller Zugang wäre nur über eine individuelle Vereinbarung mit REWE denkbar (nicht kostenlos/öffentlich verfügbar).

## EDEKA

- Ebenfalls **keine offizielle, öffentliche Schnittstelle**.
- Vorhandene Projekte nutzen reverse-engineerte App-Endpunkte (Angebote je Markt), teils nur mit Login; `edeka.de` blockiert automatisierte Zugriffe (HTTP 403).
- EDEKA ist genossenschaftlich in Regionalgesellschaften organisiert; Daten für Lieferanten (z. B. über Portale) sind nicht für Endnutzer-Apps gedacht. Ein Zugang für dieses Projekt existiert nicht.

## Open Prices

- Freie Gemeinschaftsdatenbank des Open-Food-Facts-Projekts. Jeder Preis ist von einer Person erfasst, meist mit **Foto von Preisschild oder Kassenbon**, und einer konkreten Filiale (OpenStreetMap) oder einem Onlineshop zugeordnet.
- Abdeckung in Deutschland (gemessen 11/2026): ca. **1.800 Preise aus 181 REWE-Filialen**, ca. **2.100 aus 136 EDEKA-Filialen**, je ca. 1.000–1.300 bei Lidl, ALDI und Kaufland. Für ein beliebiges Produkt ist ein REWE- oder EDEKA-Preis daher eher die Ausnahme.
- Der API-Filter `location__osm_name__contains` lieferte bei der Prüfung keine Treffer; ShopCalc fragt deshalb per GTIN ab und ordnet die Filialen selbst einem Händler zu.

## So arbeitet ShopCalc

1. **Produkt erkennen** (nacheinander, bis eine Quelle es kennt): lokal → Open-*-Facts → Open Prices Produktdaten. Produktdaten werden nie als Preis verwendet.
2. **Preise suchen** (unabhängig voneinander; ein Fehler blockiert keine andere Quelle): eigene Preise, Open Prices; REWE/EDEKA werden nur als „nicht verfügbar“ gemeldet, ohne Netzwerkzugriff.
3. **Zuordnung**: Händler (REWE, EDEKA inkl. E center/E aktiv, ALDI Nord/Süd, Lidl, Kaufland, eigene Märkte) und konkreter Markt (Filialname + Ort bzw. Onlineshop). Nur deutsche Filialen werden einem Händler zugeordnet.
4. **Speicherung**: jeder Preis mit Händler, Markt, Quelle, Kanal (Filiale/online), Erfassungs- und Abrufdatum.
5. **Vorauswahl** nur aktueller Filialpreise: eigener Preis beim gewählten Händler → belegter Open-Prices-Preis beim gewählten Händler → eigener Preis anderswo → belegter Open-Prices-Preis aus Deutschland. Ältere, geschätzte und Onlinepreise werden angezeigt, aber nie automatisch gewählt.
6. **Kein Preis?** → „Preis manuell eingeben“. Mit jedem eigenen Preis wird die App beim nächsten Scan besser.
7. **Duplikate**: Produkte werden über die normalisierte GTIN (UPC-A/GTIN-14 → EAN-13) erkannt und automatisch zusammengeführt.

## Quellen der Recherche

- REWE: keine öffentliche API laut Drittanbietern ([Pepesto](https://www.pepesto.com/supermarkets/rewe/), [Apify REWE-Scraper](https://apify.com/blackfalcondata/rewe-scraper)), [innoq-Marktanalyse 2022](https://www.innoq.com/en/blog/2022/06/marktanalyse/)
- EDEKA: inoffizielle Projekte [apis-spec/edeka](https://github.com/apis-spec/edeka), [edekompile](https://github.com/ByteSizedMarius/edekompile); [Pepesto EDEKA](https://www.pepesto.com/supermarkets/edeka/)
- Open-*-Facts: [Scanning cosmetics, pet food and other products](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/scanning-cosmetics-pet-food-and-other-products/)
- Open Prices: [prices.openfoodfacts.org](https://prices.openfoodfacts.org), API-Schema unter `/api/schema`
