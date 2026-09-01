import type { ReceiptData } from "@/types/receipt";
import { formatPaymentMethodLabel, getReceiptFooterLines, getReceiptHeaderLines, NOT_BIR_ACCREDITED_NOTICE } from "@/types/receipt";
import { getComputationLines, type ComputationLine, type DiscountType, type VatCalculationResult } from "@/lib/vat-calculations";

const peso = (value: number) => (value < 0 ? `-₱${(-value).toFixed(2)}` : `₱${value.toFixed(2)}`);

const DISCOUNT_PERCENT: Record<string, number> = { SENIOR: 20, PWD: 20, STUDENT: 10, EMPLOYEE: 15, NONE: 0 };
const DISCOUNT_LABEL: Record<string, string> = {
  SENIOR: "SENIOR CITIZEN",
  PWD: "PWD",
  STUDENT: "STUDENT",
  EMPLOYEE: "EMPLOYEE",
};
const isSeniorOrPwd = (discountType?: string) => discountType === "SENIOR" || discountType === "PWD";

// Reuses the exact same step-by-step derivation the checkout screen shows
// before the sale is even made — so the printed receipt can never disagree
// with what the cashier already saw, and there is only one place that knows
// how the math works. Every number is read straight off the fields persisted
// on the Sale at checkout time, so a reprint always matches the original.
const buildComputationLines = (r: ReceiptData): ComputationLine[] => {
  const discountType = (r.discountType ?? "NONE") as DiscountType;
  const discountPercent = DISCOUNT_PERCENT[discountType] ?? 0;
  const result: VatCalculationResult = {
    subtotal: r.subtotal,
    vatableSales: r.vatableSales ?? 0,
    nonVatableSales: r.nonVatableSales ?? 0,
    vatAmount: r.taxAmount,
    discountAmount: r.discountAmount ?? 0,
    finalTotal: r.totalAmount,
    vatExemptSales: r.vatExemptSales,
    vatableGross: r.vatableGross ?? 0,
    nonVatableGross: r.nonVatableGross ?? 0,
    vatableDiscountAmount: r.vatableDiscountAmount ?? 0,
    nonVatableDiscountAmount: r.nonVatableDiscountAmount ?? 0,
    vatRemovedFromVatable: r.vatRemovedFromVatable ?? 0,
  };
  return getComputationLines(result, discountType, discountPercent).filter((line) => line.kind !== "total");
};

