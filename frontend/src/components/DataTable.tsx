import React from 'react';

interface Column<T> {
    header: string;
    key: string;
    render?: (item: T) => React.ReactNode;
    className?: string;
}

interface DataTableProps<T> {
    columns: Column<T>[];
    data: T[];
    loading?: boolean;
    onRowClick?: (item: T) => void;
    emptyMessage?: string;
    loadingMessage?: string;
}

const DataTable = <T extends { [key: string]: any }>({
    columns,
    data,
    loading = false,
    onRowClick,
    emptyMessage = "No records found.",
    loadingMessage = "Synchronizing data..."
}: DataTableProps<T>) => {
    return (
        <div className="bg-white rounded-2xl md:rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
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
                                        <div className="w-10 h-10 rounded-full border-3 border-[#F97316]/20 border-t-[#F97316] animate-spin"></div>
                                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{loadingMessage}</p>
                                    </div>
                                </td>
                            </tr>
                        ) : data.length > 0 ? (
                            data.map((item, rowIdx) => (
                                <tr 
                                    key={item.id || item.report_id || item.rescue_id || rowIdx} 
                                    className={`group hover:bg-orange-50/20 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                                    onClick={() => onRowClick?.(item)}
                                >
                                    {columns.map((col, colIdx) => (
                                        <td key={colIdx} className={`px-6 py-4 text-sm ${col.className || ''}`}>
                                            {col.render ? col.render(item) : (
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
                                <td colSpan={columns.length} className="px-6 py-16 text-center">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{emptyMessage}</p>
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
