import type { ReceiptData } from "@/types/receipt";
import { formatPaymentMethodLabel, getReceiptFooterLines, getReceiptHeaderLines, NOT_BIR_ACCREDITED_NOTICE } from "@/types/receipt";

const peso = (value: number) => (value < 0 ? `-₱${(-value).toFixed(2)}` : `₱${value.toFixed(2)}`);

const DISCOUNT_PERCENT: Record<string, number> = { SENIOR: 20, PWD: 20, STUDENT: 10, EMPLOYEE: 15, NONE: 0 };
const DISCOUNT_LABEL: Record<string, string> = {
  SENIOR: "SENIOR CITIZEN",
  PWD: "PWD",
  STUDENT: "STUDENT",
  EMPLOYEE: "EMPLOYEE",
};
const isSeniorOrPwd = (discountType?: string) => discountType === "SENIOR" || discountType === "PWD";

interface AmountLine {
  label: string;
  amount: number;
  bold?: boolean;
}

interface DiscountSection {
  headerLabel: string;
  lines: AmountLine[];
  totalLabel: string;
  totalAmount: number;
}

// Every number here is read straight off the fields persisted on the Sale at
// checkout time — nothing is re-derived — so a reprint always shows the exact
// original computation, never an approximation.
const buildVatSection = (r: ReceiptData): AmountLine[] => {
  const vatableGross = r.vatableGross ?? 0;
  const nonVatableGross = r.nonVatableGross ?? 0;
  const vatRemoved = r.vatRemovedFromVatable ?? 0;

  if (isSeniorOrPwd(r.discountType)) {
    // Senior/PWD purchases are VAT-exempt outright — the entire net-of-VAT
    // total (vatable base + whatever was never vatable) counts as exempt.
    const vatExempt = Number((vatableGross - vatRemoved + nonVatableGross).toFixed(2));
    return [
      { label: "VAT Sales (Gross)", amount: vatableGross },
      { label: "Less: 12% VAT", amount: -vatRemoved },
      { label: "VAT-Exempt Sales", amount: vatExempt },
      { label: "VAT Zero-Rated Sales", amount: r.zeroRatedSales ?? 0 },
      { label: "Total Net of VAT", amount: vatExempt, bold: true },
    ];
  }

  const discountApplies = (r.vatableDiscountAmount ?? 0) > 0 || (r.nonVatableDiscountAmount ?? 0) > 0;
  const netOfVat = Number(((r.vatableSales ?? 0) + (r.nonVatableSales ?? 0)).toFixed(2));
  const lines: AmountLine[] = [{ label: "VAT Sales (Gross)", amount: vatableGross }];
  if (discountApplies && (r.vatableDiscountAmount ?? 0) > 0) {
    const label = `Less: ${DISCOUNT_PERCENT[r.discountType ?? "NONE"] ?? 0}% ${DISCOUNT_LABEL[r.discountType ?? ""] ?? r.discountType} Discount`;
    lines.push({ label, amount: -(r.vatableDiscountAmount ?? 0) });
    lines.push({ label: "Vatable Sales (Net of Discount)", amount: vatableGross - (r.vatableDiscountAmount ?? 0) });
  }
  lines.push({ label: "Less: 12% VAT", amount: -r.taxAmount });
  lines.push({ label: "VAT Sales (Net of VAT)", amount: r.vatableSales ?? 0 });
  if (nonVatableGross > 0) {
    lines.push({ label: "Non-VAT Sales (Gross)", amount: nonVatableGross });
    if (discountApplies && (r.nonVatableDiscountAmount ?? 0) > 0) {
      const label = `Less: ${DISCOUNT_PERCENT[r.discountType ?? "NONE"] ?? 0}% ${DISCOUNT_LABEL[r.discountType ?? ""] ?? r.discountType} Discount`;
      lines.push({ label, amount: -(r.nonVatableDiscountAmount ?? 0) });
      lines.push({ label: "Non-VAT Sales (Net)", amount: r.nonVatableSales ?? 0 });
    }
  }
  lines.push({ label: "Total Net of VAT", amount: netOfVat, bold: true });
  return lines;
};

