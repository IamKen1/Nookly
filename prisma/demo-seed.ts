
import { PrismaClient, PlanCode } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const DEMO_SLUG = 'demo-pharmacy'

async function main() {
  console.log('Seeding Nookly demo tenant...')

  const plan =
    (await prisma.plan.findUnique({ where: { code: PlanCode.BLOOM } })) ??
    (await prisma.plan.findFirst())
  if (!plan) {
    throw new Error('No plans found. Run `npm run db:seed` first to seed Sprout/Bloom/Empire.')
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug: DEMO_SLUG },
    update: {},
    create: {
      name: "Kendall's Pharmacy (Demo)",
      slug: DEMO_SLUG,
      ownerEmail: 'admin@gfp-pos.com',
      onboardingStep: 3,
      stores: {
        create: { name: "Kendall's Pharmacy - Main Branch", code: 'MAIN', isMainBranch: true },
      },
      subscription: {
        create: {
          planId: plan.id,
          status: 'ACTIVE',
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      },
      receiptSettings: { create: { storeName: "Kendall's Pharmacy" } },
      notificationSettings: { create: {} },
    },
    include: { stores: true },
  })
  const store = tenant.stores[0]
  console.log(`Tenant ready: ${tenant.slug} (store: ${store.code})`)

  const password = await bcrypt.hash('password', 10)
  const users = [
    { email: 'admin@gfp-pos.com', username: 'admin', firstName: 'Ken', lastName: 'Administrator', role: 'ADMIN' as const },
    { email: 'pharmacist@gfp-pos.com', username: 'pharmacist', firstName: 'Trisha', lastName: 'Gutierrez', role: 'PHARMACIST' as const },
    { email: 'cashier@gfp-pos.com', username: 'cashier', firstName: 'Kendal', lastName: 'Taylor', role: 'CASHIER' as const },
  ]
  for (const u of users) {
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: u.email } },
      update: {},
      create: { ...u, tenantId: tenant.id, storeId: store.id, password },
    })
  }
  console.log('Created demo users (password: "password")')

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
  console.log('Created categories')

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
  console.log('Created suppliers')

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
  console.log('Created products + per-branch stock')

  for (let i = 0; i < createdProducts.length; i++) {
    const product = createdProducts[i]
    const supplier = createdSuppliers[i % createdSuppliers.length]
    await prisma.productSupplier.upsert({
      where: { productId_supplierId: { productId: product.id, supplierId: supplier.id } },
      update: {},
      create: {
        productId: product.id,
        supplierId: supplier.id,
        supplierCode: `SUP-${product.name.substring(0, 3).toUpperCase()}-${Math.floor(Math.random() * 1000)}`,
        leadTime: Math.floor(Math.random() * 14) + 1,
        minimumOrder: Math.floor(Math.random() * 50) + 10,
      },
    })
  }
  console.log('Linked products to suppliers')

  await prisma.doctor.upsert({
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
  console.log('Created sample doctor')

  const existingCustomer = await prisma.customer.findFirst({
    where: { tenantId: tenant.id, email: 'jane.smith@email.com' },
  })
  if (!existingCustomer) {
    await prisma.customer.create({
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
  console.log('Created sample customer')

  console.log(`\nDemo tenant ready — login at /login with:`)
  console.log(`  workspace slug: ${DEMO_SLUG}`)
  console.log(`  username: admin / pharmacist / cashier`)
  console.log(`  password: password`)
}

main()
  .catch((e) => {
    console.error('Error during demo seeding:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
