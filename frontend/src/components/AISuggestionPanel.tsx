import React from 'react';

interface AISuggestionPanelProps {
    animalType?: string | null;
    dominantColor?: string | null;
    coatPattern?: string | null;
    estimatedSize?: string | null;
    suggestedRiskLevel?: string | null;
    suggestedPriority?: string | null;
    possibleBreed?: string | null;
    description?: string | null;
    categoryName?: string | null;
    suggestedPriorityReason?: string | null;
    behaviorChasing?: boolean | null;
    behaviorActualBite?: boolean | null;
    behaviorAttemptedBite?: boolean | null;
    behaviorInjury?: boolean | null;
    behaviorAggressive?: boolean | null;
    behaviorExplanation?: string | null;
    // AI Photo Analysis (Authenticity / Synthetic Detection)
    aiPhotoLikelihood?: number | null;
    aiPhotoStatus?: string | null;
    aiPhotoRecommendation?: string | null;
    aiPhotoDetails?: string | null;
    // Verified Field Investigation Findings
    verificationStatus?: string | null;
    verifiedActualBite?: boolean | null;
    verifiedChasing?: boolean | null;
    verifiedAttemptedBite?: boolean | null;
    verifiedInjury?: boolean | null;
    verifiedAggressive?: boolean | null;
    behaviorFinding?: string | null;
    verificationNotes?: string | null;
    verifiedByName?: string | null;
    verifiedAt?: string | null;
    // The report itself: its AI confidences (YOLOv8 detection, Gemini per field) and the AI's own values
    aiReport?: any;
}

type FieldKey = 'animal_type' | 'color' | 'coat_pattern' | 'size' | 'breed' | 'risk' | 'behavior';

// Flags a suggestion Gemini itself is unsure about (only while the displayed value is still the AI's suggestion).
// High / medium confidence shows nothing: only the doubtful values need the officer's attention.
const ConfidenceTag: React.FC<{ level?: string | null }> = ({ level }) => {
    if (level !== 'low') return null;
    return (
        <span className="ml-1.5 px-1.5 py-px rounded-md border text-[8px] font-black normal-case tracking-normal bg-amber-100 border-amber-300 text-amber-800"
            title="The AI is unsure about this suggestion: check it before relying on it">
            AI unsure
        </span>
    );
};

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
    const colors = (colorStr || 'Gray').split(',').map(c => c.trim()).filter(Boolean);
    if (colors.length === 0) return '#71717A';
    if (colors.length === 1) return getColorHex(colors[0]);
    // Beautiful split linear gradient for multiple colors
    const hex1 = getColorHex(colors[0]);
    const hex2 = getColorHex(colors[1]);
    return `linear-gradient(135deg, ${hex1} 50%, ${hex2} 50%)`;
};

