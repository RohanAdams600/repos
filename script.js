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
})();

function wireLiveDemo() {
  // Vapi's public key is safe to expose client-side by design (unlike the
  // private API key) -- it can only start calls against this assistant, not
  // manage the account. Get it from the Vapi dashboard: Settings -> API Keys.
  const VAPI_PUBLIC_KEY = "REPLACE_WITH_VAPI_PUBLIC_KEY";
  const VAPI_ASSISTANT_ID = "c70c81b5-bf40-4753-a528-3ebc859c6878";

  const btn = document.getElementById("demo-call-btn");
  const status = document.getElementById("demo-status");
  if (!btn || typeof Vapi === "undefined") return;

  if (VAPI_PUBLIC_KEY === "REPLACE_WITH_VAPI_PUBLIC_KEY") {
    status.textContent = "Demo not configured yet.";
    btn.disabled = true;
    btn.style.opacity = "0.6";
    return;
  }

  const vapi = new Vapi(VAPI_PUBLIC_KEY);
  let isCallActive = false;

  vapi.on("call-start", () => {
    isCallActive = true;
    btn.classList.add("is-active");
    btn.querySelector(".btn-text").textContent = "End call";
    status.textContent = "Live -- speak naturally, it's listening.";
    status.className = "demo-status live";
  });

  vapi.on("call-end", () => {
    isCallActive = false;
    btn.classList.remove("is-active");
    btn.querySelector(".btn-text").textContent = "Talk to our AI agent";
    status.textContent = "Call ended. Click to talk again.";
    status.className = "demo-status";
  });

  vapi.on("error", (e) => {
    isCallActive = false;
    btn.classList.remove("is-active");
    btn.querySelector(".btn-text").textContent = "Talk to our AI agent";
    status.textContent = "Couldn't connect -- check microphone permissions and try again.";
    status.className = "demo-status error";
    console.error("Vapi error:", e);
  });

  btn.addEventListener("click", () => {
    if (isCallActive) {
      vapi.stop();
    } else {
      status.textContent = "Connecting...";
      status.className = "demo-status";
      vapi.start(VAPI_ASSISTANT_ID);
    }
  });
}
