import { prisma, isDbConnected } from '../../config/db.js';
import { ApiError } from '../../utils/apiError.js';
import { cacheGet, cacheSet } from '../../config/redis.js';

// Pre-configured government services fallback data
export const INITIAL_SERVICES = [
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    name: 'Income Certificate',
    department: 'Revenue Department',
    description: 'Certificate showing annual family income for scholarship, subsidy, and welfare schemes.',
    eligibility: 'Resident of the state with verifiable family income below the prescribed statutory limit.',
    applicationMethod: 'BOTH',
    governmentPortalUrl: 'https://edistrict.up.gov.in',
    region: 'Uttar Pradesh',
    isActive: true,
    documents: [
      {
        id: 'doc-001',
        name: 'Aadhaar Card',
        description: 'Valid Aadhaar card of applicant',
        mandatory: true
      },
      {
        id: 'doc-002',
        name: 'Income Proof',
        description: 'Salary slip, IT return, or employer income certificate',
        mandatory: true
      },
      {
        id: 'doc-003',
        name: 'Self Declaration',
        description: 'Self-attested affidavit regarding household income',
        mandatory: true
      }
    ]
  },
  {
    id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    name: 'Caste Certificate',
    department: 'Social Welfare Department',
    description: 'Statutory certificate certifying SC, ST, or OBC caste category.',
    eligibility: 'Citizen belonging to recognized SC/ST/OBC community with state lineage.',
    applicationMethod: 'BOTH',
    governmentPortalUrl: 'https://edistrict.up.gov.in',
    region: 'Uttar Pradesh',
    isActive: true,
    documents: [
      {
        id: 'doc-004',
        name: 'Aadhaar Card',
        description: 'Valid Aadhaar card of applicant',
        mandatory: true
      },
      {
        id: 'doc-005',
        name: 'Family Caste Proof',
        description: 'Caste certificate of father/sibling or ancestral land record',
        mandatory: true
      }
    ]
  },
  {
    id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
    name: 'Domicile Certificate',
    department: 'Revenue Department',
    description: 'Official proof of permanent residence in the state.',
    eligibility: 'Continuous residence in the state for at least 3 years.',
    applicationMethod: 'BOTH',
    governmentPortalUrl: 'https://edistrict.up.gov.in',
    region: 'Uttar Pradesh',
    isActive: true,
    documents: [
      {
        id: 'doc-006',
        name: 'Aadhaar Card',
        description: 'Valid Aadhaar card',
        mandatory: true
      },
      {
        id: 'doc-007',
        name: 'Address Proof',
        description: 'Electricity bill, water bill, or ration card',
        mandatory: true
      }
    ]
  },
  {
    id: 'd4e5f6a7-b8c9-0123-def1-234567890123',
    name: 'Birth Certificate',
    department: 'Health & Family Welfare Department',
    description: 'Vital record certifying date, place, and parentage of birth.',
    eligibility: 'Any birth taking place within the state jurisdiction.',
    applicationMethod: 'ONLINE',
    governmentPortalUrl: 'https://crsorgi.gov.in',
    region: 'Delhi',
    isActive: true,
    documents: [
      {
        id: 'doc-008',
        name: 'Hospital Discharge Certificate',
        description: 'Institutional birth slip or proof of birth',
        mandatory: true
      },
      {
        id: 'doc-009',
        name: 'Parents ID Proof',
        description: 'Aadhaar card of both parents',
        mandatory: true
      }
    ]
  }
];

export const searchServices = async ({ q, department, region, page = 1, limit = 10 }) => {
  const cacheKey = `services:q=${q || ''}:dept=${department || ''}:reg=${region || ''}:page=${page}:limit=${limit}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return cached;
  }

  let services = [];
  let total = 0;

  if (prisma && isDbConnected) {
    try {
      const where = {
        isActive: true,
        ...(q ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { department: { contains: q, mode: 'insensitive' } }
          ]
        } : {}),
        ...(department ? { department: { contains: department, mode: 'insensitive' } } : {}),
        ...(region ? { region: { contains: region, mode: 'insensitive' } } : {})
      };

      total = await prisma.service.count({ where });
      const dbServices = await prisma.service.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          department: true,
          description: true,
          applicationMethod: true,
          region: true
        }
      });

      if (total > 0) {
        services = dbServices;
      }
    } catch (err) {
      // fallback
    }
  }

  // Fallback to in-memory initial services
  if (services.length === 0 && total === 0) {
    let filtered = INITIAL_SERVICES.filter(s => s.isActive);
    if (q) {
      const query = q.toLowerCase();
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query) ||
        s.department.toLowerCase().includes(query)
      );
    }
    if (department) {
      filtered = filtered.filter(s => s.department.toLowerCase().includes(department.toLowerCase()));
    }
    if (region) {
      filtered = filtered.filter(s => s.region.toLowerCase().includes(region.toLowerCase()));
    }

    total = filtered.length;
    const startIndex = (page - 1) * limit;
    services = filtered.slice(startIndex, startIndex + limit).map(s => ({
      id: s.id,
      name: s.name,
      department: s.department,
      description: s.description,
      applicationMethod: s.applicationMethod,
      region: s.region
    }));
  }

  const result = {
    services,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: Number(total),
      totalPages: Math.ceil(total / limit) || 1
    }
  };

  await cacheSet(cacheKey, result, 300);
  return result;
};

export const getServiceById = async (serviceId) => {
  const cacheKey = `service:${serviceId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return cached;
  }

  let service = null;
  if (prisma && isDbConnected) {
    try {
      service = await prisma.service.findUnique({
        where: { id: serviceId },
        include: {
          documents: {
            select: {
              id: true,
              name: true,
              description: true,
              mandatory: true
            }
          }
        }
      });
    } catch (err) {
      // fallback
    }
  }

  if (!service) {
    service = INITIAL_SERVICES.find(s => s.id === serviceId);
  }

  if (!service) {
    throw ApiError.notFound('Service not found');
  }

  const responseData = {
    id: service.id,
    name: service.name,
    department: service.department,
    description: service.description,
    eligibility: service.eligibility || '',
    applicationMethod: service.applicationMethod,
    governmentPortalUrl: service.governmentPortalUrl || '',
    region: service.region,
    documents: (service.documents || []).map(d => ({
      id: d.id,
      name: d.name,
      description: d.description || '',
      mandatory: Boolean(d.mandatory)
    }))
  };

  await cacheSet(cacheKey, responseData, 600);
  return responseData;
};

export const getServiceChecklist = async (serviceId) => {
  const service = await getServiceById(serviceId);

  return {
    serviceId: service.id,
    serviceName: service.name,
    documents: (service.documents || []).map(d => ({
      id: d.id,
      name: d.name,
      mandatory: Boolean(d.mandatory),
      checked: false
    }))
  };
};
