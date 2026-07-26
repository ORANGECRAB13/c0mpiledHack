/** Lightweight Markdown renderer (headings, bold, lists, tables, rules, paragraphs). */
export function Markdown({ text }) {
  const blocks = String(text || '').split(/\n\n+/);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-700">
      {blocks.map((block, index) => {
        const lines = block.split('\n').filter((l) => l.trim() !== '');
        if (!lines.length) return null;

        // horizontal rule
        if (lines.length === 1 && /^---+$/.test(lines[0].trim())) return <hr key={index} className="border-slate-200" />;

        // table
        if (lines.length > 1 && lines.every((line) => line.trim().startsWith('|'))) {
          const rows = lines.filter((line) => !/^\|[\s:|-]+\|$/.test(line.trim()));
          return (
            <div key={index} className="overflow-x-auto">
              <table className="min-w-full border border-slate-200 text-xs">
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className={rowIndex === 0 ? 'bg-slate-100 font-medium' : 'odd:bg-white even:bg-slate-50'}>
                      {row.split('|').slice(1, -1).map((cell, cellIndex) => (
                        <td key={cellIndex} className="border border-slate-200 px-2 py-1">{inline(cell.trim())}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        // headings
        if (/^#{1,4}\s/.test(lines[0]) && lines.length === 1) {
          const level = lines[0].match(/^#+/)[0].length;
          const content = lines[0].replace(/^#+\s/, '');
          const cls = level <= 2 ? 'text-base font-semibold text-slate-900' : 'text-sm font-semibold text-slate-800';
          return <p key={index} className={cls}>{inline(content)}</p>;
        }

        // bullet / numbered list
        if (lines.every((line) => /^\s*([-*]|\d+\.)\s/.test(line))) {
          const ordered = /^\s*\d+\./.test(lines[0]);
          const Tag = ordered ? 'ol' : 'ul';
          return (
            <Tag key={index} className={`${ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-5`}>
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{inline(line.replace(/^\s*([-*]|\d+\.)\s/, ''))}</li>
              ))}
            </Tag>
          );
        }

        return <p key={index}>{lines.map((line, lineIndex) => <span key={lineIndex}>{inline(line)}{lineIndex < lines.length - 1 && <br />}</span>)}</p>;
      })}
    </div>
  );
}

// inline bold/code
function inline(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={index} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(part)) return <code key={index} className="rounded bg-slate-100 px-1 text-xs">{part.slice(1, -1)}</code>;
    return part;
  });
}
