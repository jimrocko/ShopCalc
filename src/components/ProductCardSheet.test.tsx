import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { resetDBConnection } from '../db/db';
import { AppProvider, useApp } from '../state/AppContext';
import { ProductCardSheet } from './ProductCardSheet';
import { BEAUTY_LOREAL, EMPTY_PRODUCT, FOOD_COLA, OPEN_PRICES_COLA, mockFetch } from '../test/fixtures';
import * as repo from '../db/repo';
import { formatCents } from '../lib/money';

let calls: string[] = [];
beforeEach(async () => {
  await resetDBConnection();
  globalThis.indexedDB = new IDBFactory();
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 10, 9, 12)));
  const m = mockFetch({
    'api/v3/product/5449000000996': { body: FOOD_COLA },
    'api/v3/product/3600523614417': { body: BEAUTY_LOREAL },
    'api/v3/product/2000000000008': { body: EMPTY_PRODUCT },
    'prices.openfoodfacts.org': { body: OPEN_PRICES_COLA },
  });
  calls = m.calls;
  vi.stubGlobal('fetch', m.impl);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function CartTotal() {
  const { budget, state } = useApp();
  return (
    <div>
      <span data-testid="total">{formatCents(budget.totalCents)}</span>
      <span data-testid="items">{state.session.items.map((i) => `${i.name}:${i.unitPriceCents}`).join('|')}</span>
    </div>
  );
}

function Harness({ code }: { code: string }) {
  const { state } = useApp();
  if (!state.ready) return null;
  return (
    <>
      <CartTotal />
      <ProductCardSheet barcode={code} onClose={() => undefined} onMoreOptions={() => undefined} />
    </>
  );
}

const renderCard = (code: string) =>
  render(
    <AppProvider>
      <Harness code={code} />
    </AppProvider>,
  );

describe('Produktkarte', () => {
  it('Gewählter Händler REWE: Zusammenfassung, REWE-Preis zuerst, Datenquellen inkl. REWE/EDEKA-Status', async () => {
    await (await import('../db/repo')).saveSettings({ ...(await (await import('../db/repo')).loadSettings()), currentStoreId: 'rewe' });
    renderCard('5449000000996');
    const summary = await screen.findByTestId('retailer-summary');
    expect(summary.textContent).toMatch(/Bei REWE: 2 Preise gefunden/);
    const radios = screen.getAllByRole('radio');
    expect(radios[0].textContent).toMatch(/REWE City, Berlin/);
    await waitFor(() => expect(screen.getAllByRole('radio')[0].getAttribute('aria-checked')).toBe('true'));
    expect(radios[1].textContent).toMatch(/rewe\.de.*Onlinepreis/);
    expect(radios[1].getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('button', { name: /Zum Einkauf hinzufügen · 1,19/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Datenquellen anzeigen/ }));
    const list = screen.getByTestId('source-list').textContent!;
    expect(list).toMatch(/Open Prices · gefunden/);
    expect(list).toMatch(/REWE-Schnittstelle · nicht verfügbar/);
    expect(list).toMatch(/EDEKA-Schnittstelle · nicht verfügbar/);
    expect(calls.some((c) => /rewe\.de|edeka\.de/.test(c))).toBe(false);
  });

  it('Gewählter Händler ohne Preis: ehrlicher Hinweis', async () => {
    await (await import('../db/repo')).saveSettings({ ...(await (await import('../db/repo')).loadSettings()), currentStoreId: 'edeka' });
    renderCard('5449000000996');
    expect((await screen.findByTestId('retailer-summary')).textContent).toMatch(/Bei EDEKA ist noch kein Preis bekannt/);
  });

  it('Lebensmittel: zeigt Bild, Name, Größe und Open-Prices-Preise; „Zum Einkauf hinzufügen“', async () => {
    renderCard('5449000000996');
    expect((await screen.findByTestId('product-name')).textContent).toBe('Coca-Cola');
    expect(screen.getByText(/330 ml/)).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Coca-Cola' })).toBeTruthy();
    const add = await screen.findByRole('button', { name: /Zum Einkauf hinzufügen · 1,19/ });
    // Kennzeichnung von Quelle, Kanal und Art
    expect(screen.getByText('Lidl, Berlin')).toBeTruthy();
    expect(screen.getAllByText('Aktuell bestätigt').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Onlinepreis').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Open Prices · Preisschild').length).toBeGreaterThan(0);
    expect(screen.getByText('rewe.de')).toBeTruthy();
    fireEvent.click(add);
    expect(screen.getByTestId('items').textContent).toBe('Coca-Cola:119');
    // Fremdpreis wird NICHT als eigener Preis gespeichert
    const p = (await repo.findProductByBarcode('5449000000996'))!;
    expect((await repo.listPrices(p.id)).every((r) => r.source === 'openprices')).toBe(true);
  });

  it('Kosmetik: kein Preis → „Preis manuell eingeben“, speichern & hinzufügen', async () => {
    renderCard('3600523614417');
    await screen.findByText(/Infallible Foundation/);
    await screen.findByText(/keine freie Preisdatenbank/);
    expect(calls.some((c) => c.includes('prices.openfoodfacts.org'))).toBe(false);
    expect(screen.getByTestId('no-price')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Zum Einkauf hinzufügen/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Preis manuell eingeben' }));
    fireEvent.change(screen.getByLabelText('Preis'), { target: { value: '12,99' } });
    fireEvent.click(screen.getByRole('button', { name: 'REWE' }));
    fireEvent.click(screen.getByRole('button', { name: 'Speichern & zum Einkauf hinzufügen' }));
    await waitFor(() => expect(screen.getByTestId('items').textContent).toMatch(/Infallible.*:1299/));
    const p = (await repo.findProductByBarcode('3600523614417'))!;
    expect((await repo.listPrices(p.id))[0]).toMatchObject({ priceCents: 1299, storeId: 'rewe', source: 'manual' });
  });

  it('Unbekannter Barcode: Hinweis und manuelle Eingabe mit Name', async () => {
    renderCard('2000000000008');
    await screen.findByText(/in keiner der freien Produktdatenbanken bekannt/);
    expect(screen.getByTestId('product-name').textContent).toBe('Unbekanntes Produkt');
    fireEvent.click(screen.getByRole('button', { name: 'Preis manuell eingeben' }));
    fireEvent.change(screen.getByLabelText('Preis'), { target: { value: '1,95' } });
    fireEvent.change(screen.getByLabelText(/Produktname/), { target: { value: 'Deo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern & zum Einkauf hinzufügen' }));
    await waitFor(() => expect(screen.getByTestId('items').textContent).toBe('Deo:195'));
    expect((await repo.findProductByBarcode('2000000000008'))!.name).toBe('Deo');
  });
});
