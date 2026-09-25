import React, { useState, useEffect } from 'react';

// Directly bundle the GIFs in the component so it is 100% self-contained and reusable anywhere
import catGifAsset from '../assets/straysafe_running_cat.gif';
import dogGifAsset from '../assets/straysafe_dog_running.gif';

export const CAT_LOADING_GIF: string = catGifAsset;
export const DOG_LOADING_GIF: string = dogGifAsset;

// Automatic silent preloader so both animations appear instantly with 0ms lag
if (typeof window !== 'undefined') {
    try {
        const p1 = new Image();
        p1.src = CAT_LOADING_GIF;
        const p2 = new Image();
        p2.src = DOG_LOADING_GIF;
        if (catGifAsset) {
            const p3 = new Image();
            p3.src = catGifAsset;
        }
        if (dogGifAsset) {
            const p4 = new Image();
            p4.src = dogGifAsset;
        }
    } catch {
        // Safe ignore during SSR or non-browser environments
    }
}

export type AnimalType = 'Cat' | 'Dog' | 'cat' | 'dog' | 'Unknown' | string | null | undefined;

export interface StraySafeLoadingProps {
    /** 
     * Target animal type. 
     * - 'cat' (or containing 'cat', 'kitten', 'puspin', 'feline') -> Running Cat GIF
     * - 'dog' (or containing 'dog', 'puppy', 'aspin', 'canine')   -> Running Dog GIF
     * Automatically defaults to 'dog' if undefined.
     */
    animalType?: AnimalType;
    /** Main prominent title text */
    message?: string;
    /** Descriptive subtitle providing context or instructions */
    subMessage?: string;
    /** Whether to display as a full-screen blocking overlay */
    fullScreen?: boolean;
    /** Predefined size variants */
    size?: 'sm' | 'md' | 'lg';
    /** Custom extra container classes */
    className?: string;
    /** Whether to display the animated progress indicator bar */
    showProgressBar?: boolean;
    /** Header badge text, defaults to animal-aware badge or 'STRAY-SAFE System' */
    badgeText?: string;
    /** Optional detailed status step indicator (e.g., 'Uploading photo 1 of 3...') */
    progressText?: string;
}

/**
 * Normalizes an animal type string to 'cat' or 'dog'.
 */
export const normalizeAnimalType = (animal?: AnimalType): 'cat' | 'dog' => {
    if (!animal) return 'dog';
    const lower = String(animal).trim().toLowerCase();
    if (
        lower.includes('cat') ||
        lower.includes('feline') ||
        lower.includes('puspin') ||
        lower.includes('kitten')
    ) {
        return 'cat';
    }
    return 'dog';
};

/**
 * Get the corresponding GIF asset for any given animal type.
 */
export const getAnimalGif = (animal?: AnimalType): string => {
    return normalizeAnimalType(animal) === 'cat' ? CAT_LOADING_GIF : DOG_LOADING_GIF;
};

/**
 * Main Dynamic Loading Component.
 * Automatically chooses running cat GIF or running dog GIF based on animalType.
 * Never displays both simultaneously.
 */
