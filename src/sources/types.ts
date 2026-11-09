/** Gemeinsame Beschreibung aller Datenquellen (Produkt- und Preisquellen). */
export type SourceStatus =
  | 'ok' //          Daten gefunden
  | 'empty' //       erreichbar, aber nichts gefunden
  | 'skipped' //     für dieses Produkt nicht zuständig (z. B. Open Prices bei Kosmetik)
  | 'offline'
  | 'error'
  | 'disabled' //    in den Einstellungen abgeschaltet
  | 'unavailable'; // keine erlaubte, kostenlose Schnittstelle vorhanden

export interface SourceReport {
  id: string;
  label: string;
  kind: 'product' | 'price';
  status: SourceStatus;
  /** Anzahl gefundener Preise bzw. 1 für ein gefundenes Produkt */
  count: number;
  detail: string;
}

/** Führt eine Quelle aus; jeder Fehler wird in einen Bericht umgewandelt und blockiert keine andere Quelle. */
export async function runSource(
  meta: Pick<SourceReport, 'id' | 'label' | 'kind'>,
  fn: () => Promise<Omit<SourceReport, 'id' | 'label' | 'kind'>>,
): Promise<SourceReport> {
  try {
    return { ...meta, ...(await fn()) };
  } catch (e) {
    console.error(`Quelle ${meta.id} fehlgeschlagen`, e);
    return { ...meta, status: 'error', count: 0, detail: 'Unerwarteter Fehler – andere Quellen sind nicht betroffen.' };
  }
}
