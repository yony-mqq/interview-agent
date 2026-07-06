import { RPCClient } from '@alicloud/pop-core';

interface TokenInfo {
  token: string;
  expireTime: number; // 秒级时间戳
}

let cachedToken: TokenInfo | null = null;

const MOCK_ASR_TEXT = '请介绍一下你的项目经验';

/**
 * 生成一段极短的静音 WAV 音频（16kHz / 16bit / mono），用于 Mock 模式。
 */
function generateMockWavBase64(): string {
  const sampleRate = 16000;
  const duration = 0.2;
  const numSamples = Math.floor(sampleRate * duration);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // 数据段已初始化为 0（静音）
  return buffer.toString('base64');
}

function isMockMode(): boolean {
  return process.env.SPEECH_MOCK === 'true';
}

function ensureCredentials(): { accessKeyId: string; accessKeySecret: string } {
  const accessKeyId = process.env.ALIYUN_AK_ID;
  const accessKeySecret = process.env.ALIYUN_AK_SECRET;

  if (!accessKeyId || !accessKeySecret) {
    throw new Error('缺少阿里云访问凭证：请配置 ALIYUN_AK_ID 和 ALIYUN_AK_SECRET 环境变量');
  }

  return { accessKeyId, accessKeySecret };
}

function getAppkey(): string {
  const appkey = process.env.ALIYUN_NLS_APPKEY;
  if (!appkey) {
    throw new Error('缺少智能语音交互项目 Appkey：请配置 ALIYUN_NLS_APPKEY 环境变量');
  }
  return appkey;
}

/**
 * 获取 NLS Token，带本地缓存，过期前 60 秒自动刷新。
 */
async function getNlsToken(): Promise<string> {
  if (cachedToken && cachedToken.expireTime - Date.now() / 1000 > 60) {
    return cachedToken.token;
  }

  const { accessKeyId, accessKeySecret } = ensureCredentials();

  const client = new RPCClient({
    accessKeyId,
    accessKeySecret,
    endpoint: 'http://nls-meta.cn-shanghai.aliyuncs.com',
    apiVersion: '2019-02-28',
  });

  const result = await client.request('CreateToken');
  const token = result?.Token?.Id as string;
  const expireTime = Number(result?.Token?.ExpireTime);

  if (!token || !expireTime) {
    throw new Error('获取 NLS Token 失败：响应格式异常');
  }

  cachedToken = { token, expireTime };
  return token;
}

export interface ASROptions {
  format?: string;
  sampleRate?: number;
}

/**
 * 调用阿里云一句话识别 RESTful API，将音频 Buffer 转为文字。
 */
export async function recognizeSpeech(audioBuffer: Buffer, options: ASROptions = {}): Promise<string> {
  if (isMockMode()) {
    return MOCK_ASR_TEXT;
  }

  const token = await getNlsToken();
  const appkey = getAppkey();
  const format = options.format ?? 'wav';
  const sampleRate = options.sampleRate ?? 16000;

  const url = new URL('https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/asr');
  url.searchParams.set('appkey', appkey);
  url.searchParams.set('format', format);
  url.searchParams.set('sample_rate', String(sampleRate));
  url.searchParams.set('enable_punctuation_prediction', 'true');
  url.searchParams.set('enable_inverse_text_normalization', 'true');

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'X-NLS-Token': token,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(audioBuffer.length),
    },
    body: new Uint8Array(audioBuffer),
  });

  const data = (await response.json()) as {
    status: number;
    result?: string;
    message?: string;
  };

  if (data.status !== 20000000) {
    throw new Error(`ASR 失败 [${data.status}]: ${data.message ?? 'unknown'}`);
  }

  return data.result ?? '';
}

export interface TTSOptions {
  voice?: string;
  format?: 'pcm' | 'wav' | 'mp3';
  sampleRate?: number;
  speechRate?: number;
  pitchRate?: number;
  volume?: number;
}

/**
 * 调用阿里云语音合成 RESTful API，将文字转为音频 Buffer。
 */
export async function synthesizeSpeech(text: string, options: TTSOptions = {}): Promise<Buffer> {
  if (isMockMode()) {
    const base64 = generateMockWavBase64();
    return Buffer.from(base64, 'base64');
  }

  const token = await getNlsToken();
  const appkey = getAppkey();

  const response = await fetch('https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-NLS-Token': token,
    },
    body: JSON.stringify({
      appkey,
      text,
      token,
      format: options.format ?? 'mp3',
      sample_rate: options.sampleRate ?? 16000,
      voice: options.voice ?? 'aixia',
      speech_rate: options.speechRate ?? 0,
      pitch_rate: options.pitchRate ?? 0,
      volume: options.volume ?? 50,
    }),
  });

  const contentType = response.headers.get('content-type') ?? '';

  if (!response.ok || contentType.includes('application/json')) {
    const data = (await response.json()) as { status?: number; message?: string };
    throw new Error(`TTS 失败 [${data.status ?? response.status}]: ${data.message ?? response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
