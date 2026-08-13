export type PrinterKind = "usb" | "bluetooth";

export interface PrinterConnection {
  kind: PrinterKind;
  name: string;
  send(bytes: Uint8Array): Promise<void>;
  disconnect(): Promise<void>;
}

export class PrinterNotSupportedError extends Error {}
export class PrinterConnectionError extends Error {}