export const StraySafeLoading: React.FC<StraySafeLoadingProps> = ({
    animalType = 'Dog',
    message,
    subMessage,
    fullScreen = false,
    size = 'md',
    className = '',
    showProgressBar = true,
    badgeText,
    progressText,
}) => {
    const isCat = normalizeAnimalType(animalType) === 'cat';
    const primaryAsset = isCat ? CAT_LOADING_GIF : DOG_LOADING_GIF;

    const [imgSrc, setImgSrc] = useState<string>(primaryAsset);
    const [isImgLoaded, setIsImgLoaded] = useState<boolean>(false);

    // Synchronize image whenever animalType changes
    useEffect(() => {
        setImgSrc(primaryAsset);
        setIsImgLoaded(false);
    }, [primaryAsset]);

    const handleImgError = () => {
        if (isCat) {
            if (imgSrc !== catGifAsset && catGifAsset) {
                setImgSrc(catGifAsset);
            } else if (imgSrc !== DOG_LOADING_GIF) {
                setImgSrc(DOG_LOADING_GIF);
            } else if (dogGifAsset) {
                setImgSrc(dogGifAsset);
            }
        } else {
            if (imgSrc !== dogGifAsset && dogGifAsset) {
                setImgSrc(dogGifAsset);
            } else if (imgSrc !== CAT_LOADING_GIF) {
                setImgSrc(CAT_LOADING_GIF);
            } else if (catGifAsset) {
                setImgSrc(catGifAsset);
            }
        }
    };

    // Default badge and title if not explicitly provided
    const effectiveBadge = badgeText || (isCat ? '🐱 Cat Sighting Dispatch' : '🐶 Dog Sighting Dispatch');
    const effectiveMessage = message || (isCat ? 'Processing Cat Report' : 'Processing Dog Report');

    const sizeConfig = {
        sm: {
            card: 'max-w-[280px] p-4 rounded-3xl',
            imgWrap: 'max-w-[200px] min-h-[120px]',
            title: 'text-sm font-black',
            sub: 'text-[11px]',
            badge: 'text-[9px] px-2.5 py-0.5 mb-2',
            bar: 'max-w-[180px] h-1',
        },
        md: {
            card: 'max-w-[92vw] sm:max-w-[400px] p-4 sm:p-6 rounded-3xl sm:rounded-[2.5rem]',
            imgWrap: 'w-full max-w-[260px] sm:max-w-[340px] min-h-[130px] sm:min-h-[170px]',
            title: 'text-base sm:text-lg font-black',
            sub: 'text-xs',
            badge: 'text-[10px] px-3 py-1 mb-2.5 sm:mb-3',
            bar: 'max-w-[200px] sm:max-w-[240px] h-1.5',
        },
        lg: {
            card: 'max-w-[92vw] sm:max-w-[460px] p-4 sm:p-8 rounded-3xl sm:rounded-[2.5rem]',
            imgWrap: 'w-full max-w-[270px] sm:max-w-[380px] min-h-[140px] sm:min-h-[190px]',
            title: 'text-base sm:text-xl font-black',
            sub: 'text-xs sm:text-sm',
            badge: 'text-[10px] sm:text-[11px] px-3 sm:px-3.5 py-1 mb-2.5 sm:mb-4',
            bar: 'max-w-[200px] sm:max-w-[280px] h-1.5 sm:h-2',
        }
    }[size];

    const content = (
        <div
            className={`flex flex-col items-center justify-center text-center ${className}`}
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <div className={`relative w-full ${sizeConfig.card} bg-[#FAF6F0]/95 dark:bg-[#151C2C]/95 backdrop-blur-xl border border-orange-200/70 dark:border-orange-500/25 shadow-2xl shadow-orange-950/20 flex flex-col items-center transition-all duration-300 hover:scale-[1.01]`}>

                {/* Brand / Status Pill */}
                {effectiveBadge && (
                    <div className={`inline-flex items-center gap-2 rounded-full bg-orange-100/80 dark:bg-orange-950/60 border border-orange-300/40 dark:border-orange-800/50 text-[#C2410C] dark:text-orange-400 font-black uppercase tracking-widest ${sizeConfig.badge}`}>
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F97316] opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#F97316]"></span>
                        </span>
                        <span>{effectiveBadge}</span>
                    </div>
                )}

                {/* Animated Mascot Artwork (Either Cat OR Dog - Never Both) */}
                <div className={`relative w-full ${sizeConfig.imgWrap} rounded-2xl sm:rounded-[2rem] overflow-hidden shadow-md border border-amber-200/50 dark:border-gray-700/60 bg-[#F4ECE2] dark:bg-[#1a2338] p-1.5 flex items-center justify-center`}>
                    {!isImgLoaded && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-orange-50/50 dark:bg-gray-800/50 animate-pulse z-0">
                            <span className="text-2xl animate-bounce">{isCat ? '🐱' : '🐶'}</span>
                        </div>
                    )}
                    <img
                        key={imgSrc}
                        src={imgSrc}
                        alt={isCat ? "STRAY-SAFE Running Cat Loading Animation" : "STRAY-SAFE Running Dog Loading Animation"}
                        onLoad={() => setIsImgLoaded(true)}
                        onError={handleImgError}
                        loading="eager"
                        decoding="async"
                        className={`w-full h-auto min-h-[120px] max-h-[170px] sm:max-h-[240px] rounded-xl sm:rounded-[1.6rem] block object-contain select-none pointer-events-none transition-opacity duration-300 z-10 ${isImgLoaded ? 'opacity-100' : 'opacity-90'}`}
                    />
                </div>

                {/* Main Message with animated bounce dots */}
                <h3 className={`mt-3 sm:mt-4 uppercase tracking-tight text-[#1a1208] dark:text-white flex items-center justify-center gap-0.5 ${sizeConfig.title}`}>
                    <span>{effectiveMessage}</span>
                    <span className="inline-flex text-[#F97316]">
                        <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                        <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                        <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                    </span>
                </h3>

                {/* Subtitle / Contextual Message */}
                {subMessage && (
                    <p className={`mt-1.5 sm:mt-2 text-gray-500 dark:text-gray-400 font-semibold leading-relaxed max-w-xs ${sizeConfig.sub}`}>
                        {subMessage}
                    </p>
                )}

                {/* Optional Step Progress Text */}
                {progressText && (
                    <p className="mt-1.5 sm:mt-2 text-[11px] font-bold text-[#F97316] tracking-wide animate-pulse">
                        {progressText}
                    </p>
                )}

                {/* Progress Bar Shimmer */}
                {showProgressBar && (
                    <div className={`w-full ${sizeConfig.bar} mt-3 sm:mt-4 bg-orange-100/90 dark:bg-gray-800 rounded-full overflow-hidden relative`}>
                        <div className="absolute inset-y-0 bg-gradient-to-r from-orange-400 via-[#F97316] to-amber-400 rounded-full w-1/2 animate-[progress_1.6s_ease-in-out_infinite]" />
                    </div>
                )}
            </div>

            <style>{`
                @keyframes progress {
                    0% { transform: translateX(-100%); }
                    50% { transform: translateX(100%); }
                    100% { transform: translateX(250%); }
                }
            `}</style>
        </div>
    );

    if (fullScreen) {
        return (
            <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/60 dark:bg-black/80 backdrop-blur-md animate-in fade-in duration-200 pointer-events-auto select-none overflow-y-auto">
                {content}
            </div>
        );
    }

    return content;
};

/**
 * Reusable helper pre-configured for Cat uploads / reports.
 */
export const StraySafeCatLoading: React.FC<Omit<StraySafeLoadingProps, 'animalType'>> = (props) => (
    <StraySafeLoading animalType="cat" {...props} />
);

/**
 * Reusable helper pre-configured for Dog uploads / reports.
 */
export const StraySafeDogLoading: React.FC<Omit<StraySafeLoadingProps, 'animalType'>> = (props) => (
    <StraySafeLoading animalType="dog" {...props} />
);

/**
 * Convenient Drop-in Full-Screen Loading Overlay.
 * Simply pass `isVisible={true/false}` and the `animalType`!
 */
export const AnimalLoadingOverlay: React.FC<StraySafeLoadingProps & { isVisible: boolean }> = ({
    isVisible,
    ...props
}) => {
    if (!isVisible) return null;
    return <StraySafeLoading fullScreen size="lg" {...props} />;
};

export default StraySafeLoading;

