import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { LoginPage } from "@/features/auth/LoginPage";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage";
import { AppShell } from "@/components/chrome/AppShell";
import { ToastProvider } from "@/components/chrome/Toast";

import { Dashboard } from "@/features/dashboard/Dashboard";
import { KinderenList } from "@/features/kinderen/KinderenList";
import { KindDetail } from "@/features/kinderen/KindDetail";
import { OudersList } from "@/features/ouders/OudersList";
import { OuderDetail } from "@/features/ouders/OuderDetail";
import { TeachersList } from "@/features/teachers/TeachersList";
import { StudentsList } from "@/features/students/StudentsList";
import { LeerlingDetail } from "@/features/students/LeerlingDetail";
import { ClassesList } from "@/features/classes/ClassesList";
import { ClassDetail } from "@/features/classes/ClassDetail";
import { EnrollmentsScreen } from "@/features/enrollments/EnrollmentsScreen";
import { FinanceScreen } from "@/features/finance/FinanceScreen";
import { PlanningScreen } from "@/features/planning/PlanningScreen";
import { SettingsScreen } from "@/features/settings/SettingsScreen";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/wachtwoord-herstellen" element={<ResetPasswordPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/planning" element={<PlanningScreen />} />
                <Route path="/kinderen" element={<KinderenList />} />
                <Route path="/kinderen/:id" element={<KindDetail />} />
                <Route path="/ouders" element={<OudersList />} />
                <Route path="/ouders/:id" element={<OuderDetail />} />
                <Route path="/teachers" element={<TeachersList />} />
                <Route path="/students" element={<StudentsList />} />
                <Route path="/students/:id" element={<LeerlingDetail />} />
                <Route path="/classes" element={<ClassesList />} />
                <Route path="/classes/:id" element={<ClassDetail />} />
                <Route path="/enrollments" element={<EnrollmentsScreen />} />
                <Route path="/finance" element={<FinanceScreen />} />
                <Route path="/settings" element={<SettingsScreen />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
