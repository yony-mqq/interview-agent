export const schemaSQL = `
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

CREATE TABLE IF NOT EXISTS access_verification_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempt_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_access_codes_email ON access_verification_codes(email);

CREATE TABLE IF NOT EXISTS interviewer_access (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  company_domain TEXT,
  company_name TEXT,
  session_token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  verified_at INTEGER NOT NULL,
  last_access_at INTEGER,
  ip TEXT,
  ua TEXT
);

CREATE INDEX IF NOT EXISTS idx_interviewer_access_token ON interviewer_access(session_token);
CREATE INDEX IF NOT EXISTS idx_interviewer_access_email ON interviewer_access(email);
CREATE INDEX IF NOT EXISTS idx_interviewer_access_company_name ON interviewer_access(company_name);

CREATE TABLE IF NOT EXISTS conversation_summaries (
  conversation_id TEXT PRIMARY KEY,
  summary TEXT NOT NULL,
  message_count INTEGER DEFAULT 0,
  token_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_summaries_conversation_id ON conversation_summaries(conversation_id);
`;
