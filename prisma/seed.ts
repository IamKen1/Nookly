import { PrismaClient, PlanCode } from '@prisma/client'

const prisma = new PrismaClient()

const plans = [
  {
    code: PlanCode.SPROUT,
    name: 'Sprout',
    tagline: 'Perfect para sa isang sigla-simula na botika',
    priceMonthly: 899,
    priceYearly: 8990,
    maxStores: 1,
    maxUsers: 2,
    maxProducts: 500,
    sortOrder: 1,
    featureReports: false,
    featurePrescriptions: false,
    featureAlerts: false,
    featureMultiBranch: false,
    featureApiAccess: false,
    features: [
      '1 branch / store',
      'Up to 2 staff accounts',
      'Up to 500 products',
      'POS with barcode scanning',
      'Inventory & low-stock tracking',
      'VAT & Senior/PWD discount receipts',
      'Basic sales reports',
      'Email support',
    ],
  },
  {
    code: PlanCode.BLOOM,
    name: 'Bloom',
    tagline: 'Para sa lumalaking chain na may ilang branch',
    priceMonthly: 2499,
    priceYearly: 24990,
    maxStores: 3,
    maxUsers: 10,
    maxProducts: -1,
    sortOrder: 2,
    featureReports: true,
    featurePrescriptions: true,
    featureAlerts: true,
    featureMultiBranch: false,
    featureApiAccess: false,
    features: [
      'Up to 3 branches',
      'Up to 10 staff accounts',
      'Unlimited products',
      'Everything in Sprout',
      'Prescription (Rx) management',
      'Expiry & low-stock email alerts',
      'Sales analytics dashboard',
      'Customer profiles & loyalty points',
      'Priority chat support',
    ],
  },
  {
    code: PlanCode.EMPIRE,
    name: 'Empire',
    tagline: 'Para sa buong drugstore empire mo, unlimited na',
    priceMonthly: 4999,
    priceYearly: 49990,
    maxStores: -1,
    maxUsers: -1,
    maxProducts: -1,
    sortOrder: 3,
    featureReports: true,
    featurePrescriptions: true,
    featureAlerts: true,
    featureMultiBranch: true,
    featureApiAccess: true,
    features: [
      'Unlimited branches',
      'Unlimited staff accounts',
      'Everything in Bloom',
      'Multi-branch stock transfer',
      'Advanced analytics & exports',
      'Custom receipt branding',
      'API access',
      'Dedicated account manager',
      'Free onboarding & staff training',
    ],
  },
]

async function main() {
  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: plan,
      create: plan,
    })
  }
  console.log(`Seeded ${plans.length} plans: ${plans.map((p) => p.name).join(', ')}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
