import { useState, useEffect, useRef } from 'react';

export default function Autocomplete({ placeholder, fetchOptions, onSelect, displayKey = 'nome', renderOption }) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const wrapperRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setOptions([]);
      setShowDropdown(false);
      setSearched(false);
      return;
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await fetchOptions(query);
        setOptions(results);
        setSearched(true);
        setShowDropdown(true);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timeoutRef.current);
  }, [query, fetchOptions]);

  const handleSelect = (item) => {
    setQuery(item[displayKey]);
    setShowDropdown(false);
    onSelect(item);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setSearched(false); }}
        onFocus={() => (options.length > 0 || searched) && setShowDropdown(true)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      />
      {loading && <span className="absolute right-3 top-2.5 text-xs text-gray-400">...</span>}
      {showDropdown && (
        <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-auto">
          {options.length > 0 ? (
            options.map(item => (
              <li
                key={item.id}
                onClick={() => handleSelect(item)}
                className="px-3 py-2 text-sm hover:bg-primary-light cursor-pointer"
              >
                {renderOption ? renderOption(item) : item[displayKey]}
              </li>
            ))
          ) : searched ? (
            <li className="px-3 py-2 text-sm text-gray-400 italic">
              Nenhuma cliente encontrada para "{query}"
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
