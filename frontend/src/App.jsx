import { Routes, Route, Link } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppLayout from './components/AppLayout.jsx';

import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Assistant from './pages/Assistant.jsx';
import Services from './pages/Services.jsx';
import ServiceDetails from './pages/ServiceDetails.jsx';
import Checklist from './pages/Checklist.jsx';
import Offices from './pages/Offices.jsx';
import Applications from './pages/Applications.jsx';
import ApplicationDetails from './pages/ApplicationDetails.jsx';
import Cases from './pages/Cases.jsx';
import CaseDetails from './pages/CaseDetails.jsx';

import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminCases from './pages/admin/AdminCases.jsx';
import AdminCaseDetails from './pages/admin/AdminCaseDetails.jsx';
import AdminServices from './pages/admin/AdminServices.jsx';

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <h1 className="text-3xl font-bold">404</h1>
      <p className="text-slate-600">Page not found</p>
      <Link to="/" className="btn-primary">Go home</Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Citizen */}
      <Route
        element={
          <ProtectedRoute roles={['CITIZEN']}>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        {/* optional param: one route => component stays mounted when a new conversation gets its id */}
        <Route path="/assistant/:conversationId?" element={<Assistant />} />
        <Route path="/services" element={<Services />} />
        <Route path="/services/:serviceId" element={<ServiceDetails />} />
        <Route path="/services/:serviceId/checklist" element={<Checklist />} />
        <Route path="/offices" element={<Offices />} />
        <Route path="/applications" element={<Applications />} />
        <Route path="/applications/:applicationId" element={<ApplicationDetails />} />
        <Route path="/cases" element={<Cases />} />
        <Route path="/cases/:caseId" element={<CaseDetails />} />
      </Route>

      {/* Admin / Agent */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={['ADMIN', 'AGENT']}>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="cases" element={<AdminCases />} />
        <Route path="cases/:caseId" element={<AdminCaseDetails />} />
        <Route path="services" element={<AdminServices />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}