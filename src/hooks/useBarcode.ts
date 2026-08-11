"use client";

import { useRef, useState } from "react";

interface Product {
  id: string;
  name: string;
  barcode: string | null;
}

interface UseBarcodeProps<T extends Product> {
  products: T[];
  onProductFound: (product: T) => void;
  onProductNotFound: (barcode: string) => void;
}

const SCAN_COOLDOWN_MS = 1500;

export function useBarcode<T extends Product>({ products, onProductFound, onProductNotFound }: UseBarcodeProps<T>) {
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lastScannedBarcode, setLastScannedBarcode] = useState("");
  const lastScanRef = useRef<{ barcode: string; timestamp: number }>({ barcode: "", timestamp: 0 });
  const inFlightLookupRef = useRef(false);

  const lookupProduct = async (barcode: string) => {
    const normalizedBarcode = barcode.trim();
    if (!normalizedBarcode) return;

    const now = Date.now();
    const isDuplicateScan =
      lastScanRef.current.barcode === normalizedBarcode && now - lastScanRef.current.timestamp < SCAN_COOLDOWN_MS;
    if (isDuplicateScan || inFlightLookupRef.current) return;

    lastScanRef.current = { barcode: normalizedBarcode, timestamp: now };
    inFlightLookupRef.current = true;
    setIsLookingUp(true);
    setLastScannedBarcode(normalizedBarcode);

    try {
      const localProduct = products.find((p) => p.barcode === normalizedBarcode || p.id === normalizedBarcode);
      if (localProduct) {
        onProductFound(localProduct);
        return;
      }

      const response = await fetch(`/api/products?search=${encodeURIComponent(normalizedBarcode)}`);
      if (!response.ok) throw new Error("Failed to search products");

      const searchResults: T[] = await response.json();
      const exactMatch = searchResults.find((p) => p.barcode === normalizedBarcode);
      if (exactMatch) {
        onProductFound(exactMatch);
        return;
      }

      onProductNotFound(normalizedBarcode);
    } catch (error) {
      console.error("Barcode lookup error:", error);
      onProductNotFound(normalizedBarcode);
    } finally {
      setIsLookingUp(false);
      inFlightLookupRef.current = false;
      setTimeout(() => {
        setLastScannedBarcode((current) => (current === normalizedBarcode ? "" : current));
      }, SCAN_COOLDOWN_MS);
    }
  };

  const resetLastScanned = () => {
    lastScanRef.current = { barcode: "", timestamp: 0 };
    setLastScannedBarcode("");
  };

  return { lookupProduct, isLookingUp, lastScannedBarcode, resetLastScanned };
}
