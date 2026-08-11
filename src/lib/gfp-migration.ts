import { prisma } from "@/lib/prisma";
import { gfpLegacyClient } from "@/lib/gfp-legacy-client";

export interface MigrationTableResult {
  table: string;
  created: number;
  updated: number;
  failed: number;
  errors: string[];
}

export interface MigrationSummary {
  tenantId: string;
  storeId: string;
  tables: MigrationTableResult[];
  startedAt: string;
  finishedAt: string;
}

const CONCURRENCY = 10;

async function runBatch<T>(items: T[], fn: (item: T) => Promise<"created" | "updated">, table: string): Promise<MigrationTableResult> {
  const result: MigrationTableResult = { table, created: 0, updated: 0, failed: 0, errors: [] };
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const chunk = items.slice(i, i + CONCURRENCY);
    const outcomes = await Promise.allSettled(chunk.map(fn));
    for (const outcome of outcomes) {
      if (outcome.status === "fulfilled") {
        if (outcome.value === "created") result.created += 1;
        else result.updated += 1;
      } else {
        result.failed += 1;
        const message = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        if (result.errors.length < 10) result.errors.push(message.split("\n")[0]);
      }
    }
  }
  return result;
}

const dec = (value: unknown) => (value == null ? null : String(value));

export async function migrateGfpDataToTenant(tenantId: string): Promise<MigrationSummary> {
  const startedAt = new Date().toISOString();

  const mainStore = await prisma.store.findFirst({
    where: { tenantId },
    orderBy: [{ isMainBranch: "desc" }, { createdAt: "asc" }],
  });
  if (!mainStore) throw new Error("Target tenant has no store to attach migrated data to.");
  const storeId = mainStore.id;

  const tables: MigrationTableResult[] = [];

  // 1. Categories
  const categories = await gfpLegacyClient.category.findMany();
  tables.push(
    await runBatch(
      categories,
      async (c) => {
        const existing = await prisma.category.findUnique({ where: { id: c.id } });
        await prisma.category.upsert({
          where: { id: c.id },
          create: { id: c.id, tenantId, name: c.name, description: c.description, isActive: c.isActive },
          update: { name: c.name, description: c.description, isActive: c.isActive },
        });
        return existing ? "updated" : "created";
      },
      "categories"
    )
  );

  // 2. Suppliers
  const suppliers = await gfpLegacyClient.supplier.findMany();
  tables.push(
    await runBatch(
      suppliers,
      async (s) => {
        const existing = await prisma.supplier.findUnique({ where: { id: s.id } });
        await prisma.supplier.upsert({
          where: { id: s.id },
          create: {
            id: s.id, tenantId, name: s.name, contactPerson: s.contactPerson, email: s.email, phone: s.phone,
            address: s.address, city: s.city, state: s.state, zipCode: s.zipCode, isActive: s.isActive,
          },
          update: {
            name: s.name, contactPerson: s.contactPerson, email: s.email, phone: s.phone,
            address: s.address, city: s.city, state: s.state, zipCode: s.zipCode, isActive: s.isActive,
          },
        });
        return existing ? "updated" : "created";
      },
      "suppliers"
    )
  );

  // 3. Customers
  const customers = await gfpLegacyClient.customer.findMany();
  tables.push(
    await runBatch(
      customers,
      async (c) => {
        const existing = await prisma.customer.findUnique({ where: { id: c.id } });
        const data = {
          firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone,
          address: c.address, city: c.city, state: c.state, zipCode: c.zipCode, dateOfBirth: c.dateOfBirth,
          gender: c.gender, insuranceCarrier: c.insuranceCarrier, insuranceId: c.insuranceId, insuranceGroup: c.insuranceGroup,
          allergies: c.allergies, medicalNotes: c.medicalNotes, isActive: c.isActive, loyaltyPoints: c.loyaltyPoints,
        };
        await prisma.customer.upsert({ where: { id: c.id }, create: { id: c.id, tenantId, ...data }, update: data });
        return existing ? "updated" : "created";
      },
      "customers"
    )
  );

  // 4. Doctors
  const doctors = await gfpLegacyClient.doctor.findMany();
  tables.push(
    await runBatch(
      doctors,
      async (d) => {
        const existing = await prisma.doctor.findUnique({ where: { id: d.id } });
        const data = {
          firstName: d.firstName, lastName: d.lastName, specialty: d.specialty, licenseNumber: d.licenseNumber,
          deaNumber: d.deaNumber, npiNumber: d.npiNumber, phone: d.phone, email: d.email,
          address: d.address, city: d.city, state: d.state, zipCode: d.zipCode, isActive: d.isActive,
        };
        await prisma.doctor.upsert({ where: { id: d.id }, create: { id: d.id, tenantId, ...data }, update: data });
        return existing ? "updated" : "created";
      },
      "doctors"
    )
  );

  // 5. Users — password hash copied as-is (bcrypt hashes are portable), so staff keep their existing password.
  const users = await gfpLegacyClient.user.findMany();
  tables.push(
    await runBatch(
      users,
      async (u) => {
        const existing = await prisma.user.findUnique({ where: { id: u.id } });
        const data = {
          storeId, email: u.email, username: u.username, password: u.password,
          firstName: u.firstName, lastName: u.lastName, role: u.role as never, isActive: u.isActive,
        };
        await prisma.user.upsert({ where: { id: u.id }, create: { id: u.id, tenantId, ...data }, update: data });
        return existing ? "updated" : "created";
      },
      "users"
    )
  );

  // 6. Products
  const products = await gfpLegacyClient.product.findMany();
  tables.push(
    await runBatch(
      products,
      async (p) => {
        const existing = await prisma.product.findUnique({ where: { id: p.id } });
        const data = {
          name: p.name, genericName: p.genericName, brandName: p.brandName, barcode: p.barcode, ndcNumber: p.ndcNumber,
          description: p.description, strength: p.strength, dosageForm: p.dosageForm, manufacturer: p.manufacturer,
          classification: p.classification, therapeuticUse: p.therapeuticUse, costPrice: dec(p.costPrice)!,
          costPricePerBox: dec(p.costPricePerBox), sellingPrice: dec(p.sellingPrice)!, insurancePrice: dec(p.insurancePrice),
          minimumStock: p.minimumStock, maximumStock: p.maximumStock, reorderPoint: p.reorderPoint,
          drugSchedule: p.drugSchedule as never, requiresPrescription: p.requiresPrescription, isOTC: p.isOTC,
          isVatable: p.isVatable, isActive: p.isActive, categoryId: p.categoryId, imageUrl: p.imageUrl,
          productType: p.productType, sku: p.sku, weight: p.weight, dimensions: p.dimensions, color: p.color,
          size: p.size, material: p.material, expiryDate: p.expiryDate,
        };
        await prisma.product.upsert({ where: { id: p.id }, create: { id: p.id, tenantId, ...data }, update: data });
        await prisma.productStock.upsert({
          where: { productId_storeId: { productId: p.id, storeId } },
          create: { productId: p.id, storeId, currentStock: p.currentStock },
          update: { currentStock: p.currentStock },
        });
        return existing ? "updated" : "created";
      },
      "products"
    )
  );

  // 7. Product batches
  const batches = await gfpLegacyClient.productBatch.findMany();
  tables.push(
    await runBatch(
      batches,
      async (b) => {
        const existing = await prisma.productBatch.findUnique({ where: { id: b.id } });
        const data = { batchNumber: b.batchNumber, expirationDate: b.expirationDate, quantity: b.quantity, costPrice: dec(b.costPrice)!, receivedDate: b.receivedDate, productId: b.productId };
        await prisma.productBatch.upsert({ where: { id: b.id }, create: { id: b.id, ...data }, update: data });
        return existing ? "updated" : "created";
      },
      "product_batches"
    )
  );

  // 8. Product-supplier links
  const productSuppliers = await gfpLegacyClient.productSupplier.findMany();
  tables.push(
    await runBatch(
      productSuppliers,
      async (ps) => {
        const existing = await prisma.productSupplier.findUnique({ where: { id: ps.id } });
        const data = { supplierCode: ps.supplierCode, leadTime: ps.leadTime, minimumOrder: ps.minimumOrder, productId: ps.productId, supplierId: ps.supplierId };
        await prisma.productSupplier.upsert({ where: { id: ps.id }, create: { id: ps.id, ...data }, update: data });
        return existing ? "updated" : "created";
      },
      "product_suppliers"
    )
  );

  // 9. Prescriptions
  const prescriptions = await gfpLegacyClient.prescription.findMany();
  tables.push(
    await runBatch(
      prescriptions,
      async (rx) => {
        const existing = await prisma.prescription.findUnique({ where: { id: rx.id } });
        const data = {
          prescriptionNumber: rx.prescriptionNumber, originalDate: rx.originalDate, writtenDate: rx.writtenDate,
          instructions: rx.instructions, refillsAllowed: rx.refillsAllowed, refillsUsed: rx.refillsUsed,
          daysSupply: rx.daysSupply, status: rx.status as never, customerId: rx.customerId, doctorId: rx.doctorId,
        };
        await prisma.prescription.upsert({ where: { id: rx.id }, create: { id: rx.id, tenantId, ...data }, update: data });
        return existing ? "updated" : "created";
      },
      "prescriptions"
    )
  );

  // 10. Prescription items
  const prescriptionItems = await gfpLegacyClient.prescriptionItem.findMany();
  tables.push(
    await runBatch(
      prescriptionItems,
      async (pi) => {
        const existing = await prisma.prescriptionItem.findUnique({ where: { id: pi.id } });
        const data = { quantity: pi.quantity, instructions: pi.instructions, substituted: pi.substituted, prescriptionId: pi.prescriptionId, productId: pi.productId };
        await prisma.prescriptionItem.upsert({ where: { id: pi.id }, create: { id: pi.id, ...data }, update: data });
        return existing ? "updated" : "created";
      },
      "prescription_items"
    )
  );

  // 11. Sales
  const sales = await gfpLegacyClient.sale.findMany();
  tables.push(
    await runBatch(
      sales,
      async (s) => {
        const existing = await prisma.sale.findUnique({ where: { id: s.id } });
        const data = {
          storeId, saleNumber: s.saleNumber, subtotal: dec(s.subtotal)!, vatableSales: dec(s.vatableSales),
          nonVatableSales: dec(s.nonVatableSales), taxAmount: dec(s.taxAmount)!, discountType: s.discountType,
          discountAmount: dec(s.discountAmount)!, totalAmount: dec(s.totalAmount)!, paymentMethod: s.paymentMethod as never,
          cashReceived: dec(s.cashReceived), changeGiven: dec(s.changeGiven), insuranceClaim: s.insuranceClaim,
          copayAmount: dec(s.copayAmount), insurancePaid: dec(s.insurancePaid), orderRemarks: s.orderRemarks,
          status: s.status as never, saleDate: s.saleDate, customerId: s.customerId, userId: s.userId, prescriptionId: s.prescriptionId,
        };
        await prisma.sale.upsert({ where: { id: s.id }, create: { id: s.id, tenantId, ...data }, update: data });
        return existing ? "updated" : "created";
      },
      "sales"
    )
  );

  // 12. Sale items
  const saleItems = await gfpLegacyClient.saleItem.findMany();
  tables.push(
    await runBatch(
      saleItems,
      async (si) => {
        const existing = await prisma.saleItem.findUnique({ where: { id: si.id } });
        const data = { quantity: si.quantity, unitPrice: dec(si.unitPrice)!, totalPrice: dec(si.totalPrice)!, discountAmount: dec(si.discountAmount)!, saleId: si.saleId, productId: si.productId };
        await prisma.saleItem.upsert({ where: { id: si.id }, create: { id: si.id, ...data }, update: data });
        return existing ? "updated" : "created";
      },
      "sale_items"
    )
  );

  // 13. Stock movements
  const stockMovements = await gfpLegacyClient.stockMovement.findMany();
  tables.push(
    await runBatch(
      stockMovements,
      async (sm) => {
        const existing = await prisma.stockMovement.findUnique({ where: { id: sm.id } });
        const data = {
          storeId, type: sm.type as never, quantity: sm.quantity, reason: sm.reason, reference: sm.reference,
          notes: sm.notes, createdAt: sm.createdAt, productId: sm.productId, userId: sm.userId,
        };
        await prisma.stockMovement.upsert({ where: { id: sm.id }, create: { id: sm.id, tenantId, ...data }, update: data });
        return existing ? "updated" : "created";
      },
      "stock_movements"
    )
  );

  // 14. Receipt settings — merge in, but deliberately do NOT copy receiptTitle:
  // Nookly's default ("Acknowledgement Receipt (AR)") must not be overwritten
  // with gfp-pos's "Official Receipt" — Nookly isn't BIR-accredited.
  const legacyReceipt = await gfpLegacyClient.receiptSettings.findFirst();
  if (legacyReceipt) {
    await prisma.receiptSettings.upsert({
      where: { tenantId },
      create: {
        tenantId, storeName: legacyReceipt.storeName, addressLine1: legacyReceipt.addressLine1,
        addressLine2: legacyReceipt.addressLine2, contactNumber: legacyReceipt.contactNumber, tin: legacyReceipt.tin,
        permitNumber: legacyReceipt.permitNumber, accreditationNumber: legacyReceipt.accreditationNumber,
        serialNumberLabel: legacyReceipt.serialNumberLabel, footerMessage: legacyReceipt.footerMessage,
        showVatBreakdown: legacyReceipt.showVatBreakdown, showCashierName: legacyReceipt.showCashierName,
        showCustomerName: legacyReceipt.showCustomerName, includeOrderRemarks: legacyReceipt.includeOrderRemarks,
      },
      update: {
        storeName: legacyReceipt.storeName, addressLine1: legacyReceipt.addressLine1, addressLine2: legacyReceipt.addressLine2,
        contactNumber: legacyReceipt.contactNumber, tin: legacyReceipt.tin, permitNumber: legacyReceipt.permitNumber,
        accreditationNumber: legacyReceipt.accreditationNumber, serialNumberLabel: legacyReceipt.serialNumberLabel,
        footerMessage: legacyReceipt.footerMessage, showVatBreakdown: legacyReceipt.showVatBreakdown,
        showCashierName: legacyReceipt.showCashierName, showCustomerName: legacyReceipt.showCustomerName,
        includeOrderRemarks: legacyReceipt.includeOrderRemarks,
      },
    });
  }

  // 15. Notification settings
  const legacyNotif = await gfpLegacyClient.notificationSettings.findFirst();
  if (legacyNotif) {
    await prisma.notificationSettings.upsert({
      where: { tenantId },
      create: {
        tenantId, emailNotificationsEnabled: legacyNotif.emailNotificationsEnabled,
        saleNotificationsEnabled: legacyNotif.saleNotificationsEnabled, lowStockNotificationsEnabled: legacyNotif.lowStockNotificationsEnabled,
        outOfStockNotificationsEnabled: legacyNotif.outOfStockNotificationsEnabled, endOfDaySummaryEnabled: legacyNotif.endOfDaySummaryEnabled,
        monthlySummaryEnabled: legacyNotif.monthlySummaryEnabled,
      },
      update: {
        emailNotificationsEnabled: legacyNotif.emailNotificationsEnabled, saleNotificationsEnabled: legacyNotif.saleNotificationsEnabled,
        lowStockNotificationsEnabled: legacyNotif.lowStockNotificationsEnabled, outOfStockNotificationsEnabled: legacyNotif.outOfStockNotificationsEnabled,
        endOfDaySummaryEnabled: legacyNotif.endOfDaySummaryEnabled, monthlySummaryEnabled: legacyNotif.monthlySummaryEnabled,
      },
    });
  }

  return { tenantId, storeId, tables, startedAt, finishedAt: new Date().toISOString() };
}