export const AISuggestionPanel: React.FC<AISuggestionPanelProps> = ({
    animalType,
    dominantColor,
    coatPattern,
    estimatedSize,
    suggestedRiskLevel,
    suggestedPriority,
    possibleBreed,
    description,
    categoryName,
    suggestedPriorityReason,
    behaviorChasing,
    behaviorActualBite,
    behaviorAttemptedBite,
    behaviorInjury,
    behaviorAggressive,
    behaviorExplanation,
    aiPhotoLikelihood,
    aiPhotoStatus,
    aiPhotoRecommendation,
    aiPhotoDetails,
    verificationStatus,
    verifiedActualBite,
    verifiedChasing,
    verifiedAttemptedBite,
    verifiedInjury,
    verifiedAggressive,
    behaviorFinding,
    verificationNotes,
    verifiedByName,
    verifiedAt,
    aiReport
}) => {
    const fieldConf: Record<string, string> = (aiReport?.ai_description_confidence && typeof aiReport.ai_description_confidence === 'object')
        ? aiReport.ai_description_confidence : {};
    const same = (a?: string | null, b?: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
    // Show a field's confidence only when the value on screen is still the AI's (not one a person entered or corrected)
    const confFor = (key: FieldKey, shown?: string | null, aiValue?: string | null): string | null => {
        const level = fieldConf[key];
        if (!level) return null;
        if (aiValue === undefined) return level;
        return same(shown, aiValue) ? level : null;
    };
    const detection = aiReport ? aiReport.ai_detection_confidence : undefined;
    const detectionPct = detection === null || detection === undefined || detection === '' ? null : Math.round(Number(detection) * 100);
    // If no suggestions exist yet, display a premium loading state
    const hasData = animalType || dominantColor || coatPattern || estimatedSize || suggestedRiskLevel || suggestedPriority || possibleBreed;

    if (!hasData) {
        return (
            <div className="relative overflow-hidden bg-gradient-to-br from-amber-50/70 via-orange-50/30 to-stone-50/60 p-6 rounded-2xl border border-amber-200/60 shadow-xs animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest">AI Sighting Intelligence</span>
                </div>
                <p className="text-xs text-stone-500 uppercase tracking-wider font-bold">Analyzing media and incident reports...</p>
            </div>
        );
    }

    // Helper functions for custom badge colors & styling
    const getRiskStyles = (risk?: string | null) => {
        const val = (risk || '').toLowerCase();
        if (val.includes('high')) {
            return {
                bg: 'bg-rose-50 border-rose-200 text-rose-700',
                dot: 'bg-rose-500 animate-pulse',
                label: 'High Risk'
            };
        }
        if (val.includes('medium')) {
            return {
                bg: 'bg-amber-50 border-amber-200 text-amber-800',
                dot: 'bg-amber-500',
                label: 'Medium Risk'
            };
        }
        return {
            bg: 'bg-emerald-50 border-emerald-200 text-emerald-700',
            dot: 'bg-emerald-500',
            label: 'Low Risk'
        };
    };

    const getAnimalStyles = (type?: string | null) => {
        const val = (type || '').toLowerCase();
        if (val === 'dog') {
            return {
                bg: 'bg-amber-50 border-amber-200 text-amber-900',
                icon: (
                    <svg className="w-3.5 h-3.5 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                )
            };
        }
        if (val === 'cat') {
            return {
                bg: 'bg-teal-50 border-teal-200 text-teal-800',
                icon: (
                    <svg className="w-3.5 h-3.5 text-teal-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                )
            };
        }
        return {
            bg: 'bg-stone-50 border-stone-200 text-stone-700',
            icon: (
                <svg className="w-3.5 h-3.5 text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            )
        };
    };

    const getSizeStyles = (size?: string | null) => {
        const val = (size || '').toLowerCase();
        if (val === 'small') return 'bg-sky-50 border-sky-200 text-sky-800';
        if (val === 'large') return 'bg-purple-50 border-purple-200 text-purple-800';
        return 'bg-amber-50 border-amber-200 text-amber-800'; // Medium
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
    const animal = getAnimalStyles(animalType);
    const sizeStyle = getSizeStyles(estimatedSize);
    const isVerifiedTrue = verificationStatus === 'verified_true';
    const isAggressiveIncident = Boolean(verifiedActualBite || verifiedAggressive || verifiedAttemptedBite || verifiedChasing);
    const isCleanRecord = isVerifiedTrue && !isAggressiveIncident;

    return (
        <div className="relative overflow-hidden bg-gradient-to-br from-amber-50/30 via-white to-stone-50/50 p-5 rounded-2xl border border-amber-200/70 shadow-xs transition-all duration-300 hover:border-amber-300">
            {/* Ambient Background Glow */}
            <div className="absolute -right-20 -top-20 w-40 h-40 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -left-20 -bottom-20 w-40 h-40 bg-orange-400/5 rounded-full blur-3xl pointer-events-none" />

            {/* Header */}
            <div className="flex items-center justify-between mb-5 border-b border-stone-200/70 pb-3">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-xs shadow-amber-500/20">
                        <svg className="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                    </div>
                    <div>
                        <h4 className="text-xs font-black text-stone-900 uppercase tracking-wider flex items-center gap-2">
                            StraySafe Copilot
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[8px] font-black uppercase tracking-widest">
                                AI Suggestion
                            </span>
                        </h4>
                        <p className="text-[9px] font-bold text-stone-500 uppercase tracking-widest">Suggested from the photo and report</p>
                        {aiReport && (
                            <p className="mt-1 text-[10px] font-bold"
                                title="YOLOv8's confidence that the box it found is a dog or cat (not a measured accuracy)">
                                {detectionPct === null ? (
                                    <span className="text-stone-500">Animal detection: not measured</span>
                                ) : detectionPct < 50 ? (
                                    <span className="text-amber-700">Weak detection ({detectionPct}%): check the photo</span>
                                ) : (
                                    <span className="text-emerald-700">Animal detected ({detectionPct}%)</span>
                                )}
                            </p>
                        )}
                    </div>
                </div>

                {suggestedPriority && (
                    <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest border shadow-xs ${
                        suggestedPriority.toLowerCase().includes('high')
                            ? 'bg-rose-50 border-rose-200 text-rose-700'
                            : suggestedPriority.toLowerCase().includes('medium')
                            ? 'bg-amber-50 border-amber-200 text-amber-800'
                            : 'bg-sky-50 border-sky-200 text-sky-700'
                    }`}>
                        {suggestedPriority}
                    </span>
                )}
            </div>

            {/* Grid Container */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* Animal Type */}
                <div className="bg-white p-3 rounded-xl border border-stone-200/70 shadow-2xs flex flex-col justify-between transition-all hover:border-amber-200 hover:bg-amber-50/20">
                    <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1.5 block">Detected Animal Type<ConfidenceTag level={confFor('animal_type', animalType, aiReport?.ai_animal_type)} /></span>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${animal.bg} w-fit`}>
                        {animal.icon}
                        <span className="text-xs font-extrabold uppercase tracking-wide">{animalType || 'Unknown'}</span>
                    </div>
                </div>

                {/* Dominant Color */}
                <div className="bg-white p-3 rounded-xl border border-stone-200/70 shadow-2xs flex flex-col justify-between transition-all hover:border-amber-200 hover:bg-amber-50/20">
                    <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1.5 block">Dominant Color<ConfidenceTag level={confFor('color', dominantColor, aiReport?.ai_dominant_color)} /></span>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-stone-50 border-stone-200 text-stone-800 w-fit">
                        <div className="w-2.5 h-2.5 rounded-full border border-stone-300 shadow-2xs" style={{ 
                            background: getSwatchStyle(dominantColor)
                        }} />
                        <span className="text-xs font-extrabold uppercase tracking-wide">{dominantColor || 'Brown'}</span>
                    </div>
                </div>

                {/* Coat Pattern */}
                <div className="bg-white p-3 rounded-xl border border-stone-200/70 shadow-2xs flex flex-col justify-between transition-all hover:border-amber-200 hover:bg-amber-50/20">
                    <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1.5 block">Coat Pattern<ConfidenceTag level={confFor('coat_pattern', coatPattern, aiReport?.ai_coat_pattern)} /></span>
                    <div className="px-3 py-1.5 rounded-xl border bg-amber-50 border-amber-200 text-amber-900 w-fit">
                        <span className="text-xs font-extrabold uppercase tracking-wide">
                            {(() => {
                                if (coatPattern && coatPattern.trim() && coatPattern.toLowerCase() !== 'unknown') {
                                    return coatPattern;
                                }
                                if (description) {
                                    const match = description.match(/pattern:\s*([^|]+)/i) || description.match(/markings:\s*([^|]+)/i);
                                    if (match && match[1].trim()) return match[1].trim();
                                }
                                return coatPattern || 'Solid';
                            })()}
                        </span>
                    </div>
                </div>

                {/* Estimated Size */}
                <div className="bg-white p-3 rounded-xl border border-stone-200/70 shadow-2xs flex flex-col justify-between transition-all hover:border-amber-200 hover:bg-amber-50/20">
                    <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1.5 block">Estimated Size<ConfidenceTag level={confFor('size', estimatedSize, aiReport?.ai_estimated_size)} /></span>
                    <div className={`px-3 py-1.5 rounded-xl border ${sizeStyle} w-fit`}>
                        <span className="text-xs font-extrabold uppercase tracking-wide">{estimatedSize || 'Medium'}</span>
                    </div>
                </div>

                {/* Possible Breed */}
                <div className="bg-white p-3 rounded-xl border border-stone-200/70 shadow-2xs flex flex-col justify-between transition-all hover:border-amber-200 hover:bg-amber-50/20">
                    <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1.5 block">Possible Breed<ConfidenceTag level={confFor('breed', possibleBreed, aiReport?.ai_possible_breed)} /></span>
                    <div className="px-3 py-1.5 rounded-xl border bg-amber-50 border-amber-200 text-amber-900 w-fit">
                        <span className="text-xs font-extrabold uppercase tracking-wide">{possibleBreed || 'Unknown'}</span>
                    </div>
                </div>

                {/* Suggested Risk Level */}
                <div className="bg-white p-3 rounded-xl border border-stone-200/70 shadow-2xs flex flex-col justify-between transition-all hover:border-amber-200 hover:bg-amber-50/20">
                    <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1.5 block">AI Assessed Risk<ConfidenceTag level={confFor('risk', suggestedRiskLevel, aiReport?.ai_suggested_risk_level)} /></span>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${risk.bg} w-fit`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${risk.dot}`} />
                        <span className="text-xs font-black uppercase tracking-wide">{risk.label}</span>
                    </div>
                </div>
            </div>

            {aiReport && Object.values(fieldConf).includes('low') && (
                <p className="mt-2 text-[9px] font-medium text-stone-500 leading-relaxed">
                    "AI unsure" marks a suggestion to check before relying on it.
                </p>
            )}

            {/* STAGE 1.5: AI PHOTO ANALYSIS (Authenticity / AI Detection Estimate) */}
            {(aiPhotoLikelihood !== undefined && aiPhotoLikelihood !== null || aiPhotoStatus || aiPhotoRecommendation) && (() => {
                const rawLikelihood = typeof aiPhotoLikelihood === 'number' ? aiPhotoLikelihood : null;
                const likelihoodPct = rawLikelihood !== null ? Math.round(rawLikelihood > 1 ? rawLikelihood : rawLikelihood * 100) : null;
                const normStatus = (aiPhotoStatus || '').toLowerCase();
                const isUnable = normStatus.includes('unable') || normStatus === 'unable_to_analyze' || (likelihoodPct === null && !normStatus);
                const isHigh = !isUnable && (normStatus.includes('potentially ai') || normStatus.includes('ai_generated') || (likelihoodPct !== null && likelihoodPct >= 60));
                const isUncertain = !isUnable && !isHigh && (normStatus.includes('uncertain') || (likelihoodPct !== null && likelihoodPct > 35 && likelihoodPct < 60));
                
                const statusDisplay = isUnable
                    ? 'Unable to analyze image'
                    : (isHigh ? 'Potentially AI-generated' : (isUncertain ? 'Uncertain' : 'Likely Authentic'));
                
                const recDisplay = aiPhotoRecommendation || (
                    isUnable
                        ? 'Unable to analyze image. Please ensure a clear photo of the animal is uploaded.'
                        : (isHigh || isUncertain
                            ? 'Please verify the authenticity of the uploaded photo.'
                            : 'Photo appears authentic.')
                );

                return (
                    <div className={`mt-3 p-4 rounded-xl border transition-all ${
                        isUnable
                            ? 'bg-stone-50 border-stone-200 text-stone-700'
                            : (isHigh
                                ? 'bg-rose-50/70 border-rose-200 text-rose-900 shadow-2xs'
                                : (isUncertain
                                    ? 'bg-amber-50/70 border-amber-200 text-amber-900 shadow-2xs'
                                    : 'bg-emerald-50/60 border-emerald-200 text-emerald-900 shadow-2xs'))
                    }`}>
                        <div className="flex items-center justify-between pb-3 border-b border-black/5 flex-wrap gap-2">
                            <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm ${
                                    isUnable
                                        ? 'bg-stone-100 text-stone-600 border border-stone-200'
                                        : (isHigh
                                            ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                            : (isUncertain
                                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                                : 'bg-emerald-100 text-emerald-700 border border-emerald-200'))
                                }`}>
                                    {isUnable ? '🔍' : (isHigh ? '⚠️' : (isUncertain ? '🟡' : '🛡️'))}
                                </div>
                                <div>
                                    <h5 className="text-[11px] font-black uppercase tracking-widest text-stone-900 flex items-center gap-2">
                                        AI Photo Analysis
                                        <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider ${
                                            isUnable
                                                ? 'bg-stone-100 text-stone-700 border border-stone-200'
                                                : (isHigh
                                                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                                    : (isUncertain
                                                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'))
                                        }`}>
                                            {statusDisplay}
                                        </span>
                                    </h5>
                                    <p className="text-[9px] text-stone-500 font-medium">
                                        AI detection estimate • Decision support for officer review
                                    </p>
                                </div>
                            </div>

                            {likelihoodPct !== null ? (
                                <div className="text-right">
                                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-xl border inline-block ${
                                        isHigh
                                            ? 'bg-rose-100/80 border-rose-200 text-rose-800'
                                            : (isUncertain
                                                ? 'bg-amber-100/80 border-amber-200 text-amber-800'
                                                : 'bg-emerald-100/80 border-emerald-200 text-emerald-800')
                                    }`}>
                                        AI-Generated Likelihood: <strong>{likelihoodPct}%</strong>
                                    </span>
                                </div>
                            ) : (
                                <span className="text-[9px] font-black px-2 py-0.5 rounded-lg border bg-stone-100 border-stone-200 text-stone-600">
                                    Unable to analyze image
                                </span>
                            )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-xs">
                            <div className="bg-white/90 p-2.5 rounded-xl border border-stone-200/80 shadow-2xs space-y-0.5">
                                <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest block">Status</span>
                                <span className={`text-xs font-black uppercase ${
                                    isHigh ? 'text-rose-700' : (isUncertain ? 'text-amber-700' : (isUnable ? 'text-stone-700' : 'text-emerald-700'))
                                }`}>
                                    {statusDisplay}
                                </span>
                            </div>

                            <div className="bg-white/90 p-2.5 rounded-xl border border-stone-200/80 shadow-2xs space-y-0.5">
                                <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest block">Recommendation</span>
                                <span className="text-xs font-bold text-stone-800 block leading-snug">
                                    {recDisplay}
                                </span>
                            </div>
                        </div>

                        {aiPhotoDetails && (
                            <div className="mt-2.5 text-[10px] text-stone-600 bg-white/90 p-2.5 rounded-xl border border-stone-200/80 leading-relaxed">
                                <strong className="text-stone-900">Forensic Analysis: </strong>
                                {aiPhotoDetails}
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* STAGE 2: OFFICIAL STAFF INVESTIGATION & FINAL VERIFIED RECORD */}
            {isVerifiedTrue && (
                <div className={`mt-3 p-4 rounded-xl border transition-all ${
                    isCleanRecord 
                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950 shadow-2xs' 
                        : 'bg-rose-50/70 border-rose-200 text-rose-950 shadow-2xs'
                }`}>
                    <div className="flex items-center justify-between pb-3 border-b border-black/5">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">{isCleanRecord ? '🛡️' : '🚨'}</span>
                            <div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-stone-900 flex items-center gap-2">
                                    FINAL VERIFIED RECORD (Ground Truth Investigation)
                                    <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider ${
                                        isCleanRecord ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-rose-100 text-rose-800 border border-rose-200'
                                    }`}>
                                        {isCleanRecord ? 'CLEAN RECORD' : 'CONFIRMED INCIDENT'}
                                    </span>
                                </span>
                                <p className="text-[9px] text-stone-500 font-medium">
                                    {verifiedByName ? `Inspected on-site by ${verifiedByName}` : 'Verified on-site by Staff'}
                                    {verifiedAt ? ` • ${new Date(verifiedAt).toLocaleDateString()}` : ''}
                                </p>
                            </div>
                        </div>
                        <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-xl border ${
                            isCleanRecord ? 'bg-emerald-100 border-emerald-200 text-emerald-800' : 'bg-rose-100 border-rose-200 text-rose-800'
                        }`}>
                            Finding: {behaviorFinding || (isCleanRecord ? 'Unsubstantiated / Friendly' : 'Substantiated')}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
                        <div className="bg-white/90 p-2.5 rounded-xl border border-stone-200/80 shadow-2xs text-center">
                            <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1">Actual Bite</p>
                            <span className={`text-xs font-black uppercase ${verifiedActualBite ? 'text-rose-700' : 'text-emerald-700'}`}>
                                {verifiedActualBite ? 'YES 🚨' : 'NO ✓'}
                            </span>
                        </div>

                        <div className="bg-white/90 p-2.5 rounded-xl border border-stone-200/80 shadow-2xs text-center">
                            <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1">Actual Chasing</p>
                            <span className={`text-xs font-black uppercase ${verifiedChasing ? 'text-rose-700' : 'text-emerald-700'}`}>
                                {verifiedChasing ? 'YES ⚠️' : 'NO ✓'}
                            </span>
                        </div>

                        <div className="bg-white/90 p-2.5 rounded-xl border border-stone-200/80 shadow-2xs text-center">
                            <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1">Attempted Bite</p>
                            <span className={`text-xs font-black uppercase ${verifiedAttemptedBite ? 'text-rose-700' : 'text-emerald-700'}`}>
                                {verifiedAttemptedBite ? 'YES ⚠️' : 'NO ✓'}
                            </span>
                        </div>

                        <div className="bg-white/90 p-2.5 rounded-xl border border-stone-200/80 shadow-2xs text-center">
                            <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1">Injury / Wound</p>
                            <span className={`text-xs font-black uppercase ${verifiedInjury ? 'text-rose-700' : 'text-emerald-700'}`}>
                                {verifiedInjury ? 'YES 🩸' : 'NO ✓'}
                            </span>
                        </div>

                        <div className="bg-white/90 p-2.5 rounded-xl border border-stone-200/80 shadow-2xs text-center">
                            <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1">Aggression</p>
                            <span className={`text-xs font-black uppercase ${verifiedAggressive ? 'text-rose-700' : 'text-emerald-700'}`}>
                                {verifiedAggressive ? 'YES ⚠️' : 'NO ✓'}
                            </span>
                        </div>
                    </div>

                    {isCleanRecord && (
                        <div className="mt-2.5 bg-emerald-100/60 border border-emerald-200 p-2.5 rounded-xl text-[10px] text-emerald-900 flex items-start gap-2">
                            <span>✨</span>
                            <p className="leading-relaxed">
                                <strong>Record Cleared:</strong> Physical inspection confirmed the animal is friendly / non-threatening. The original biting/chasing report was determined to be <strong>unsubstantiated</strong> and will not negatively impact the pet or owner's record.
                            </p>
                        </div>
                    )}

                    {verificationNotes && (
                        <div className="mt-2 text-[10px] text-stone-700 bg-white/90 p-2.5 rounded-xl border border-stone-200/80 leading-relaxed">
                            <strong className="text-stone-900">Officer Investigation Notes: </strong>
                            {verificationNotes}
                        </div>
                    )}
                </div>
            )}

            {/* STAGE 1: INITIAL CITIZEN REPORT & AI CONTEXT UNDERSTANDING */}
            {(behaviorChasing !== undefined || behaviorActualBite !== undefined || behaviorAttemptedBite !== undefined || behaviorAggressive !== undefined) && (
                <div className="bg-stone-50/70 p-4 rounded-xl border border-stone-200/80 space-y-3 mt-3">
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest flex items-center gap-1.5">
                            <span>🧠</span> Initial Citizen Report (AI Context Parsing)
                        </span>
                        <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md ${
                            isVerifiedTrue 
                                ? (isCleanRecord ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-stone-200 text-stone-700')
                                : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}>
                            {isVerifiedTrue ? 'Overridden by Field Verification' : 'Pending On-Site Inspection'}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        <div className="bg-white p-2.5 rounded-xl border border-stone-200/70 shadow-2xs text-center">
                            <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1">Reported Chasing</p>
                            <span className={`text-xs font-black uppercase ${behaviorChasing ? 'text-amber-700' : 'text-stone-400'}`}>
                                {behaviorChasing ? 'YES ⚠️' : 'NO'}
                            </span>
                        </div>

                        <div className="bg-white p-2.5 rounded-xl border border-stone-200/70 shadow-2xs text-center">
                            <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1">Reported Attempted</p>
                            <span className={`text-xs font-black uppercase ${behaviorAttemptedBite ? 'text-amber-700' : 'text-stone-400'}`}>
                                {behaviorAttemptedBite ? 'YES ⚠️' : 'NO'}
                            </span>
                        </div>

                        <div className="bg-white p-2.5 rounded-xl border border-stone-200/70 shadow-2xs text-center">
                            <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1">Reported Bite</p>
                            <span className={`text-xs font-black uppercase ${behaviorActualBite ? 'text-rose-700' : 'text-stone-400'}`}>
                                {behaviorActualBite ? 'YES 🚨' : 'NO'}
                            </span>
                        </div>

                        <div className="bg-white p-2.5 rounded-xl border border-stone-200/70 shadow-2xs text-center">
                            <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1">Reported Injury</p>
                            <span className={`text-xs font-black uppercase ${behaviorInjury ? 'text-rose-700' : 'text-stone-400'}`}>
                                {behaviorInjury ? 'YES 🩸' : 'NO'}
                            </span>
                        </div>

                        <div className="bg-white p-2.5 rounded-xl border border-stone-200/70 shadow-2xs text-center">
                            <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-1">Reported Aggression</p>
                            <span className={`text-xs font-black uppercase ${behaviorAggressive ? 'text-rose-700' : 'text-emerald-700'}`}>
                                {behaviorAggressive ? 'YES ⚠️' : 'NO ✓'}
                            </span>
                        </div>
                    </div>

                    {!isVerifiedTrue && (behaviorActualBite || behaviorInjury) && (
                        <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl flex items-start gap-2.5">
                            <span className="text-base flex-shrink-0">⚠️</span>
                            <div>
                                <p className="text-[11px] font-bold text-rose-800">
                                    Physical On-Site Verification Required
                                </p>
                                <p className="text-[10px] text-rose-700 leading-relaxed mt-0.5">
                                    Bite or injury was mentioned in the report description. In-person staff verification, witness interview, and rabies risk assessment are required before dispatching animal capture teams to prevent false alarms or neighbor disputes.
                                </p>
                            </div>
                        </div>
                    )}

                    {behaviorExplanation && (
                        <div className="pt-2 border-t border-stone-200/70">
                            <p className="text-[10px] text-stone-600 font-medium leading-relaxed">
                                <strong className="text-amber-800 font-bold">Report Context: </strong>
                                {behaviorExplanation}
                                <ConfidenceTag level={confFor('behavior')} />
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* AI Decision Reasoning */}
            {(suggestedPriorityReason || hasData) && (
                <div className="bg-white p-3.5 rounded-xl border border-stone-200/80 shadow-2xs flex flex-col gap-1.5 transition-all hover:border-amber-200 mt-3">
                    <div className="flex items-center gap-1.5 text-amber-700">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-[9px] font-black uppercase tracking-widest">AI Decision Reasoning</span>
                    </div>
                    <p className="text-[11px] text-stone-700 leading-relaxed font-medium">
                        {suggestedPriorityReason || getPriorityExplanation()}
                    </p>
                </div>
            )}
        </div>
    );
};

export default AISuggestionPanel;
