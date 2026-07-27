(() => {
  "use strict";

  /**
   * Waitlist backend config.
   * Plug in a real endpoint (Formspree, Getwaitlist, a Supabase edge function,
   * your own API, etc). Until WAITLIST_ENDPOINT is set, signups are stored
   * locally in the browser so the form is fully demoable out of the box.
   * See README.md for step-by-step instructions on wiring a real backend.
   */
  const WAITLIST_ENDPOINT = ""; // e.g. "https://formspree.io/f/xxxxxxx"
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
})();
