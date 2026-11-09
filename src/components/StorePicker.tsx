import { useState } from 'react';
import { useApp } from '../state/AppContext';
import { Chip, inputClass } from './ui';
import { addStore } from '../db/repo';

/** Horizontale Chip-Auswahl der Märkte inkl. „Markt hinzufügen“. */
export function StorePicker({
  value,
  onChange,
  allowNone = true,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  allowNone?: boolean;
}) {
  const { stores, reloadStores } = useApp();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const submit = async () => {
    if (!name.trim()) {
      setAdding(false);
      return;
    }
    const s = await addStore(name);
    await reloadStores();
    onChange(s.id);
    setName('');
    setAdding(false);
  };

  return (
    <div>
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {allowNone && (
          <Chip active={value === null} onClick={() => onChange(null)}>
            Kein Markt
          </Chip>
        )}
        {stores.map((s) => (
          <Chip key={s.id} active={value === s.id} onClick={() => onChange(s.id)}>
            {s.name}
          </Chip>
        ))}
        {!adding && <Chip onClick={() => setAdding(true)}>+ Markt</Chip>}
      </div>
      {adding && (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            className={inputClass}
            placeholder="Name des Marktes"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <button type="button" className="tap rounded-2xl bg-accent px-4 font-semibold text-black" onClick={() => void submit()}>
            OK
          </button>
        </div>
      )}
    </div>
  );
}
