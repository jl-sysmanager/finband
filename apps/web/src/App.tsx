import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/layout/AppShell";
import { LoginPage } from "@/pages/LoginPage";
import { useAuth } from "@/stores/auth";
import { useTheme } from "@/stores/theme";
import { Toaster } from "@/components/feedback/Toaster";
import { queryClient } from "@/lib/query-client";

// Cada página se descarga al visitarla (recharts, exceljs de informes, etc. no van
// en el paquete inicial). El login va incluido para que la primera pantalla sea inmediata.
const ClassDetailPage = lazy(() => import("@/pages/ClassDetailPage").then((m) => ({ default: m.ClassDetailPage })));
const ClassesPage = lazy(() => import("@/pages/ClassesPage").then((m) => ({ default: m.ClassesPage })));
const DashboardPage = lazy(() => import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const FinancePage = lazy(() => import("@/pages/FinancePage").then((m) => ({ default: m.FinancePage })));
const PaymentsPage = lazy(() => import("@/pages/PaymentsPage").then((m) => ({ default: m.PaymentsPage })));
const ReportsPage = lazy(() => import("@/pages/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const StudentDetailPage = lazy(() => import("@/pages/StudentDetailPage").then((m) => ({ default: m.StudentDetailPage })));
const StudentsPage = lazy(() => import("@/pages/StudentsPage").then((m) => ({ default: m.StudentsPage })));
const TariffsPage = lazy(() => import("@/pages/TariffsPage").then((m) => ({ default: m.TariffsPage })));
const TeacherDetailPage = lazy(() => import("@/pages/TeacherDetailPage").then((m) => ({ default: m.TeacherDetailPage })));
const TeachersPage = lazy(() => import("@/pages/TeachersPage").then((m) => ({ default: m.TeachersPage })));


function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const fetchMe = useAuth((s) => s.fetchMe);
  const apply = useTheme((s) => s.apply);
  useEffect(() => {
    apply();
    void fetchMe();
  }, [apply, fetchMe]);
  return children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthBootstrap>
          <Toaster />
          <Suspense
            fallback={
              <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
                Cargando…
              </div>
            }
          >
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route index element={<DashboardPage />} />
                <Route path="alumnos" element={<StudentsPage />} />
                <Route path="alumnos/:id" element={<StudentDetailPage />} />
                <Route path="profesores" element={<TeachersPage />} />
                <Route path="profesores/:id" element={<TeacherDetailPage />} />
                <Route path="clases" element={<ClassesPage />} />
                <Route path="clases/:id" element={<ClassDetailPage />} />
                <Route path="tarifas" element={<TariffsPage />} />
                <Route path="economia/ingresos" element={<FinancePage mode="incomes" />} />
                <Route path="economia/gastos" element={<FinancePage mode="expenses" />} />
                <Route path="pagos" element={<PaymentsPage />} />
                <Route path="informes" element={<ReportsPage />} />
                <Route path="configuracion" element={<SettingsPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </AuthBootstrap>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
