# ShopCalc – Einkaufsrechner fürs iPhone

ShopCalc ist ein **digitaler Einkaufsrechner** für spontanes Einkaufen mit Budget.
Keine Einkaufsliste, keine Kaufempfehlungen – nur ein schnelles Werkzeug, das den Taschenrechner im Supermarkt ersetzt.

Die App ist eine **Progressive Web App (PWA)**: Sie läuft in Safari, lässt sich über *Teilen › Zum Home-Bildschirm* installieren, funktioniert offline und speichert alle Daten lokal auf dem Gerät (IndexedDB). Keine Registrierung, keine Cloud, keine Kosten.

## Funktionen

| Bereich | Umfang |
|---|---|
| **Budget** | Frei wählbar (Schnellwahl 20/30/50/75/100/150 €), jederzeit änderbar. Anzeige von Gesamtbudget, Ausgegeben, Noch verfügbar. Negative Restbeträge erlaubt, Warnung ab 90 % und bei Überschreitung – Eingaben werden nie blockiert. |
| **Preis eingeben** | Einzelpreis (Komma oder Punkt), Menge, optionaler Name, Pfand, Supermarkt. „+ Nächstes“ für Serienerfassung. Bearbeiten, Entfernen (mit Rückgängig), Menge ±, gleiche Produkte automatisch zusammenfassen. |
| **Barcode-Scanner** | Rückkamera, EAN-8/EAN-13 (UPC-A wird umgewandelt), Prüfziffernkontrolle und Doppel-Bestätigung gegen Fehlerkennungen. Erkennung lokal mit ZXing. Manuelle Barcode-Eingabe, falls keine Kamera/Berechtigung. |
| **Produktkarte nach dem Scan** | Bild, Name, Marke, Größe, Kategorie, Datenquelle und alle gefundenen Preise. „Zum Einkauf hinzufügen“ mit gewähltem Preis – oder „Preis manuell eingeben“, wenn keiner vorliegt (Preis, Markt, optional Name und „nur geschätzt“). |
| **Produkterkennung** | Lokale Datenbank zuerst, danach die universelle Abfrage `product_type=all` über Open Food Facts, Open Beauty Facts, Open Pet Food Facts und Open Products Facts. Diese Datenbanken enthalten **keine Preise**. |
| **Preissuche** | 1. eigene ShopCalc-Preise, 2./3. Open Prices (einzige freie öffentliche Preisdatenbank; von Nutzern per Preisschild/Kassenbon belegt) – **nur für Lebensmittel**. Für Kosmetik & Co. gibt es keine freie Preisquelle; dann folgt die manuelle Eingabe. |
| **Preisdatenbank** | Ein Produkt hat beliebig viele Preise; jeder Preis hat Quelle (eigene Eingabe / Open Prices), Kanal (Filiale / online), Markt bzw. Ort und Datum. Märkte: Aldi, Lidl, REWE, EDEKA, Kaufland + eigene. |
| **Preiskennzeichnung** | Jeder Preis ist eindeutig eingeordnet: *Aktuell bestätigt* (Open Prices mit Beleg), *Manuell erfasst*, *Älterer Preis* (Schwelle einstellbar), *Onlinepreis*, *Geschätzt* (vom Nutzer so markiert). ShopCalc schätzt oder erfindet selbst keine Preise. Automatisch vorausgewählt werden nur aktuelle Filialpreise (eigene zuerst, sonst belegte Open-Prices-Preise aus Deutschland). |
| **Preisvergleich** | Neuester Preis je Quelle und Markt für genau dieses Produkt (gleicher Barcode bzw. gleiche Packungsgröße), mit Datum. Eigene Preise zuerst, nicht nach Preis sortiert, ohne Empfehlung. Preisverlauf einsehbar. |
| **Taschenrechner** | + − × ÷, Prozent (50 + 10 % = 55), Rabatt-Taste, Zwischensummen, Rechenprotokoll, Übernahme in den Einkauf. |
| **Pfand** | Pfand je Artikel oder separat (Einweg, Mehrweg, Kasten, eigener Betrag) mit Anzahl. Rückgabe/Leergutbon verrechnen. Warenwert und Pfand getrennt ausgewiesen. |
| **Offline** | Service Worker, alle Berechnungen und gespeicherten Produkte offline nutzbar, Offline-Anzeige im Kopfbereich. |
| **Sicherung** | Export/Import als JSON-Datei (z. B. für Gerätewechsel). |

## Technik

