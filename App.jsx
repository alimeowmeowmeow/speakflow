import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, Square, ChevronLeft, Flame, TrendingUp, Type, Sparkles } from "lucide-react";

/* ============================================================
   SpeakFlow — English speaking-fluency companion (MVP)
   Design notes (for future-me / future passes):
   - Palette: warm graphite dark, not pure black. Accent "current"
     (teal) = flow/conversation. "ember" (soft amber) = warmth/streak.
     Avoided cream+serif+terracotta and neon-on-black defaults.
   - Signature element: the "breath orb" — a slow pulsing gradient
     circle. Dormant on Home, active during Session (fills when AI
     speaks, rings when it's the user's turn). Ties visually to the
     idea of steadying your breathing before/while speaking.
   - Fonts: Instrument Serif (display, used sparingly, italic warmth)
     + Inter (body/UI) + IBM Plex Mono (numbers: timer, streak, counts).
   ============================================================ */

const TOPICS = [
  "a trip or weekend that stuck with you",
  "a hobby you've picked up or want to try",
  "your honest opinion on remote work",
  "a book, show, or film you actually enjoyed",
  "a goal you're working toward this year",
  "food — something you love cooking or eating",
  "a hard decision you had to make",
  "a cultural difference that surprised you",
  "a memorable story from traveling",
  "how technology has changed your daily life",
  "a person who influenced how you think",
  "something you changed your mind about recently",
];

const STORAGE_KEY = "speakflow-data";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function dateStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
function startOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function isThisWeek(iso) {
  const d = new Date(iso);
  return d >= startOfWeek();
}
function computeStreak(sessions) {
  const days = new Set(
    sessions.filter((s) => s.type === "ai_session").map((s) => s.date)
  );
  let streak = 0;
  let cur = new Date();
  while (true) {
    const key = dateStr(cur);
    if (days.has(key)) {
      streak += 1;
      cur.setDate(cur.getDate() - 1);
    } else if (streak === 0 && key === dateStr(new Date())) {
      // today has no session yet — check yesterday to keep an active streak alive
      cur.setDate(cur.getDate() - 1);
      if (!days.has(dateStr(cur))) break;
    } else {
      break;
    }
  }
  return streak;
}
function normalizeCategory(s) {
  return (s || "").trim().toLowerCase();
}
function aggregateWeakSpots(sessions) {
  const counts = new Map();
  sessions.forEach((s) => {
    (s.recurringErrors || []).forEach((e) => {
      const key = normalizeCategory(e.category || e.issue);
      if (!key) return;
      const prev = counts.get(key) || { category: e.category || e.issue, issue: e.issue, count: 0 };
      prev.count += 1;
      prev.issue = e.issue || prev.issue;
      counts.set(key, prev);
    });
  });
  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}

// Talks to our own /api/chat serverless function (see /api/chat.js), which
// holds the real Anthropic API key server-side. The browser never sees the
// key — this is the only safe way to call the API from a deployed site.
async function callClaude({ system, messages, jsonMode = false }) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, messages }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const text = (data.text || "").trim();
  if (jsonMode) {
    const cleaned = text.replace(/```json|```/g, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {}
      }
      return null;
    }
  }
  return text;
}

/* ---------- persistence ----------
   Real localStorage, since this now runs as a normal top-level page
   (not inside the artifact sandbox) — data stays on this device only. */
function useSpeakFlowData() {
  const [data, setData] = useState(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : { sessions: [] };
    } catch {
      return { sessions: [] };
    }
  });

  const addSession = useCallback(
    (session) => {
      setData((prev) => {
        const next = { ...prev, sessions: [...prev.sessions, session] };
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    []
  );

  return { data, loaded: true, addSession };
}

/* ---------- breath orb (signature element) ---------- */
function BreathOrb({ state = "idle", size = 120 }) {
  // state: idle | listening | speaking
  const color =
    state === "speaking" ? "#6FB3AA" : state === "listening" ? "#E3A868" : "#3A4048";
  const glow =
    state === "speaking"
      ? "0 0 60px 10px rgba(111,179,170,0.35)"
      : state === "listening"
      ? "0 0 40px 8px rgba(227,168,104,0.28)"
      : "0 0 24px 4px rgba(58,64,72,0.25)";
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        margin: "0 auto",
        background: `radial-gradient(circle at 35% 30%, ${color}55, ${color}15 60%, transparent 75%)`,
        border: `1.5px solid ${color}88`,
        boxShadow: glow,
        transition: "box-shadow 0.6s ease, border-color 0.6s ease",
        animation:
          state === "idle"
            ? "sf-breathe 4.2s ease-in-out infinite"
            : state === "listening"
            ? "sf-breathe 1.8s ease-in-out infinite"
            : "sf-breathe 1.1s ease-in-out infinite",
      }}
    />
  );
}

