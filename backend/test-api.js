import app from './src/app.js';
import http from 'http';
import fs from 'fs';
import path from 'path';

let server;
let baseUrl;

const request = async (endpoint, options = {}) => {
  const url = `${baseUrl}${endpoint}`;
  const headers = options.headers || {};
  let body = options.body;

  if (body && typeof body === 'object' && !(body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = { raw: text };
  }

  return {
    status: res.status,
    headers: res.headers,
    data: json
  };
};

const runTests = async () => {
  console.log('🧪 Starting AI Legal Assistant Backend API Test Suite...\n');

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;
  console.log(`Server listening on test port: ${port}`);

  let passed = 0;
  let failed = 0;

  const assert = (condition, testName, extra = '') => {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`, extra);
      failed++;
    }
  };

  try {
    // 0. Health check
    const health = await request('/api/v1/health');
    assert(health.status === 200 && health.data.success === true, 'Health check');

    // 1. Auth Register (Section 10.1)
    const registerRes = await request('/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Taru Sharma',
        email: `taru_${Date.now()}@example.com`,
        password: 'StrongPassword123',
        preferredLanguage: 'hi'
      }
    });
    assert(registerRes.status === 201, 'POST /auth/register status 201');
    assert(registerRes.data.success === true, 'POST /auth/register success: true');
    assert(registerRes.data.message === 'Registration successful', 'POST /auth/register message');
    assert(registerRes.data.data.user.role === 'CITIZEN', 'POST /auth/register role CITIZEN');
    assert(registerRes.data.data.user.preferredLanguage === 'hi', 'POST /auth/register preferredLanguage hi');
    assert(typeof registerRes.data.data.accessToken === 'string', 'POST /auth/register accessToken returned');

    const citizenToken = registerRes.data.data.accessToken;
    const citizenId = registerRes.data.data.user.id;
    const citizenEmail = registerRes.data.data.user.email;

    // 2. Auth Login (Section 11)
    const loginRes = await request('/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: citizenEmail,
        password: 'StrongPassword123'
      }
    });
    assert(loginRes.status === 200, 'POST /auth/login status 200');
    assert(loginRes.data.success === true, 'POST /auth/login success: true');
    assert(loginRes.data.data.user.email === citizenEmail, 'POST /auth/login user email matches');

    // 3. Current User (Section 12)
    const meRes = await request('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });
    assert(meRes.status === 200, 'GET /auth/me status 200');
    assert(meRes.data.success === true, 'GET /auth/me success: true');
    assert(meRes.data.data.id === citizenId, 'GET /auth/me ID matches');
    assert(meRes.data.data.role === 'CITIZEN', 'GET /auth/me role matches');

    // 4. Create AI Conversation (Section 13.1)
    const createConvRes = await request('/api/v1/ai/conversations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${citizenToken}` },
      body: {
        language: 'hi',
        title: 'Income Certificate Query'
      }
    });
    assert(createConvRes.status === 201, 'POST /ai/conversations status 201');
    assert(createConvRes.data.success === true, 'POST /ai/conversations success: true');
    assert(typeof createConvRes.data.data.conversationId === 'string', 'POST /ai/conversations returns conversationId');
    assert(createConvRes.data.data.language === 'hi', 'POST /ai/conversations returns language');

    const conversationId = createConvRes.data.data.conversationId;

    // 5. Ask AI (Section 14 & 15)
    const askAiRes = await request(`/api/v1/ai/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${citizenToken}` },
      body: {
        message: 'मुझे आय प्रमाण पत्र बनवाना है। कौन से दस्तावेज चाहिए?',
        language: 'hi'
      }
    });
    assert(askAiRes.status === 200, 'POST /ai/conversations/:id/messages status 200');
    assert(askAiRes.data.success === true, 'POST /ai/conversations/:id/messages success: true');
    assert(typeof askAiRes.data.data.confidence === 'number', 'POST /ai/conversations/:id/messages confidence is a number');
    assert(typeof askAiRes.data.data.needsHuman === 'boolean', 'POST /ai/conversations/:id/messages needsHuman is boolean');
    assert(Array.isArray(askAiRes.data.data.sources), 'POST /ai/conversations/:id/messages sources is array');
    assert(askAiRes.data.data.suggestedService !== undefined, 'POST /ai/conversations/:id/messages suggestedService returned');

    // 6. Get Conversations list (Section 16)
    const convListRes = await request('/api/v1/ai/conversations', {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });
    assert(convListRes.status === 200, 'GET /ai/conversations status 200');
    assert(Array.isArray(convListRes.data.data), 'GET /ai/conversations returns array');
    assert(convListRes.data.data.some(c => c.id === conversationId), 'GET /ai/conversations contains created conversation');

    // 7. Get Conversation Details (Section 17)
    const getConvRes = await request(`/api/v1/ai/conversations/${conversationId}`, {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });
    assert(getConvRes.status === 200, 'GET /ai/conversations/:id status 200');
    assert(Array.isArray(getConvRes.data.data.messages), 'GET /ai/conversations/:id messages is array');
    assert(getConvRes.data.data.messages.length >= 2, 'GET /ai/conversations/:id has user and AI messages');

    // 8. Search Services (Section 18)
    const servicesRes = await request('/api/v1/services?q=certificate&region=Uttar%20Pradesh&page=1&limit=10');
    assert(servicesRes.status === 200, 'GET /services status 200');
    assert(Array.isArray(servicesRes.data.data.services), 'GET /services returns services array');
    assert(typeof servicesRes.data.data.pagination.total === 'number', 'GET /services pagination total is number');
    assert(servicesRes.data.data.services.length > 0, 'GET /services returns matched services');

    const serviceId = servicesRes.data.data.services[0].id;

    // 9. Get Service Details (Section 19)
    const serviceDetailsRes = await request(`/api/v1/services/${serviceId}`);
    assert(serviceDetailsRes.status === 200, 'GET /services/:id status 200');
    assert(serviceDetailsRes.data.data.id === serviceId, 'GET /services/:id id matches');
    assert(Array.isArray(serviceDetailsRes.data.data.documents), 'GET /services/:id documents is array');

    // 10. Document Checklist API (Section 20)
    const checklistRes = await request(`/api/v1/services/${serviceId}/checklist`);
    assert(checklistRes.status === 200, 'GET /services/:id/checklist status 200');
    assert(checklistRes.data.data.serviceId === serviceId, 'GET /services/:id/checklist serviceId matches');
    assert(Array.isArray(checklistRes.data.data.documents), 'GET /services/:id/checklist documents is array');
    assert(checklistRes.data.data.documents[0].checked === false, 'GET /services/:id/checklist checked default false');

    // 11. Office Search API (Section 21)
    const officesRes = await request(`/api/v1/offices?serviceId=${serviceId}&latitude=28.67&longitude=77.43&radiusKm=50`);
    assert(officesRes.status === 200, 'GET /offices status 200');
    assert(Array.isArray(officesRes.data.data), 'GET /offices returns array');
    if (officesRes.data.data.length > 0) {
      assert(typeof officesRes.data.data[0].distanceKm === 'number', 'GET /offices distanceKm calculated as number');
    }

    // 12. Create Application (Section 22)
    const createAppRes = await request('/api/v1/applications', {
      method: 'POST',
      headers: { Authorization: `Bearer ${citizenToken}` },
      body: { serviceId }
    });
    assert(createAppRes.status === 201, 'POST /applications status 201');
    assert(createAppRes.data.data.status === 'DRAFT', 'POST /applications status DRAFT');
    assert(createAppRes.data.data.referenceNumber.startsWith('APP-'), 'POST /applications referenceNumber format APP-');

    const applicationId = createAppRes.data.data.id;

    // 13. Get My Applications (Section 23)
    const myAppsRes = await request('/api/v1/applications', {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });
    assert(myAppsRes.status === 200, 'GET /applications status 200');
    assert(Array.isArray(myAppsRes.data.data.applications), 'GET /applications returns array');
    assert(myAppsRes.data.data.applications.some(a => a.id === applicationId), 'GET /applications contains created application');

    // 14. Get Application Details (Section 24)
    const appDetailsRes = await request(`/api/v1/applications/${applicationId}`, {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });
    assert(appDetailsRes.status === 200, 'GET /applications/:id status 200');
    assert(appDetailsRes.data.data.id === applicationId, 'GET /applications/:id id matches');
    assert(Array.isArray(appDetailsRes.data.data.documents), 'GET /applications/:id documents array');

    // 15. Application Document Upload (Section 25)
    // Create a temporary multipart form payload
    const dummyFilePath = path.resolve('test-doc.pdf');
    fs.writeFileSync(dummyFilePath, '%PDF-1.4 test dummy document content');
    const formData = new FormData();
    const fileBlob = new Blob([fs.readFileSync(dummyFilePath)], { type: 'application/pdf' });
    formData.append('file', fileBlob, 'test-doc.pdf');
    formData.append('documentName', 'Aadhaar Card');

    const uploadRes = await fetch(`${baseUrl}/api/v1/applications/${applicationId}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${citizenToken}` },
      body: formData
    });
    const uploadData = await uploadRes.json();
    assert(uploadRes.status === 200, 'POST /applications/:id/documents status 200');
    assert(uploadData.success === true, 'POST /applications/:id/documents success: true');
    assert(uploadData.data.documentName === 'Aadhaar Card', 'POST /applications/:id/documents documentName matches');
    assert(uploadData.data.status === 'UPLOADED', 'POST /applications/:id/documents status UPLOADED');
    if (fs.existsSync(dummyFilePath)) fs.unlinkSync(dummyFilePath);

    // 16. Create Human Escalation (Section 26)
    const createCaseRes = await request('/api/v1/escalations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${citizenToken}` },
      body: {
        conversationId,
        subject: 'Need help regarding property dispute',
        description: 'I need human assistance regarding this issue.'
      }
    });
    assert(createCaseRes.status === 201, 'POST /escalations status 201');
    assert(createCaseRes.data.data.status === 'PENDING', 'POST /escalations status PENDING');

    const caseId = createCaseRes.data.data.id;

    // 17. Get My Cases (Section 27)
    const myCasesRes = await request('/api/v1/escalations', {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });
    assert(myCasesRes.status === 200, 'GET /escalations status 200');
    assert(Array.isArray(myCasesRes.data.data), 'GET /escalations returns array');
    assert(myCasesRes.data.data.some(c => c.id === caseId), 'GET /escalations contains created case');

    // 18. Citizen Sends Case Message (Section 29)
    const citizenMsgRes = await request(`/api/v1/escalations/${caseId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${citizenToken}` },
      body: {
        message: 'I have uploaded the required document.'
      }
    });
    assert(citizenMsgRes.status === 200, 'POST /escalations/:id/messages status 200');
    assert(citizenMsgRes.data.data.senderRole === 'CITIZEN', 'POST /escalations/:id/messages senderRole CITIZEN');

    // 19. Get Case Details (Section 28)
    const caseDetailsRes = await request(`/api/v1/escalations/${caseId}`, {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });
    assert(caseDetailsRes.status === 200, 'GET /escalations/:id status 200');
    assert(Array.isArray(caseDetailsRes.data.data.messages), 'GET /escalations/:id messages is array');
    assert(caseDetailsRes.data.data.messages.some(m => m.message === 'I have uploaded the required document.'), 'GET /escalations/:id contains sent message');

    // 20. Dashboard API (Section 33)
    const dashboardRes = await request('/api/v1/dashboard', {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });
    assert(dashboardRes.status === 200, 'GET /dashboard status 200');
    assert(dashboardRes.data.data.user.name === 'Taru Sharma', 'GET /dashboard user name');
    assert(typeof dashboardRes.data.data.counts.applications === 'number', 'GET /dashboard counts.applications');
    assert(typeof dashboardRes.data.data.counts.cases === 'number', 'GET /dashboard counts.cases');
    assert(Array.isArray(dashboardRes.data.data.recentApplications), 'GET /dashboard recentApplications array');
    assert(Array.isArray(dashboardRes.data.data.recentCases), 'GET /dashboard recentCases array');

    // Setup Admin and Agent tokens for testing admin endpoints
    const adminRegister = await request('/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Admin User',
        email: `admin_${Date.now()}@example.com`,
        password: 'AdminPassword123',
        preferredLanguage: 'en'
      }
    });
    // In our auth service we can mock admin role by generating token or registering
    const jwt = (await import('jsonwebtoken')).default;
    const { env } = await import('./src/config/env.js');
    const adminToken = jwt.sign({ sub: 'admin-uuid', role: 'ADMIN', name: 'Admin', email: 'admin@legal.gov.in' }, env.JWT_SECRET);
    const agentToken = jwt.sign({ sub: 'agent-uuid', role: 'AGENT', name: 'Agent', email: 'agent@legal.gov.in' }, env.JWT_SECRET);

    // 21. Admin: Get Escalation Queue (Section 30)
    const adminQueueRes = await request('/api/v1/admin/escalations', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(adminQueueRes.status === 200, 'GET /admin/escalations status 200');
    assert(Array.isArray(adminQueueRes.data.data.escalations), 'GET /admin/escalations escalations array');

    // 22. Admin: Update Case Status (Section 30)
    const updateStatusRes = await request(`/api/v1/admin/escalations/${caseId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { status: 'IN_REVIEW' }
    });
    assert(updateStatusRes.status === 200, 'PATCH /admin/escalations/:id status 200');
    assert(updateStatusRes.data.data.status === 'IN_REVIEW', 'PATCH /admin/escalations/:id status IN_REVIEW');

    // 23. Admin Reply (Section 31)
    const adminReplyRes = await request(`/api/v1/admin/escalations/${caseId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${agentToken}` },
      body: { message: 'Please submit the additional address proof.' }
    });
    assert(adminReplyRes.status === 200, 'POST /admin/escalations/:id/messages status 200');
    assert(adminReplyRes.data.data.senderRole === 'AGENT', 'POST /admin/escalations/:id/messages senderRole AGENT');

    // 24. Admin: Create Service (Section 32)
    const createServiceRes = await request('/api/v1/admin/services', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        name: 'Death Certificate',
        department: 'Health & Family Welfare Department',
        description: 'Vital certificate certifying death of an individual.',
        eligibility: 'Relative or legal representative of the deceased.',
        applicationMethod: 'ONLINE',
        governmentPortalUrl: 'https://crsorgi.gov.in',
        region: 'Delhi',
        documents: [
          { name: 'Hospital Death Report', mandatory: true }
        ]
      }
    });
    assert(createServiceRes.status === 201, 'POST /admin/services status 201');
    assert(createServiceRes.data.data.name === 'Death Certificate', 'POST /admin/services name Death Certificate');

    const newServiceId = createServiceRes.data.data.id;

    // 25. Admin: Update Service (Section 32)
    const updateServiceRes = await request(`/api/v1/admin/services/${newServiceId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        description: 'Updated vital certificate certifying death of an individual.'
      }
    });
    assert(updateServiceRes.status === 200, 'PATCH /admin/services/:id status 200');

    // 26. Admin: Deactivate Service (Section 32)
    const deleteServiceRes = await request(`/api/v1/admin/services/${newServiceId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(deleteServiceRes.status === 200, 'DELETE /admin/services/:id status 200');
    assert(deleteServiceRes.data.message === 'Service deactivated successfully', 'DELETE /admin/services/:id message');

    // 27. Test Error Handling Contract (Section 62)
    // 401 Unauthorized
    const unauthRes = await request('/api/v1/dashboard');
    assert(unauthRes.status === 401, 'Unauthenticated request returns 401');
    assert(unauthRes.data.success === false, 'Error response success: false');
    assert(unauthRes.data.error.code === 'UNAUTHORIZED', 'Error code UNAUTHORIZED');

    // 403 Forbidden (Citizen trying to access admin endpoint)
    const forbidRes = await request('/api/v1/admin/escalations', {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });
    assert(forbidRes.status === 403, 'Citizen accessing admin endpoint returns 403');
    assert(forbidRes.data.error.code === 'FORBIDDEN', 'Error code FORBIDDEN');

    // 422 Validation Error
    const invalidRegRes = await request('/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: '',
        email: 'invalid-email-address',
        password: '123'
      }
    });
    assert(invalidRegRes.status === 422, 'Invalid input returns 422');
    assert(invalidRegRes.data.error.code === 'VALIDATION_ERROR', 'Error code VALIDATION_ERROR');
    assert(Array.isArray(invalidRegRes.data.error.details), 'Error details is an array');

    // 404 Not Found
    const notFoundRes = await request('/api/v1/non-existent-endpoint');
    assert(notFoundRes.status === 404, 'Invalid route returns 404');
    assert(notFoundRes.data.error.code === 'NOT_FOUND', 'Error code NOT_FOUND');

    console.log(`\n========================================`);
    console.log(`Test Results: ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal test error:', error);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
  }
};

runTests();
