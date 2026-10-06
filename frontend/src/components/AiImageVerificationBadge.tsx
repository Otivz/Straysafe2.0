import React from 'react';
import { ShieldCheck, AlertTriangle, Sparkles, RefreshCw, Camera, HelpCircle, Info } from 'lucide-react';
import dogCatGifAsset from '../assets/dog_and_cat_running.gif';

export type VerificationStatus = 'authentic' | 'ai_generated' | 'uncertain' | 'unable_to_analyze' | 'not_checked' | 'ineligible_subject' | null;

export interface AiVerificationData {
    isAiGenerated?: boolean;
    aiGenerationConfidence?: number | null;
    aiPhotoLikelihood?: number | null;
    ai_photo_likelihood?: number | null;
    aiPhotoStatus?: string | null;
    ai_photo_status?: string | null;
    aiPhotoRecommendation?: string | null;
    ai_photo_recommendation?: string | null;
    verificationStatus?: VerificationStatus | string;
    verification_status?: VerificationStatus | string;
    verificationMessage?: string;
    verification_message?: string;
    authenticityDetails?: string;
    authenticity_details?: string;
}

interface AiImageVerificationBadgeProps {
    isAnalyzing: boolean;
    verification?: AiVerificationData | null;
    status?: VerificationStatus | string;
    confidence?: number | null;
    likelihood?: number | null;
    message?: string;
    recommendation?: string;
    details?: string;
    onRetry?: () => void;
    onRemove?: () => void;
    className?: string;
    compact?: boolean;
    showGuidance?: boolean;
}

