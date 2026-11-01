import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cx } from '@/lib/format';
import { Skeleton } from './ui/primitives';

export interface Column<T> {
  key: string; header: string; sort?: string; cell: (row: T) => ReactNode; className?: string; headerClassName?: string; firstOrder?: 'asc' | 'desc';
}

export function DataTable<T>({ columns, rows, rowKey, loading, sort, order, onSort, empty, onRowClick }: {
  columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string | number; loading?: boolean; sort?: string; order?: 'asc' | 'desc';
  onSort?: (key: string, firstOrder?: 'asc' | 'desc') => void; empty?: ReactNode; onRowClick?: (r: T) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-white">
      <table className="w-full min-w-[760px] border-collapse text-left text-[13.5px]">
        <thead>
          <tr className="border-b border-line bg-cream/50 text-[12px] font-semibold uppercase tracking-wide text-muted">
            {columns.map((c) => {
              const active = c.sort && sort === c.sort;
              return (
                <th key={c.key} scope="col" aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : undefined} className={cx('whitespace-nowrap px-4 py-3', c.headerClassName)}>
                  {c.sort && onSort ? (
                    <button onClick={() => onSort(c.sort!, c.firstOrder)} className={cx('inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink', active && 'text-ink')}>
                      {c.header}{active ? (order === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ChevronsUpDown size={12} className="opacity-40" />}
                    </button>
                  ) : c.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading && Array.from({ length: 6 }, (_, i) => (
            <tr key={i} className="border-b border-line last:border-0">{columns.map((c) => <td key={c.key} className="px-4 py-3.5"><Skeleton className="h-4 w-full max-w-[140px]" /></td>)}</tr>
          ))}
          {!loading && rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cx('border-b border-line transition last:border-0', onRowClick && 'cursor-pointer hover:bg-cream/60')}>
              {columns.map((c) => <td key={c.key} className={cx('px-4 py-3 align-middle', c.className)}>{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && rows.length === 0 && empty}
    </div>
  );
}
