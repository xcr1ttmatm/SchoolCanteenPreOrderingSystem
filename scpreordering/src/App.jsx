import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import ProtectedRoute, { RequireRole } from './components/ProtectedRoute'
import AccountPage from './pages/AccountPage'
import LoginPage from './pages/LoginPage'
import AdminAccounts from './pages/admin/Accounts'
import AdminStaff from './pages/admin/StaffAdmin'
import StudentCart from './pages/student/Cart'
import StudentDashboard from './pages/student/Dashboard'
import StudentMenu from './pages/student/Menu'
import StudentOrders from './pages/student/Orders'
import StaffAvailability from './pages/staff/Availability'
import StaffMenuAdmin from './pages/staff/MenuAdmin'
import StaffQueue from './pages/staff/Queue'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route element={<RequireRole allow={['student']} />}>
            <Route path="/" element={<StudentDashboard />} />
            <Route path="/menu" element={<StudentMenu />} />
            <Route path="/orders" element={<StudentOrders />} />
            <Route path="/cart" element={<StudentCart />} />
          </Route>

          <Route element={<RequireRole allow={['staff']} />}>
            <Route path="/staff" element={<StaffQueue />} />
            <Route path="/staff/availability" element={<StaffAvailability />} />
            <Route path="/staff/menu" element={<StaffMenuAdmin />} />
          </Route>

          <Route element={<RequireRole allow={['admin']} />}>
            <Route path="/admin" element={<AdminAccounts />} />
            <Route path="/admin/staff" element={<AdminStaff />} />
          </Route>

          <Route path="/account" element={<AccountPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
