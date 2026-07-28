"use client";

import { useEffect, useRef, useState } from "react";
import type Vapi from "@vapi-ai/web";

type CallState = "idle" | "connecting" | "active" | "error";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
const DEMO_ASSISTANT_ID = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID_DEMO;
const isConfigured = Boolean(PUBLIC_KEY && DEMO_ASSISTANT_ID);

/**
 * Explicitly resolves the mic permission prompt before handing off to
 * Vapi's WebRTC setup. Without this, the call can start before the
 * browser has actually granted (or the user has responded to) the mic
 * permission request — a real race condition found and fixed the hard
 * way on this project's other demo-widget iteration (see git history on
 * `main`, PR #7). The stream is stopped immediately after — this call is
 * only here to force-resolve the permission prompt; Vapi's own WebRTC
 * setup acquires its own stream once the call actually starts.
 */
async function confirmMicAccess(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser doesn't support microphone access.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => track.stop());
}

function messageStyleErrorFor(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError") {
      return "Microphone access was blocked. Check your browser's site permissions (the lock icon in the address bar) and allow microphone access, then try again.";
    }
    if (err.name === "NotFoundError") {
      return "No microphone was found on this device.";
    }
  }
  const message = err instanceof Error ? err.message : "";
  return message ? `Couldn't connect — ${message}` : "Couldn't connect — try again.";
}

export function VoiceDemo() {
  const [state, setState] = useState<CallState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const vapiRef = useRef<Vapi | null>(null);

  useEffect(() => {
    return () => {
      // Never leave a live mic open behind — hang up if this unmounts mid-call.
      vapiRef.current?.stop();
    };
  }, []);

  async function startCall() {
    if (!isConfigured) return;
    setErrorMessage("");
    setState("connecting");

    try {
      await confirmMicAccess();

      const { default: VapiClient } = await import("@vapi-ai/web");
      const vapi = new VapiClient(PUBLIC_KEY!);
      vapiRef.current = vapi;

      vapi.on("call-start", () => setState("active"));

      vapi.on("call-end", () => setState("idle"));

      // Vapi's Web SDK reports the end-of-call reason via a 'message'
      // event (type: 'end-of-call-report'), not on 'call-end' itself.
      // The most common silent-failure case is the call connecting but
      // audio never reaching Vapi (usually a firewall/VPN blocking
      // WebRTC) — worth a specific, actionable message instead of a
      // generic "call ended."
      vapi.on("message", (message: unknown) => {
        if (
          typeof message === "object" &&
          message !== null &&
          "endedReason" in message &&
          typeof (message as { endedReason?: unknown }).endedReason === "string" &&
          (message as { endedReason: string }).endedReason.includes("did-not-receive-customer-audio")
        ) {
          setErrorMessage(
            "Connected, but your audio never reached us — this usually means a firewall or VPN is blocking the call. Try a different network, or disable any VPN, then try again."
          );
          setState("error");
        }
      });

      vapi.on("error", (err) => {
        console.error("Vapi call error:", err);
        setErrorMessage("The call dropped unexpectedly — try again.");
        setState("error");
      });

      await vapi.start(DEMO_ASSISTANT_ID);
    } catch (err) {
      console.error("Failed to start Vapi call:", err);
      setErrorMessage(messageStyleErrorFor(err));
      setState("error");
    }
  }

  async function endCall() {
    await vapiRef.current?.stop();
    setState("idle");
  }

  return (
    <section className="py-24">
      <div className="container-page">
        <div className="mx-auto max-w-2xl rounded-3xl border border-accent/20 bg-accent/5 p-10 text-center sm:p-14">
          <span className="eyebrow">Live voice demo</span>
          <h2 className="section-heading mt-3">Talk to Autonoma right now.</h2>
          <p className="mx-auto mt-4 max-w-md text-muted">
            This isn&apos;t a video — it&apos;s the actual voice agent, live, answering
            whatever you ask it about the service.
          </p>

          <div className="mt-8">
            {!isConfigured && (
              <span className="btn-secondary cursor-not-allowed opacity-60">Voice demo coming soon</span>
            )}

            {isConfigured && state === "idle" && (
              <button onClick={startCall} className="btn-primary">
                <MicIcon /> Talk to Autonoma
              </button>
            )}

            {isConfigured && state === "connecting" && (
              <span className="btn-primary opacity-80">Connecting…</span>
            )}

            {isConfigured && state === "active" && (
              <button onClick={endCall} className="btn-primary !bg-red-500 hover:!bg-red-600">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-pulse-slow rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                </span>
                End call
              </button>
            )}

            {state === "error" && (
              <div className="mt-4">
                <button onClick={startCall} className="btn-secondary">
                  Try again
                </button>
              </div>
            )}
          </div>

          {errorMessage && <p className="mt-4 text-sm text-red-500">{errorMessage}</p>}
        </div>
      </div>
    </section>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8" />
    </svg>
  );
}