export const AiImageVerificationBadge: React.FC<AiImageVerificationBadgeProps> = ({
    isAnalyzing,
    verification,
    status: propStatus,
    confidence: propConfidence,
    likelihood: propLikelihood,
    message: propMessage,
    recommendation: propRecommendation,
    details: propDetails,
    onRetry,
    onRemove,
    className = '',
    compact = false,
    showGuidance = true
}) => {
    // 1. Loading Modal
    if (isAnalyzing) {
        return (
            <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200 select-none">
                <div 
                    className="relative w-full max-w-sm sm:max-w-md bg-white dark:bg-stone-900 rounded-3xl sm:rounded-[2.5rem] p-6 sm:p-8 shadow-2xl border-2 border-role-border/80 dark:border-role-strong/60 flex flex-col items-center text-center space-y-4 animate-in zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header Badge */}
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-role-muted dark:bg-role-strong/80 text-role dark:text-role-border text-xs font-black uppercase tracking-wider border border-role-border dark:border-role-strong/80 shadow-2xs">
                        <Sparkles className="w-3.5 h-3.5 text-role animate-spin" />
                        AI Vision Verification
                    </div>

                    {/* Centered Animation Canvas */}
                    <div className="relative w-full max-w-[290px] sm:max-w-[350px] aspect-[16/9] overflow-hidden rounded-2xl sm:rounded-3xl shadow-sm border border-role-border/80 dark:border-role-strong/50 flex items-center justify-center bg-[#FAF7F2] dark:bg-stone-800">
                        <img
                            src={dogCatGifAsset}
                            alt="AI is analyzing your photo..."
                            className="w-full h-full object-contain object-center select-none block"
                            onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = '/assets/dog_and_cat_running.gif';
                            }}
                        />
                    </div>

                    {/* Informative Copy */}
                    <div className="space-y-1.5 px-2">
                        <h3 className="text-lg sm:text-xl font-black text-[#1a1208] dark:text-white uppercase tracking-tight">
                            AI is analyzing your photo…
                        </h3>
                        <p className="text-xs sm:text-sm font-bold text-gray-500 dark:text-gray-400 leading-relaxed">
                            Estimating image authenticity and animal traits.
                        </p>
                    </div>

                    {/* Pulsing Gradient Progress Track */}
                    <div className="w-full max-w-[220px] sm:max-w-[260px] h-2 bg-role-muted dark:bg-role-strong/80 rounded-full overflow-hidden shadow-inner">
                        <div className="h-full bg-gradient-to-r from-amber-400 via-role to-amber-500 rounded-full animate-pulse w-full" />
                    </div>

                    <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500">
                        Inspecting camera sensor textures & authentic traits
                    </p>
                </div>
            </div>
        );
    }

    if (!verification && !propStatus && propLikelihood === undefined) return null;

    // Resolve likelihood percentage
    let rawLikelihood: number | null = null;
    if (propLikelihood !== undefined && propLikelihood !== null) {
        rawLikelihood = propLikelihood;
    } else if (verification?.aiPhotoLikelihood !== undefined && verification?.aiPhotoLikelihood !== null) {
        rawLikelihood = verification.aiPhotoLikelihood;
    } else if (verification?.ai_photo_likelihood !== undefined && verification?.ai_photo_likelihood !== null) {
        rawLikelihood = verification.ai_photo_likelihood;
    } else if (propConfidence !== undefined && propConfidence !== null) {
        rawLikelihood = propConfidence > 1 ? propConfidence : propConfidence * 100;
    } else if (verification?.aiGenerationConfidence !== undefined && verification?.aiGenerationConfidence !== null) {
        rawLikelihood = verification.aiGenerationConfidence > 1 ? verification.aiGenerationConfidence : verification.aiGenerationConfidence * 100;
    }

    // Resolve normalized percentage (0-100) or null if unable to analyze
    const likelihoodPct = rawLikelihood !== null && !isNaN(rawLikelihood)
        ? Math.max(0, Math.min(100, Math.round(rawLikelihood > 1 ? rawLikelihood : rawLikelihood * 100)))
        : null;

    // Resolve status
    const rawStatus = (
        propStatus ||
        verification?.aiPhotoStatus ||
        verification?.ai_photo_status ||
        verification?.verificationStatus ||
        verification?.verification_status ||
        ''
    ).toString().toLowerCase();

    const isIneligible = (
        rawStatus.includes('ineligible') ||
        rawStatus.includes('non-canine') ||
        (verification as any)?.animalDetected === false ||
        (verification as any)?.animal_detected === false
    );

    // AI service offline: the animal was detected locally but authenticity could not be checked
    const isNotChecked = rawStatus.includes('not_checked') || rawStatus.includes('not checked');

    const isUnableToAnalyze = !isIneligible && (
        isNotChecked ||
        rawStatus.includes('unable') ||
        rawStatus === 'unable_to_analyze' ||
        (likelihoodPct === null && rawStatus !== 'authentic' && rawStatus !== 'likely authentic')
    );

    const isHighLikelihood = !isIneligible && !isUnableToAnalyze && (
        rawStatus.includes('ai_generated') ||
        rawStatus.includes('potentially ai') ||
        (likelihoodPct !== null && likelihoodPct >= 60)
    );

    const isUncertain = !isIneligible && !isUnableToAnalyze && !isHighLikelihood && (
        rawStatus.includes('uncertain') ||
        (likelihoodPct !== null && likelihoodPct > 35 && likelihoodPct < 60)
    );

    const message = propMessage || verification?.verificationMessage || verification?.verification_message;
    const recommendation = propRecommendation || verification?.aiPhotoRecommendation || verification?.ai_photo_recommendation;
    const details = propDetails || verification?.authenticityDetails || verification?.authenticity_details;

    // Case 0: Ineligible Non-Dog/Cat Subject
    if (isIneligible) {
        return (
            <div className={`p-4 sm:p-5 rounded-2xl sm:rounded-3xl border-2 bg-rose-50/95 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700 text-rose-950 dark:text-rose-100 shadow-sm transition-all animate-in fade-in duration-200 ${className}`}>
                <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-900/80 text-rose-600 dark:text-rose-300 flex items-center justify-center shrink-0 border border-rose-300 dark:border-rose-700 shadow-2xs">
                        <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs sm:text-sm font-black text-rose-900 dark:text-rose-200 uppercase tracking-tight">
                                    AI Animal Verification
                                </span>
                                <span className="px-2.5 py-0.5 rounded-full bg-rose-200 dark:bg-rose-900 text-rose-900 dark:text-rose-200 text-[10px] font-black uppercase tracking-wider">
                                    Not Eligible • Dogs & Cats Only
                                </span>
                            </div>
                            <span className="text-[9px] font-extrabold uppercase tracking-wider text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/50 px-2 py-0.5 rounded-md">
                                Submission Blocked
                            </span>
                        </div>

                        <div className="p-3 bg-white/80 dark:bg-black/30 rounded-2xl border border-rose-200 dark:border-rose-800/60 space-y-1">
                            <p className="text-xs font-bold text-rose-900 dark:text-rose-100 leading-snug">
                                {message || "StraySafe strictly accepts reports for dogs and cats only. No canine or feline was detected in this image."}
                            </p>
                            <p className="text-[11px] text-rose-800/90 dark:text-rose-200/90 font-medium">
                                <span className="font-bold">Requirement:</span> Please upload a clear photo or video showing a stray dog or cat.
                            </p>
                        </div>

                        <div className="pt-1 flex items-center gap-2 flex-wrap">
                            {onRemove && (
                                <button
                                    type="button"
                                    onClick={onRemove}
                                    className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wider transition-all shadow-xs active:scale-95 flex items-center gap-1.5 cursor-pointer"
                                >
                                    <Camera className="w-3.5 h-3.5" /> Upload Dog / Cat Photo
                                </button>
                            )}
                            {onRetry && (
                                <button
                                    type="button"
                                    onClick={onRetry}
                                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-rose-950/40 hover:bg-rose-100 text-rose-800 dark:text-rose-200 text-xs font-bold transition-all border border-rose-300 dark:border-rose-700 flex items-center gap-1 cursor-pointer"
                                >
                                    <RefreshCw className="w-3 h-3" /> Re-analyze
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Case 1: Unable to Analyze Image
    if (isUnableToAnalyze) {
        return (
            <div className={`p-4 sm:p-5 rounded-2xl sm:rounded-3xl border-2 bg-stone-50 dark:bg-stone-900/80 border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 shadow-sm transition-all animate-in fade-in duration-200 ${className}`}>
                <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-2xl bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-300 flex items-center justify-center shrink-0 border border-stone-300 dark:border-stone-700">
                        <HelpCircle className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs sm:text-sm font-black text-stone-800 dark:text-stone-200 uppercase tracking-tight">
                                AI Photo Analysis
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 text-[10px] font-black uppercase tracking-wider">
                                {isNotChecked ? 'Authenticity not checked' : 'Unable to analyze image'}
                            </span>
                        </div>

                        <p className="text-xs font-bold text-stone-700 dark:text-stone-300 leading-snug">
                            {message || "Unable to analyze image. Please ensure a clear photo of the animal is uploaded."}
                        </p>

                        {recommendation && (
                            <p className="text-[11px] font-medium text-stone-600 dark:text-stone-400">
                                <span className="font-bold">Recommendation:</span> {recommendation}
                            </p>
                        )}

                        <div className="pt-1 flex items-center gap-2 flex-wrap">
                            {onRetry && (
                                <button
                                    type="button"
                                    onClick={onRetry}
                                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-bold transition-all border border-stone-300 dark:border-stone-600 flex items-center gap-1 cursor-pointer"
                                >
                                    <RefreshCw className="w-3 h-3" /> Retry Analysis
                                </button>
                            )}
                            {onRemove && (
                                <button
                                    type="button"
                                    onClick={onRemove}
                                    className="px-3 py-1.5 rounded-xl bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 text-stone-800 dark:text-stone-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                                >
                                    <Camera className="w-3.5 h-3.5" /> Replace Photo
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Case 2: High AI Likelihood (Non-blocking warning/suggestion)
    if (isHighLikelihood) {
        return (
            <div className={`p-4 sm:p-5 rounded-2xl sm:rounded-3xl border-2 bg-gradient-to-br from-amber-50/95 to-role-soft/90 dark:from-amber-950/60 dark:to-role-strong/40 border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-100 shadow-sm transition-all animate-in fade-in duration-200 ${className}`}>
                <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-900/80 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 border border-amber-300 dark:border-amber-700 shadow-2xs">
                        <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs sm:text-sm font-black text-amber-900 dark:text-amber-200 uppercase tracking-tight">
                                    AI Photo Analysis
                                </span>
                                <span className="px-2.5 py-0.5 rounded-full bg-amber-200/90 dark:bg-amber-900 text-amber-900 dark:text-amber-200 text-[10px] font-black uppercase tracking-wider">
                                    Potentially AI-Generated
                                </span>
                                {likelihoodPct !== null && (
                                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider shadow-2xs">
                                        High AI-generated likelihood
                                    </span>
                                )}
                            </div>
                            <span className="text-[9px] font-extrabold uppercase tracking-wider text-amber-700/80 dark:text-amber-300/80 bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 rounded-md">
                                AI Estimate • Non-Blocking
                            </span>
                        </div>

                        {/* Core warning requirement */}
                        <div className="p-3 bg-white/80 dark:bg-black/30 rounded-2xl border border-amber-200/80 dark:border-amber-800/60 space-y-1">
                            <p className="text-xs font-bold text-amber-900 dark:text-amber-100 leading-snug">
                                {message || "This image may be AI-generated. Please make sure the uploaded photo is an actual photo of the reported animal."}
                            </p>
                            <p className="text-[11px] text-amber-800/90 dark:text-amber-200/90 font-medium">
                                <span className="font-bold">Recommendation:</span> {recommendation || "Please verify the authenticity of the uploaded photo."}
                            </p>
                        </div>

                        {showGuidance && (
                            <p className="text-[10px] font-medium text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                                <Info className="w-3.5 h-3.5 shrink-0" />
                                <span>You may proceed with report submission or replace the image if this was uploaded by mistake.</span>
                            </p>
                        )}

                        {details && !compact && (
                            <p className="text-[11px] font-medium text-amber-800/90 dark:text-amber-300/90 leading-relaxed bg-amber-100/50 dark:bg-stone-900/60 p-2.5 rounded-xl border border-amber-200/60 dark:border-amber-800/40">
                                <span className="font-bold">Analysis Details:</span> {details}
                            </p>
                        )}

                        <div className="pt-1 flex items-center gap-2 flex-wrap">
                            {onRemove && (
                                <button
                                    type="button"
                                    onClick={onRemove}
                                    className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase tracking-wider transition-all shadow-xs active:scale-95 flex items-center gap-1.5 cursor-pointer"
                                >
                                    <Camera className="w-3.5 h-3.5" /> Replace With Real Photo
                                </button>
                            )}
                            {onRetry && (
                                <button
                                    type="button"
                                    onClick={onRetry}
                                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-amber-950/40 hover:bg-amber-100 text-amber-800 dark:text-amber-200 text-xs font-bold transition-all border border-amber-300 dark:border-amber-700 flex items-center gap-1 cursor-pointer"
                                >
                                    <RefreshCw className="w-3 h-3" /> Re-analyze
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Case 3: Uncertain Likelihood (36% - 59%)
    if (isUncertain) {
        return (
            <div className={`p-4 rounded-2xl sm:rounded-3xl border-2 bg-yellow-50/95 dark:bg-yellow-950/50 border-yellow-300 dark:border-yellow-700 text-yellow-950 dark:text-yellow-100 shadow-sm transition-all animate-in fade-in duration-200 ${className}`}>
                <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-2xl bg-yellow-100 dark:bg-yellow-900/60 text-yellow-700 dark:text-yellow-300 flex items-center justify-center shrink-0 border border-yellow-300 dark:border-yellow-700">
                        <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-black text-yellow-900 dark:text-yellow-200 uppercase tracking-tight">
                                AI Photo Analysis
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-yellow-200/80 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-[10px] font-black uppercase tracking-wider">
                                Status: Uncertain
                            </span>
                            {likelihoodPct !== null && (
                                <span className="px-2 py-0.5 rounded-full bg-yellow-400 text-yellow-950 text-[10px] font-black uppercase tracking-wider">
                                    Uncertain AI-generated likelihood
                                </span>
                            )}
                        </div>
                        <p className="text-xs font-bold text-yellow-800 dark:text-yellow-200 leading-snug">
                            {message || "Image authenticity is uncertain. Please ensure the photo is clear and taken with a camera."}
                        </p>
                        {recommendation && (
                            <p className="text-[11px] font-medium text-yellow-700 dark:text-yellow-300">
                                <span className="font-bold">Recommendation:</span> {recommendation}
                            </p>
                        )}
                        {details && !compact && (
                            <p className="text-[11px] font-medium text-yellow-700/90 dark:text-yellow-300/90">
                                {details}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Case 4: Likely Authentic (<= 35%)
    return (
        <div className={`p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl border bg-emerald-50/90 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/80 text-emerald-950 dark:text-emerald-100 shadow-xs transition-all animate-in fade-in duration-200 ${className}`}>
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0 border border-emerald-200 dark:border-emerald-800 shadow-2xs">
                    <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-emerald-900 dark:text-emerald-200 uppercase tracking-tight">
                            AI Photo Analysis
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-200/80 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" /> Likely Authentic
                        </span>
                        {likelihoodPct !== null && (
                            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                (Low AI-generated likelihood)
                            </span>
                        )}
                    </div>
                    <p className="text-xs font-bold text-emerald-800 dark:text-emerald-200 leading-snug">
                        {message || "Photo verified — appears to be an authentic animal photograph."}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AiImageVerificationBadge;
