"use client";

import PrinterConnectButton from "@/components/pos/PrinterConnectButton";
import { usePrinterConnection } from "@/lib/printer/usePrinterConnection";

// The receipt printer on every page's header, so reprints work anywhere and
// the connection made in the POS is visible (and fixable) outside it.
export default function HeaderPrinterButton() {
  const printer = usePrinterConnection();
  return <PrinterConnectButton printer={printer} tone="light" />;
}
