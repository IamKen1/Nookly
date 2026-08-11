import type { ReceiptData } from "@/types/receipt";
import { formatPaymentMethodLabel, getReceiptFooterLines, getReceiptHeaderLines } from "@/types/receipt";

const peso = (value: number) => `₱${value.toFixed(2)}`;

export const generateReceiptHTML = (receiptData: ReceiptData): string => {
  const {
    saleNumber,
    date,
    items,
    subtotal,
    discountType,
    discountAmount,
    taxAmount,
    vatableSales,
    nonVatableSales,
    zeroRatedSales,
    vatExemptSales,
    totalAmount,
    paymentMethod,
    cashReceived,
    changeGiven,
    customer,
    cashier,
    orderRemarks,
    store,
  } = receiptData;

  const headerLines = getReceiptHeaderLines(store);
  const footerLines = getReceiptFooterLines(store);

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
        .receipt-info { margin: 4px 0; font-size: 9.5px; }
        .receipt-info div { margin-bottom: 1px; }
        .items { border-bottom: 1px dashed #000; padding-bottom: 3px; margin-bottom: 3px; }
        .item { margin-bottom: 2px; }
        .item-name { font-weight: 600; font-size: 10px; }
        .item-line { display: flex; justify-content: space-between; font-size: 9.5px; }
        .totals { margin-bottom: 4px; font-size: 9.5px; }
        .total-line { display: flex; justify-content: space-between; margin-bottom: 1px; }
        .total-line.grand-total { font-weight: bold; font-size: 12px; border-top: 1px dashed #000; padding-top: 2px; margin-top: 2px; }
        .vat-section { border-top: 1px dashed #000; padding-top: 2px; margin-top: 2px; font-size: 9px; }
        .payment-info { border-top: 1px dashed #000; padding-top: 3px; margin-bottom: 4px; font-size: 9.5px; }
        .remarks { border-top: 1px dashed #000; padding-top: 3px; margin-bottom: 4px; font-size: 9px; }
        .footer { text-align: center; font-size: 9px; border-top: 1px dashed #000; padding-top: 3px; }
        .footer .disclaimer { margin-top: 3px; font-style: italic; color: #444; }
        .separator { text-align: center; margin: 3px 0; font-size: 9px; }
        .receipt-title { text-align: center; font-weight: 700; font-size: 10px; letter-spacing: 0.5px; margin: 3px 0; text-transform: uppercase; }
      </style>
    </head>
    <body>
      <div class="header">
        ${headerLines.map((line, i) => `<div class="${i === 0 ? "store-name" : "store-info"}">${line}</div>`).join("")}
      </div>

      ${store.receiptTitle?.trim() ? `<div class="receipt-title">${store.receiptTitle.trim()}</div>` : ""}

      <div class="receipt-info">
        <div>Receipt #: ${saleNumber}</div>
        <div>Date: ${date.toLocaleDateString("en-PH")} ${date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true })}</div>
        ${store.showCashierName ? `<div>Cashier: ${cashier.firstName} ${cashier.lastName}</div>` : ""}
        ${store.showCustomerName && customer ? `<div>Customer: ${customer.firstName} ${customer.lastName}</div>` : ""}
      </div>

      <div class="items">
        ${items
          .map(
            (item) => `
          <div class="item">
            <div class="item-name">${item.name}</div>
            <div class="item-line">
              <span>${item.quantity} x ${peso(item.unitPrice)}</span>
              <span>${peso(item.totalPrice)}</span>
            </div>
          </div>
        `
          )
          .join("")}
      </div>

      <div class="totals">
        <div class="total-line"><span>Subtotal:</span><span>${peso(subtotal)}</span></div>
        ${
          discountAmount && discountAmount > 0
            ? `<div class="total-line"><span>${discountType && discountType !== "NONE" ? `${discountType} Discount` : "Discount"}:</span><span>-${peso(discountAmount)}</span></div>`
            : ""
        }
        <div class="total-line grand-total"><span>TOTAL:</span><span>${peso(totalAmount)}</span></div>
      </div>

      ${
        store.showVatBreakdown && (vatableSales || nonVatableSales || taxAmount > 0 || vatExemptSales)
          ? `
      <div class="vat-section">
        <div class="separator">VAT BREAKDOWN</div>
        ${vatExemptSales ? `<div class="total-line"><span>VAT-Exempt Sales:</span><span>${peso(vatExemptSales)}</span></div>` : ""}
        <div class="total-line"><span>VAT Sales:</span><span>${peso(vatableSales ?? 0)}</span></div>
        <div class="total-line"><span>12% VAT Sales:</span><span>${peso(taxAmount)}</span></div>
        <div class="total-line"><span>Non-VAT Sales:</span><span>${peso(nonVatableSales ?? 0)}</span></div>
        <div class="total-line"><span>Zero Rated Sales:</span><span>${peso(zeroRatedSales ?? 0)}</span></div>
      </div>`
          : ""
      }

      <div class="payment-info">
        <div class="total-line"><span>Payment:</span><span>${formatPaymentMethodLabel(paymentMethod)}</span></div>
        ${cashReceived ? `<div class="total-line"><span>Cash:</span><span>${peso(cashReceived)}</span></div>` : ""}
        ${changeGiven && changeGiven > 0 ? `<div class="total-line"><span>Change:</span><span>${peso(changeGiven)}</span></div>` : ""}
      </div>

      ${store.includeOrderRemarks && orderRemarks?.trim() ? `<div class="remarks"><strong>Remarks:</strong> ${orderRemarks.trim()}</div>` : ""}

      <div class="footer">
        ${footerLines.map((line, i) => `<div class="${i === footerLines.length - 1 ? "disclaimer" : ""}">${line}</div>`).join("")}
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
  const {
    saleNumber,
    date,
    items,
    subtotal,
    discountType,
    discountAmount,
    taxAmount,
    vatableSales,
    nonVatableSales,
    zeroRatedSales,
    vatExemptSales,
    totalAmount,
    paymentMethod,
    cashReceived,
    changeGiven,
    customer,
    cashier,
    store,
  } = receiptData;

  const ESC = "\x1B";
  const GS = "\x1D";
  const INIT = ESC + "@";
  const CENTER = ESC + "a1";
  const LEFT = ESC + "a0";
  const BOLD_ON = ESC + "E1";
  const BOLD_OFF = ESC + "E0";
  const CUT = GS + "V1";
  const NEWLINE = "\n";
  const SEPARATOR = "--------------------------------";

  const headerLines = getReceiptHeaderLines(store);
  const footerLines = getReceiptFooterLines(store);

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
  receipt += `Receipt #: ${saleNumber}` + NEWLINE;
  receipt += `Date: ${date.toLocaleDateString("en-PH")} ${date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true })}` + NEWLINE;
  if (store.showCashierName) receipt += `Cashier: ${cashier.firstName} ${cashier.lastName}` + NEWLINE;
  if (store.showCustomerName && customer) receipt += `Customer: ${customer.firstName} ${customer.lastName}` + NEWLINE;
  receipt += SEPARATOR + NEWLINE;

  items.forEach((item) => {
    receipt += BOLD_ON + item.name + BOLD_OFF + NEWLINE;
    const itemLine = `${item.quantity} x ${peso(item.unitPrice)}`;
    const spaces = 32 - itemLine.length - peso(item.totalPrice).length;
    receipt += itemLine + " ".repeat(Math.max(0, spaces)) + peso(item.totalPrice) + NEWLINE;
  });
  receipt += SEPARATOR + NEWLINE;

  const addTotalLine = (label: string, amount: number, isBold = false) => {
    const amountStr = peso(amount);
    const spaces = 32 - label.length - amountStr.length;
    receipt += (isBold ? BOLD_ON : "") + label + " ".repeat(Math.max(0, spaces)) + amountStr + (isBold ? BOLD_OFF : "") + NEWLINE;
  };

  addTotalLine("Subtotal:", subtotal);
  if (discountAmount && discountAmount > 0) {
    addTotalLine(discountType && discountType !== "NONE" ? `${discountType} Discount:` : "Discount:", -discountAmount);
  }
  addTotalLine("TOTAL:", totalAmount, true);

  if (store.showVatBreakdown && (vatableSales || nonVatableSales || taxAmount > 0 || vatExemptSales)) {
    receipt += SEPARATOR + NEWLINE;
    receipt += CENTER + "VAT BREAKDOWN" + NEWLINE + LEFT;
    if (vatExemptSales) addTotalLine("VAT-Exempt Sales:", vatExemptSales);
    addTotalLine("VAT Sales:", vatableSales ?? 0);
    addTotalLine("12% VAT Sales:", taxAmount);
    addTotalLine("Non-VAT Sales:", nonVatableSales ?? 0);
    addTotalLine("Zero Rated Sales:", zeroRatedSales ?? 0);
  }

  receipt += SEPARATOR + NEWLINE;
  receipt += `Payment: ${formatPaymentMethodLabel(paymentMethod)}` + NEWLINE;
  if (cashReceived) addTotalLine("Cash:", cashReceived);
  if (changeGiven && changeGiven > 0) addTotalLine("Change:", changeGiven);
  receipt += SEPARATOR + NEWLINE;

  receipt += CENTER;
  footerLines.forEach((line) => {
    receipt += line + NEWLINE;
  });
  receipt += NEWLINE + NEWLINE + NEWLINE;
  receipt += CUT;

  return receipt;
};
