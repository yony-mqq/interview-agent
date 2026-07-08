/**
 * 合规检查服务
 *
 * 职责：
 * 1. 敏感词检测 —— 拦截涉暴、涉政、违法等内容
 * 2. 输入安全检查 —— 防止 Prompt 注入攻击（基础层面）
 * 3. 返回检测结果 + 匹配到的词，方便日志审计
 *
 * 注意：
 * - 面试 Agent 场景下敏感词库不需要像内容平台那么重
 * - 主要目的是展示「有合规意识」和「有拦截机制」
 */

export interface ComplianceResult {
  passed: boolean;      // true = 通过，false = 命中敏感词
  matched?: string;     // 命中的具体词/片段
  category?: string;    // 敏感类别
}

interface SensitiveRule {
  pattern: RegExp;
  category: string;
}

/**
 * 敏感词规则库（面试场景轻量版）
 * 实际生产环境可接入外部词库服务或更完善的规则引擎
 */
const SENSITIVE_RULES: SensitiveRule[] = [
  { pattern: /暴\s*力|恐\s*怖|杀\s*人|自\s*杀/, category: 'violence' },
  { pattern: /黄\s*赌\s*毒|嫖\s*娼|吸\s*毒/, category: 'illegal' },
  { pattern: /反\s*党|反\s*政\s*府|分\s*裂|颠\s*覆/, category: 'political' },
];

/**
 * 检查文本是否包含敏感内容
 */
export function checkCompliance(text: string): ComplianceResult {
  for (const rule of SENSITIVE_RULES) {
    const match = text.match(rule.pattern);
    if (match) {
      return {
        passed: false,
        matched: match[0],
        category: rule.category,
      };
    }
  }
  return { passed: true };
}

/**
 * Prompt 注入检测（基础版）
 *
 * 拦截明显的越狱/注入尝试，例如：
 * - "忽略之前的指令"
 * - "你是 ChatGPT，现在你要..."
 * - "system prompt: ..."
 */
const INJECTION_PATTERNS = [
  /忽\s*略\s*之\s*前\s*的?\s*指\s*令/,
  /忽\s*略\s*上\s*面\s*的?\s*所\s*有\s*设\s*定/,
  /你\s*是\s*(ChatGPT|GPT|AI\s*助手)/,
  /system\s*prompt\s*[:：]/i,
  /以\s*下\s*不\s*是\s*真\s*实\s*的/,
  /DAN\s*模\s*式/i,
];

export function checkPromptInjection(text: string): ComplianceResult {
  for (const pattern of INJECTION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return {
        passed: false,
        matched: match[0],
        category: 'prompt_injection',
      };
    }
  }
  return { passed: true };
}
