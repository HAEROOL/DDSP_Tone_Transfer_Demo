import React, { useState, useRef } from "react";
import * as mm from "@magenta/music";

const PRESET_MODEL_URL =
  "https://storage.googleapis.com/magentadata/js/checkpoints/ddsp/tenor_saxophone";

// WAV 인코딩에 필요한 함수들
function floatTo16BitPCM(output, offset, input) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function encodeWAV(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const channels = 1;

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  // fmt subchunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true); // byte rate
  view.setUint16(32, channels * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  // data subchunk
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  floatTo16BitPCM(view, 44, samples);

  return view;
}

const Converter = ({ recordedUrl }) => {
  const [audioUrl, setAudioUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const audioCtx = useRef(null);
  const spice = useRef(null);
  const audioFeatures = useRef(null);

  // 모델 초기화 및 녹음된 음성 처리
  const initialize = async () => {
    if (!recordedUrl) {
      setErrorMsg("녹음된 음성이 없습니다. 먼저 녹음을 진행해주세요.");
      return;
    }
    try {
      const ctx = new AudioContext();
      await ctx.resume();
      audioCtx.current = ctx;
      // SPICE 인스턴스 생성 (SPICE 모델 경로에 맞게 수정 필요)
      spice.current = new mm.SPICE("/spice");
      await spice.current.initialize();
      await readFileAndProcessAudio(recordedUrl);
    } catch (error) {
      console.error("Initialization error:", error);
      setErrorMsg(error.message);
    }
  };

  // 녹음된 파일 URL을 받아 오디오 디코딩 후 오디오 피처를 추출
  async function readFileAndProcessAudio(src) {
    try {
      const audioFile = await fetch(src);
      const arrayBuffer = await audioFile.arrayBuffer();
      const audioBuffer = await audioCtx.current.decodeAudioData(arrayBuffer);
      audioFeatures.current = await spice.current.getAudioFeatures(audioBuffer);
    } catch (error) {
      console.error("Error processing audio:", error);
      setErrorMsg("오디오 처리 중 오류가 발생했습니다.");
    }
  }

  // tone transfer 수행: 녹음된 음성을 tenor saxophone 스타일로 변환
  const toneTransfer = async (checkpointUrl = PRESET_MODEL_URL) => {
    if (!audioFeatures.current) {
      setErrorMsg(
        "오디오 피처가 추출되지 않았습니다. 먼저 모델 초기화 후 다시 시도해주세요."
      );
      return;
    }
    setLoading(true);
    try {
      const ddsp = new mm.DDSP(checkpointUrl);
      await ddsp.initialize();
      const toneTransferredAudioData = await ddsp.synthesize(
        audioFeatures.current
      );
      const dataview = encodeWAV(
        toneTransferredAudioData,
        audioCtx.current.sampleRate
      );
      const blob = new Blob([dataview], { type: "audio/wav" });
      const url = window.URL.createObjectURL(blob);
      setAudioUrl(url);
      ddsp.dispose();
    } catch (error) {
      console.error("Tone transfer error:", error);
      setErrorMsg("톤 전환 중 오류가 발생했습니다.");
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: "1rem" }}>
      <h2>음성 변환기</h2>
      <button onClick={initialize}>모델 초기화</button>
      <br />
      <button onClick={() => toneTransfer(PRESET_MODEL_URL)}>
        Tenor Saxophone 변환
      </button>
      {loading && <p>처리 중...</p>}
      {errorMsg && <p style={{ color: "red" }}>Error: {errorMsg}</p>}
      {audioUrl && (
        <div>
          <h3>변환된 음성</h3>
          <audio src={audioUrl} controls />
        </div>
      )}
    </div>
  );
};

export default Converter;
