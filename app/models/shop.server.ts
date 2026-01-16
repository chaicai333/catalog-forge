import prisma from "../db.server";

export async function getOrCreateShop(domain: string) {
  const existing = await prisma.shop.findUnique({ where: { domain } });
  if (existing) {
    return existing;
  }
  return prisma.shop.create({ data: { domain } });
}