React 19 · TypeScript · Vite · Tailwind CSS · vite-plugin-pwa (Workbox) · IndexedDB (`idb`) · ZXing (`@zxing/browser`) · Open Food Facts API · Vitest

```
src/
  lib/        Reine Logik: Cent-Arithmetik, Summen/Budget, Taschenrechner, Preise, Barcode
  db/         IndexedDB-Schema und Repository (Produkte, Preise, Märkte, Einstellungen, Sitzung)
  api/        Open-*-Facts-Produktabfrage (product_type=all), Open Prices
  services/   Ablauf nach dem Scan (lokal → Produktdatenbanken → Open Prices)
  scanner/    Kamera + Barcode-Erkennung
  state/      App-Zustand (Reducer + Context), Online-Status
  components/ UI-Bausteine und Bottom-Sheets
  views/      Einkauf, Produkte, Einstellungen
```

**Geld wird ausschließlich in ganzzahligen Cent berechnet** (149 Cent × 3 = 447 Cent); erst die Anzeige formatiert zu „4,47 €“.

## Entwicklung

```bash
npm install
npm run dev        # Entwicklungsserver
npm test           # Tests (Vitest)
npm run build      # Produktions-Build nach dist/
npm run preview    # Build lokal ansehen
```

Hinweis: Die Kamera funktioniert in Browsern nur über **HTTPS** (oder `localhost`). Zum Testen auf dem iPhone daher die veröffentlichte HTTPS-Version verwenden.

## Kostenlos veröffentlichen

Alle Varianten sind kostenlos, ohne Kreditkarte, und liefern automatisch HTTPS.

**Netlify (Free)** – https://app.netlify.com → *Add new site › Import from Git* → dieses Repository wählen. Die Einstellungen werden aus `netlify.toml` übernommen.

**Vercel (Hobby, kostenlos für private Nutzung)** – https://vercel.com/new → Repository importieren. Framework „Vite“ wird erkannt, Einstellungen aus `vercel.json`.

Danach die URL in Safari öffnen → *Teilen* → *Zum Home-Bildschirm*.

### Kosten und Grenzen

| Dienst | Kosten | Grenzen |
|---|---|---|
| Netlify Free | 0 € | Großzügiges monatliches Kontingent für Bandbreite und Builds – für eine private App weit ausreichend |
| Vercel Hobby | 0 € | Nur für nicht-kommerzielle, private Nutzung |
| Open Food / Beauty / Pet Food / Products Facts | 0 € | Offene Daten (ODbL), kein Schlüssel nötig. Rate-Limit ca. 100 Produktabfragen pro Minute – ShopCalc fragt nur bei unbekannten bzw. noch nicht abgeglichenen Produkten ab und speichert das Ergebnis lokal |
| Open Prices | 0 € | Offene Daten (ODbL), Lesezugriff ohne Schlüssel. Abfrage nur für Lebensmittel; Ergebnisse werden lokal mit Abrufdatum gespeichert |
| ZXing, React, Vite, Tailwind, idb, Workbox | 0 € | Open Source (MIT / Apache-2.0) |
| IndexedDB, Service Worker | 0 € | Browser-Speicher auf dem Gerät |

Hinweis zu iOS: Safari kann Website-Daten löschen, wenn eine Website mehrere Wochen nicht genutzt wird. Als Home-Bildschirm-App installiert ist das in der Regel nicht der Fall – für wichtige Preisdaten trotzdem gelegentlich eine Sicherung exportieren (Einstellungen › Daten).

## App-Icons

Icons und iOS-Startbildschirme liegen in `public/`. Bei Designänderungen an `public/favicon.svg` neu erzeugen mit `npm run icons` (benötigt Playwright/Chromium lokal).

## Datenquellen und Rechtliches

- **Keine Shop-Scraper.** Supermarkt-Websites werden nicht ausgelesen; es gibt keine kostenlose, rechtlich saubere API mit aktuellen Supermarktpreisen in Deutschland.
- **Preise anderer Nutzer** stammen ausschließlich aus Open Prices, einer offenen Gemeinschaftsdatenbank, in die Menschen Preise mit Foto-Beleg eintragen. Eine eigene ShopCalc-Cloud zum Teilen von Preisen gibt es nicht – sie wäre nicht dauerhaft kostenlos zu betreiben.
- Alle Open-*-Facts-Daten stehen unter der Open Database License (ODbL); die Quelle wird in der App bei jedem Produkt und Preis genannt.
