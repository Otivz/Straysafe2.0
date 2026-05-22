import React from 'react';

interface SuccessModalProps {
    isOpen: boolean;
    message: string;
}

const SuccessModal: React.FC<SuccessModalProps> = ({ isOpen, message }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-white/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white rounded-[40px] shadow-2xl p-12 flex flex-col items-center max-w-sm w-full animate-in zoom-in-95 duration-300 border border-gray-100">
                {/* Animated Checkmark */}
                <div className="w-24 h-24 mb-8 relative">
                    <div className="absolute inset-0 bg-[#22C55E]/10 rounded-full animate-ping duration-1000"></div>
                    <div className="relative w-24 h-24 bg-[#22C55E] rounded-full flex items-center justify-center shadow-lg shadow-[#22C55E]/20">
                        <svg
                            className="w-12 h-12 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={4}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                                className="animate-[draw_0.6s_ease-in-out_forwards]"
                                style={{
                                    strokeDasharray: 50,
                                    strokeDashoffset: 50
                                }}
                            />
                        </svg>
                    </div>
                </div>
                <h3 className="text-3xl font-black text-[#1a1208] tracking-tighter uppercase mb-2">Success!</h3>
                <p className="text-[#9c8670] font-bold text-center text-sm tracking-wide leading-relaxed">{message}</p>
                

                <style>{`
                    @keyframes draw {
                        to {
                            stroke-dashoffset: 0;
                        }
                    }
                `}</style>
            </div>
        </div>
    );
};

export default SuccessModal;