/* ---------- shared UI atoms ---------- */
function Screen({ children }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#14171C",
        color: "#EDEFF2",
        fontFamily: "'Inter', -apple-system, sans-serif",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 430,
          minHeight: "100dvh",
          padding: "env(safe-area-inset-top, 28px) 22px calc(env(safe-area-inset-bottom, 20px) + 20px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
    </div>
  );
}
function TopBar({ title, onBack }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 26, minHeight: 30 }}>
      {onBack && (
        <button onClick={onBack} style={iconBtnStyle} aria-label="Back">
          <ChevronLeft size={20} color="#8B93A1" />
        </button>
      )}
      <span style={{ fontSize: 15, color: "#8B93A1", letterSpacing: 0.3 }}>{title}</span>
    </div>
  );
}
const iconBtnStyle = {
  background: "none",
  border: "none",
  padding: 4,
  display: "flex",
  cursor: "pointer",
};
const cardStyle = {
  background: "#1D2128",
  borderRadius: 18,
  padding: "20px 18px",
  border: "1px solid #262B33",
};
const primaryBtnStyle = {
  background: "#6FB3AA",
  color: "#0F1215",
  border: "none",
  borderRadius: 999,
  padding: "18px 24px",
  fontSize: 17,
  fontWeight: 600,
  width: "100%",
  cursor: "pointer",
  fontFamily: "'Inter', sans-serif",
};
const secondaryBtnStyle = {
  background: "transparent",
  color: "#EDEFF2",
  border: "1px solid #33393F",
  borderRadius: 999,
  padding: "14px 22px",
  fontSize: 15,
  fontWeight: 500,
  width: "100%",
  cursor: "pointer",
  fontFamily: "'Inter', sans-serif",
};

/* ============================================================
   HOME
   ============================================================ */
function Home({ sessions, onStart, onLiveClub, onProgress, onWeakSpots }) {
  const week = sessions.filter((s) => isThisWeek(s.date));
  const aiThisWeek = week.filter((s) => s.type === "ai_session").length;
  const clubThisWeek = week.filter((s) => s.type === "live_club").length;
  const streak = computeStreak(sessions);
  const last = [...sessions].reverse().find((s) => typeof s.easeScore === "number");

  return (
    <Screen>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 34 }}>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontStyle: "italic",
              fontSize: 34,
              color: "#EDEFF2",
              marginBottom: 6,
            }}
          >
            SpeakFlow
          </div>
          <div style={{ fontSize: 14, color: "#8B93A1" }}>steady, real, in English</div>
        </div>

        <BreathOrb state="idle" size={104} />

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button style={primaryBtnStyle} onClick={onStart}>
            Start 30-min Speaking
          </button>
          <button style={secondaryBtnStyle} onClick={onLiveClub}>
            Debrief Live Club
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={cardStyle}>
            <div style={statLabel}>AI sessions</div>
            <div style={statValue}>{aiThisWeek}</div>
            <div style={statSub}>this week</div>
          </div>
          <div style={cardStyle}>
            <div style={statLabel}>Live clubs</div>
            <div style={statValue}>{clubThisWeek}</div>
            <div style={statSub}>this week</div>
          </div>
          <div style={cardStyle}>
            <div style={{ ...statLabel, display: "flex", alignItems: "center", gap: 5 }}>
              <Flame size={13} color="#E3A868" /> Streak
            </div>
            <div style={statValue}>{streak}</div>
            <div style={statSub}>{streak === 1 ? "day" : "days"}</div>
          </div>
          <div style={cardStyle}>
            <div style={statLabel}>Ease of speaking</div>
            <div style={statValue}>{last ? last.easeScore : "—"}</div>
            <div style={statSub}>{last ? "latest" : "no data yet"}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 22, paddingTop: 18 }}>
        <button onClick={onProgress} style={linkStyle}>
          Progress
        </button>
        <button onClick={onWeakSpots} style={linkStyle}>
          Weak spots
        </button>
      </div>
    </Screen>
  );
}
const statLabel = { fontSize: 12, color: "#8B93A1", marginBottom: 8 };
const statValue = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 26,
  color: "#EDEFF2",
  fontWeight: 500,
};
const statSub = { fontSize: 11.5, color: "#5C636D", marginTop: 2 };
const linkStyle = {
  background: "none",
  border: "none",
  color: "#8B93A1",
  fontSize: 13.5,
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: 3,
  textDecorationColor: "#33393F",
};

