import { PrismaClient, Prisma } from '@prisma/client'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const prisma = new PrismaClient()
const TENANT_SLUG = 'jenna-pharmacy'

interface ExportedCategory {
  id: string
  name: string
  description: string | null
}

interface ExportedProduct {
  id: string
  name: string
  genericName: string | null
  brandName: string | null
  barcode: string | null
  ndcNumber: string | null
  description: string | null
  strength: string | null
  dosageForm: string | null
  manufacturer: string | null
  classification: string | null
  therapeuticUse: string | null
  costPrice: number
  costPricePerBox: number | null
  sellingPrice: number
  insurancePrice: number | null
  currentStock: number
  minimumStock: number
  maximumStock: number | null
  reorderPoint: number
  drugSchedule: string | null
  requiresPrescription: boolean
  isOTC: boolean
  isVatable: boolean
  isActive: boolean
  categoryId: string
  imageUrl: string | null
  productType: string | null
  sku: string | null
  weight: number | null
  dimensions: string | null
  color: string | null
  size: string | null
  material: string | null
  expiryDate: string | null
  category: { name: string }
}

async function main() {
  const filePath = path.join(process.cwd(), 'prisma', 'catalog-export.json')
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as {
    categories: ExportedCategory[]
    products: ExportedProduct[]
  }
  console.log(`Loaded ${raw.categories.length} categories, ${raw.products.length} products from export`)

  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG }, include: { stores: true } })
  if (!tenant) throw new Error(`Tenant "${TENANT_SLUG}" not found.`)
  const store = tenant.stores.find((s) => s.isMainBranch) ?? tenant.stores[0]
  if (!store) throw new Error(`Tenant "${TENANT_SLUG}" has no store.`)

  // --- categories: upsert by name, build old-id -> new-id map ---
  const categoryIdMap = new Map<string, string>()
  const uniqueCategoryNames = new Map<string, ExportedCategory>()
  for (const c of raw.categories) {
    if (!uniqueCategoryNames.has(c.name)) uniqueCategoryNames.set(c.name, c)
  }
  for (const c of uniqueCategoryNames.values()) {
    const created = await prisma.category.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: c.name } },
      update: {},
      create: { tenantId: tenant.id, name: c.name, description: c.description },
    })
    categoryIdMap.set(c.id, created.id)
  }
  console.log(`Categories ready (${categoryIdMap.size})`)

  // --- products ---
  let created = 0
  let updated = 0
  let skipped = 0
  const seenBarcodes = new Set<string>()
  const seenSkus = new Set<string>()

  const CHUNK_SIZE = 15
  for (let i = 0; i < raw.products.length; i += CHUNK_SIZE) {
    const chunk = raw.products.slice(i, i + CHUNK_SIZE)
    await Promise.all(
      chunk.map(async (p) => {
        try {
          const categoryId = categoryIdMap.get(p.categoryId)
          if (!categoryId) {
            skipped++
            return
          }

          const barcode = p.barcode && !seenBarcodes.has(p.barcode) ? p.barcode : null
          if (p.barcode) seenBarcodes.add(p.barcode)
          const sku = p.sku && !seenSkus.has(p.sku) ? p.sku : null
          if (p.sku) seenSkus.add(p.sku)

          const drugSchedule = p.drugSchedule && p.drugSchedule !== 'UNSCHEDULED' ? (p.drugSchedule as never) : null

          const data = {
            name: p.name,
            genericName: p.genericName,
            brandName: p.brandName,
            barcode,
            ndcNumber: null, // ndcNumber uniqueness collides easily across re-imports; skip carrying it over
            description: p.description,
            strength: p.strength,
            dosageForm: p.dosageForm,
            manufacturer: p.manufacturer,
            classification: p.classification,
            therapeuticUse: p.therapeuticUse,
            costPrice: new Prisma.Decimal(p.costPrice),
            costPricePerBox: p.costPricePerBox != null ? new Prisma.Decimal(p.costPricePerBox) : null,
            sellingPrice: new Prisma.Decimal(p.sellingPrice),
            insurancePrice: p.insurancePrice != null ? new Prisma.Decimal(p.insurancePrice) : null,
            minimumStock: p.minimumStock,
            maximumStock: p.maximumStock,
            reorderPoint: p.reorderPoint,
            drugSchedule,
            requiresPrescription: p.requiresPrescription,
            isOTC: p.isOTC,
            isVatable: p.isVatable,
            isActive: p.isActive,
            categoryId,
            imageUrl: p.imageUrl,
            productType: p.productType,
            sku,
            weight: p.weight,
            dimensions: p.dimensions,
            color: p.color,
            size: p.size,
            material: p.material,
            expiryDate: p.expiryDate ? new Date(p.expiryDate) : null,
          }

          let productId: string
          if (barcode) {
            const existing = await prisma.product.findUnique({
              where: { tenantId_barcode: { tenantId: tenant.id, barcode } },
            })
            if (existing) {
              await prisma.product.update({ where: { id: existing.id }, data })
              productId = existing.id
              updated++
            } else {
              const createdProduct = await prisma.product.create({ data: { ...data, tenantId: tenant.id } })
              productId = createdProduct.id
              created++
            }
          } else {
            const existing = await prisma.product.findFirst({
              where: { tenantId: tenant.id, name: p.name, strength: p.strength, dosageForm: p.dosageForm },
            })
            if (existing) {
              await prisma.product.update({ where: { id: existing.id }, data })
              productId = existing.id
              updated++
            } else {
              const createdProduct = await prisma.product.create({ data: { ...data, tenantId: tenant.id } })
              productId = createdProduct.id
              created++
            }
          }

          await prisma.productStock.upsert({
            where: { productId_storeId: { productId, storeId: store.id } },
            update: { currentStock: p.currentStock },
            create: { productId, storeId: store.id, currentStock: p.currentStock },
          })
        } catch (err) {
          console.error(`Failed on product "${p.name}":`, err instanceof Error ? err.message : err)
          skipped++
        }
      })
    )
    console.log(`Processed ${Math.min(i + CHUNK_SIZE, raw.products.length)}/${raw.products.length}`)
  }

  console.log(`\nDone. Created ${created}, updated ${updated}, skipped ${skipped}.`)
}

main()
  .catch((e) => {
    console.error('Import failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
