/**
 * 安全防护 —— 速率限制 + 话题校验
 *
 * 使用 Cloudflare Workers KV 或内存存储进行速率限制。
 * 开发阶段使用简单的内存 Map，生产环境可切换到 KV。
 */

// ===== 速率限制 =====

interface RateLimitEntry {
  count: number
  resetAt: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()
let lastCleanupAt = 0

/** 速率限制配置 */
const RATE_LIMIT = {
  /** 时间窗口（毫秒） */
  windowMs: 60_000,
  /** 每个窗口内最大请求数 */
  maxRequests: 20,
}

/**
 * 检查请求是否超过速率限制
 * @returns 如果允许通过则返回 true，否则返回 false
 */
export function checkRateLimit(clientIp: string, maxRequests = RATE_LIMIT.maxRequests): boolean {
  const now = Date.now()
  lazyCleanup(now)
  const entry = rateLimitStore.get(clientIp)

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(clientIp, { count: 1, resetAt: now + RATE_LIMIT.windowMs })
    return true
  }

  if (entry.count >= maxRequests) {
    return false
  }

  entry.count++
  return true
}

/** 获取剩余请求次数 */
export function getRateLimitRemaining(clientIp: string): number {
  const entry = rateLimitStore.get(clientIp)
  if (!entry) return RATE_LIMIT.maxRequests
  return Math.max(0, RATE_LIMIT.maxRequests - entry.count)
}

/** 惰性清理过期条目（在每次 checkRateLimit 时顺便做） */
function lazyCleanup(now: number): void {
  if (now - lastCleanupAt < RATE_LIMIT.windowMs) return
  lastCleanupAt = now
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key)
    }
  }
}

// ===== 话题校验 =====

/** 明显的越狱/注入模式 */
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /system\s*:\s*/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /you\s+are\s+now\s+(dan|jailbreak)/i,
  /pretend\s+you\s+are/i,
  /act\s+as\s+(if\s+)?you\s+were/i,
]

/** 明显的非技术话题关键词 */
const OFF_TOPIC_PATTERNS = [
  /how\s+to\s+(hack|steal|exploit|break\sin|bypass\s+security)/i,
  /write\s+(malware|virus|ransomware|trojan)/i,
  /generate\s+(fake|false)\s+(news|information)/i,
  /create\s+(deepfake|fake\s+video)/i,
]

/**
 * 校验问题内容
 * @returns 如果问题安全则返回 null，否则返回错误消息
 */
export function validateQuestion(question: string): string | null {
  // 长度限制
  if (question.length > 2000) {
    return '问题过长，请控制在 2000 字以内'
  }

  if (question.length < 2) {
    return '请输入有意义的问题'
  }

  // 检测注入
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(question)) {
      return '检测到不当的提示注入，请提出正经的技术面试问题'
    }
  }

  // 检测明显不当话题
  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(question)) {
      return '此问题超出了技术面试的范畴，请提出与技术项目相关的问题'
    }
  }

  return null
}

/**
 * 从请求中提取客户端 IP
 */
export function extractClientIP(request: Request): string {
  // Cloudflare Workers 中从 CF-Connecting-IP 头获取真实 IP
  const cfIP = request.headers.get('CF-Connecting-IP')
  if (cfIP) return cfIP

  return 'unknown'
}
