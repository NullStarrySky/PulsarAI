export class WebAudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("当前环境不支持录音功能。");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioChunks = [];

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";

    this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };
    this.mediaRecorder.start(100);
  }

  async stop(): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error("录音尚未启动。"));
        return;
      }
      this.mediaRecorder.onstop = async () => {
        try {
          const blob = new Blob(this.audioChunks, {
            type: this.mediaRecorder?.mimeType || "audio/webm",
          });
          const arrayBuffer = await blob.arrayBuffer();
          this.mediaRecorder?.stream.getTracks().forEach((track) => track.stop());
          this.mediaRecorder = null;
          this.audioChunks = [];
          resolve(new Uint8Array(arrayBuffer));
        } catch (error) {
          reject(error);
        }
      };
      this.mediaRecorder.stop();
    });
  }

  cancel(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
  }
}
