import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';

interface Officer {
    user_id: number;
    name: string;
    email: string;
    phone?: string;
    profile_picture?: string;
    role_id: number;
    subdivision_id?: number;
    position?: {
        position_name: string;
    };
}

interface TransferReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    reportId: number;
    currentUserId: number;
    subdivisionId?: number;
    onTransferSuccess: (updatedReport: any) => void;
}

const TransferReportModal: React.FC<TransferReportModalProps> = ({
    isOpen,
    onClose,
    reportId,
    currentUserId,
    subdivisionId,
    onTransferSuccess,
}) => {
    const [officers, setOfficers] = useState<Officer[]>([]);
    const [selectedOfficerId, setSelectedOfficerId] = useState<number | null>(null);
    const [notes, setNotes] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchSubdivisionOfficers();
            setSelectedOfficerId(null);
            setNotes('');
            setError(null);
        }
    }, [isOpen, subdivisionId]);

    const fetchSubdivisionOfficers = async () => {
        setLoading(true);
        setError(null);
        try {
            const params: any = { role_id: 2 };
            if (subdivisionId) {
                params.subdivision_id = subdivisionId;
            }
            const res = await api.get('/users', { params });
            const list: Officer[] = (res.data || []).filter(
                (u: Officer) => u.user_id !== currentUserId
            );
            setOfficers(list);
            if (list.length > 0) {
                setSelectedOfficerId(list[0].user_id);
            }
        } catch (err: any) {
            console.error('Failed to fetch subdivision officers:', err);
            setError('Could not load fellow subdivision leaders. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedOfficerId) {
            setError('Please select an officer to transfer this case to.');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const res = await api.post(`/reports/${reportId}/transfer/request`, {
                user_id: currentUserId,
                target_user_id: selectedOfficerId,
                notes: notes.trim() || undefined,
            });

            onTransferSuccess(res.data);
            onClose();
        } catch (err: any) {
            console.error('Failed to request report transfer:', err);
            setError(err.response?.data?.detail || 'Failed to submit transfer request.');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const selectedOfficer = officers.find((o) => o.user_id === selectedOfficerId);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-gray-100 flex flex-col gap-6 relative max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-orange-100 text-[#F97316] flex items-center justify-center text-xl font-black">
                            🔄
                        </div>
                        <div>
                            <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">
                                Transfer Report #{reportId}
                            </h3>
                            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
                                Hand over case to another Subdivision Leader
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="w-8 h-8 rounded-full bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-700 flex items-center justify-center transition-all cursor-pointer"
                    >
                        ✕
                    </button>
                </div>

                {error && (
                    <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-xs font-bold flex items-center gap-2">
                        <span>⚠️</span>
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Select Leader */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">
                            Select Recipient Leader
                        </label>
                        {loading ? (
                            <div className="p-8 text-center bg-gray-50 rounded-2xl">
                                <div className="w-6 h-6 border-2 border-[#F97316] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    Loading officers...
                                </span>
                            </div>
                        ) : officers.length === 0 ? (
                            <div className="p-6 text-center bg-amber-50 border border-amber-100 rounded-2xl">
                                <p className="text-xs font-bold text-amber-900">
                                    No other active subdivision leaders found in your subdivision.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-2.5 max-h-48 overflow-y-auto p-1">
                                {officers.map((officer) => {
                                    const isSelected = selectedOfficerId === officer.user_id;
                                    return (
                                        <div
                                            key={officer.user_id}
                                            onClick={() => setSelectedOfficerId(officer.user_id)}
                                            className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                                isSelected
                                                    ? 'bg-orange-50/80 border-[#F97316] shadow-xs'
                                                    : 'bg-gray-50/50 hover:bg-gray-50 border-gray-100'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <img
                                                    src={getProfilePicture(officer.profile_picture)}
                                                    alt={officer.name}
                                                    onError={(e) => {
                                                        e.currentTarget.src = DEFAULT_AVATAR;
                                                    }}
                                                    className="w-10 h-10 rounded-full object-cover border border-gray-200 shrink-0"
                                                />
                                                <div className="min-w-0">
                                                    <h5 className="text-xs font-black text-gray-900 truncate">
                                                        {officer.name}
                                                    </h5>
                                                    <p className="text-[10px] text-gray-500 font-semibold truncate">
                                                        {officer.position?.position_name || 'Subdivision Leader'} • {officer.email}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="shrink-0">
                                                <div
                                                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                                        isSelected
                                                            ? 'border-[#F97316] bg-[#F97316] text-white'
                                                            : 'border-gray-300'
                                                    }`}
                                                >
                                                    {isSelected && <span className="text-[10px]">✓</span>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Handover Reason / Notes */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1 flex items-center justify-between">
                            <span>Handover Notes / Instructions</span>
                            <span className="text-[9px] text-gray-400 font-normal lowercase">optional</span>
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="e.g. Currently handling an emergency call. Please follow up on-site."
                            rows={3}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-bold text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316] focus:bg-white transition-all resize-none shadow-xs"
                        />
                    </div>

                    {/* Workflow Info Box */}
                    <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-100 flex items-start gap-2.5 text-xs text-blue-900">
                        <span className="text-base shrink-0">ℹ️</span>
                        <p className="text-[11px] leading-relaxed font-medium">
                            {selectedOfficer ? (
                                <>
                                    A notification will be sent to <strong className="font-bold text-blue-950">{selectedOfficer.name}</strong> to accept or reject this transfer request. You remain responsible for the report until they accept.
                                </>
                            ) : (
                                <>The recipient will receive a notification to review and accept your handover request.</>
                            )}
                        </p>
                    </div>

                    {/* Buttons */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || !selectedOfficerId || officers.length === 0}
                            className="px-6 py-2.5 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-black uppercase tracking-wider shadow-md shadow-orange-500/20 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                        >
                            {submitting ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                    <span>Sending Request...</span>
                                </>
                            ) : (
                                <>
                                    <span>Send Transfer Request</span>
                                    <span>→</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default TransferReportModal;
