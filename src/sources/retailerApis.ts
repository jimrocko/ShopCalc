/**
 * Händler-Schnittstellen – Ergebnis der Prüfung (Stand 11/2026):
 *
 * REWE: Es gibt keine offizielle, öffentliche Entwickler-API für Produkte oder Preise.
 *   Die vom Onlineshop und der App genutzten Endpunkte sind undokumentiert und gegen fremde Nutzung
 *   geschützt (u. a. Client-Zertifikate der App, Bot-Schutz). Ihre Nutzung wäre eine Umgehung von
 *   Zugriffsschutz und ist daher ausgeschlossen. Angebote Dritter (Apify, Pepesto, parse.bot) sind
 *   kostenpflichtig bzw. Scraper und ebenfalls ausgeschlossen.
 *
 * EDEKA: Ebenfalls keine offizielle, öffentliche API. Vorhandene Endpunkte (Angebote je Markt) sind
 *   inoffiziell/reverse-engineered und teils nur mit Login nutzbar; edeka.de blockiert automatisierte
 *   Zugriffe (HTTP 403). Ausgeschlossen aus denselben Gründen.
 *
 * Preise von REWE- und EDEKA-Filialen kommen deshalb nur aus Open Prices (von Nutzern belegt) und aus
 * eigenen Eingaben. Sobald ein Händler eine offizielle, kostenlose Schnittstelle anbietet, kann hier
 * eine Quelle mit derselben Struktur ergänzt werden.
 */
import type { SourceReport } from './types';

export interface RetailerApiInfo {
  id: string;
  label: string;
  reason: string;
}

export const RETAILER_APIS: RetailerApiInfo[] = [
  {
    id: 'rewe-api',
    label: 'REWE',
    reason: 'Keine offizielle, kostenlose Schnittstelle. REWE-Preise kommen aus Open Prices und deinen eigenen Eingaben.',
  },
  {
    id: 'edeka-api',
    label: 'EDEKA',
    reason: 'Keine offizielle, kostenlose Schnittstelle. EDEKA-Preise kommen aus Open Prices und deinen eigenen Eingaben.',
  },
];

/** Berichte ohne Netzwerkzugriff – es wird bewusst nichts abgefragt. */
export function retailerApiReports(): SourceReport[] {
  return RETAILER_APIS.map((r) => ({
    id: r.id,
    label: `${r.label}-Schnittstelle`,
    kind: 'price' as const,
    status: 'unavailable' as const,
    count: 0,
    detail: r.reason,
  }));
}
