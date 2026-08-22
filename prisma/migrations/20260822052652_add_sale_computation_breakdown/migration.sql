-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "nonVatableDiscountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "nonVatableGross" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "vatRemovedFromVatable" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "vatableDiscountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "vatableGross" DECIMAL(10,2) NOT NULL DEFAULT 0;
