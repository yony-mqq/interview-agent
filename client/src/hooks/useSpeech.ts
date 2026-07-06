import { useState, useRef, useCallback } from 'react';
import { getAuthHeaders } from '../utils/auth.js';

interface UseSpeechOptions {
  apiUrl: string;
}

interface TTSResult {
  audio: string;
  format: string;
  mock?: boolean;
}

interface AudioRecorder {
  audioContext: AudioContext;
  processor: ScriptProcessorNode;
  source: MediaStreamAudioSourceNode;
  stream: MediaStream;
  audioBuffers: Float32Array[];
}

const SAMPLE_RATE = 16000;

export function useSpeech({ apiUrl }: UseSpeechOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  /**
   * 开始录音。返回 boolean 表示是否成功获取麦克风权限。
   * 使用 ScriptProcessorNode 将音频采集为 16kHz 单声道 Float32 数据。
   */
  const startRecording = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      const audioBuffers: Float32Array[] = [];

      processor.onaudioprocess = event => {
        const channelData = event.inputBuffer.getChannelData(0);
        audioBuffers.push(new Float32Array(channelData));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      recorderRef.current = { audioContext, processor, source, stream, audioBuffers };
      setIsRecording(true);
      return true;
    } catch (error) {
      console.error('[useSpeech] 启动录音失败:', error);
      return false;
    }
  }, []);

  /**
   * 停止录音并调用 ASR 接口识别文字。
   * 返回识别到的文字；失败或无文字时返回 null。
   */
  const stopRecording = useCallback(async (): Promise<string | null> => {
    const recorder = recorderRef.current;
    if (!recorder) {
      setIsRecording(false);
      return null;
    }

    // 断开音频图并关闭上下文
    recorder.processor.disconnect();
    recorder.source.disconnect();
    await recorder.audioContext.close();
    recorder.stream.getTracks().forEach(track => track.stop());

    recorderRef.current = null;
    setIsRecording(false);
    setIsRecognizing(true);

    try {
      const wavBuffer = encodeWAV(recorder.audioBuffers, SAMPLE_RATE);
      const base64Audio = arrayBufferToBase64(wavBuffer);

      const response = await fetch(`${apiUrl}/speech/asr`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          audio: base64Audio,
          format: 'wav',
          sample_rate: SAMPLE_RATE,
        }),
      });

      if (!response.ok) {
        throw new Error(`ASR HTTP ${response.status}`);
      }

      const data = (await response.json()) as { text?: string };
      return data.text ?? null;
    } catch (error) {
      console.error('[useSpeech] ASR 失败:', error);
      return null;
    } finally {
      setIsRecognizing(false);
    }
  }, [apiUrl]);

  const cancelRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.processor.disconnect();
      recorder.source.disconnect();
      recorder.audioContext.close().catch(() => {});
      recorder.stream.getTracks().forEach(track => track.stop());
      recorderRef.current = null;
    }
    setIsRecording(false);
    setIsRecognizing(false);
  }, []);

  /**
   * 调用 TTS 接口并播放返回的音频。
   */
  const speak = useCallback(
    async (text: string): Promise<void> => {
      try {
        const response = await fetch(`${apiUrl}/speech/tts`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ text, format: 'mp3' }),
        });

        if (!response.ok) {
          throw new Error(`TTS HTTP ${response.status}`);
        }

        const result = (await response.json()) as TTSResult;
        if (!result.audio) {
          throw new Error('TTS 返回为空');
        }

        stopSpeaking();

        const audio = new Audio(`data:audio/${result.format};base64,${result.audio}`);
        audioPlayerRef.current = audio;

        await audio.play();
      } catch (error) {
        console.error('[useSpeech] TTS 播放失败:', error);
      }
    },
    [apiUrl]
  );

  /**
   * 停止当前播放的语音。
   */
  const stopSpeaking = useCallback(() => {
    const player = audioPlayerRef.current;
    if (player) {
      player.pause();
      player.currentTime = 0;
      audioPlayerRef.current = null;
    }
  }, []);

  return {
    isRecording,
    isRecognizing,
    startRecording,
    stopRecording,
    cancelRecording,
    speak,
    stopSpeaking,
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function encodeWAV(buffers: Float32Array[], sampleRate: number): ArrayBuffer {
  const length = buffers.reduce((acc, buf) => acc + buf.length, 0);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, length * 2, true);

  let offset = 44;
  for (const buf of buffers) {
    for (let i = 0; i < buf.length; i++) {
      const s = Math.max(-1, Math.min(1, buf[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
