"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { isUsbSupported, requestUsbPrinter } from "./usb";
import { isBluetoothSupported, requestBluetoothPrinter } from "./bluetooth";
import { textToEscPosBytes } from "./encode";
import { ensurePrinter, getPrinter, setPrinter, subscribePrinter } from "./store";

export function usePrinterConnection() {
  // Shared across pages (see ./store), so leaving the POS keeps the printer.
  const connection = useSyncExternalStore(subscribePrinter, getPrinter, () => null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensurePrinter();
  }, []);

  const connectUsb = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      // Let go of any current printer first (it may be the same device).
      await getPrinter()?.disconnect().catch(() => {});
      setPrinter(null);
      setPrinter(await requestUsbPrinter());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to USB printer.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const connectBluetooth = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      // Let go of any current printer first (it may be the same device).
      await getPrinter()?.disconnect().catch(() => {});
      setPrinter(null);
      setPrinter(await requestBluetoothPrinter());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to Bluetooth printer.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await getPrinter()?.disconnect().catch(() => {});
    setPrinter(null);
  }, []);

  const printText = useCallback(async (text: string) => {
    const printer = getPrinter();
    if (!printer) throw new Error("No printer connected.");
    await printer.send(textToEscPosBytes(text));
  }, []);

  return {
    connection,
    connecting,
    error,
    usbSupported: isUsbSupported(),
    bluetoothSupported: isBluetoothSupported(),
    connectUsb,
    connectBluetooth,
    disconnect,
    printText,
  };
}
