import React, { useState, useRef } from "react";

const Recorder = ({ onRecordingComplete }) => {
  const [recording, setRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/wav",
        });
        const url = URL.createObjectURL(audioBlob);
        setRecordedUrl(url);
        onRecordingComplete(url);
      };

      mediaRecorderRef.current.start();
      setRecording(true);
    } catch (err) {
      console.error("녹음 시작 오류:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  return (
    <div>
      <button onClick={recording ? stopRecording : startRecording}>
        {recording ? "녹음 중지" : "녹음 시작"}
      </button>
      {recordedUrl && (
        <div>
          <h3>녹음된 음성 재생</h3>
          <audio src={recordedUrl} controls />
        </div>
      )}
    </div>
  );
};

export default Recorder;
