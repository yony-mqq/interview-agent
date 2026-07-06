interface NewChatButtonProps {
  onClick: () => void;
}

export function NewChatButton({ onClick }: NewChatButtonProps) {
  return (
    <button
      onClick={onClick}
      className="tw-mx-3 tw-mb-3 tw-flex tw-items-center tw-justify-center tw-gap-2 tw-px-3 tw-py-2 tw-text-sm tw-text-[#1B365D] tw-bg-[#EEF2F7] hover:tw-bg-[#dce4ed] tw-rounded-lg tw-transition"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      新对话
    </button>
  );
}
