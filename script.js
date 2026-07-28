(() => {
  "use strict";

  /**
   * Waitlist backend config.
   * Plug in a real endpoint (Formspree, Getwaitlist, a Supabase edge function,
   * your own API, etc). Until WAITLIST_ENDPOINT is set, signups are stored
   * locally in the browser so the form is fully demoable out of the box.
   * See README.md for step-by-step instructions on wiring a real backend.
   */
  const WAITLIST_ENDPOINT = "https://formspree.io/f/mnjelkga";
  const STORAGE_KEY = "autonoma_waitlist";
  const BASE_COUNT = 312; // starting "social proof" number shown before real signups

  document.getElementById("year").textContent = new Date().getFullYear();

  function getLocalSignups() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveLocalSignup(email) {
    const signups = getLocalSignups();
    if (!signups.includes(email)) {
      signups.push(email);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(signups));
    }
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  async function submitToEndpoint(email) {
    const res = await fetch(WAITLIST_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error("Request failed");
  }

  function wireForm(formId, noteId) {
    const form = document.getElementById(formId);
    const note = document.getElementById(noteId);
    if (!form) return;

    const input = form.querySelector("input[type='email']");
    const defaultNote = note.textContent;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = input.value.trim();

      input.classList.remove("invalid");
      if (!isValidEmail(email)) {
        input.classList.add("invalid");
        note.textContent = "Please enter a valid email address.";
        note.className = "form-note error";
        input.focus();
        return;
      }

      form.classList.add("is-loading");
      form.querySelector("button").disabled = true;

      try {
        if (WAITLIST_ENDPOINT) {
          await submitToEndpoint(email);
        } else {
          // Demo fallback: no backend configured yet.
          await new Promise((r) => setTimeout(r, 500));
        }
        saveLocalSignup(email);
        note.textContent = "You're on the list! We'll be in touch soon.";
        note.className = "form-note success";
        form.reset();
        updateWaitlistCount();
      } catch (err) {
        note.textContent = "Something went wrong. Please try again.";
        note.className = "form-note error";
      } finally {
        form.classList.remove("is-loading");
        form.querySelector("button").disabled = false;
        setTimeout(() => {
          note.textContent = defaultNote;
          note.className = "form-note";
        }, 6000);
      }
    });
  }

  function updateWaitlistCount() {
    const el = document.getElementById("waitlist-count");
    if (!el) return;
    const total = BASE_COUNT + getLocalSignups().length;
    el.textContent = total.toLocaleString();
  }

  function revealOnScroll() {
    const targets = document.querySelectorAll(".card, .step, .faq-item");
    targets.forEach((t) => t.setAttribute("data-reveal", ""));

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    targets.forEach((t) => observer.observe(t));
  }

  wireForm("waitlist-form-hero", "form-note-hero");
  wireForm("waitlist-form-main", "form-note-main");
  updateWaitlistCount();
  revealOnScroll();
  wireLiveDemo();
  wireTranscriptDemo();
})();

function wireTranscriptDemo() {
  const body = document.getElementById("transcript-body");
  const windowEl = document.getElementById("transcript-window");
  if (!body || !windowEl) return;

  const lines = [
    { role: "caller", label: "Caller", text: "Hi, my AC stopped cooling and it's getting pretty warm in here." },
    { role: "agent", label: "AI agent", text: "Sorry to hear that -- I can get a technician out to you. Can I grab your name and address?" },
    { role: "caller", label: "Caller", text: "John Smith, 123 Oak Street." },
    { role: "agent", label: "AI agent", text: "Got it, John. I have openings tomorrow 10am-12pm or 2-4pm -- which works better?" },
    { role: "caller", label: "Caller", text: "10 to 12 works great." },
    { role: "agent", label: "AI agent", text: "You're booked for 10am-12pm tomorrow. Sending a confirmation text now -- see you then!" },
  ];

  let hasPlayed = false;

  function playTranscript() {
    if (hasPlayed) return;
    hasPlayed = true;
    body.innerHTML = "";
    lines.forEach((line, i) => {
      setTimeout(() => {
        const el = document.createElement("div");
        el.className = `transcript-line ${line.role}`;
        el.innerHTML = `<span class="line-label">${line.label}</span>${line.text}`;
        body.appendChild(el);
        windowEl.scrollTop = windowEl.scrollHeight;
      }, i * 900);
    });
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          playTranscript();
          observer.disconnect();
        }
      });
    },
    { threshold: 0.4 }
  );
  observer.observe(windowEl);
}