export const generateReceiptHTML = (receiptData: ReceiptData, options: { autoPrint?: boolean } = {}): string => {
  const { autoPrint = true } = options;
  const { saleNumber, date, items, totalAmount, paymentMethod, cashReceived, changeGiven, customer, cashier, orderRemarks, store } = receiptData;

  const headerLines = getReceiptHeaderLines(store);
  const footerLines = getReceiptFooterLines(store).filter((line) => line !== NOT_BIR_ACCREDITED_NOTICE);
  const computationLines = buildComputationLines(receiptData);
  const showScPwdBlock = isSeniorOrPwd(receiptData.discountType) && Boolean(receiptData.discountAmount && receiptData.discountAmount > 0);

  const amountLine = (line: ComputationLine) =>
    `<div class="total-line comp-${line.kind}"><span>${line.label}:</span><span>${line.kind === "subtotal" ? "= " : ""}${peso(line.amount)}</span></div>`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Receipt - ${saleNumber}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page { size: 58mm auto; margin: 0; padding: 0; }
        html, body { width: 58mm; }
        @media print {
          body { margin: 0; padding: 0; width: 58mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        body { font-family: 'Courier New', monospace; font-size: 10px; line-height: 1.3; width: 58mm; margin: 0; padding: 1.5mm; color: #000; background: #fff; }
        .header { text-align: center; margin-bottom: 4px; border-bottom: 1px dashed #000; padding-bottom: 3px; }
        .store-name { font-size: 11px; font-weight: 700; margin-bottom: 1px; }
        .store-info { font-size: 9px; line-height: 1.3; }
        .receipt-info { margin: 4px 0; font-size: 9.5px; border-bottom: 1px dashed #000; padding-bottom: 3px; }
        .receipt-info-row { display: flex; justify-content: space-between; }
        .receipt-info div { margin-bottom: 1px; }
        .items-header { display: flex; justify-content: space-between; font-size: 9px; font-weight: 700; border-bottom: 1px dashed #000; padding-bottom: 2px; margin-bottom: 2px; text-transform: uppercase; }
        .items { border-bottom: 1px dashed #000; padding-bottom: 3px; margin-bottom: 3px; }
        .item { margin-bottom: 2px; }
        .item-name { font-weight: 600; font-size: 10px; }
        .item-line { display: flex; justify-content: space-between; font-size: 9.5px; }
        .item-count { font-size: 9px; border-bottom: 1px dashed #000; padding-bottom: 3px; margin-bottom: 3px; }
        .section { margin-bottom: 4px; font-size: 9.5px; }
        .section-title { font-size: 9px; font-weight: 700; text-transform: uppercase; margin-bottom: 2px; }
        .total-line { display: flex; justify-content: space-between; margin-bottom: 1px; }
        .total-line.grand-total { font-weight: bold; border-top: 1px dashed #000; padding-top: 2px; margin-top: 2px; }
        .comp-base { font-weight: 700; }
        .comp-subtract { color: #b91c1c; }
        .comp-subtotal { color: #555; border-top: 1px dashed #ccc; padding-top: 1px; margin-top: 1px; }
        .comp-savings { font-weight: 700; color: #047857; border-top: 1px dashed #ccc; padding-top: 2px; margin-top: 1px; }
        .final-total { font-weight: bold; font-size: 13px; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 3px 0; margin: 4px 0; display: flex; justify-content: space-between; }
        .sc-pwd-block { border: 1px solid #000; padding: 4px; margin-bottom: 4px; font-size: 9px; }
        .sc-pwd-title { font-weight: 700; text-align: center; margin-bottom: 4px; text-transform: uppercase; }
        .sc-pwd-field { margin-bottom: 6px; }
        .sc-pwd-field .fill { display: inline-block; border-bottom: 1px solid #000; min-width: 32mm; }
        .payment-info { border-top: 1px dashed #000; padding-top: 3px; margin-bottom: 4px; font-size: 9.5px; }
        .remarks { border: 1px dashed #000; padding: 3px; margin-bottom: 4px; font-size: 9px; }
        .remarks .remarks-title { font-weight: 700; text-transform: uppercase; margin-bottom: 2px; }
        .footer { text-align: center; font-size: 9px; border-top: 1px dashed #000; padding-top: 3px; }
        .bir-notice { margin-top: 3px; font-style: italic; color: #444; font-size: 8px; border: 1px solid #444; padding: 2px; }
        .receipt-title { text-align: center; font-weight: 700; font-size: 10px; letter-spacing: 0.5px; margin: 3px 0; text-transform: uppercase; }
      </style>
    </head>
    <body>
      <div class="header">
        ${headerLines.map((line, i) => `<div class="${i === 0 ? "store-name" : "store-info"}">${line}</div>`).join("")}
      </div>

      ${store.receiptTitle?.trim() ? `<div class="receipt-title">${store.receiptTitle.trim()}</div>` : ""}

      <div class="receipt-info">
        <div class="receipt-info-row"><span>AR No: ${saleNumber}</span><span>${date.toLocaleDateString("en-PH")}</span></div>
        ${store.showCashierName ? `<div class="receipt-info-row"><span>Cashier: ${cashier.firstName} ${cashier.lastName}</span><span>${date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true })}</span></div>` : ""}
        ${store.showCustomerName && customer ? `<div>Customer: ${customer.firstName} ${customer.lastName}</div>` : ""}
      </div>

      <div class="items-header"><span>Qty / Item</span><span>Amount</span></div>
      <div class="items">
        ${items
          .map(
            (item) => `
          <div class="item">
            <div class="item-line"><span class="item-name">${item.name}</span><span></span></div>
            <div class="item-line">
              <span>${item.quantity} x ${peso(item.unitPrice)}</span>
              <span>${peso(item.totalPrice)} ${item.isVatable ? "V" : "N"}</span>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
      <div class="item-count">Total Items: ${items.length}</div>

      <div class="section">
        <div class="section-title">How This Total Was Computed</div>
        ${computationLines.map(amountLine).join("")}
      </div>

      <div class="final-total"><span>Total Amount Due:</span><span>${peso(totalAmount)}</span></div>

      ${
        showScPwdBlock
          ? `
      <div class="sc-pwd-block">
        <div class="sc-pwd-title">${DISCOUNT_LABEL[receiptData.discountType ?? ""] ?? ""} Information</div>
        <div class="sc-pwd-field">Name: <span class="fill">${receiptData.discountHolderName?.trim() || ""}</span></div>
        <div class="sc-pwd-field">OSCA ID / PWD ID No.: <span class="fill">${receiptData.discountIdNumber?.trim() || ""}</span></div>
        <div class="sc-pwd-field">Signature: <span class="fill"></span></div>
      </div>`
          : ""
      }

      <div class="payment-info">
        <div class="total-line"><span>Payment:</span><span>${formatPaymentMethodLabel(paymentMethod)}</span></div>
        ${cashReceived ? `<div class="total-line"><span>Cash:</span><span>${peso(cashReceived)}</span></div>` : ""}
        ${changeGiven && changeGiven > 0 ? `<div class="total-line"><span>Change:</span><span>${peso(changeGiven)}</span></div>` : ""}
      </div>

      ${
        store.includeOrderRemarks && orderRemarks?.trim()
          ? `<div class="remarks"><div class="remarks-title">Dosage / Instructions</div>${orderRemarks.trim()}</div>`
          : ""
      }

      <div class="bir-notice">${NOT_BIR_ACCREDITED_NOTICE}</div>

      <div class="footer">
        ${footerLines.map((line) => `<div>${line}</div>`).join("")}
      </div>

      ${
        autoPrint
          ? `<script>
        window.onload = function() {
          window.print();
          window.addEventListener('afterprint', function() {
            setTimeout(function() { window.close(); }, 500);
          });
        }
      </script>`
          : ""
      }
    </body>
    </html>
  `;
};

// Prints via a hidden same-page <iframe> instead of window.open(...). A
// popup opened asynchronously (after the checkout/receipt fetch resolves,
// not synchronously inside the button click that started it) is exactly
// the case Chrome's popup blocker is designed to silently kill or push to
// the background — which is why the print preview sometimes never
// auto-printed and closing it did nothing. An iframe needs no such
// permission, so triggering print() from it is reliable regardless of how
// long the async work before it took.
export const printReceipt = (receiptData: ReceiptData) => {
  const html = generateReceiptHTML(receiptData, { autoPrint: false });

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const cleanup = () => {
    // Give the print dialog a moment to actually hand off to the OS print
    // spooler before tearing down the iframe it's printing from.
    setTimeout(() => iframe.remove(), 1000);
  };

  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    win.addEventListener("afterprint", cleanup);
    win.focus();
    win.print();
    // afterprint doesn't fire in every browser (e.g. some in-app webviews) —
    // fall back to a fixed timeout so the iframe is never left behind.
    setTimeout(cleanup, 15000);
  };

  iframe.srcdoc = html;
};

export const downloadReceiptHTML = (receiptData: ReceiptData) => {
  const html = generateReceiptHTML(receiptData);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `receipt-${receiptData.saleNumber}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const generateThermalReceiptText = (receiptData: ReceiptData): string => {
  const { saleNumber, date, items, totalAmount, paymentMethod, cashReceived, changeGiven, customer, cashier, orderRemarks, store } = receiptData;

  const ESC = "\x1B";
  const GS = "\x1D";
  const INIT = ESC + "@";
  const CENTER = ESC + "a1";
  const LEFT = ESC + "a0";
  const BOLD_ON = ESC + "E1";
  const BOLD_OFF = ESC + "E0";
  const UNDERLINE_ON = ESC + "-1";
  const UNDERLINE_OFF = ESC + "-0";
  const CUT = GS + "V1";
  const NEWLINE = "\n";
  const WIDTH = 32;
  const SEPARATOR = "-".repeat(WIDTH);
  const DOUBLE_SEPARATOR = "=".repeat(WIDTH);

  const headerLines = getReceiptHeaderLines(store);
  const footerLines = getReceiptFooterLines(store).filter((line) => line !== NOT_BIR_ACCREDITED_NOTICE);
  const computationLines = buildComputationLines(receiptData);
  const showScPwdBlock = isSeniorOrPwd(receiptData.discountType) && Boolean(receiptData.discountAmount && receiptData.discountAmount > 0);

  let receipt = INIT;
  receipt += CENTER + BOLD_ON;
  receipt += (headerLines[0] ?? store.storeName) + NEWLINE;
  receipt += BOLD_OFF;
  headerLines.slice(1).forEach((line) => {
    receipt += line + NEWLINE;
  });
  if (store.receiptTitle?.trim()) {
    receipt += BOLD_ON + store.receiptTitle.trim().toUpperCase() + BOLD_OFF + NEWLINE;
  }
  receipt += SEPARATOR + NEWLINE;

  receipt += LEFT;

  // Right-aligns `value` on the same line as `label` when it fits in WIDTH
  // chars; otherwise wraps value onto its own right-aligned line so nothing
  // gets truncated on 58mm paper.
  const addRow = (label: string, value: string, isBold = false) => {
    const on = isBold ? BOLD_ON : "";
    const off = isBold ? BOLD_OFF : "";
    const spaces = WIDTH - label.length - value.length;
    if (spaces < 1) {
      receipt += on + label + off + NEWLINE;
      receipt += on + " ".repeat(Math.max(0, WIDTH - value.length)) + value + off + NEWLINE;
    } else {
      receipt += on + label + " ".repeat(spaces) + value + off + NEWLINE;
    }
  };
  const addTotalLine = (label: string, amount: number, isBold = false) => addRow(label, peso(amount), isBold);

  addRow("AR No:", saleNumber);
  addRow("Date:", date.toLocaleDateString("en-PH"));
  if (store.showCashierName) addRow("Cashier:", `${cashier.firstName} ${cashier.lastName}`);
  addRow("Time:", date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true }));
  if (store.showCustomerName && customer) addRow("Customer:", `${customer.firstName} ${customer.lastName}`);
  receipt += SEPARATOR + NEWLINE;

  receipt += BOLD_ON + "QTY ITEM" + " ".repeat(18) + "AMOUNT" + BOLD_OFF + NEWLINE;
  receipt += SEPARATOR + NEWLINE;
  items.forEach((item) => {
    receipt += BOLD_ON + item.name + BOLD_OFF + NEWLINE;
    const itemLine = `${item.quantity} x ${peso(item.unitPrice)}`;
    const amountStr = `${peso(item.totalPrice)} ${item.isVatable ? "V" : "N"}`;
    const spaces = WIDTH - itemLine.length - amountStr.length;
    receipt += itemLine + " ".repeat(Math.max(0, spaces)) + amountStr + NEWLINE;
  });
  receipt += SEPARATOR + NEWLINE;
  receipt += `Total Items: ${items.length}` + NEWLINE;
  receipt += SEPARATOR + NEWLINE;

  receipt += CENTER + UNDERLINE_ON + "HOW THIS TOTAL WAS COMPUTED" + UNDERLINE_OFF + NEWLINE + LEFT;
  computationLines.forEach((l) => {
    const isBold = l.kind === "base" || l.kind === "subtotal" || l.kind === "savings";
    const value = (l.kind === "subtotal" ? "= " : "") + peso(l.amount);
    addRow(l.label + ":", value, isBold);
  });

  receipt += DOUBLE_SEPARATOR + NEWLINE;
  addTotalLine("TOTAL AMOUNT DUE:", totalAmount, true);
  receipt += DOUBLE_SEPARATOR + NEWLINE;

  if (showScPwdBlock) {
    receipt += CENTER + BOLD_ON + `${(receiptData.discountType === "PWD" ? "PWD" : "SENIOR CITIZEN")} INFORMATION` + BOLD_OFF + NEWLINE + LEFT;
    addRow("Name:", receiptData.discountHolderName?.trim() || "___________________");
    addRow("OSCA/PWD ID:", receiptData.discountIdNumber?.trim() || "___________________");
    receipt += "Signature: _________________" + NEWLINE;
    receipt += SEPARATOR + NEWLINE;
  }

  receipt += `Payment: ${formatPaymentMethodLabel(paymentMethod)}` + NEWLINE;
  if (cashReceived) addTotalLine("Cash:", cashReceived);
  if (changeGiven && changeGiven > 0) addTotalLine("Change:", changeGiven);
  receipt += SEPARATOR + NEWLINE;

  if (store.includeOrderRemarks && orderRemarks?.trim()) {
    receipt += BOLD_ON + "DOSAGE / INSTRUCTIONS:" + BOLD_OFF + NEWLINE;
    receipt += orderRemarks.trim() + NEWLINE;
    receipt += SEPARATOR + NEWLINE;
  }

  receipt += CENTER + NOT_BIR_ACCREDITED_NOTICE + NEWLINE;
  footerLines.forEach((line) => {
    receipt += line + NEWLINE;
  });
  receipt += NEWLINE + NEWLINE + NEWLINE;
  receipt += CUT;

  return receipt;
};
