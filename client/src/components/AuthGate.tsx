import { useState, useCallback } from 'react';
import { API_BASE_URL } from '../config.js';

interface AuthGateProps {
  onAuthenticated?: () => void;
}

export function AuthGate({ onAuthenticated }: AuthGateProps) {
  const [companyName, setCompanyName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = useCallback(async () => {
    setError(null);

    const trimmed = companyName.trim();
    if (!trimmed) {
      setError('请输入公司名称');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/access/company-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: trimmed }),
      });

      const data = await res.json().catch(() => ({ error: '请求失败' }));

      if (!res.ok) {
        setError(data.error || '登录失败');
        return;
      }

      if (data.token) {
        try {
          localStorage.setItem('interview_agent_access_token', data.token);
        } catch {
          // ignore
        }
      }

      onAuthenticated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setIsLoading(false);
    }
  }, [companyName, onAuthenticated]);

  return (
    <div className="tw-fixed tw-inset-0 tw-z-[60] tw-flex tw-items-center tw-justify-center tw-bg-black/50 tw-p-4">
      <div className="tw-w-full tw-max-w-sm tw-rounded-xl tw-bg-white tw-p-6 tw-shadow-2xl">
        <div className="tw-mb-5 tw-text-center">
          <div className="tw-mb-2 tw-flex tw-justify-center">
            <div className="tw-flex tw-h-12 tw-w-12 tw-items-center tw-justify-center tw-rounded-full tw-bg-[#EEF2F7] tw-text-2xl">
              🔒
            </div>
          </div>
          <h2 className="tw-text-lg tw-font-semibold tw-text-gray-900">面试官认证</h2>
          <p className="tw-mt-1 tw-text-sm tw-text-gray-500">请输入公司名称后开始使用</p>
        </div>

        {error && (
          <div className="tw-mb-4 tw-rounded-lg tw-bg-red-50 tw-px-3 tw-py-2 tw-text-sm tw-text-red-600">
            {error}
          </div>
        )}

        <div className="tw-space-y-4">
          <div>
            <label className="tw-mb-1.5 tw-block tw-text-sm tw-font-medium tw-text-gray-700">
              公司名称
            </label>
            <input
              type="text"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="例如：阿里巴巴"
              className="tw-w-full tw-rounded-lg tw-border tw-border-gray-300 tw-px-3 tw-py-2 tw-text-sm tw-outline-none focus:tw-border-[#1B365D] focus:tw-ring-1 focus:tw-ring-[#1B365D]"
              onKeyDown={e => {
                if (e.key === 'Enter') handleLogin();
              }}
              disabled={isLoading}
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={isLoading}
            className="tw-w-full tw-rounded-lg tw-bg-[#1B365D] tw-px-4 tw-py-2.5 tw-text-sm tw-font-medium tw-text-white tw-transition hover:tw-bg-[#152a4a] disabled:tw-cursor-not-allowed disabled:tw-opacity-60"
          >
            {isLoading ? '进入中…' : '进入'}
          </button>
        </div>
      </div>
    </div>
  );
}
