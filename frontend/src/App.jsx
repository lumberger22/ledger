import { Routes, Route } from 'react-router-dom'
import NavBar from './components/NavBar'
import { UploadModalProvider } from './context/UploadModalContext'
import Dashboard from './pages/Dashboard'
import Charges from './pages/Charges'
import UploadPreview from './pages/UploadPreview'
import Budget from './pages/Budget'
import Analysis from './pages/Analysis'
import Settings from './pages/Settings'

export default function App() {
  return (
    <UploadModalProvider>
      <div className="min-h-screen">
        <NavBar />
        <main className="max-w-6xl mx-auto px-6 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/charges" element={<Charges />} />
            <Route path="/upload-preview" element={<UploadPreview />} />
            <Route path="/budget" element={<Budget />} />
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </UploadModalProvider>
  )
}
