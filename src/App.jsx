import React, { useState } from "react";
import Recorder from "./components/Recorder";
import Converter from "./components/Converter";

function App() {
  const [recordedUrl, setRecordedUrl] = useState(null);

  return (
    <div className="App">
      <h1>Magenta.js 기반 음성 변환 데모</h1>
      <Recorder onRecordingComplete={(url) => setRecordedUrl(url)} />
      {recordedUrl && <Converter recordedUrl={recordedUrl} />}
    </div>
  );
}

export default App;