/* ============================================================
   SPEAKING SESSION
   ------------------------------------------------------------
   Single shared pipeline: submitUserMessage(text) is the only
   path that ever talks to the AI. Both the typed Send button and
   the voice recognition's final-result callback call it — there
   is no separate "voice conversation logic". Text-to-speech is
   fire-and-forget: it never blocks the pipeline, because relying
   on the browser's speechSynthesis "onend" event to always fire
   is not safe (some browsers/webviews never fire it, which used
   to hang the whole conversation waiting for it).
   ============================================================ */
function SpeakingSession({ weakSpots, onEnd, onExit }) {
  const [topic] = useState(() => TOPICS[Math.floor(Math.random() * TOPICS.length)]);
  const [seconds, setSeconds] = useState(0);

  // conversation state
  const [aiThinking, setAiThinking] = useState(true); // true while waiting on the API
  const [aiSpeakingVisual, setAiSpeakingVisual] = useState(false); // cosmetic only, from TTS
  const [lastLine, setLastLine] = useState({ who: null, text: "" });

  // voice input state
  const [useVoice, setUseVoice] = useState(true);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [recordingState, setRecordingState] = useState("idle"); // idle | requesting | recording
  const [liveText, setLiveText] = useState("");
  const [micError, setMicError] = useState("");

  // typed input state
  const [typedInput, setTypedInput] = useState("");

  const transcriptRef = useRef([]); // {role, content}[] — sent to the API
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const submitRef = useRef(() => {}); // always holds the latest submitUserMessage

  const weakSpotList = weakSpots
    .filter((w) => w.count >= 2)
    .slice(0, 4)
    .map((w) => w.category)
    .join(", ");

  const system = `You are a warm, genuinely curious English conversation partner helping a B1-to-B2 learner get comfortable holding a real 30-40 minute conversation with a new person. Rules you always follow:
- Speak only in natural, spoken-style English. No Russian, ever.
- Priority order: fluency first, confidence second, accuracy last. NEVER correct grammar or pronunciation during the conversation, even if you notice mistakes — just keep the conversation flowing naturally. Corrections happen later, in the debrief, not here.
- Keep your own turns short and natural, like real speech: 1-3 sentences, then usually one genuine follow-up question.
- Respond to what the user actually said — refer back to specific things they mentioned earlier when it fits naturally. Avoid generic, repetitive questions.
- Push gently for depth: ask for opinions, stories, comparisons, and reasons ("why do you think that", "how did that compare to...", "what would you have done instead"). Don't let answers stay shallow small talk.
- Start around B1-B2 difficulty and adapt gradually to how the user is doing.
- If the user seems to be searching for a word, first encourage them to paraphrase or describe it, and only if they're still stuck, offer one natural expression.
- Weave in natural opportunities (without announcing it) to use these areas the user has struggled with before, if it fits naturally: ${weakSpotList || "(none yet)"}.
- Today's topic to explore together: ${topic}. Open with a short, friendly, specific question about it — don't just say "let's talk about X".`;

  /* ---- timer ---- */
  useEffect(() => {
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  /* ---- the one shared conversation pipeline ---- */
  const submitUserMessage = useCallback(
    async (rawText) => {
      const text = (rawText || "").trim();
      if (!text) return; // guards empty transcription / empty typed submit
      if (aiThinking) return; // guards duplicate/overlapping submission

      setMicError("");
      setLiveText("");
      setLastLine({ who: "user", text });
      const updated = [...transcriptRef.current, { role: "user", content: text }];
      transcriptRef.current = updated;
      setAiThinking(true);

      try {
        const reply = await callClaude({ system, messages: updated });
        const replyText = reply || "Sorry, could you say that again?";
        transcriptRef.current = [...transcriptRef.current, { role: "assistant", content: replyText }];
        setLastLine({ who: "ai", text: replyText });
        speakAloud(replyText);
      } catch {
        setLastLine({ who: "ai", text: "Sorry — I had trouble responding there. Could you try again?" });
      } finally {
        setAiThinking(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aiThinking, system]
  );
  useEffect(() => {
    submitRef.current = submitUserMessage;
  }, [submitUserMessage]);

  /* ---- text-to-speech: cosmetic, non-blocking, never hangs the pipeline ---- */
  function speakAloud(text) {
    if (!window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "en-US";
      utter.rate = 0.98;
      const voices = window.speechSynthesis.getVoices();
      const enVoice = voices.find((v) => v.lang === "en-US") || voices.find((v) => v.lang?.startsWith("en"));
      if (enVoice) utter.voice = enVoice;
      setAiSpeakingVisual(true);
      utter.onend = () => setAiSpeakingVisual(false);
      utter.onerror = () => setAiSpeakingVisual(false);
      window.speechSynthesis.speak(utter);
      // safety net — some browsers/webviews never fire onend
      setTimeout(() => setAiSpeakingVisual(false), Math.min(16000, 1200 + text.length * 70));
    } catch {
      setAiSpeakingVisual(false);
    }
  }

  /* ---- speech recognition setup (runs once) ---- */
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setVoiceSupported(false);
      setUseVoice(false);
    } else {
      const rec = new SR();
      rec.lang = "en-US";
      rec.continuous = false;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let interim = "";
        let final = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) final += e.results[i][0].transcript;
          else interim += e.results[i][0].transcript;
        }
        setLiveText(interim);
        if (final.trim()) {
          setLiveText("");
          submitRef.current(final.trim());
        }
      };
      rec.onerror = (e) => {
        setRecordingState("idle");
        setLiveText("");
        const reason =
          e.error === "not-allowed" || e.error === "permission-denied"
            ? "Microphone access was denied. Allow it in your browser settings, or type instead."
            : e.error === "no-speech"
            ? "Didn't catch that — try again, or type instead."
            : e.error === "audio-capture"
            ? "No microphone found. Try typing instead."
            : "Recording stopped unexpectedly. Try again, or type instead.";
        setMicError(reason);
      };
      rec.onend = () => {
        // always resets, so the user can record again no matter how it ended
        setRecordingState("idle");
        setLiveText("");
      };
      recognitionRef.current = rec;
    }

    // kick off the conversation — the AI opens with the first question
    (async () => {
      setAiThinking(true);
      try {
        const reply = await callClaude({
          system,
          messages: [{ role: "user", content: "(start the conversation now)" }],
        });
        const replyText = reply || "Hi! Good to talk with you today — what's been on your mind lately?";
        transcriptRef.current = [{ role: "assistant", content: replyText }];
        setLastLine({ who: "ai", text: replyText });
        speakAloud(replyText);
      } catch {
        const fallback = "Hi! Good to talk with you today — what's been on your mind lately?";
        transcriptRef.current = [{ role: "assistant", content: fallback }];
        setLastLine({ who: "ai", text: fallback });
      } finally {
        setAiThinking(false);
      }
    })();

    return () => {
      try {
        recognitionRef.current && recognitionRef.current.stop();
      } catch {}
      window.speechSynthesis && window.speechSynthesis.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- recording controls ---- */
  async function startRecording() {
    if (recordingState !== "idle" || aiThinking) return; // already active / not ready
    setMicError("");
    if (!recognitionRef.current) {
      setMicError("Voice input isn't supported in this browser — type instead.");
      return;
    }
    setRecordingState("requesting");
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch (err) {
      setRecordingState("idle");
      setMicError(
        err && err.name === "NotAllowedError"
          ? "Microphone access was denied. Allow it in your browser settings, or type instead."
          : "Couldn't access the microphone. Try typing instead."
      );
      return;
    }
    try {
      recognitionRef.current.start();
      setRecordingState("recording");
    } catch {
      setRecordingState("idle");
      setMicError("Recording couldn't start — try again in a moment.");
    }
  }
  function stopRecording() {
    if (recordingState !== "recording" || !recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {
      setRecordingState("idle");
    }
  }
  function submitTyped() {
    const t = typedInput.trim();
    if (!t || aiThinking) return;
    setTypedInput("");
    submitUserMessage(t);
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const orbState = aiSpeakingVisual ? "speaking" : recordingState === "recording" ? "listening" : "idle";
  const statusLabel = aiThinking
    ? "thinking…"
    : recordingState === "requesting"
    ? "requesting microphone…"
    : recordingState === "recording"
    ? "listening…"
    : aiSpeakingVisual
    ? "speaking"
    : lastLine.who === "user"
    ? "you said"
    : "your turn";

  return (
    <Screen>
      <TopBar title={topic} onBack={onExit} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, color: "#5C636D" }}>
          {mm}:{ss}
        </div>

        <BreathOrb state={orbState} size={160} />

        <div style={{ minHeight: 70, textAlign: "center", maxWidth: 340 }}>
          <div
            style={{
              fontSize: 12,
              color: recordingState === "recording" ? "#E3A868" : "#5C636D",
              marginBottom: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {recordingState === "recording" && (
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#E3A868",
                  display: "inline-block",
                  animation: "sf-blink 1s ease-in-out infinite",
                }}
              />
            )}
            {statusLabel}
          </div>
          <div style={{ fontSize: 16, lineHeight: 1.5, color: liveText ? "#8B93A1" : "#EDEFF2" }}>
            {liveText || lastLine.text}
          </div>
        </div>

        {micError && (
          <div
            style={{
              width: "100%",
              background: "#2A2020",
              border: "1px solid #4A2E2E",
              color: "#E3A0A0",
              fontSize: 12.5,
              borderRadius: 10,
              padding: "10px 12px",
              textAlign: "center",
            }}
          >
            {micError}
          </div>
        )}

        {useVoice ? (
          <button
            onClick={recordingState === "recording" ? stopRecording : startRecording}
            disabled={aiThinking || recordingState === "requesting"}
            style={{
              width: 68,
              height: 68,
              borderRadius: "50%",
              border: "none",
              background: recordingState === "recording" ? "#E3A868" : "#6FB3AA",
              opacity: aiThinking || recordingState === "requesting" ? 0.4 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: aiThinking || recordingState === "requesting" ? "default" : "pointer",
            }}
            aria-label={recordingState === "recording" ? "Stop recording" : "Start recording"}
          >
            {recordingState === "recording" ? <Square size={24} color="#0F1215" /> : <Mic size={26} color="#0F1215" />}
          </button>
        ) : (
          <div style={{ width: "100%", display: "flex", gap: 8 }}>
            <input
              value={typedInput}
              onChange={(e) => setTypedInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitTyped()}
              placeholder="Type your reply…"
              disabled={aiThinking}
              style={{
                flex: 1,
                background: "#1D2128",
                border: "1px solid #262B33",
                borderRadius: 12,
                padding: "12px 14px",
                color: "#EDEFF2",
                fontSize: 15,
                opacity: aiThinking ? 0.6 : 1,
              }}
            />
            <button
              onClick={submitTyped}
              disabled={aiThinking || !typedInput.trim()}
              style={{ ...primaryBtnStyle, width: "auto", padding: "0 18px", opacity: aiThinking || !typedInput.trim() ? 0.5 : 1 }}
            >
              Send
            </button>
          </div>
        )}

        {voiceSupported && (
          <button
            onClick={() => {
              setMicError("");
              setUseVoice((v) => !v);
            }}
            style={{ ...linkStyle, display: "flex", alignItems: "center", gap: 5 }}
          >
            {useVoice ? <Type size={13} /> : <Mic size={13} />}
            {useVoice ? "switch to typing" : "switch to voice"}
          </button>
        )}
        {!voiceSupported && (
          <div style={{ fontSize: 11.5, color: "#5C636D", textAlign: "center" }}>
            Voice input isn't available in this browser — typing instead.
          </div>
        )}
      </div>

      <button
        style={{ ...secondaryBtnStyle, marginTop: 16 }}
        onClick={() => onEnd({ topic, seconds, transcript: transcriptRef.current })}
      >
        End session
      </button>

      <style>{`
        @keyframes sf-breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes sf-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
      `}</style>
    </Screen>
  );
}

/* ============================================================
   SESSION DEBRIEF
   ============================================================ */
function SessionDebrief({ session, onSave, onExit }) {
  const [step, setStep] = useState("rate"); // rate | generating | result
  const [ease, setEase] = useState(6);
  const [hardest, setHardest] = useState("");
  const [result, setResult] = useState(null);

  async function generate() {
    setStep("generating");
    const transcriptText = session.transcript
      .map((t) => `${t.role === "assistant" ? "AI" : "User"}: ${t.content}`)
      .join("\n");
    const system = `You analyze an English speaking practice transcript for a B1-to-B2 learner. Be direct and specific, not diplomatic. Return ONLY valid JSON, no prose, no markdown fences, matching exactly this shape:
{"corrections": [{"issue": "short natural-language description of the mistake, quoting what they said if useful", "category": "2-4 word category label, consistent wording you'd reuse across sessions e.g. 'past tense irregulars', 'articles a/the', 'prepositions of time'"}], "phrases": ["natural phrase or expression they could use next time", "..."], "nextFocus": "one specific, concrete focus for the next session, one sentence"}
Rules: corrections array has AT MOST 3 items — pick only the most important recurring or fluency-blocking ones, ignore minor one-off slips. phrases array has 3 to 5 natural, spoken-register phrases relevant to what they were actually talking about. Never invent mistakes that aren't in the transcript.`;
    const userMsg = `Transcript:\n${transcriptText}\n\nThe user said speaking felt this hard today (1-10): ${ease}\nWhat felt hardest, in their words: "${hardest || "(not specified)"}"`;
    const data = await callClaude({ system, messages: [{ role: "user", content: userMsg }], jsonMode: true });
    setResult(
      data || {
        corrections: [],
        phrases: [],
        nextFocus: "Keep going — try to talk 20% longer before pausing.",
      }
    );
    setStep("result");
  }

  function save() {
    onSave({
      id: uid(),
      date: dateStr(),
      type: "ai_session",
      duration: session.seconds,
      easeScore: ease,
      topic: session.topic,
      hardest,
      recurringErrors: result.corrections || [],
      usefulPhrases: result.phrases || [],
      nextFocus: result.nextFocus || "",
    });
  }

  return (
    <Screen>
      <TopBar title="Debrief" onBack={onExit} />
      {step === "rate" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 30 }}>
          <div>
            <div style={{ fontSize: 16, marginBottom: 14 }}>How easy was speaking today?</div>
            <input
              type="range"
              min={1}
              max={10}
              value={ease}
              onChange={(e) => setEase(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#6FB3AA" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "#5C636D" }}>
              <span>hard</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 20, color: "#EDEFF2" }}>{ease}</span>
              <span>easy</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 16, marginBottom: 10 }}>What felt hardest?</div>
            <textarea
              value={hardest}
              onChange={(e) => setHardest(e.target.value)}
              placeholder="e.g. finding words fast enough, staying on topic…"
              rows={4}
              style={{
                width: "100%",
                background: "#1D2128",
                border: "1px solid #262B33",
                borderRadius: 12,
                padding: 14,
                color: "#EDEFF2",
                fontSize: 15,
                fontFamily: "inherit",
                resize: "none",
              }}
            />
          </div>
          <button style={primaryBtnStyle} onClick={generate}>
            See what to work on
          </button>
        </div>
      )}

      {step === "generating" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
          <BreathOrb state="listening" size={90} />
          <div style={{ color: "#8B93A1", fontSize: 14 }}>Looking back over the conversation…</div>
        </div>
      )}

      {step === "result" && result && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>
          <ResultBlock title="Worth fixing" items={result.corrections?.map((c) => c.issue)} empty="Nothing major — solid turn." />
          <ResultBlock title="Phrases to reuse" items={result.phrases} empty="No standout phrases this time." />
          <div style={cardStyle}>
            <div style={{ fontSize: 12, color: "#8B93A1", marginBottom: 8 }}>Next session, focus on</div>
            <div style={{ fontSize: 15, color: "#EDEFF2" }}>{result.nextFocus}</div>
          </div>
          <button
            style={primaryBtnStyle}
            onClick={() => {
              save();
            }}
          >
            Save & done
          </button>
        </div>
      )}
    </Screen>
  );
}
function ResultBlock({ title, items, empty }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, color: "#8B93A1", marginBottom: 10 }}>{title}</div>
      {!items || items.length === 0 ? (
        <div style={{ fontSize: 14, color: "#5C636D" }}>{empty}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((it, i) => (
            <div key={i} style={{ fontSize: 14.5, color: "#EDEFF2", lineHeight: 1.4 }}>
              · {it}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   LIVE CLUB DEBRIEF
   ============================================================ */
function LiveClubDebrief({ onSave, onExit }) {
  const [step, setStep] = useState("input");
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript + " ";
      setText(t.trim());
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    return () => {
      try {
        rec.stop();
      } catch {}
    };
  }, []);

  function toggleRecord() {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setListening(true);
      } catch {}
    }
  }

  async function generate() {
    setStep("generating");
    const system = `You analyze a short recap of a real, in-person English speaking club session for a B1-to-B2 learner. Return ONLY valid JSON, no prose, no markdown fences, matching exactly:
{"difficultMoments": ["short description of a moment that was hard"], "missingVocabulary": ["specific word or phrase they needed but didn't have"], "recurringMistakes": [{"issue": "short description", "category": "2-4 word category label, consistent wording e.g. 'past tense irregulars', 'articles a/the'"}], "nextFocus": "one specific, concrete focus for next practice, one sentence"}
Base everything strictly on what's in the recap below — don't invent details it doesn't contain. Keep each list to at most 5 items.`;
    const data = await callClaude({ system, messages: [{ role: "user", content: text }], jsonMode: true });
    setResult(data || { difficultMoments: [], missingVocabulary: [], recurringMistakes: [], nextFocus: "" });
    setStep("result");
  }

  function save() {
    onSave({
      id: uid(),
      date: dateStr(),
      type: "live_club",
      duration: null,
      easeScore: null,
      topic: null,
      hardest: (result.difficultMoments || []).join("; "),
      recurringErrors: result.recurringMistakes || [],
      usefulPhrases: [],
      missingVocabulary: result.missingVocabulary || [],
      nextFocus: result.nextFocus || "",
    });
  }

  return (
    <Screen>
      <TopBar title="Live Club Debrief" onBack={onExit} />
      {step === "input" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 15, color: "#8B93A1" }}>
            Describe how it went — what came up, what you struggled with, anything you wanted to say but couldn't.
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder="Type or record…"
            style={{
              flex: 1,
              background: "#1D2128",
              border: "1px solid #262B33",
              borderRadius: 14,
              padding: 16,
              color: "#EDEFF2",
              fontSize: 15,
              fontFamily: "inherit",
              resize: "none",
            }}
          />
          {recognitionRef.current && (
            <button
              onClick={toggleRecord}
              style={{ ...secondaryBtnStyle, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              {listening ? <Square size={15} color="#E3A868" /> : <Mic size={15} />}
              {listening ? "Stop recording" : "Record instead of typing"}
            </button>
          )}
          <button style={primaryBtnStyle} disabled={!text.trim()} onClick={generate}>
            Extract takeaways
          </button>
        </div>
      )}
      {step === "generating" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
          <BreathOrb state="listening" size={90} />
          <div style={{ color: "#8B93A1", fontSize: 14 }}>Pulling out the useful parts…</div>
        </div>
      )}
      {step === "result" && result && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
          <ResultBlock title="Difficult moments" items={result.difficultMoments} empty="Nothing flagged." />
          <ResultBlock title="Missing vocabulary" items={result.missingVocabulary} empty="Nothing flagged." />
          <ResultBlock title="Recurring mistakes" items={result.recurringMistakes?.map((c) => c.issue)} empty="Nothing flagged." />
          <div style={cardStyle}>
            <div style={{ fontSize: 12, color: "#8B93A1", marginBottom: 8 }}>Next practice, focus on</div>
            <div style={{ fontSize: 15, color: "#EDEFF2" }}>{result.nextFocus}</div>
          </div>
          <button style={primaryBtnStyle} onClick={save}>
            Save & done
          </button>
        </div>
      )}
    </Screen>
  );
}

