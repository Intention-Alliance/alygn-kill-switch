import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { LoginPage } from './auth/LoginPage';
import { SessionMonitor } from './auth/SessionMonitor';
import { Layout } from './components/Layout';
import { KillSwitchDashboard } from './features/kill-switch/KillSwitchDashboard';
import { FlagList } from './features/flags/FlagList';
import { FlagEditor } from './features/flags/FlagEditor';
import { AuditLog } from './features/flags/AuditLog';
import { ErrorBoundaryWithTrace } from './otel/error-boundary';
import { useState } from 'react';
import type { Flag } from './features/flags/types';

function AppRoutes(): React.ReactElement {
  const [editingFlag, setEditingFlag] = useState<Flag | null>(null);

  return (
    <SessionMonitor>
      <ErrorBoundaryWithTrace>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute requiredRole="viewer">
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="kill-switch" replace />} />
            <Route
              path="kill-switch"
              element={
                <ProtectedRoute requiredRole="viewer">
                  <KillSwitchDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="flags"
              element={
                <ProtectedRoute requiredRole="viewer">
                  <FlagList onEditFlag={(flag: Flag) => setEditingFlag(flag)} />
                  {editingFlag && (
                    <FlagEditor
                      flagId={editingFlag.id}
                      onClose={() => setEditingFlag(null)}
                      onSave={() => setEditingFlag(null)}
                    />
                  )}
                </ProtectedRoute>
              }
            />
            <Route
              path="flags/new"
              element={
                <ProtectedRoute requiredRole="developer">
                  <FlagEditor onClose={() => {}} onSave={() => {}} />
                </ProtectedRoute>
              }
            />
            <Route
              path="audit"
              element={
                <ProtectedRoute requiredRole="viewer">
                  <AuditLog />
                </ProtectedRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundaryWithTrace>
    </SessionMonitor>
  );
}

export function App(): React.ReactElement {
  return <AppRoutes />;
}
