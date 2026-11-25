import {
  BookOpen,
  CircleUser,
  ClipboardList,
  Home,
  Layers,
  LogOut,
  ReceiptText,
  ShoppingBasket,
  UserPlus,
  Users,
} from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Notifications } from './Notifications'
import { useAuth } from '../context/useAuth'

const navByRole = {
  student: [
    { to: '/', label: 'Today', icon: Home },
    { to: '/menu', label: 'Menu', icon: BookOpen },
    { to: '/orders', label: 'My orders', icon: ReceiptText },
    { to: '/cart', label: 'Cart', icon: ShoppingBasket },
    { to: '/account', label: 'Account', icon: CircleUser },
  ],
  staff: [
    { to: '/staff', label: 'Order queue', icon: ClipboardList },
    { to: '/staff/availability', label: "Today's board", icon: Layers },
    { to: '/staff/menu', label: 'Menu', icon: BookOpen },
    { to: '/account', label: 'Account', icon: CircleUser },
  ],
  admin: [
    { to: '/admin', label: 'Accounts', icon: Users },
    { to: '/admin/staff', label: 'Add staff', icon: UserPlus },
    { to: '/account', label: 'Account', icon: CircleUser },
  ],
}

export default function AppShell() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const role = profile?.role ?? 'student'
  const items = navByRole[role] ?? navByRole.student

  const handleSignOut = async () => {
    const { error } = await signOut()
    if (error) toast.error(error.message)
    else {
      toast.success('Signed out. See you at the counter!')
      navigate('/login')
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="shop-sign shop-sign-row">
          <div>
            <p className="shop-name">SPC Canteen</p>
            <p className="shop-place">St. Paul College · Cafeteria</p>
          </div>
          {(role === 'student' || role === 'staff') && <Notifications />}
        </div>

        <nav className="nav" aria-label="Main navigation">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="nav-spacer" />

        <div className="sidebar-foot">
          <p className="tiny-label">Signed in as</p>
          <p className="mt-8">{profile?.full_name || 'Canteen user'}</p>
          <p className="muted">{profile?.student_id || role}</p>
          <button type="button" className="btn btn-quiet btn-sm mt-16" onClick={handleSignOut}>
            <LogOut size={15} aria-hidden="true" /> Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
