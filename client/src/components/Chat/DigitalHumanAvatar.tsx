interface DigitalHumanAvatarProps {
  isSpeaking?: boolean;
  isListening?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: { wrapper: 'tw-w-24 tw-h-24', inner: 'tw-w-16 tw-h-16' },
  md: { wrapper: 'tw-w-36 tw-h-36', inner: 'tw-w-24 tw-h-24' },
  lg: { wrapper: 'tw-w-48 tw-h-48', inner: 'tw-w-32 tw-h-32' },
}

export function DigitalHumanAvatar({ isSpeaking = false, isListening = false, size = 'lg' }: DigitalHumanAvatarProps) {
  const { wrapper, inner } = sizeMap[size]

  return (
    <div className={`tw-relative ${wrapper} tw-flex tw-items-center tw-justify-center`}>
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes ripple {
          0% { transform: scale(0.8); opacity: 0.6; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes sound-bar {
          0%, 100% { height: 20%; }
          50% { height: 100%; }
        }
        .dh-float { animation: float 4s ease-in-out infinite; }
        .dh-ripple { animation: ripple 2s ease-out infinite; }
        .dh-ripple-delay { animation: ripple 2s ease-out infinite 1s; }
        .dh-sound-bar { animation: sound-bar 0.8s ease-in-out infinite; }
      `}</style>

      {/* 背景光环 */}
      <div className="tw-absolute tw-inset-0 tw-rounded-full tw-bg-gradient-to-br tw-from-[#1B365D]/10 tw-to-[#3B6FBF]/10 tw-animate-pulse" />

      {/* 说话/聆听时的扩散波纹 */}
      {(isSpeaking || isListening) && (
        <>
          <div className="tw-absolute tw-inset-0 tw-rounded-full tw-border-2 tw-border-[#1B365D]/30 dh-ripple" />
          <div className="tw-absolute tw-inset-0 tw-rounded-full tw-border-2 tw-border-[#3B6FBF]/20 dh-ripple-delay" />
        </>
      )}

      {/* 头像容器 */}
      <div className={`${inner} tw-relative tw-rounded-full tw-bg-gradient-to-br tw-from-[#1B365D] tw-to-[#3B6FBF] tw-shadow-xl tw-flex tw-items-center tw-justify-center dh-float`}>
        {/* 人物剪影 SVG */}
        <svg
          viewBox="0 0 100 100"
          className="tw-w-[55%] tw-h-[55%] tw-text-white/90"
          fill="currentColor"
        >
          <circle cx="50" cy="32" r="18" />
          <path d="M50 56c-18 0-34 10-42 26 6 8 16 14 28 16 5 1 10 1 14 0 12-2 22-8 28-16-8-16-24-26-42-26z" />
        </svg>

        {/* 状态指示点 */}
        {isSpeaking && (
          <div className="tw-absolute -tw-bottom-1 tw-bg-green-500 tw-text-white tw-text-[10px] tw-px-2 tw-py-0.5 tw-rounded-full tw-shadow tw-font-medium">
            说话中
          </div>
        )}
        {isListening && (
          <div className="tw-absolute -tw-bottom-1 tw-bg-amber-500 tw-text-white tw-text-[10px] tw-px-2 tw-py-0.5 tw-rounded-full tw-shadow tw-font-medium">
            聆听中
          </div>
        )}
      </div>

      {/* 底部声音波形（仅在说话时显示） */}
      {isSpeaking && (
        <div className="tw-absolute -tw-bottom-5 tw-left-1/2 -tw-translate-x-1/2 tw-flex tw-items-center tw-gap-1 tw-h-5">
          {[0, 1, 2, 3, 4].map(i => (
            <span
              key={i}
              className="tw-w-1 tw-bg-[#1B365D]/70 tw-rounded-full dh-sound-bar"
              style={{ animationDelay: `${i * 120}ms`, height: '20%' }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
