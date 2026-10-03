import { prisma, isDbConnected } from '../../config/db.js';

export const getDashboardData = async (userId, userName) => {
  let appCount = 0;
  let pendingAppCount = 0;
  let caseCount = 0;
  let openCaseCount = 0;
  let recentApplications = [];
  let recentCases = [];

  if (prisma && isDbConnected) {
    try {
      const [
        totalApps,
        pendingApps,
        totalCases,
        openCases,
        dbRecentApps,
        dbRecentCases
      ] = await Promise.all([
        prisma.application.count({ where: { userId } }),
        prisma.application.count({
          where: {
            userId,
            status: { in: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW'] }
          }
        }),
        prisma.escalation.count({ where: { userId } }),
        prisma.escalation.count({
          where: {
            userId,
            status: { in: ['PENDING', 'IN_REVIEW'] }
          }
        }),
        prisma.application.findMany({
          where: { userId },
          take: 5,
          orderBy: { applicationDate: 'desc' },
          include: { service: { select: { name: true } } }
        }),
        prisma.escalation.findMany({
          where: { userId },
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: { id: true, subject: true, status: true }
        })
      ]);

      appCount = totalApps;
      pendingAppCount = pendingApps;
      caseCount = totalCases;
      openCaseCount = openCases;
      recentApplications = dbRecentApps.map(a => ({
        id: a.id,
        serviceName: a.service?.name || 'Government Service',
        status: a.status
      }));
      recentCases = dbRecentCases.map(c => ({
        id: c.id,
        subject: c.subject,
        status: c.status
      }));
    } catch (err) {
      // fallback
    }
  }

  return {
    user: {
      name: userName || 'Taru Sharma'
    },
    counts: {
      applications: appCount,
      pendingApplications: pendingAppCount,
      cases: caseCount,
      openCases: openCaseCount
    },
    recentApplications,
    recentCases
  };
};
