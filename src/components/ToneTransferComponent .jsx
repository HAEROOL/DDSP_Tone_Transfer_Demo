import React, { useState, useRef } from "react";
import * as mm from "@magenta/music";

// 모델 이름과 체크포인트 URL 설정
const MODEL = {
  VIOLIN: "violin",
  TENOR_SAXOPHONE: "tenor_saxophone",
  TRUMPET: "trumpet",
  FLUTE: "flute",
};

const PRESET_MODEL_URL =
  "https://storage.googleapis.com/magentadata/js/checkpoints/ddsp";

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

const ToneTransferComponent = () => {
  // 상태 변수들
  const [spiceMessage, setSpiceMessage] = useState("");
  const [audioFeatures, setAudioFeatures] = useState(null);
  const [showButtons, setShowButtons] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [spiceInitialized, setSpiceInitialized] = useState(false);

  // AudioContext와 spice 인스턴스를 useRef로 관리
  const audioCtxRef = useRef(null);
  const spiceRef = useRef(null);

  // SPICE 초기화 및 AudioContext 생성
  const initializeSpice = async () => {
    const spice = new mm.SPICE("/spice/");
    setSpiceMessage("Loading SPICE model.");
    await spice.initialize();
    setSpiceMessage("SPICE model is ready.");
    spiceRef.current = spice;
    audioCtxRef.current = new AudioContext();
    setSpiceInitialized(true);
  };

  // 파일 업로드 후 파일 데이터를 읽고 오디오를 디코딩하여 audio features 추출
  const readFileAndProcessAudio = async (src) => {
    try {
      const audioFile = await fetch(src);
      const arrayBuffer = await audioFile.arrayBuffer();
      const audioBuffer = await audioCtxRef.current.decodeAudioData(
        arrayBuffer
      );
      // SPICE 모델을 이용하여 오디오 피처 추출
      const features = await spiceRef.current.getAudioFeatures(audioBuffer);
      setAudioFeatures(features);
      setShowButtons(true);
    } catch (err) {
      console.error(err);
    }
  };

  // 파일 업로드 핸들러
  const handleFileUpload = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async (event) => {
        await readFileAndProcessAudio(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // tone transfer 실행 함수
  const toneTransfer = async (checkpointUrl, settings) => {
    // ddsp 인스턴스 생성 및 초기화
    const ddsp = new mm.DDSP(checkpointUrl, settings);
    await ddsp.initialize();
    // tone transfer를 통해 음성 데이터를 생성
    const toneTransferredAudioData = await ddsp.synthesize(audioFeatures);
    // WAV 인코딩 후 Blob URL 생성
    const dataview = encodeWAV(
      toneTransferredAudioData,
      audioCtxRef.current.sampleRate
    );
    const blob = new Blob([dataview], { type: "audio/wav" });
    const url = window.URL.createObjectURL(blob);
    setAudioUrl(url);
    ddsp.dispose();
  };

  return (
    <div>
      {/* SPICE 초기화 */}
      {!spiceInitialized && (
        <button onClick={initializeSpice}>Initialize SPICE</button>
      )}
      {spiceMessage && <p>{spiceMessage}</p>}

      {/* 파일 업로드 */}
      <div>
        <input type="file" onChange={handleFileUpload} />
      </div>

      {/* Audio Features 확인 */}
      {audioFeatures && (
        <details>
          <summary>View Audio Features</summary>
          <pre>{JSON.stringify(audioFeatures, null, 2)}</pre>
        </details>
      )}

      {/* tone transfer 버튼들 */}
      {showButtons && (
        <div>
          <button
            onClick={() => toneTransfer(`${PRESET_MODEL_URL}/${MODEL.VIOLIN}`)}
          >
            Violin
          </button>
          <button
            onClick={() =>
              toneTransfer(`${PRESET_MODEL_URL}/${MODEL.TENOR_SAXOPHONE}`)
            }
          >
            Tenor Saxophone
          </button>
          <button
            onClick={() => toneTransfer(`${PRESET_MODEL_URL}/${MODEL.FLUTE}`)}
          >
            Flute
          </button>
          <button
            onClick={() => toneTransfer(`${PRESET_MODEL_URL}/${MODEL.TRUMPET}`)}
          >
            Trumpet
          </button>
        </div>
      )}

      {/* 결과 음성 플레이어 */}
      {audioUrl && (
        <div>
          <audio controls src={audioUrl} />
        </div>
      )}
    </div>
  );
};

export default ToneTransferComponent;
