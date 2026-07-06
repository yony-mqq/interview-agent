import { useState, useEffect, useCallback } from 'react';
import { getAccessToken, setAccessToken, clearAccessToken } from '../utils/auth.js';
import { API_BASE_URL } from '../config.js';

interface AccessStatus {
  enabled: boolean;
}

interface CheckResult {
  email?: string;
  company_domain?: string;
  company_name?: string;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  companyName: string | null;
}

interface LoginResult {
  success: boolean;
  message: string;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    companyName: null,
  });

  const [accessEnabled, setAccessEnabled] = useState<boolean | null>(null);

  // 检查访问控制是否开启
  const checkAccessStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/access/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AccessStatus = await res.json();
      setAccessEnabled(data.enabled);
      return data.enabled;
    } catch (error) {
      console.error('[useAuth] check access status error:', error);
      setAccessEnabled(false);
      return false;
    }
  }, []);

  // 校验本地保存的 token
  const validateToken = useCallback(async (token: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/access/check`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: CheckResult = await res.json();
      setState({
        isAuthenticated: true,
        isLoading: false,
        companyName: data.company_name || null,
      });
      return true;
    } catch (error) {
      console.error('[useAuth] validate token error:', error);
      clearAccessToken();
      setState(prev => ({ ...prev, isAuthenticated: false, isLoading: false }));
      return false;
    }
  }, []);

  // 刷新认证状态：从 localStorage 读取 token 并校验
  const refresh = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setState(prev => ({ ...prev, isAuthenticated: false, isLoading: false }));
      return false;
    }
    return validateToken(token);
  }, [validateToken]);

  // 初始化：先查开关状态，再校验 token
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const enabled = await checkAccessStatus();
      if (cancelled) return;

      if (!enabled) {
        setState({ isAuthenticated: true, isLoading: false, companyName: null });
        return;
      }

      const token = getAccessToken();
      if (token) {
        await validateToken(token);
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [checkAccessStatus, validateToken]);

  // 使用公司名称登录
  const companyLogin = useCallback(async (companyName: string): Promise<LoginResult> => {
    const trimmed = companyName.trim();
    if (!trimmed) {
      return { success: false, message: '请输入公司名称' };
    }

    try {
      const res = await fetch(`${API_BASE_URL}/access/company-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: trimmed }),
      });

      const data = await res.json().catch(() => ({ error: '登录失败' }));

      if (!res.ok) {
        return { success: false, message: data.error || '登录失败' };
      }

      if (data.token) {
        setAccessToken(data.token);
        setState({
          isAuthenticated: true,
          isLoading: false,
          companyName: data.company_name || trimmed,
        });
      }

      return { success: true, message: '已进入' };
    } catch (error) {
      console.error('[useAuth] company login error:', error);
      return { success: false, message: error instanceof Error ? error.message : '网络错误' };
    }
  }, []);

  // 登出
  const logout = useCallback(() => {
    clearAccessToken();
    setState({
      isAuthenticated: false,
      isLoading: false,
      companyName: null,
    });
  }, []);

  return {
    ...state,
    accessEnabled,
    companyLogin,
    logout,
    refresh,
  };
}
