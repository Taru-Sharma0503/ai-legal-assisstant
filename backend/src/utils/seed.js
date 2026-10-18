
import bcrypt from 'bcryptjs';
import { prisma } from '../config/db.js';
import { logger } from './logger.js';
import { INITIAL_SERVICES } from '../modules/services/service.service.js';
import { assertNonProductionDatabase, seedOfficeRecords } from './officeSeed.js';

export const seedDatabase = async () => {
  if (!prisma) {
    logger.warn('[Seed] PrismaClient is not initialized. Skipping seed.');
    return;
  }

  try {
    assertNonProductionDatabase({ databaseUrl: process.env.DATABASE_URL });
    logger.info('[Seed] Seeding database...');

    // 1. Seed Users (Citizen, Agent, Admin)
    const citizenPassword = await bcrypt.hash('StrongPassword123', 10);
    const adminPassword = await bcrypt.hash('AdminPassword123', 10);

    const citizen = await prisma.user.upsert({
      where: { email: 'taru@example.com' },
      update: {},
      create: {
        name: 'Taru Sharma',
        email: 'taru@example.com',
        password: citizenPassword,
        role: 'CITIZEN',
        preferredLanguage: 'hi'
      }
    });

    const admin = await prisma.user.upsert({
      where: { email: 'admin@legal.gov.in' },
      update: {},
      create: {
        name: 'Government Admin',
        email: 'admin@legal.gov.in',
        password: adminPassword,
        role: 'ADMIN',
        preferredLanguage: 'en'
      }
    });

    const agent = await prisma.user.upsert({
      where: { email: 'agent@legal.gov.in' },
      update: {},
      create: {
        name: 'Legal Assistant Agent',
        email: 'agent@legal.gov.in',
        password: adminPassword,
        role: 'AGENT',
        preferredLanguage: 'hi'
      }
    });

    logger.info(
      `[Seed] Users seeded: Citizen (${citizen.email}), Admin (${admin.email}), Agent (${agent.email})`
    );

    // 2. Seed Services and Documents
    for (const serviceData of INITIAL_SERVICES) {
      const service = await prisma.service.upsert({
        where: { id: serviceData.id },
        update: {
          name: serviceData.name,
          department: serviceData.department,
          description: serviceData.description,
          eligibility: serviceData.eligibility,
          applicationMethod: serviceData.applicationMethod,
          governmentPortalUrl: serviceData.governmentPortalUrl,
          region: serviceData.region,
          isActive: serviceData.isActive
        },
        create: {
          id: serviceData.id,
          name: serviceData.name,
          department: serviceData.department,
          description: serviceData.description,
          eligibility: serviceData.eligibility,
          applicationMethod: serviceData.applicationMethod,
          governmentPortalUrl: serviceData.governmentPortalUrl,
          region: serviceData.region,
          isActive: serviceData.isActive
        }
      });

      for (const doc of serviceData.documents) {
        await prisma.serviceDocument.upsert({
          where: { id: doc.id },
          update: {
            name: doc.name,
            description: doc.description,
            mandatory: doc.mandatory
          },
          create: {
            id: doc.id,
            serviceId: service.id,
            name: doc.name,
            description: doc.description,
            mandatory: doc.mandatory
          }
        });
      }
    }

    logger.info(
      `[Seed] Seeded ${INITIAL_SERVICES.length} services with documents`
    );

    // 3. Seed verified office records and their verified service relationships.
    await seedOfficeRecords({
      db: prisma,
      allowedServiceIds: INITIAL_SERVICES.map(({ id }) => id),
      databaseUrl: process.env.DATABASE_URL
    });

    logger.info('[Seed] Database seeding completed successfully.');
  } catch (error) {
    logger.error('[Seed] Database seeding error:', error.message);
    throw error;
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }
};

// Execute if run directly from CLI
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const args = new Set(process.argv.slice(2));
  if (args.has('--dry-run') && !args.has('--offices-only')) {
    throw new Error('--dry-run requires --offices-only');
  }
  if (args.has('--offices-only')) {
    seedOfficeRecords({
      db: prisma,
      allowedServiceIds: INITIAL_SERVICES.map(({ id }) => id),
      databaseUrl: process.env.DATABASE_URL,
      dryRun: args.has('--dry-run')
    }).finally(() => prisma?.$disconnect());
  } else {
    seedDatabase();
  }
}
