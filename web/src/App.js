import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import DashboardPage from './components/Dashboard';
import Login from './components/user/Login';
import AcceptInvite from './components/user/AcceptInvite';
import RequireAuth from './components/utils/RequireAuth';
import OnboardingWizard from './components/user/OnboardingWizard';
import { ToastProvider } from './ui';
import './styles/theme.css';
import './ui/ui.css';
import './ui/brand.css';
import './ui/pages.css';
// Imported last on purpose: it normalises the page frame across every tab and must land after the per-view stylesheets, so it wins at equal specificity.
import './styles/pageShell.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/invite" element={<AcceptInvite />} />
          <Route
            path="/onboarding/company"
            element={
              <RequireAuth onboarding>
                <ToastProvider>
                  <OnboardingWizard />
                </ToastProvider>
              </RequireAuth>
            }
          />
          <Route path="/" element={<Navigate to="/goals-tickets" replace />} />
          <Route
            path="/*"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
