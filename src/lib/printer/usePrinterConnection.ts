"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isUsbSupported, reconnectUsbPrinter, requestUsbPrinter } from "./usb";
import { isBluetoothSupported, reconnectBluetoothPrinter, requestBluetoothPrinter } from "./bluetooth";
import { textToEscPosBytes } from "./encode";
import type { PrinterConnection } from "./types";

export function usePrinterConnection() {
  const [connection, setConnection] = useState<PrinterConnection | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connectionRef = useRef<PrinterConnection | null>(null);

  useEffect(() => {
    connectionRef.current = connection;
  }, [connection]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const usb = await reconnectUsbPrinter().catch(() => null);
      if (usb) {
        if (!cancelled) setConnection(usb);
        return;
      }
      const bt = await reconnectBluetoothPrinter().catch(() => null);
      if (bt && !cancelled) setConnection(bt);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const connectUsb = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const next = await requestUsbPrinter();
      await connectionRef.current?.disconnect().catch(() => {});
      setConnection(next);
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
      const next = await requestBluetoothPrinter();
      await connectionRef.current?.disconnect().catch(() => {});
      setConnection(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to Bluetooth printer.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await connectionRef.current?.disconnect().catch(() => {});
    setConnection(null);
  }, []);

  const printText = useCallback(async (text: string) => {
    if (!connectionRef.current) throw new Error("No printer connected.");
    await connectionRef.current.send(textToEscPosBytes(text));
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
