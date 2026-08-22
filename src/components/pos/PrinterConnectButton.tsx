"use client";

import { useRef, useState } from "react";
import { Printer, Usb, Bluetooth, X, Loader2 } from "lucide-react";
import { usePrinterConnection } from "@/lib/printer/usePrinterConnection";

export default function PrinterConnectButton({ printer }: { printer: ReturnType<typeof usePrinterConnection> }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connectingKind, setConnectingKind] = useState<"usb" | "bluetooth" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { connection, connecting, error, usbSupported, bluetoothSupported, connectUsb, connectBluetooth, disconnect } = printer;

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
          connection ? "bg-white/15 text-white hover:bg-white/25" : "text-emerald-100 hover:bg-white/10"
        }`}
        title={connection ? `Printer: ${connection.name}` : "Connect a receipt printer"}
      >
        <Printer className="h-4 w-4" />
        <span className="hidden sm:inline">{connection ? connection.name : "Connect Printer"}</span>
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-xl border border-gray-100 bg-white p-1.5 text-gray-700 shadow-xl">
          {connection ? (
            <>
              <div className="px-2 py-1.5 text-xs text-gray-500">
                Connected via {connection.kind === "usb" ? "USB" : "Bluetooth"}
              </div>
              <button
                onClick={async () => {
                  setDisconnecting(true);
                  try {
                    await disconnect();
                    setMenuOpen(false);
                  } finally {
                    setDisconnecting(false);
                  }
                }}
                disabled={disconnecting}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 btn-press"
              >
                {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                Disconnect
              </button>
            </>
          ) : (
            <>
              <button
                disabled={!usbSupported || connecting}
                onClick={async () => {
                  setConnectingKind("usb");
                  try {
                    await connectUsb();
                    setMenuOpen(false);
                  } finally {
                    setConnectingKind(null);
                  }
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40 btn-press"
              >
                {connectingKind === "usb" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Usb className="h-4 w-4" />}
                {usbSupported ? "Connect via USB" : "USB not supported here"}
              </button>
              <button
                disabled={!bluetoothSupported || connecting}
                onClick={async () => {
                  setConnectingKind("bluetooth");
                  try {
                    await connectBluetooth();
                    setMenuOpen(false);
                  } finally {
                    setConnectingKind(null);
                  }
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40 btn-press"
              >
                {connectingKind === "bluetooth" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bluetooth className="h-4 w-4" />}
                {bluetoothSupported ? "Connect via Bluetooth" : "Bluetooth not supported here"}
              </button>
              {error && <div className="mt-1 border-t border-gray-100 px-3 py-2 text-xs text-red-600">{error}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
