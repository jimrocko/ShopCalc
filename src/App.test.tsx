import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import App from './App';
import { resetDBConnection } from './db/db';
import { loadSession } from './db/repo';

beforeEach(async () => {
  await resetDBConnection();
  globalThis.indexedDB = new IDBFactory();
});
afterEach(cleanup);

const remaining = () => screen.getByTestId('remaining').textContent!.replace(/\s/g, ' ');

describe('ShopCalc UI', () => {
  it('Budget festlegen, Preis erfassen, Überschreitung anzeigen, Daten bleiben erhalten', async () => {
    render(<App />);
    await screen.findByText('Noch verfügbar');
    expect(remaining()).toBe('50,00 €');

    // Budget auf 20 € setzen
    fireEvent.click(screen.getByRole('button', { name: /Budget 50,00/ }));
    fireEvent.click(screen.getByRole('button', { name: /^20\s€$/ }));
    expect(remaining()).toBe('20,00 €');

    // Milch 2 × 1,19 €
    fireEvent.click(screen.getByRole('button', { name: 'Preis eingeben' }));
    fireEvent.change(screen.getByLabelText('Preis'), { target: { value: '1,19' } });
    fireEvent.click(screen.getByRole('button', { name: 'Menge erhöhen' }));
    fireEvent.change(screen.getByLabelText(/Produkt/), { target: { value: 'Milch' } });
    expect(screen.getByText(/Summe dieser Position/).nextSibling!.textContent).toMatch(/2,38/);
    fireEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    expect(remaining()).toBe('17,62 €');

    // Überschreitung blockiert nichts
    fireEvent.click(screen.getByRole('button', { name: 'Preis eingeben' }));
    fireEvent.change(screen.getByLabelText('Preis'), { target: { value: '21' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    expect(remaining()).toBe('-3,38 €');
    expect(screen.getByText(/Budget um 3,38\s€ überschritten/)).toBeTruthy();

    // Menge in der Liste erhöhen
    fireEvent.click(screen.getByRole('button', { name: 'Menge von Milch erhöhen' }));
    expect(remaining()).toBe('-4,57 €');

    // Persistenz
    await waitFor(async () => expect((await loadSession()).items).toHaveLength(2));
    cleanup();
    await resetDBConnection();
    render(<App />);
    await screen.findByText('Noch verfügbar');
    expect(remaining()).toBe('-4,57 €');
  });
});
