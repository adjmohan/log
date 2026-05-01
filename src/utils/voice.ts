class VoiceService {
  private synth: SpeechSynthesis | null = null;
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    this.synth = window.speechSynthesis;
    this.loadVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => this.loadVoices();
    }
  }

  private loadVoices() {
    if (!this.synth) return;

    const voices = this.synth.getVoices();
    // Try to find a good English voice
    this.voice = voices.find(v => v.lang.includes('en-US') && v.name.includes('Google')) ||
                 voices.find(v => v.lang.includes('en')) ||
                 voices[0];
  }

  speak(text: string) {
    if (!this.synth) return;

    if (this.synth.speaking) {
      this.synth.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(text);
    if (this.voice) {
      utterance.voice = this.voice;
    }
    utterance.rate = 1;
    utterance.pitch = 1;
    this.synth.speak(utterance);
  }
}

export const voice = new VoiceService();
