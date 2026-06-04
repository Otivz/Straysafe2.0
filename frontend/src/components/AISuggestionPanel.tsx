import React from 'react';

interface AISuggestionPanelProps {
    animalType?: string | null;
    dominantColor?: string | null;
    estimatedSize?: string | null;
    suggestedRiskLevel?: string | null;
    suggestedPriority?: string | null;
    possibleBreed?: string | null;
    description?: string | null;
    categoryName?: string | null;
    suggestedPriorityReason?: string | null;
}

const getColorHex = (colorName: string): string => {
    const name = colorName.trim().toLowerCase();
    if (name.includes('brown')) return '#8B5A2B';
    if (name.includes('black')) return '#18181B';
    if (name.includes('white')) return '#FAFAFA';
    if (name.includes('gray') || name.includes('grey')) return '#71717A';
    if (name.includes('golden')) return '#F59E0B';
    if (name.includes('orange') || name.includes('ginger')) return '#EA580C';
    if (name.includes('yellow') || name.includes('cream')) return '#EAB308';
    if (name.includes('red')) return '#EF4444';
    if (name.includes('tan')) return '#D2B48C';
    if (name.includes('blue')) return '#3B82F6';
    if (name.includes('green')) return '#10B981';
    return '#71717A'; // fallback gray
};

const getSwatchStyle = (colorStr?: string | null): string => {
    const colors = (colorStr || 'Brown').split(',').map(c => c.trim()).filter(Boolean);
    if (colors.length === 0) return '#8B5A2B';
    if (colors.length === 1) return getColorHex(colors[0]);
    // Beautiful split linear gradient for multiple colors
    const hex1 = getColorHex(colors[0]);
    const hex2 = getColorHex(colors[1]);
    return `linear-gradient(135deg, ${hex1} 50%, ${hex2} 50%)`;
};