/* ============================================================
   PROGRESS
   ============================================================ */
function Progress({ sessions, onExit }) {
  const aiSessions = sessions.filter((s) => s.type === "ai_session");
  const clubSessions = sessions.filter((s) => s.type === "live_club");
  const easeTrend = aiSessions.filter((s) => typeof s.easeScore === "number").slice(-12);
  const weakSpots = aggregateWeakSpots(sessions).slice(0, 5);
  const activePhrases = Array.from(
    new Set(aiSessions.slice(-5).flatMap((s) => s.usefulPhrases || []))
  ).slice(0, 8);

  const w = 300,
    h = 70;
  const points = easeTrend.map((s, i) => {
    const x = easeTrend.length > 1 ? (i / (easeTrend.length - 1)) * w : w / 2;
    const y = h - (s.easeScore / 10) * h;
    return `${x},${y}`;
  });

  return (
    <Screen>
      <TopBar title="Progress" onBack={onExit} />
      <div style={{ display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={cardStyle}>
            <div style={statLabel}>AI sessions</div>
            <div style={statValue}>{aiSessions.length}</div>
            <div style={statSub}>total</div>
          </div>
          <div style={cardStyle}>
            <div style={statLabel}>Live clubs</div>
            <div style={statValue}>{clubSessions.length}</div>
            <div style={statSub}>total</div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ ...statLabel, display: "flex", alignItems: "center", gap: 5, marginBottom: 12 }}>
            <TrendingUp size={13} color="#6FB3AA" /> Ease of speaking
          </div>
          {easeTrend.length > 1 ? (
            <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
              <polyline points={points.join(" ")} fill="none" stroke="#6FB3AA" strokeWidth="2" />
            </svg>
          ) : (
            <div style={{ fontSize: 13.5, color: "#5C636D" }}>Not enough sessions yet to show a trend.</div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={{ ...statLabel, marginBottom: 12 }}>Recurring weak spots</div>
          {weakSpots.length === 0 ? (
            <div style={{ fontSize: 13.5, color: "#5C636D" }}>None yet.</div>
          ) : (
            weakSpots.map((w, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 14.5, padding: "6px 0", borderTop: i > 0 ? "1px solid #262B33" : "none" }}>
                <span>{w.category}</span>
                <span style={{ color: "#5C636D", fontFamily: "'IBM Plex Mono', monospace" }}>×{w.count}</span>
              </div>
            ))
          )}
        </div>

        <div style={cardStyle}>
          <div style={{ ...statLabel, marginBottom: 12 }}>Phrases in rotation</div>
          {activePhrases.length === 0 ? (
            <div style={{ fontSize: 13.5, color: "#5C636D" }}>None yet.</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {activePhrases.map((p, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 12.5,
                    background: "#262B33",
                    color: "#EDEFF2",
                    padding: "6px 10px",
                    borderRadius: 999,
                  }}
                >
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Screen>
  );
}

/* ============================================================
   WEAK SPOTS
   ============================================================ */
function WeakSpots({ sessions, onExit }) {
  const spots = aggregateWeakSpots(sessions);
  return (
    <Screen>
      <TopBar title="Weak Spots" onBack={onExit} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
        {spots.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: "center", color: "#5C636D", fontSize: 14 }}>
            Nothing tracked yet — this fills in after a few debriefs.
          </div>
        ) : (
          spots.map((s, i) => (
            <div key={i} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 15.5, color: "#EDEFF2" }}>{s.category}</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: "#8B93A1" }}>×{s.count}</div>
              </div>
              <div style={{ fontSize: 13, color: "#5C636D", marginTop: 6 }}>{s.issue}</div>
              {s.count >= 2 && (
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 10, fontSize: 12, color: "#E3A868" }}>
                  <Sparkles size={12} /> woven into your next sessions
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </Screen>
  );
}

