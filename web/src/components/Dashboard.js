import React from 'react';
import { useNavigate, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import {
  Dashboard, ToastProvider, HomeIcon, ChatBubbleIcon, HistoryIcon, PeopleIcon, BoardIcon, FolderIcon,
  PlanIcon, SettingsIcon, AuditIcon, HelpIcon, BookIcon, LogoutIcon, ArrowUpRightIcon,
} from '../ui';
import { hanko } from '../hanko';
import Integration from './integrations/Integrations';
import Settings from './user/Settings';
import Team from './team/Team';
import GoalsAndTickets from './user/GoalsAndTickets';
import AuditTrail from './user/AuditTrail';
import ChatPage from './chat/ChatPage';
import LockedFeature from './free/LockedFeature';
import PlanPage from './free/PlanPage';
import MilestoneBanner from './free/MilestoneBanner';
import { openUpgrade } from '../edition';
import { AistyLogo } from './utils/Icons';
import { WorkspaceRoleProvider, useWorkspaceRole, canViewTeam } from './utils/WorkspaceRoleContext';
import './free/free.css';

function UpgradeBlock() {
  return (
    <button type="button" className="navUpgrade" onClick={() => openUpgrade('sidebar')}>
      <span className="navUpgrade__text">
        <span className="navUpgrade__title">Upgrade to hosted Aisty</span>
        <span className="navUpgrade__body">See every AI tool your team uses, not only Aisty.</span>
      </span>
      <ArrowUpRightIcon size={16} />
    </button>
  );
}

function DashboardInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { role, loading: roleLoading } = useWorkspaceRole();

  const handleLogout = async () => {
    try {
      await hanko.user.logout();
    } finally {
      navigate('/login');
    }
  };

  const isActive = (path, exact) => (exact ? location.pathname === path : location.pathname.startsWith(path));

  // Same tabs, same order as hosted Aisty. Hosted-only ones stay in place, locked.
  const allTabs = [
    { label: 'Home', icon: <HomeIcon />, path: '/home', locked: true },
    { label: 'Chat', icon: <ChatBubbleIcon />, path: '/chat', exact: true },
    { label: 'Chat History', icon: <HistoryIcon />, path: '/chat/history' },
    { label: 'Team', icon: <PeopleIcon />, path: '/team', roles: ['owner', 'admin', 'billing'] },
    { label: 'Goals & Tickets', icon: <BoardIcon />, path: '/goals-tickets' },
    { label: 'Files', icon: <FolderIcon />, path: '/files', locked: true },
  ];

  const tabs = allTabs
    .filter((tab) => !tab.roles || tab.roles.includes(role))
    .map((tab) => ({ ...tab, active: isActive(tab.path, tab.exact), onClick: () => navigate(tab.path) }));

  const canViewAudit = role === 'owner' || role === 'admin';

  const footerButtons = [
    { label: 'Plan', icon: <PlanIcon />, active: isActive('/plan'), onClick: () => navigate('/plan') },
    { label: 'Settings', icon: <SettingsIcon />, active: isActive('/settings'), onClick: () => navigate('/settings') },
    canViewAudit && { label: 'Audit Trail', icon: <AuditIcon />, active: isActive('/audit'), onClick: () => navigate('/audit') },
    { label: 'Help', icon: <HelpIcon />, onClick: () => window.open('https://aisty.ai/contact', '_blank', 'noopener') },
    { label: 'Docs', icon: <BookIcon />, onClick: () => window.open('https://aisty.ai/docs', '_blank', 'noopener') },
    { label: 'Log out', icon: <LogoutIcon />, onClick: handleLogout },
  ].filter(Boolean);

  return (
    <Dashboard
      logo={
        <div className="freeBrand">
          <AistyLogo width={96} height={18} />
          <span className="freeBrand__badge">Free</span>
        </div>
      }
      tabs={tabs}
      banner={<MilestoneBanner />}
      footerTop={<UpgradeBlock />}
      footerButtons={footerButtons}
      content={
        <Routes>
          <Route path="/home" element={<LockedFeature feature="home" />} />
          <Route path="/chat/*" element={<ChatPage />} />
          <Route path="/team" element={roleLoading ? null : canViewTeam(role) ? <Team /> : <Navigate to="/goals-tickets" replace />} />
          <Route path="/goals-tickets" element={<GoalsAndTickets />} />
          <Route path="/insights" element={<LockedFeature feature="insights" />} />
          <Route path="/files" element={<LockedFeature feature="files" />} />
          <Route path="/integrations" element={<Integration />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/audit" element={roleLoading ? null : canViewAudit ? <AuditTrail /> : <Navigate to="/goals-tickets" replace />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/billing" element={<Navigate to="/plan" replace />} />
          <Route path="*" element={<Navigate to="/goals-tickets" replace />} />
        </Routes>
      }
    />
  );
}

function DashboardPage() {
  return (
    <WorkspaceRoleProvider>
      <ToastProvider>
        <DashboardInner />
      </ToastProvider>
    </WorkspaceRoleProvider>
  );
}

export default DashboardPage;
