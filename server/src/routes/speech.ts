/**
 * 语音交互接口
 *
 * 使用场景：数字人模式或语音输入场景，支持语音转文字（ASR）和文字转语音（TTS）。
 * 作用：
 * 1. 将用户录制的音频（base64）识别为文本，用于语音输入发消息。
 * 2. 将 AI 回复的文本合成为音频（base64），用于数字人播报语音回答。
 * 底层调用阿里云智能语音交互服务（NLS）。
 */
import { Router, Request, Response } from 'express';
import { recognizeSpeech, synthesizeSpeech, type TTSOptions } from '../services/speech.js';

const router = Router();

interface ASRRequest {
  audio: string;
  format?: string;
  sample_rate?: number;
}

interface TTSRequest {
  text: string;
  voice?: string;
  format?: 'pcm' | 'wav' | 'mp3';
  sample_rate?: number;
}

/**
 * POST /api/speech/asr
 * 语音识别：将用户上传的音频（base64）转为文本。
 * 使用场景：用户点击麦克风录制语音后，前端发送音频数据，后端返回识别出的文字内容。
 */
router.post('/speech/asr', async (req: Request, res: Response): Promise<void> => {
  try {
    const { audio, format, sample_rate } = req.body as ASRRequest;

    if (!audio || typeof audio !== 'string') {
      res.status(400).json({ error: 'audio is required and must be a base64 string' });
      return;
    }

    const audioBuffer = Buffer.from(audio, 'base64');
    if (audioBuffer.length === 0) {
      res.status(400).json({ error: 'audio is empty' });
      return;
    }

    const text = await recognizeSpeech(audioBuffer, {
      format,
      sampleRate: sample_rate,
    });

    res.json({ text });
  } catch (error) {
    console.error('[Speech/ASR] Error:', error);
    res.status(500).json({
      error: 'ASR failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/speech/tts
 * 语音合成：将文本转为音频（base64）。
 * 使用场景：数字人模式下 AI 回复完成后，前端调用此接口获取语音播报音频。
 */
router.post('/speech/tts', async (req: Request, res: Response): Promise<void> => {
  try {
    const { text, voice, format, sample_rate } = req.body as TTSRequest;

    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'text is required and must be a string' });
      return;
    }

    const options: TTSOptions = {
      voice,
      format,
      sampleRate: sample_rate,
    };

    const audioBuffer = await synthesizeSpeech(text, options);
    const isMock = process.env.SPEECH_MOCK === 'true';

    res.json({
      audio: audioBuffer.toString('base64'),
      format: options.format ?? (isMock ? 'wav' : 'mp3'),
      mock: isMock,
    });
  } catch (error) {
    console.error('[Speech/TTS] Error:', error);
    res.status(500).json({
      error: 'TTS failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
