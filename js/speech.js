// Speech layer — only free, built-in browser/OS capabilities. Three separate things:
//  1. Text-to-speech  : speechSynthesis with the device's Dutch voice (offline if the voice is installed).
//  2. Speech-to-text  : the browser's SpeechRecognition (Chrome/Edge). On most Android phones the audio
//                       is processed by the browser vendor's online service; it needs internet unless an
//                       on-device Dutch language pack is installed. Not available in Firefox.
//  3. Voice recording : MediaRecorder, kept in memory only, for shadowing playback. Never uploaded.
// Pronunciation is NOT scored anywhere: a transcript cannot measure pronunciation.

const synth = window.speechSynthesis;
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let voicesCache = [];
const loadVoices = () => { voicesCache = synth ? synth.getVoices() : []; };
if (synth) { loadVoices(); synth.addEventListener?.('voiceschanged', loadVoices); }

export const tts = {
  supported: !!synth,
  dutchVoices: () => voicesCache.filter((v) => /^nl([-_]|$)/i.test(v.lang)),
  voice() {
    const nl = this.dutchVoices();
    return nl.find((v) => /nl[-_]NL/i.test(v.lang) && v.localService) || nl.find((v) => /nl[-_]NL/i.test(v.lang)) || nl[0] || null;
  },
  /** Speak Dutch text. Resolves when finished (or immediately when TTS is unavailable). */
  speak(text, { rate = 1, pitch = 1 } = {}) {
    return new Promise((resolve) => {
      if (!synth) return resolve(false);
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[\[\]]/g, ''));
      const v = this.voice();
      if (v) u.voice = v;
      u.lang = v?.lang || 'nl-NL'; u.rate = rate; u.pitch = pitch;
      const done = () => { clearTimeout(guard); resolve(true); };
      // Safety net: some engines never fire "end".
      const guard = setTimeout(done, 4000 + text.length * 140 / rate);
      u.onend = done; u.onerror = done;
      synth.speak(u);
    });
  },
  stop: () => synth?.cancel(),
};

export const stt = {
  supported: !!Recognition,
  /**
   * Start listening. Returns { stop(): Promise<string> }.
   * Single-utterance sessions are restarted until stop() — this avoids the duplicated-text bug of
   * continuous mode on Android Chrome and allows long answers with pauses.
   */
  listen({ onText, onError } = {}) {
    let finals = '', interim = '', stopped = false, rec, resolveStop;
    const emit = () => onText?.((finals + ' ' + interim).trim());
    const start = () => {
      rec = new Recognition();
      rec.lang = 'nl-NL'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) finals = (finals + ' ' + t).trim(); else interim += t;
        }
        emit();
      };
      rec.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        stopped = true; onError?.(e.error);
      };
      rec.onend = () => {
        if (interim) { finals = (finals + ' ' + interim).trim(); interim = ''; emit(); }
        if (stopped) resolveStop?.(finals); else { try { start(); } catch { resolveStop?.(finals); } }
      };
      rec.start();
    };
    start();
    return {
      stop: () => new Promise((res) => {
        if (stopped) return res(finals);
        stopped = true; resolveStop = res;
        try { rec.stop(); } catch { res(finals); }
        setTimeout(() => res(finals), 1500);
      }),
    };
  },
};

export const STT_ERRORS = {
  'not-allowed': 'Geen toegang tot de microfoon. Sta de microfoon toe in de browserinstellingen.',
  'service-not-allowed': 'Spraakherkenning is op dit toestel geblokkeerd of niet beschikbaar.',
  network: 'Spraakherkenning heeft nu internet nodig. Typ je antwoord of probeer het later opnieuw.',
  'audio-capture': 'Geen microfoon gevonden.',
  'language-not-supported': 'Nederlands wordt door de spraakherkenning op dit toestel niet ondersteund.',
};

/** In-memory voice recorder for shadowing. Nothing is stored or sent anywhere. */
export const recorder = {
  supported: !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder),
  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => chunks.push(e.data);
    mr.start();
    return {
      stop: () => new Promise((res) => {
        mr.onstop = () => { stream.getTracks().forEach((t) => t.stop()); res(URL.createObjectURL(new Blob(chunks, { type: mr.mimeType }))); };
        mr.stop();
      }),
    };
  },
};