/* ============================================================
   ROOT APP
   ============================================================ */
export default function App() {
  const { data, loaded, addSession } = useSpeakFlowData();
  const [screen, setScreen] = useState("home");
  const [activeSession, setActiveSession] = useState(null);

  if (!loaded) {
    return (
      <Screen>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <BreathOrb state="idle" size={80} />
        </div>
      </Screen>
    );
  }

  const weakSpots = aggregateWeakSpots(data.sessions);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@1&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        input[type=range] { height: 4px; border-radius: 4px; background: #262B33; }
        textarea:focus, input:focus, button:focus-visible { outline: 2px solid #6FB3AA; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; }
        }
      `}</style>

      {screen === "home" && (
        <Home
          sessions={data.sessions}
          onStart={() => setScreen("session")}
          onLiveClub={() => setScreen("liveclub")}
          onProgress={() => setScreen("progress")}
          onWeakSpots={() => setScreen("weakspots")}
        />
      )}

      {screen === "session" && (
        <SpeakingSession
          weakSpots={weakSpots}
          onExit={() => setScreen("home")}
          onEnd={(s) => {
            setActiveSession(s);
            setScreen("debrief");
          }}
        />
      )}

      {screen === "debrief" && activeSession && (
        <SessionDebrief
          session={activeSession}
          onExit={() => setScreen("home")}
          onSave={(record) => {
            addSession(record);
            setActiveSession(null);
            setScreen("home");
          }}
        />
      )}

      {screen === "liveclub" && (
        <LiveClubDebrief
          onExit={() => setScreen("home")}
          onSave={(record) => {
            addSession(record);
            setScreen("home");
          }}
        />
      )}

      {screen === "progress" && <Progress sessions={data.sessions} onExit={() => setScreen("home")} />}
      {screen === "weakspots" && <WeakSpots sessions={data.sessions} onExit={() => setScreen("home")} />}
    </>
  );
}
