import { PrinterConnectionError, PrinterNotSupportedError, type PrinterConnection } from "./types";

interface UsbEndpointRef {
  interfaceNumber: number;
  alternateSetting: number;
  endpointNumber: number;
}

const findOutEndpoint = (device: USBDevice): UsbEndpointRef | null => {
  for (const config of device.configurations) {
    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        const out = alt.endpoints.find((e) => e.direction === "out");
        if (out) {
          return { interfaceNumber: iface.interfaceNumber, alternateSetting: alt.alternateSetting, endpointNumber: out.endpointNumber };
        }
      }
    }
  }
  return null;
};

const openAndClaim = async (device: USBDevice): Promise<UsbEndpointRef> => {
  await device.open();
  if (device.configuration === null) {
    await device.selectConfiguration(device.configurations[0]?.configurationValue ?? 1);
  }
  const endpoint = findOutEndpoint(device);
  if (!endpoint) throw new PrinterConnectionError("This USB device has no writable (OUT) endpoint — it may not be a printer.");
  await device.claimInterface(endpoint.interfaceNumber);
  if (endpoint.alternateSetting !== 0) {
    await device.selectAlternateInterface(endpoint.interfaceNumber, endpoint.alternateSetting);
  }
  return endpoint;
};

const deviceKey = (device: USBDevice) => `${device.vendorId}:${device.productId}:${device.serialNumber ?? ""}`;

export const isUsbSupported = () => typeof navigator !== "undefined" && "usb" in navigator;

export const requestUsbPrinter = async (): Promise<PrinterConnection> => {
  if (!isUsbSupported()) throw new PrinterNotSupportedError("WebUSB is not supported in this browser.");

  const device = await navigator.usb.requestDevice({ filters: [{}] });
  const endpoint = await openAndClaim(device);
  localStorage.setItem("nookly:printer:usb", deviceKey(device));

  return {
    kind: "usb",
    name: device.productName || `USB Printer (${device.vendorId.toString(16)}:${device.productId.toString(16)})`,
    async send(bytes) {
      await device.transferOut(endpoint.endpointNumber, bytes);
    },
    async disconnect() {
      try {
        await device.close();
      } catch {
        // already closed — ignore
      }
      localStorage.removeItem("nookly:printer:usb");
    },
  };
};

export const reconnectUsbPrinter = async (): Promise<PrinterConnection | null> => {
  if (!isUsbSupported()) return null;
  const savedKey = localStorage.getItem("nookly:printer:usb");
  if (!savedKey) return null;

  const devices = await navigator.usb.getDevices();
  const device = devices.find((d) => deviceKey(d) === savedKey);
  if (!device) return null;

  try {
    const endpoint = await openAndClaim(device);
    return {
      kind: "usb",
      name: device.productName || `USB Printer (${device.vendorId.toString(16)}:${device.productId.toString(16)})`,
      async send(bytes) {
        await device.transferOut(endpoint.endpointNumber, bytes);
      },
      async disconnect() {
        try {
          await device.close();
        } catch {
          // already closed — ignore
        }
        localStorage.removeItem("nookly:printer:usb");
      },
    };
  } catch {
    return null;
  }
};