const buildDiscountSection = (r: ReceiptData): DiscountSection | null => {
  if (!isSeniorOrPwd(r.discountType) || !(r.discountAmount && r.discountAmount > 0)) return null;
  const pct = DISCOUNT_PERCENT[r.discountType ?? "NONE"] ?? 20;
  const typeLabel = DISCOUNT_LABEL[r.discountType ?? ""] ?? r.discountType ?? "";
  const lines: AmountLine[] = [];
  if ((r.vatableDiscountAmount ?? 0) > 0) lines.push({ label: `- ${typeLabel} Discount on VATable Meds`, amount: r.vatableDiscountAmount ?? 0 });
  if ((r.nonVatableDiscountAmount ?? 0) > 0) lines.push({ label: `- ${typeLabel} Discount on Non-VAT Meds`, amount: r.nonVatableDiscountAmount ?? 0 });
  return {
    headerLabel: `Less: ${pct}% ${typeLabel} Discount`,
    lines,
    totalLabel: `Total ${typeLabel} Discount`,
    totalAmount: -(r.discountAmount ?? 0),
  };
};

export const generateReceiptHTML = (receiptData: ReceiptData): string => {
  const { saleNumber, date, items, totalAmount, paymentMethod, cashReceived, changeGiven, customer, cashier, orderRemarks, store } = receiptData;

  const headerLines = getReceiptHeaderLines(store);
  const footerLines = getReceiptFooterLines(store).filter((line) => line !== NOT_BIR_ACCREDITED_NOTICE);
  const vatLines = buildVatSection(receiptData);
  const discountSection = buildDiscountSection(receiptData);
  const showScPwdBlock = isSeniorOrPwd(receiptData.discountType) && Boolean(receiptData.discountAmount && receiptData.discountAmount > 0);

  const amountLine = (line: AmountLine) =>
    `<div class="total-line${line.bold ? " grand-total" : ""}"><span>${line.label}:</span><span>${peso(line.amount)}</span></div>`;

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
        .discount-line { display: flex; justify-content: space-between; margin-bottom: 1px; padding-left: 4px; font-size: 9px; }
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
        <div class="section-title">VAT Breakdown</div>
        ${vatLines.map(amountLine).join("")}
      </div>

      ${
        discountSection
          ? `
      <div class="section">
        <div class="section-title">${discountSection.headerLabel}</div>
        ${discountSection.lines.map((l) => `<div class="discount-line"><span>${l.label}:</span><span>${peso(l.amount)}</span></div>`).join("")}
        <div class="total-line grand-total"><span>${discountSection.totalLabel}:</span><span>${peso(discountSection.totalAmount)}</span></div>
      </div>`
          : ""
      }

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

      <script>
        window.onload = function() {
          window.print();
          window.addEventListener('afterprint', function() {
            setTimeout(function() { window.close(); }, 500);
          });
        }
      </script>
    </body>
    </html>
  `;
};

export const printReceipt = (receiptData: ReceiptData) => {
  const html = generateReceiptHTML(receiptData);
  const printWindow = window.open("", "_blank", "width=400,height=600");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
  }
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
  const vatLines = buildVatSection(receiptData);
  const discountSection = buildDiscountSection(receiptData);
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

  receipt += CENTER + UNDERLINE_ON + "VAT BREAKDOWN" + UNDERLINE_OFF + NEWLINE + LEFT;
  vatLines.forEach((l) => addTotalLine(l.label + ":", l.amount, l.bold));

  if (discountSection) {
    receipt += SEPARATOR + NEWLINE;
    receipt += discountSection.headerLabel + ":" + NEWLINE;
    discountSection.lines.forEach((l) => addTotalLine("  " + l.label + ":", l.amount));
    addTotalLine(discountSection.totalLabel + ":", discountSection.totalAmount, true);
  }

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
