import { PrinterConnectionError, PrinterNotSupportedError, type PrinterConnection } from "./types";

// Cheap ESC/POS thermal printers don't follow one standard BLE profile. These are the
// service/characteristic UUID pairs seen across common printer chipsets. Classic-Bluetooth
// SPP printers (most low-cost 58mm printers marketed for "Bluetooth" without BLE support)
// are NOT reachable from Web Bluetooth at all — only BLE GATT devices can pair here.
const CANDIDATE_PROFILES: { service: string; writeCharacteristic?: string }[] = [
  { service: "000018f0-0000-1000-8000-00805f9b34fb", writeCharacteristic: "00002af1-0000-1000-8000-00805f9b34fb" },
  { service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e", writeCharacteristic: "6e400002-b5a3-f393-e0a9-e50e24dcca9e" },
  { service: "0000ffe0-0000-1000-8000-00805f9b34fb", writeCharacteristic: "0000ffe1-0000-1000-8000-00805f9b34fb" },
  { service: "0000ff00-0000-1000-8000-00805f9b34fb" },
];

export const isBluetoothSupported = () => typeof navigator !== "undefined" && "bluetooth" in navigator;

const findWritableCharacteristic = async (
  server: BluetoothRemoteGATTServer
): Promise<BluetoothRemoteGATTCharacteristic> => {
  for (const profile of CANDIDATE_PROFILES) {
    try {
      const service = await server.getPrimaryService(profile.service);
      if (profile.writeCharacteristic) {
        const characteristic = await service.getCharacteristic(profile.writeCharacteristic);
        return characteristic;
      }
      const characteristics = await service.getCharacteristics();
      const writable = characteristics.find((c) => c.properties.write || c.properties.writeWithoutResponse);
      if (writable) return writable;
    } catch {
      // this candidate service isn't present on this device — try the next one
    }
  }
  throw new PrinterConnectionError(
    "Couldn't find a writable printer service on this Bluetooth device. It may use classic Bluetooth (SPP) rather than Bluetooth Low Energy, which browsers can't connect to directly — try USB instead."
  );
};

const connectAndBuild = async (device: BluetoothDevice): Promise<PrinterConnection> => {
  if (!device.gatt) throw new PrinterConnectionError("This Bluetooth device doesn't support GATT connections.");
  const server = await device.gatt.connect();
  const characteristic = await findWritableCharacteristic(server);
  const useWithoutResponse = !characteristic.properties.write && characteristic.properties.writeWithoutResponse;

  const CHUNK_SIZE = 180; // conservative BLE MTU-safe chunk size
  return {
    kind: "bluetooth",
    name: device.name || "Bluetooth Printer",
    async send(bytes) {
      for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
        const chunk = bytes.slice(offset, offset + CHUNK_SIZE);
        if (useWithoutResponse) {
          await characteristic.writeValueWithoutResponse(chunk);
        } else {
          await characteristic.writeValueWithResponse(chunk);
        }
      }
    },
    async disconnect() {
      device.gatt?.disconnect();
      localStorage.removeItem("nookly:printer:bluetooth");
    },
  };
};

export const requestBluetoothPrinter = async (): Promise<PrinterConnection> => {
  if (!isBluetoothSupported()) throw new PrinterNotSupportedError("Web Bluetooth is not supported in this browser.");

  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: CANDIDATE_PROFILES.map((p) => p.service),
  });
  const connection = await connectAndBuild(device);
  if (device.id) localStorage.setItem("nookly:printer:bluetooth", device.id);
  return connection;
};

export const reconnectBluetoothPrinter = async (): Promise<PrinterConnection | null> => {
  if (!isBluetoothSupported() || !navigator.bluetooth.getDevices) return null;
  const savedId = localStorage.getItem("nookly:printer:bluetooth");
  if (!savedId) return null;

  try {
    const devices = await navigator.bluetooth.getDevices();
    const device = devices.find((d) => d.id === savedId);
    if (!device) return null;
    return await connectAndBuild(device);
  } catch {
    return null;
  }
};
