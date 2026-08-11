"use client";

import { useCallback, useRef } from "react";

export const useBarcodeAudio = () => {
  const audioContextRef = useRef<AudioContext | null>(null);

  const initAudio = useCallback(() => {
    if (!audioContextRef.current && typeof window !== "undefined") {
      try {
        audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      } catch (error) {
        console.warn("Audio context not supported:", error);
      }
    }
  }, []);

  const playTone = useCallback(
    (frequency: number, gain: number, duration: number) => {
      initAudio();
      const context = audioContextRef.current;
      if (!context) return;
      try {
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(context.destination);
        oscillator.frequency.setValueAtTime(frequency, context.currentTime);
        gainNode.gain.setValueAtTime(gain, context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + duration);
        oscillator.start(context.currentTime);
        oscillator.stop(context.currentTime + duration);
      } catch (error) {
        console.warn("Failed to play tone:", error);
      }
    },
    [initAudio]
  );

  const playSuccessBeep = useCallback(() => playTone(800, 0.1, 0.1), [playTone]);
  const playErrorBeep = useCallback(() => playTone(400, 0.1, 0.3), [playTone]);
  const playScanBeep = useCallback(() => playTone(600, 0.05, 0.05), [playTone]);

  return { playSuccessBeep, playErrorBeep, playScanBeep };
};