export const AISuggestionPanel: React.FC<AISuggestionPanelProps> = ({
    animalType,
    dominantColor,
    estimatedSize,
    suggestedRiskLevel,
    suggestedPriority,
    possibleBreed,
    description,
    categoryName,
    suggestedPriorityReason
}) => {
    // If no suggestions exist yet, display a premium loading state
    const hasData = animalType || dominantColor || estimatedSize || suggestedRiskLevel || suggestedPriority || possibleBreed;

    if (!hasData) {
        return (
            <div className="relative overflow-hidden bg-gradient-to-br from-indigo-950/40 via-slate-900/40 to-emerald-950/30 backdrop-blur-xl p-6 rounded-3xl border border-white/10 shadow-xl animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">AI Sighting Intelligence</span>
                </div>
                <p className="text-xs text-white/40 uppercase tracking-wider font-bold">Analyzing media and incident reports...</p>
            </div>
        );
    }

    // Helper functions for custom badge colors & styling
    const getRiskStyles = (risk?: string | null) => {
        const val = (risk || '').toLowerCase();
        if (val.includes('high')) {
            return {
                bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
                dot: 'bg-rose-500 animate-pulse',
                label: 'High Risk'
            };
        }
        if (val.includes('medium')) {
            return {
                bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
                dot: 'bg-amber-500',
                label: 'Medium Risk'
            };
        }
        return {
            bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
            dot: 'bg-emerald-500',
            label: 'Low Risk'
        };
    };

    const getPriorityStyles = (prio?: string | null) => {
        const val = (prio || '').toLowerCase();
        if (val.includes('high')) {
            return {
                bg: 'bg-red-500/15 border-red-500/40 text-red-400 font-extrabold shadow-sm shadow-red-500/10',
                dot: 'bg-red-500 animate-ping',
                label: 'High Priority'
            };
        }
        if (val.includes('regular') || val.includes('medium')) {
            return {
                bg: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
                dot: 'bg-orange-500',
                label: 'Regular Priority'
            };
        }
        return {
            bg: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
            dot: 'bg-blue-500',
            label: 'Low Priority'
        };
    };

    const getAnimalStyles = (type?: string | null) => {
        const val = (type || '').toLowerCase();
        if (val === 'dog') {
            return {
                bg: 'bg-indigo-500/10 border-indigo-500/25 text-indigo-300',
                icon: (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                )
            };
        }
        if (val === 'cat') {
            return {
                bg: 'bg-teal-500/10 border-teal-500/25 text-teal-300',
                icon: (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                )
            };
        }
        return {
            bg: 'bg-slate-500/10 border-slate-500/25 text-slate-300',
            icon: (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            )
        };
    };

    const getSizeStyles = (size?: string | null) => {
        const val = (size || '').toLowerCase();
        if (val === 'small') return 'bg-cyan-500/10 border-cyan-500/25 text-cyan-300';
        if (val === 'large') return 'bg-purple-500/10 border-purple-500/25 text-purple-300';
        return 'bg-amber-500/10 border-amber-500/25 text-amber-300'; // Medium
    };

    const getPriorityExplanation = (): string => {
        const prioVal = (suggestedPriority || '').toLowerCase();
        const descVal = (description || '').toLowerCase();
        const catVal = (categoryName || '').toLowerCase();

        if (prioVal.includes('high')) {
            if (descVal.includes('aggressive') || descVal.includes('bite') || descVal.includes('biting') || descVal.includes('attack') || descVal.includes('growl') || descVal.includes('rabid') || descVal.includes('rabies') || catVal.includes('aggressive') || catVal.includes('rabies')) {
                return "High Priority was assigned because the animal exhibits hostile, aggressive, or potential rabies risk behavior, presenting a direct safety hazard to the neighborhood.";
            }
            if (descVal.includes('injured') || descVal.includes('bleeding') || descVal.includes('wound') || descVal.includes('hurt') || descVal.includes('broken leg') || descVal.includes('blood') || descVal.includes('accident')) {
                return "High Priority was assigned because the system detected injury or trauma indicators, denoting an animal requiring urgent medical/veterinary dispatch.";
            }
            if (descVal.includes('emergency') || descVal.includes('urgent') || descVal.includes('dying') || descVal.includes('danger') || descVal.includes('asap')) {
                return "High Priority was assigned due to the explicit presence of critical urgency cues ('emergency', 'urgent', 'danger') in the description.";
            }
            return "High Priority was assigned because the system classified this incident as high risk, necessitating immediate coordination and response.";
        }

        if (prioVal.includes('regular') || prioVal.includes('medium')) {
            if (descVal.includes('sick') || descVal.includes('weak') || descVal.includes('skinny') || descVal.includes('mangy') || descVal.includes('hungry') || descVal.includes('limp')) {
                return "Medium Priority was assigned because the report indicates the animal is weak, sick, or malnourished, requiring rescue attention but without an active physical threat.";
            }
            if (descVal.includes('chasing') || descVal.includes('barking') || descVal.includes('nuisance') || catVal.includes('pack') || descVal.includes('pack')) {
                return "Medium Priority was assigned because of public nuisance factors (e.g. barking, chasing behavior, or roaming packs) requiring systematic monitoring.";
            }
            if (descVal.includes('scared') || descVal.includes('fearful') || descVal.includes('distress') || descVal.includes('cry') || descVal.includes('howl')) {
                return "Medium Priority was assigned as the stray animal displays distress or fearful behavior, requiring retrieval by subdivision personnel.";
            }
            return "Medium Priority was assigned because the stray animal exhibits moderate behavioral or health issues that warrant dispatch within normal service windows.";
        }

        if (prioVal.includes('low')) {
            return "Low Priority was assigned as the stray animal is reported in normal condition and does not exhibit aggressive behavior, injuries, or severe distress.";
        }

        return "Priority suggestion is determined based on the correlation of the report's text descriptions, category classification, and risk level.";
    };

    const risk = getRiskStyles(suggestedRiskLevel);
    const prio = getPriorityStyles(suggestedPriority);
    const animal = getAnimalStyles(animalType);
    const sizeStyle = getSizeStyles(estimatedSize);

    return (
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-900/90 via-slate-950/95 to-slate-900/90 backdrop-blur-xl p-5 rounded-3xl border border-white/10 shadow-2xl transition-all duration-300 hover:shadow-indigo-500/5 hover:border-white/15">
            {/* Ambient Background Glow */}
            <div className="absolute -right-20 -top-20 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -left-20 -bottom-20 w-40 h-40 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

            {/* Header */}
            <div className="flex items-center justify-between mb-5 border-b border-white/5 pb-3">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
                        <svg className="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                    </div>
                    <div>
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block">StraySafe Copilot</span>
                        <h4 className="text-xs font-black text-white uppercase tracking-wider -mt-0.5">AI Sighting Intelligence</h4>
                    </div>
                </div>
                <span className="text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 shadow-sm animate-pulse">
                    Real-time Analysis
                </span>
            </div>

            {/* Grid Container */}
            <div className="grid grid-cols-2 gap-4">
                {/* Animal Type */}
                <div className="bg-white/3 p-3 rounded-2xl border border-white/5 flex flex-col justify-between transition-all hover:bg-white/5">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Detected Animal Type</span>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${animal.bg} w-fit`}>
                        {animal.icon}
                        <span className="text-xs font-extrabold uppercase tracking-wide">{animalType || 'Unknown'}</span>
                    </div>
                </div>

                {/* Dominant Color */}
                <div className="bg-white/3 p-3 rounded-2xl border border-white/5 flex flex-col justify-between transition-all hover:bg-white/5">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Dominant Animal Color</span>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-slate-500/10 border-slate-500/20 text-slate-200 w-fit">
                        {/* Elegant mini color swatch indicator */}
                        <div className="w-2.5 h-2.5 rounded-full border border-white/20 shadow-sm" style={{ 
                            background: getSwatchStyle(dominantColor)
                        }} />
                        <span className="text-xs font-extrabold uppercase tracking-wide">{dominantColor || 'Brown'}</span>
                    </div>
                </div>

                {/* Estimated Size */}
                <div className="bg-white/3 p-3 rounded-2xl border border-white/5 flex flex-col justify-between transition-all hover:bg-white/5">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Estimated Animal Size</span>
                    <div className={`px-3 py-1.5 rounded-xl border ${sizeStyle} w-fit`}>
                        <span className="text-xs font-extrabold uppercase tracking-wide">{estimatedSize || 'Medium'}</span>
                    </div>
                </div>

                {/* Suggested Risk Level */}
                <div className="bg-white/3 p-3 rounded-2xl border border-white/5 flex flex-col justify-between transition-all hover:bg-white/5">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Suggested Risk Level</span>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${risk.bg} w-fit`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${risk.dot}`} />
                        <span className="text-xs font-black uppercase tracking-wide">{risk.label}</span>
                    </div>
                </div>
            </div>

            {/* Suggested Priority Banner */}
            <div className="mt-4 bg-white/3 p-3.5 rounded-2xl border border-white/5 flex items-center justify-between transition-all hover:bg-white/5">
                <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Suggested Report Priority</span>
                    <span className="text-xs font-bold text-slate-200">Recommended Dispatch Urgency</span>
                </div>
                <div className={`flex items-center gap-2.5 px-4 py-2 rounded-xl border ${prio.bg}`}>
                    <span className={`w-2 h-2 rounded-full ${prio.dot}`} />
                    <span className="text-xs font-black uppercase tracking-widest">{prio.label}</span>
                </div>
            </div>

            {/* AI Decision Reasoning */}
            {(suggestedPriorityReason || hasData) && (
                <div className="mt-3 bg-white/3 p-3.5 rounded-2xl border border-white/5 flex flex-col gap-1.5 transition-all hover:bg-white/5">
                    <div className="flex items-center gap-1.5 text-indigo-400">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-[9px] font-black uppercase tracking-widest">AI Decision Reasoning</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
                        {suggestedPriorityReason || getPriorityExplanation()}
                    </p>
                </div>
            )}
        </div>
    );
};

export default AISuggestionPanel;
