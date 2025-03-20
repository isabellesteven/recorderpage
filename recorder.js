let audioChunks = [];
let mediaRecorder;

async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            audioChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        audioChunks = [];
        const processedBlob = await convertToMono16Bit16KHz(audioBlob);
        await transcribeAudio(processedBlob);
    };

    mediaRecorder.start();
    console.log("Recording started...");
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
        console.log("Recording stopped...");
    }
}

// Convert recorded audio to Mono, 16-bit PCM, 16 kHz
async function convertToMono16Bit16KHz(audioBlob) {
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Create a mono buffer (use only one channel)
    const monoBuffer = audioContext.createBuffer(1, audioBuffer.length, 16000);
    monoBuffer.copyToChannel(audioBuffer.getChannelData(0), 0);

    // Convert to PCM WAV format
    return encodeWAV(monoBuffer);
}

// Convert AudioBuffer to 16-bit PCM WAV Blob
function encodeWAV(audioBuffer) {
    const numChannels = 1;
    const sampleRate = 16000;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const dataLength = audioBuffer.length * numChannels * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    // WAV Header
    writeString(view, 0, "RIFF"); 
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true); 
    view.setUint16(20, 1, true); 
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, "data");
    view.setUint32(40, dataLength, true);

    // PCM Data
    const floatData = audioBuffer.getChannelData(0);
    let offset = 44;
    for (let i = 0; i < floatData.length; i++, offset += 2) {
        const sample = Math.max(-1, Math.min(1, floatData[i])); // Clamp between -1 and 1
        view.setInt16(offset, sample * 32767, true);
    }

    return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// Send processed audio to OpenAI for transcription
async function transcribeAudio(audioBlob) {
    const apiKey = "YOUR_OPENAI_API_KEY"; // Replace with your OpenAI API key
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.wav");
    formData.append("model", "whisper-1");

    try {
        const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`
            },
            body: formData
        });

        const result = await response.json();
        console.log("Transcription:", result.text);
        document.getElementById("output").textContent = result.text;
    } catch (error) {
        console.error("Error transcribing audio:", error);
    }
}

// UI buttons
document.getElementById("startBtn").addEventListener("click", startRecording);
document.getElementById("stopBtn").addEventListener("click", stopRecording);
