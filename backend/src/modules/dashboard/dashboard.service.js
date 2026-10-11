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

  if (recentApplications.length === 0 && appCount === 0) {
    const { mockApplications } = await import('../applications/application.service.js');
    const userApps = Array.from(mockApplications.values())
      .filter(a => a.userId === userId)
      .sort((a, b) => new Date(b.applicationDate || b.updatedAt || 0) - new Date(a.applicationDate || a.updatedAt || 0));

    appCount = userApps.length;
    pendingAppCount = userApps.filter(a => ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW'].includes(a.status)).length;
    recentApplications = userApps.slice(0, 5).map(a => ({
      id: a.id,
      serviceName: a.service?.name || 'Government Service',
      status: a.status
    }));
  }

  if (recentCases.length === 0 && caseCount === 0) {
    const { mockEscalations } = await import('../escalations/escalation.service.js');
    const userCases = Array.from(mockEscalations.values())
      .filter(c => c.userId === userId)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    caseCount = userCases.length;
    openCaseCount = userCases.filter(c => ['PENDING', 'IN_REVIEW'].includes(c.status)).length;
    recentCases = userCases.slice(0, 5).map(c => ({
      id: c.id,
      subject: c.subject,
      status: c.status
    }));
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
