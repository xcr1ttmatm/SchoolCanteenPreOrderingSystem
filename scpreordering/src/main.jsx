import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import toast, { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext.jsx'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 3200,
            style: {
              background: '#1F2A24',
              color: '#F3EDE0',
              border: '2px solid #1F2A24',
              borderRadius: '12px',
              fontWeight: 600,
              boxShadow: '4px 4px 0 #C23A1E',
            },
            success: { iconTheme: { primary: '#DCE6D6', secondary: '#1F2A24' } },
            error: { iconTheme: { primary: '#F3CFC5', secondary: '#1F2A24' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

// Kept for quick manual checks in the browser console.
if (import.meta.env.DEV) window.__toast = toast
