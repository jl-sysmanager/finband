import { QueryClientProvider } from "@tanstack/react-query";
import { Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/layout/AppShell";
import { LoginPage } from "@/pages/LoginPage";
import { useAuth } from "@/stores/auth";
import { useTheme } from "@/stores/theme";
import { Toaster } from "@/components/feedback/Toaster";
import { lazyPage } from "@/lib/lazy-page";
import { queryClient } from "@/lib/query-client";

// Cada página se descarga al visitarla (recharts, exceljs de informes, etc. no van
// en el paquete inicial). El login va incluido para que la primera pantalla sea inmediata.
const ClassDetailPage = lazyPage(() => import("@/pages/ClassDetailPage"), "ClassDetailPage");
const ClassesPage = lazyPage(() => import("@/pages/ClassesPage"), "ClassesPage");
const DashboardPage = lazyPage(() => import("@/pages/DashboardPage"), "DashboardPage");
const FinancePage = lazyPage(() => import("@/pages/FinancePage"), "FinancePage");
const PaymentsPage = lazyPage(() => import("@/pages/PaymentsPage"), "PaymentsPage");
const ReportsPage = lazyPage(() => import("@/pages/ReportsPage"), "ReportsPage");
const SettingsPage = lazyPage(() => import("@/pages/SettingsPage"), "SettingsPage");
const StudentDetailPage = lazyPage(() => import("@/pages/StudentDetailPage"), "StudentDetailPage");
const StudentsPage = lazyPage(() => import("@/pages/StudentsPage"), "StudentsPage");
const TariffsPage = lazyPage(() => import("@/pages/TariffsPage"), "TariffsPage");
const TeacherDetailPage = lazyPage(() => import("@/pages/TeacherDetailPage"), "TeacherDetailPage");
const TeachersPage = lazyPage(() => import("@/pages/TeachersPage"), "TeachersPage");


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
