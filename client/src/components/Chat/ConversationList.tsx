import type { Conversation } from '../../types/conversation.js';

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  isLoading: boolean;
  onSelect: (conversation: Conversation) => void;
  onDelete: (id: string) => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export function ConversationList({
  conversations,
  activeId,
  isLoading,
  onSelect,
  onDelete,
}: ConversationListProps) {
  if (isLoading) {
    return (
      <div className="tw-flex-1 tw-flex tw-items-center tw-justify-center tw-text-xs tw-text-gray-400">
        加载中...
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="tw-flex-1 tw-flex tw-items-center tw-justify-center tw-px-4 tw-text-center tw-text-xs tw-text-gray-400">
        暂无历史对话
      </div>
    );
  }

  return (
    <div className="tw-flex-1 tw-overflow-y-auto tw-py-2">
      {conversations.map(conversation => (
        <div
          key={conversation.id}
          onClick={() => onSelect(conversation)}
          className={`tw-group tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-mx-2 tw-rounded-lg tw-cursor-pointer tw-transition ${
            activeId === conversation.id
              ? 'tw-bg-[#1B365D]/10 tw-text-[#1B365D]'
              : 'tw-text-gray-600 hover:tw-bg-gray-100'
          }`}
        >
          <div className="tw-flex-1 tw-min-w-0 tw-mr-2">
            <div className="tw-text-sm tw-truncate">{conversation.title}</div>
            <div className="tw-text-xs tw-text-gray-400 tw-mt-0.5">
              {formatDate(conversation.updated_at)} · {conversation.message_count || 0} 条消息
            </div>
          </div>
          <button
            onClick={e => {
              e.stopPropagation();
              if (confirm('确定删除该对话吗？')) {
                onDelete(conversation.id);
              }
            }}
            className="tw-opacity-0 group-hover:tw-opacity-100 tw-text-gray-400 hover:tw-text-red-500 tw-transition tw-p-1"
            title="删除对话"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
