import React from 'react';
import { SearchX } from 'lucide-react';

interface Column<T> {
    header: string;
    key: string;
    render?: (item: T, index?: number, data?: T[]) => React.ReactNode;
    className?: string;
}

interface DataTableProps<T> {
    columns: Column<T>[];
    data: T[];
    loading?: boolean;
    onRowClick?: (item: T) => void;
    emptyTitle?: string;
    emptyMessage?: string;
    emptyIcon?: React.ReactNode;
    onResetFilters?: () => void;
    loadingMessage?: string;
}

const DataTable = <T extends { [key: string]: any }>({
    columns,
    data,
    loading = false,
    onRowClick,
    emptyTitle,
    emptyMessage = "No active records found matching your filter criteria.",
    emptyIcon,
    onResetFilters,
    loadingMessage = "Synchronizing data..."
}: DataTableProps<T>) => {
    return (
        <div className="bg-white rounded-2xl md:rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar min-h-[300px]">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-gray-100">
                            {columns.map((col, idx) => (
                                <th 
                                    key={idx} 
                                    className={`px-6 py-4 text-left text-[11px] font-black text-slate-600 uppercase tracking-wider ${col.className || ''}`}
                                >
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr>
                                <td colSpan={columns.length} className="px-6 py-16 text-center">
                                    <div className="flex flex-col items-center gap-3 animate-pulse">
                                        <div className="w-10 h-10 rounded-full border-3 border-role/20 border-t-role animate-spin"></div>
                                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{loadingMessage}</p>
                                    </div>
                                </td>
                            </tr>
                        ) : data.length > 0 ? (
                            data.map((item, rowIdx) => (
                                <tr 
                                    key={item.id || item.report_id || item.rescue_id || item.warning_id || item.user_id || rowIdx} 
                                    className={`group hover:bg-role-soft/20 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                                    onClick={() => onRowClick?.(item)}
                                >
                                    {columns.map((col, colIdx) => (
                                        <td key={colIdx} className={`px-6 py-4 text-sm ${col.className || ''}`}>
                                            {col.render ? col.render(item, rowIdx, data) : (
                                                <span className="text-sm font-medium text-gray-700">
                                                    {item[col.key]}
                                                </span>
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={columns.length} className="px-6 py-20 text-center">
                                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto animate-in fade-in duration-300">
                                        <div className="w-16 h-16 rounded-3xl bg-role-soft border border-role-muted flex items-center justify-center text-role shadow-xs mb-3.5">
                                            {emptyIcon || (
                                                <SearchX className="w-8 h-8 stroke-[1.75]" />
                                            )}
                                        </div>
                                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                                            {emptyTitle || "No Records Found"}
                                        </h4>
                                        <p className="text-xs font-semibold text-slate-400 leading-relaxed mt-1">
                                            {emptyMessage}
                                        </p>
                                        {onResetFilters && (
                                            <button
                                                type="button"
                                                onClick={onResetFilters}
                                                className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95"
                                            >
                                                Clear Search & Filters
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default DataTable;

