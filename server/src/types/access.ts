import type { Request } from 'express';

export interface AccessVerificationCode {
  id: string;
  email: string;
  code: string;
  expires_at: number;
  attempt_count: number;
  created_at: number;
}

export interface InterviewerAccess {
  id: string;
  email: string | null;
  company_domain: string | null;
  company_name: string | null;
  session_token: string;
  expires_at: number;
  verified_at: number;
  last_access_at: number | null;
  ip: string | null;
  ua: string | null;
}

export interface AuthenticatedRequest extends Request {
  interviewer?: {
    email?: string;
    company_domain?: string;
    company_name?: string;
  };
}
