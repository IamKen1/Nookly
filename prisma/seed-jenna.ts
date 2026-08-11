import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const TENANT_SLUG = 'jenna-pharmacy'

async function main() {
  console.log(`Seeding sample data for tenant "${TENANT_SLUG}"...`)

  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG }, include: { stores: true } })
  if (!tenant) throw new Error(`Tenant "${TENANT_SLUG}" not found — sign up first.`)
  const store = tenant.stores.find((s) => s.isMainBranch) ?? tenant.stores[0]
  if (!store) throw new Error(`Tenant "${TENANT_SLUG}" has no store.`)

  const cashier = await prisma.user.findFirst({ where: { tenantId: tenant.id, username: 'kbgutierrez' } })
  if (!cashier) throw new Error('User "kbgutierrez" not found on this tenant.')

  const categories = [
    { name: 'Pain Relief', description: 'Pain management medications' },
    { name: 'Antibiotics', description: 'Antibiotic medications' },
    { name: 'Vitamins & Supplements', description: 'Nutritional supplements' },
    { name: 'Cold & Flu', description: 'Cold and flu medications' },
    { name: 'Cardiovascular', description: 'Heart and blood pressure medications' },
    { name: 'Diabetes', description: 'Diabetes management medications' },
    { name: 'Dermatology', description: 'Skin care medications' },
    { name: 'First Aid', description: 'First aid supplies' },
    { name: 'Canned Goods', description: 'Canned food items and preserved goods' },
    { name: 'Snacks', description: 'Chips, crackers, and snack foods' },
    { name: 'Beverages', description: 'Drinks, sodas, juices, and beverages' },
    { name: 'Personal Care', description: 'Hygiene and personal care products' },
  ]
  const createdCategories = await Promise.all(
    categories.map((c) =>
      prisma.category.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: c.name } },
        update: {},
        create: { ...c, tenantId: tenant.id },
      })
    )
  )
  console.log(`Categories ready (${createdCategories.length})`)

  const suppliers = [
    {
      name: 'Zuellig Pharma',
      contactPerson: 'Maria Santos',
      email: 'orders@zuelligpharma.com.ph',
      phone: '+63 2 8884 9999',
      address: '23 Pascor Drive',
      city: 'Parañaque',
      state: 'Metro Manila',
      zipCode: '1704',
    },
    {
      name: 'Metro Drug Inc.',
      contactPerson: 'Antonio Reyes',
      email: 'procurement@metrodrug.com.ph',
      phone: '+63 2 8888 6000',
      address: '1550 Pioneer Street',
      city: 'Pasig',
      state: 'Metro Manila',
      zipCode: '1600',
    },
    {
      name: 'Unilab Pharmaceuticals',
      contactPerson: 'Jose Dela Cruz',
      email: 'sales@unilab.com.ph',
      phone: '+63 2 8858 9000',
      address: '66 United Street',
      city: 'Mandaluyong',
      state: 'Metro Manila',
      zipCode: '1550',
    },
  ]
  const createdSuppliers = await Promise.all(
    suppliers.map((s) =>
      prisma.supplier.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: s.name } },
        update: {},
        create: { ...s, tenantId: tenant.id },
      })
    )
  )
  console.log(`Suppliers ready (${createdSuppliers.length})`)

  const byName = (name: string) => createdCategories.find((c) => c.name === name)!

  const products = [
    {
      name: 'Ibuprofen 200mg',
      genericName: 'Ibuprofen',
      brandName: 'Advil',
      barcode: '123456789012',
      ndcNumber: '0573-0164-40',
      description: 'Pain reliever and fever reducer',
      strength: '200mg',
      dosageForm: 'tablet',
      manufacturer: 'Pfizer Consumer Healthcare',
      costPrice: 5.0,
      sellingPrice: 8.0,
      insurancePrice: 7.0,
      currentStock: 150,
      minimumStock: 20,
      reorderPoint: 30,
      requiresPrescription: false,
      isOTC: true,
      categoryId: byName('Pain Relief').id,
    },
    {
      name: 'Acetaminophen 500mg',
      genericName: 'Acetaminophen',
      brandName: 'Tylenol',
      barcode: '123456789013',
      ndcNumber: '0045-0419-60',
      description: 'Pain reliever and fever reducer',
      strength: '500mg',
      dosageForm: 'tablet',
      manufacturer: 'Johnson & Johnson',
      costPrice: 4.5,
      sellingPrice: 7.0,
      insurancePrice: 6.0,
      currentStock: 200,
      minimumStock: 25,
      reorderPoint: 40,
      requiresPrescription: false,
      isOTC: true,
      categoryId: byName('Pain Relief').id,
    },
    {
      name: 'Amoxicillin 500mg',
      genericName: 'Amoxicillin',
      brandName: 'Amoxil',
      barcode: '123456789014',
      ndcNumber: '0781-1506-10',
      description: 'Antibiotic for bacterial infections',
      strength: '500mg',
      dosageForm: 'capsule',
      manufacturer: 'Sandoz',
      costPrice: 10.0,
      sellingPrice: 15.0,
      insurancePrice: 12.0,
      currentStock: 75,
      minimumStock: 15,
      reorderPoint: 25,
      requiresPrescription: true,
      isOTC: false,
      categoryId: byName('Antibiotics').id,
    },
    {
      name: 'Vitamin D3 1000 IU',
      genericName: 'Cholecalciferol',
      brandName: 'Nature Made Vitamin D3',
      barcode: '123456789015',
      description: 'Vitamin D supplement for bone health',
      strength: '1000 IU',
      dosageForm: 'softgel',
      manufacturer: 'Pharmavite',
      costPrice: 8.0,
      sellingPrice: 12.0,
      currentStock: 100,
      minimumStock: 20,
      reorderPoint: 30,
      requiresPrescription: false,
      isOTC: true,
      categoryId: byName('Vitamins & Supplements').id,
    },
    {
      name: 'Dextromethorphan 15mg',
      genericName: 'Dextromethorphan HBr',
      brandName: 'Robitussin DM',
      barcode: '123456789016',
      description: 'Cough suppressant',
      strength: '15mg',
      dosageForm: 'syrup',
      manufacturer: 'Pfizer Consumer Healthcare',
      costPrice: 6.0,
      sellingPrice: 9.0,
      currentStock: 60,
      minimumStock: 10,
      reorderPoint: 20,
      requiresPrescription: false,
      isOTC: true,
      categoryId: byName('Cold & Flu').id,
    },
    {
      name: 'Losartan 50mg',
      genericName: 'Losartan Potassium',
      brandName: 'Cozaar',
      barcode: '123456789017',
      description: 'Blood pressure medication',
      strength: '50mg',
      dosageForm: 'tablet',
      manufacturer: 'Unilab',
      costPrice: 9.0,
      sellingPrice: 14.0,
      currentStock: 90,
      minimumStock: 15,
      reorderPoint: 25,
      requiresPrescription: true,
      isOTC: false,
      categoryId: byName('Cardiovascular').id,
    },
    {
      name: 'Metformin 500mg',
      genericName: 'Metformin HCl',
      brandName: 'Glucophage',
      barcode: '123456789018',
      description: 'Oral diabetes medication',
      strength: '500mg',
      dosageForm: 'tablet',
      manufacturer: 'Unilab',
      costPrice: 5.5,
      sellingPrice: 9.5,
      currentStock: 5,
      minimumStock: 15,
      reorderPoint: 25,
      requiresPrescription: true,
      isOTC: false,
      categoryId: byName('Diabetes').id,
    },
    {
      name: 'Betamethasone Cream 0.1%',
      genericName: 'Betamethasone',
      brandName: 'Diprosone',
      barcode: '123456789019',
      description: 'Topical corticosteroid for skin conditions',
      strength: '0.1%',
      dosageForm: 'cream',
      manufacturer: 'Zuellig Pharma',
      costPrice: 45.0,
      sellingPrice: 68.0,
      currentStock: 0,
      minimumStock: 5,
      reorderPoint: 10,
      requiresPrescription: true,
      isOTC: false,
      categoryId: byName('Dermatology').id,
    },
    {
      name: 'Alcohol 70% 500mL',
      genericName: 'Isopropyl Alcohol',
      brandName: "Green Cross",
      barcode: '123456789020',
      description: 'Antiseptic disinfectant',
      strength: '70%',
      dosageForm: 'solution',
      manufacturer: 'Green Cross',
      costPrice: 35.0,
      sellingPrice: 55.0,
      currentStock: 120,
      minimumStock: 20,
      reorderPoint: 30,
      requiresPrescription: false,
      isOTC: true,
      categoryId: byName('First Aid').id,
    },
    {
      name: 'Bottled Water 500mL',
      brandName: 'Wilkins',
      barcode: '123456789021',
      description: 'Purified drinking water',
      manufacturer: 'Asia Brewery',
      costPrice: 8.0,
      sellingPrice: 15.0,
      currentStock: 300,
      minimumStock: 50,
      reorderPoint: 80,
      requiresPrescription: false,
      isOTC: true,
      isVatable: true,
      categoryId: byName('Beverages').id,
    },
  ]

  const createdProducts = []
  for (const { currentStock, ...product } of products) {
    const created = await prisma.product.upsert({
      where: { tenantId_barcode: { tenantId: tenant.id, barcode: product.barcode } },
      update: {},
      create: { ...product, tenantId: tenant.id },
    })
    await prisma.productStock.upsert({
      where: { productId_storeId: { productId: created.id, storeId: store.id } },
      update: { currentStock },
      create: { productId: created.id, storeId: store.id, currentStock },
    })
    createdProducts.push(created)
  }
  console.log(`Products ready (${createdProducts.length}), with per-branch stock`)

  for (let i = 0; i < createdProducts.length; i++) {
    const product = createdProducts[i]
    const supplier = createdSuppliers[i % createdSuppliers.length]
    await prisma.productSupplier.upsert({
      where: { productId_supplierId: { productId: product.id, supplierId: supplier.id } },
      update: {},
      create: {
        productId: product.id,
        supplierId: supplier.id,
        supplierCode: `SUP-${product.name.substring(0, 3).toUpperCase()}-${(i + 1) * 17}`,
        leadTime: ((i * 3) % 14) + 1,
        minimumOrder: ((i * 7) % 50) + 10,
      },
    })
  }
  console.log('Linked products to suppliers')

  const doctor = await prisma.doctor.upsert({
    where: { tenantId_licenseNumber: { tenantId: tenant.id, licenseNumber: 'MD123456' } },
    update: {},
    create: {
      tenantId: tenant.id,
      firstName: 'Dr. Michael',
      lastName: 'Smith',
      specialty: 'Internal Medicine',
      licenseNumber: 'MD123456',
      deaNumber: 'BS1234567',
      npiNumber: '1234567890',
      phone: '555-123-4567',
      email: 'dr.smith@example.com',
      address: '123 Medical Center Dr',
      city: 'Healthcare City',
      state: 'CA',
      zipCode: '90210',
    },
  })
  console.log('Doctor ready')

  let customer = await prisma.customer.findFirst({ where: { tenantId: tenant.id, email: 'jane.smith@email.com' } })
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@email.com',
        phone: '555-987-6543',
        address: '456 Customer Lane',
        city: 'Customer City',
        state: 'CA',
        zipCode: '90211',
        dateOfBirth: new Date('1985-06-15'),
        gender: 'FEMALE',
        insuranceCarrier: 'Blue Cross Blue Shield',
        insuranceId: 'BCBS123456789',
        insuranceGroup: 'GRP001',
        allergies: 'Penicillin',
        loyaltyPoints: 150,
      },
    })
  }
  console.log('Customer ready')

  // Sample prescription (Amoxicillin is Rx-only) so the Prescriptions screen has data too.
  const amoxicillin = createdProducts.find((p) => p.barcode === '123456789014')!
  const existingRx = await prisma.prescription.findFirst({ where: { tenantId: tenant.id, prescriptionNumber: 'RX-DEMO-0001' } })
  const prescription =
    existingRx ??
    (await prisma.prescription.create({
      data: {
        tenantId: tenant.id,
        prescriptionNumber: 'RX-DEMO-0001',
        originalDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        writtenDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        instructions: 'Take one capsule three times a day for 7 days.',
        refillsAllowed: 1,
        daysSupply: 7,
        customerId: customer.id,
        doctorId: doctor.id,
        items: { create: [{ productId: amoxicillin.id, quantity: 21, instructions: '1 cap TID x 7 days' }] },
      },
    }))
  console.log('Prescription ready')

  // A few sample sales over the last several days so Sales/Reports have data to show.
  const existingSalesCount = await prisma.sale.count({ where: { tenantId: tenant.id } })
  if (existingSalesCount === 0) {
    const sampleSales = [
      { daysAgo: 5, items: [{ product: createdProducts[0], qty: 2 }, { product: createdProducts[3], qty: 1 }], payment: 'CASH' as const, cash: 50 },
      { daysAgo: 4, items: [{ product: createdProducts[1], qty: 3 }], payment: 'CASH' as const, cash: 30 },
      { daysAgo: 2, items: [{ product: createdProducts[8], qty: 5 }, { product: createdProducts[9], qty: 2 }], payment: 'CREDIT_CARD' as const },
      { daysAgo: 1, items: [{ product: createdProducts[0], qty: 1 }, { product: createdProducts[7], qty: 1 }], payment: 'CASH' as const, cash: 100 },
      { daysAgo: 0, items: [{ product: createdProducts[5], qty: 2 }], payment: 'DEBIT_CARD' as const },
    ]

    for (let i = 0; i < sampleSales.length; i++) {
      const sale = sampleSales[i]
      const saleDate = new Date(Date.now() - sale.daysAgo * 24 * 60 * 60 * 1000)
      let vatableSubtotal = 0
      let nonVatableSubtotal = 0
      for (const line of sale.items) {
        const lineTotal = Number(line.product.sellingPrice) * line.qty
        if (line.product.isVatable) vatableSubtotal += lineTotal
        else nonVatableSubtotal += lineTotal
      }
      const subtotal = vatableSubtotal + nonVatableSubtotal
      const vatAmount = Number(((vatableSubtotal * 12) / 112).toFixed(2))
      const totalAmount = subtotal
      const cashReceived = sale.cash ?? totalAmount
      const changeGiven = sale.cash ? Number((sale.cash - totalAmount).toFixed(2)) : 0

      const created = await prisma.sale.create({
        data: {
          tenantId: tenant.id,
          storeId: store.id,
          saleNumber: `OR-DEMO-${String(i + 1).padStart(4, '0')}`,
          subtotal,
          vatableSales: Number((vatableSubtotal - vatAmount).toFixed(2)),
          nonVatableSales: nonVatableSubtotal,
          taxAmount: vatAmount,
          discountType: 'NONE',
          discountAmount: 0,
          totalAmount,
          paymentMethod: sale.payment,
          cashReceived: sale.payment === 'CASH' ? cashReceived : null,
          changeGiven: sale.payment === 'CASH' ? changeGiven : null,
          customerId: i === 0 ? customer.id : null,
          userId: cashier.id,
          saleDate,
        },
      })

      await prisma.saleItem.createMany({
        data: sale.items.map((line) => ({
          saleId: created.id,
          productId: line.product.id,
          quantity: line.qty,
          unitPrice: line.product.sellingPrice,
          totalPrice: Number(line.product.sellingPrice) * line.qty,
        })),
      })

      await prisma.stockMovement.createMany({
        data: sale.items.map((line) => ({
          tenantId: tenant.id,
          storeId: store.id,
          type: 'SALE' as const,
          quantity: -line.qty,
          reason: `Sale ${created.saleNumber}`,
          reference: created.saleNumber,
          productId: line.product.id,
          userId: cashier.id,
        })),
      })

      for (const line of sale.items) {
        await prisma.productStock.update({
          where: { productId_storeId: { productId: line.product.id, storeId: store.id } },
          data: { currentStock: { decrement: line.qty } },
        })
      }
    }
    console.log(`Created ${sampleSales.length} sample sales`)
  } else {
    console.log('Sales already exist for this tenant — skipped sample sales.')
  }

  console.log('\nDone. Log in at /login with:')
  console.log(`  workspace slug: ${TENANT_SLUG}`)
  console.log('  username: kbgutierrez')
  console.log('  (password as set at signup)')
  void prescription
}

main()
  .catch((e) => {
    console.error('Error seeding jenna-pharmacy sample data:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
