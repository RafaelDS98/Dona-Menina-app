import { useState, useEffect, useRef } from 'react';

export default function SearchInput({ placeholder = 'Buscar...', onSearch, debounce = 300 }) {
  const [value, setValue] = useState('');
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      onSearch(value);
    }, debounce);
    return () => clearTimeout(timeoutRef.current);
  }, [value, debounce, onSearch]);

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
    />
  );
}
