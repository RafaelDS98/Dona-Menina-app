export default function DataTable({ columns, data, emptyMessage = 'Nenhum registro encontrado', highlightId = null }) {
  if (!data || data.length === 0) {
    return <p className="text-gray-400 text-sm py-8 text-center">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            {columns.map(col => (
              <th key={col.key} className="text-left py-3 px-3 text-gray-500 font-medium text-xs uppercase tracking-wider">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const isHighlighted = highlightId !== null && Number(row.id) === Number(highlightId);
            return (
              <tr
                key={row.id || i}
                className="border-b border-gray-100 transition-colors"
                style={isHighlighted ? { backgroundColor: '#fce7f3' } : {}}
                onMouseEnter={e => { if (!isHighlighted) e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                onMouseLeave={e => { if (!isHighlighted) e.currentTarget.style.backgroundColor = ''; }}
              >
                {columns.map(col => (
                  <td key={col.key} className="py-2.5 px-3">
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
