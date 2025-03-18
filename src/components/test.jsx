import React, { useState } from "react";
import * as mm from "@magenta/music";

// WAV 인코딩 헬퍼 함수들
function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
function floatTo16BitPCM(output, offset, input) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
}
function encodeWAV(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const channels = 1;
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  floatTo16BitPCM(view, 44, samples);
  return view;
}

// 다운믹스 + 리샘플링 (스테레오 → 모노, 16kHz, targetLength 보장)
async function downmixAndResample(inputBuffer, targetSampleRate, targetLength) {
  const durationSec = inputBuffer.duration;
  const targetSamples =
    targetLength || Math.ceil(durationSec * targetSampleRate);
  const offlineCtx = new OfflineAudioContext(
    1,
    targetSamples,
    targetSampleRate
  );
  const source = offlineCtx.createBufferSource();
  source.buffer = inputBuffer;
  source.connect(offlineCtx.destination);
  source.start();
  const resampledBuffer = await offlineCtx.startRendering();
  console.log("✅ Resampled AudioBuffer length:", resampledBuffer.length);
  return resampledBuffer;
}

/**
 * 주어진 AudioBuffer를 targetLength(샘플 수)로 자르거나,
 * 부족한 경우 0으로 패딩하여 고정 길이(약 20480 샘플)로 만듭니다.
 */
function cropOrPadAudioBuffer(buffer, targetLength) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const ctx = new AudioContext();
  const newBuffer = ctx.createBuffer(numChannels, targetLength, sampleRate);
  for (let ch = 0; ch < numChannels; ch++) {
    const oldData = buffer.getChannelData(ch);
    const newData = newBuffer.getChannelData(ch);
    const copyLength = Math.min(oldData.length, targetLength);
    newData.set(oldData.subarray(0, copyLength));
    if (oldData.length < targetLength) {
      for (let i = oldData.length; i < targetLength; i++) {
        newData[i] = 0;
      }
    }
  }
  ctx.close();
  console.log("✅ Fixed AudioBuffer length:", newBuffer.length);
  return newBuffer;
}

const MODEL = {
  VIOLIN: "violin",
  TENOR_SAXOPHONE: "tenor_saxophone",
  TRUMPET: "trumpet",
  FLUTE: "flute",
};

const PRESET_MODEL_URL =
  "https://storage.googleapis.com/magentadata/js/checkpoints/ddsp";

const Test = () => {
  const [initialized, setInitialized] = useState(false);
  const [spice, setSpice] = useState(null);
  const [audioCtx, setAudioCtx] = useState(null);
  const [audioFeatures, setAudioFeatures] = useState(null);
  const [uploadedAudioUrl, setUploadedAudioUrl] = useState(null);
  const [convertedUrl, setConvertedUrl] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  // 초기화 버튼 클릭 시 SPICE 모델과 AudioContext 생성
  const handleInitialize = async () => {
    try {
      const spiceModel = new mm.SPICE("/spice"); // 로컬 경로 "/spice"
      await spiceModel.initialize();
      setSpice(spiceModel);
      const ctx = new AudioContext();
      setAudioCtx(ctx);
      setInitialized(true);
    } catch (error) {
      console.error("초기화 오류:", error);
      setErrorMsg(error.message);
    }
  };

  // 파일 업로드 처리
  const handleFileChange = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      // 생성된 Blob URL로 업로드된 파일 재생용 URL 설정
      const url = URL.createObjectURL(file);
      setUploadedAudioUrl(url);

      try {
        // 파일을 ArrayBuffer로 읽음
        const arrayBuffer = await file.arrayBuffer();
        const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        console.log("🔍 Original AudioBuffer Length:", decodedBuffer.length);
        console.log(
          "🔍 Original Audio Data (first 10 samples):",
          decodedBuffer.getChannelData(0).slice(0, 10)
        );

        // SPICE 모델에 전달할 수 있도록 다운믹스/리샘플링 및 고정 길이 처리
        const resampledBuffer = await downmixAndResample(
          decodedBuffer,
          16000,
          20480
        );
        console.log("✅ Resampled AudioBuffer:", resampledBuffer);
        const fixedBuffer = cropOrPadAudioBuffer(resampledBuffer, 20480);
        console.log("🎯 Final Fixed Buffer:", fixedBuffer);
        setAudioFeatures(await spice.getAudioFeatures(fixedBuffer));
        console.log("✅ SPICE audioFeatures set.");
      } catch (error) {
        console.error("파일 처리 오류:", error);
        setErrorMsg(error.message);
      }
    }
  };

  // 톤 트랜스퍼 함수 (각 악기 버튼에서 호출)
  const toneTransfer = async (checkpointUrl, settings) => {
    try {
      setConvertedUrl(null);
      const ddsp = new mm.DDSP(checkpointUrl, settings);
      await ddsp.initialize();
      const toneTransferredAudioData = await ddsp.synthesize(audioFeatures);
      const dataview = encodeWAV(toneTransferredAudioData, audioCtx.sampleRate);
      const wavBlob = new Blob([dataview], { type: "audio/wav" });
      const url = URL.createObjectURL(wavBlob);
      setConvertedUrl(url);
      ddsp.dispose();
    } catch (error) {
      console.error("톤 트랜스퍼 오류:", error);
      setErrorMsg(error.message);
    }
  };

  return (
    <div style={{ padding: "1rem" }}>
      <h1>Magenta.js 기반 음성 변환 데모</h1>
      {errorMsg && <p style={{ color: "red" }}>Error: {errorMsg}</p>}
      {!initialized ? (
        <button onClick={handleInitialize}>Initialize SPICE Model</button>
      ) : (
        <>
          <p>SPICE 모델이 준비되었습니다.</p>
          <div>
            <input type="file" accept="audio/*" onChange={handleFileChange} />
            {uploadedAudioUrl && (
              <div>
                <h3>업로드된 오디오</h3>
                <audio src={uploadedAudioUrl} controls />
              </div>
            )}
          </div>
          {audioFeatures && (
            <div>
              <h3>Tone Transfer</h3>
              <button
                onClick={() =>
                  toneTransfer(`${PRESET_MODEL_URL}/${MODEL.VIOLIN}`)
                }
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
                onClick={() =>
                  toneTransfer(`${PRESET_MODEL_URL}/${MODEL.FLUTE}`)
                }
              >
                Flute
              </button>
              <button
                onClick={() =>
                  toneTransfer(`${PRESET_MODEL_URL}/${MODEL.TRUMPET}`)
                }
              >
                Trumpet
              </button>
            </div>
          )}
          {convertedUrl && (
            <div>
              <h3>변환된 음원</h3>
              <audio src={convertedUrl} controls />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Test;
