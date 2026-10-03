import bcrypt from 'bcryptjs';
import { prisma } from '../config/db.js';
import { logger } from './logger.js';
import { INITIAL_SERVICES } from '../modules/services/service.service.js';
import { INITIAL_OFFICES } from '../modules/offices/office.service.js';
import { DEFAULT_KNOWLEDGE_SOURCES } from '../modules/ai/rag.service.js';

export const seedDatabase = async () => {
  if (!prisma) {
    logger.warn('[Seed] PrismaClient is not initialized. Skipping seed.');
    return;
  }

  try {
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

    logger.info(`[Seed] Users seeded: Citizen (${citizen.email}), Admin (${admin.email}), Agent (${agent.email})`);

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
    logger.info(`[Seed] Seeded ${INITIAL_SERVICES.length} services with documents`);

    // 3. Seed Offices
    for (const office of INITIAL_OFFICES) {
      await prisma.office.upsert({
        where: { id: office.id },
        update: {
          name: office.name,
          address: office.address,
          city: office.city,
          state: office.state,
          pincode: office.pincode,
          latitude: office.latitude,
          longitude: office.longitude,
          phone: office.phone,
          workingHours: office.workingHours
        },
        create: {
          id: office.id,
          name: office.name,
          address: office.address,
          city: office.city,
          state: office.state,
          pincode: office.pincode,
          latitude: office.latitude,
          longitude: office.longitude,
          phone: office.phone,
          workingHours: office.workingHours
        }
      });
    }
    logger.info(`[Seed] Seeded ${INITIAL_OFFICES.length} offices`);

    // 4. Seed Knowledge Base for RAG
    for (const kb of DEFAULT_KNOWLEDGE_SOURCES) {
      await prisma.knowledgeBase.upsert({
        where: { id: kb.id },
        update: {
          title: kb.title,
          department: kb.department,
          sourceUrl: kb.sourceUrl,
          content: kb.content,
          verified: true
        },
        create: {
          id: kb.id,
          title: kb.title,
          department: kb.department,
          sourceUrl: kb.sourceUrl,
          content: kb.content,
          verified: true
        }
      });
    }
    logger.info(`[Seed] Seeded ${DEFAULT_KNOWLEDGE_SOURCES.length} verified knowledge base articles`);

    logger.info('[Seed] Database seeding completed successfully.');
  } catch (error) {
    logger.error('[Seed] Database seeding error:', error.message);
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }
};

// Execute if run directly from CLI
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedDatabase();
}