function wireLiveDemo() {
  // Vapi's public key is safe to expose client-side by design (unlike the
  // private API key) -- it can only start calls against this assistant, not
  // manage the account. Get it from the Vapi dashboard: Settings -> API Keys.
  const VAPI_PUBLIC_KEY = "7b531751-6325-4faf-8c38-03b1186a7ed8";
  // This is the "Autonoma Website Demo" assistant -- deliberately separate from
  // the outbound cold-calling assistant. This one is built for an inbound,
  // invited visitor testing the product, not for cold-calling a prospect.
  const VAPI_ASSISTANT_ID = "ee51480a-f405-4f35-988f-4afabde7ad53";
  // @vapi-ai/web is built for bundlers and doesn't expose a browser global via
  // a plain <script> tag, so it's loaded here as an on-demand ES module
  // (jsDelivr auto-bundles the npm package into browser-ready ESM via +esm).
  const VAPI_SDK_URL = "https://cdn.jsdelivr.net/npm/@vapi-ai/web@2.6.1/+esm";

  const btn = document.getElementById("demo-call-btn");
  const status = document.getElementById("demo-status");
  if (!btn) return;

  if (VAPI_PUBLIC_KEY === "REPLACE_WITH_VAPI_PUBLIC_KEY") {
    status.textContent = "Demo not configured yet.";
    btn.disabled = true;
    btn.style.opacity = "0.6";
    return;
  }

  let vapi = null;
  let isCallActive = false;
  let isLoading = false;

  function setIdle(message) {
    isCallActive = false;
    btn.classList.remove("is-active");
    btn.querySelector(".btn-text").textContent = "Talk to our AI agent";
    status.textContent = message;
    status.className = "demo-status";
  }

  let lastEndedReason = null;

  async function ensureVapiLoaded() {
    if (vapi) return vapi;
    const mod = await import(VAPI_SDK_URL);
    // jsDelivr's +esm bundling of this package double-wraps the export --
    // mod.default is an object like { default: <actual Vapi class> }, not
    // the class itself, so a plain `new mod.default()` throws "not a
    // constructor". Unwrap one extra level when that's the shape we get.
    const Vapi = typeof mod.default === "function" ? mod.default : mod.default.default;
    if (typeof Vapi !== "function") {
      throw new Error("Vapi SDK failed to load correctly (unexpected export shape).");
    }
    vapi = new Vapi(VAPI_PUBLIC_KEY);

    vapi.on("call-start", () => {
      isCallActive = true;
      lastEndedReason = null;
      btn.classList.add("is-active");
      btn.querySelector(".btn-text").textContent = "End call";
      status.textContent = "Live -- speak naturally, it's listening.";
      status.className = "demo-status live";
    });

    vapi.on("call-end", (event) => {
      const reason = event && (event.endedReason || (event.call && event.call.endedReason));
      if (reason && reason.includes("did-not-receive-customer-audio")) {
        setIdle("Talk to our AI agent");
        status.textContent = "Connected, but your audio never reached us -- this usually means a firewall/VPN is blocking the call. Try a different network, or disable any VPN, then click again.";
        status.className = "demo-status error";
      } else {
        setIdle("Call ended. Click to talk again.");
      }
    });

    vapi.on("error", (e) => {
      setIdle("Talk to our AI agent");
      status.textContent = "Couldn't connect -- check microphone permissions and try again.";
      status.className = "demo-status error";
      console.error("Vapi error:", e);
    });

    return vapi;
  }

  async function confirmMicAccess() {
    // Explicitly resolve the mic permission prompt before handing off to
    // Vapi's WebRTC setup -- avoids a race where the call tries to start
    // before the browser has actually granted (or the user has responded
    // to) the microphone permission request.
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("This browser doesn't support microphone access.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  }

  btn.addEventListener("click", async () => {
    if (isLoading) return;

    if (isCallActive && vapi) {
      vapi.stop();
      return;
    }

    try {
      isLoading = true;
      status.textContent = "Requesting microphone access...";
      status.className = "demo-status";
      await confirmMicAccess();

      status.textContent = "Loading...";
      const instance = await ensureVapiLoaded();
      status.textContent = "Connecting...";
      await instance.start(VAPI_ASSISTANT_ID);
    } catch (e) {
      if (e && e.name === "NotAllowedError") {
        status.textContent = "Microphone access was blocked. Check your browser's site permissions (click the lock icon in the address bar) and allow microphone access, then try again.";
      } else if (e && e.name === "NotFoundError") {
        status.textContent = "No microphone was found on this device.";
      } else {
        status.textContent = "Couldn't connect -- " + (e && e.message ? e.message : "please try again.");
      }
      status.className = "demo-status error";
      console.error("Vapi start error:", e);
    } finally {
      isLoading = false;
    }
  });
}
