import { lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { RequireAdmin } from "@/features/auth/RequireAdmin";
import { RoleHome } from "@/features/auth/RoleHome";
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
import { TeacherDetail } from "@/features/teachers/TeacherDetail";
import { TasksBoard } from "@/features/tasks/TasksBoard";
import { StudentsList } from "@/features/students/StudentsList";
import { ClassesList } from "@/features/classes/ClassesList";

// De zwaarste schermen apart laden, zodat de eerste lading op een mobiel
// netwerk niet de hele app hoeft binnen te halen.
const LeerlingDetail = lazy(() => import("@/features/students/LeerlingDetail").then((m) => ({ default: m.LeerlingDetail })));
const ClassDetail = lazy(() => import("@/features/classes/ClassDetail").then((m) => ({ default: m.ClassDetail })));
const EnrollmentsScreen = lazy(() => import("@/features/enrollments/EnrollmentsScreen").then((m) => ({ default: m.EnrollmentsScreen })));
const FinanceScreen = lazy(() => import("@/features/finance/FinanceScreen").then((m) => ({ default: m.FinanceScreen })));
const PlanningScreen = lazy(() => import("@/features/planning/PlanningScreen").then((m) => ({ default: m.PlanningScreen })));
const SettingsScreen = lazy(() => import("@/features/settings/SettingsScreen").then((m) => ({ default: m.SettingsScreen })));
const AdminToetsen = lazy(() => import("@/features/admin-tests/AdminToetsen").then((m) => ({ default: m.AdminToetsen })));

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
                {/* Accessible to admins and to the docent of that class (RLS-scoped). */}
                <Route path="/classes/:id" element={<ClassDetail />} />
                <Route path="/students/:id" element={<LeerlingDetail />} />
                {/* Gedeeld teambord: admins én docenten. */}
                <Route path="/tasks" element={<TasksBoard />} />
                {/* Admin-only. */}
                <Route element={<RequireAdmin />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/planning" element={<PlanningScreen />} />
                  <Route path="/kinderen" element={<KinderenList />} />
                  <Route path="/kinderen/:id" element={<KindDetail />} />
                  <Route path="/ouders" element={<OudersList />} />
                  <Route path="/ouders/:id" element={<OuderDetail />} />
                  <Route path="/teachers" element={<TeachersList />} />
                  <Route path="/teachers/:id" element={<TeacherDetail />} />
                  <Route path="/students" element={<StudentsList />} />
                  <Route path="/classes" element={<ClassesList />} />
                  <Route path="/enrollments" element={<EnrollmentsScreen />} />
                  <Route path="/admin-toetsen" element={<AdminToetsen />} />
                  <Route path="/finance" element={<FinanceScreen />} />
                  <Route path="/settings" element={<SettingsScreen />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<RoleHome />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
