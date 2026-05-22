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
        <div className="bg-white rounded-[2.5rem] shadow-xl shadow-gray-200/40 border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-[#1B4340]/5 border-b border-gray-100">
                            {columns.map((col, idx) => (
                                <th 
                                    key={idx} 
                                    className={`px-8 py-6 text-left text-[10px] font-bold text-[#1B4340] uppercase tracking-widest ${col.className || ''}`}
                                >
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {loading ? (
                            <tr>
                                <td colSpan={columns.length} className="px-8 py-20 text-center">
                                    <div className="flex flex-col items-center gap-4 animate-pulse">
                                        <div className="w-12 h-12 rounded-full border-4 border-[#F97316]/20 border-t-[#F97316] animate-spin"></div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{loadingMessage}</p>
                                    </div>
                                </td>
                            </tr>
                        ) : data.length > 0 ? (
                            data.map((item, rowIdx) => (
                                <tr 
                                    key={item.id || item.report_id || item.rescue_id || rowIdx} 
                                    className={`group hover:bg-[#F8FAFC] transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                                    onClick={() => onRowClick?.(item)}
                                >
                                    {columns.map((col, colIdx) => (
                                        <td key={colIdx} className={`px-8 py-6 ${col.className || ''}`}>
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
                                <td colSpan={columns.length} className="px-8 py-20 text-center">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{emptyMessage}</p>
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
