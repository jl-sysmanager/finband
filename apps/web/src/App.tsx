import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/layout/AppShell";
import { ClassDetailPage } from "@/pages/ClassDetailPage";
import { ClassesPage } from "@/pages/ClassesPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { FinancePage } from "@/pages/FinancePage";
import { LoginPage } from "@/pages/LoginPage";
import { PaymentsPage } from "@/pages/PaymentsPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { StudentDetailPage } from "@/pages/StudentDetailPage";
import { StudentsPage } from "@/pages/StudentsPage";
import { TariffsPage } from "@/pages/TariffsPage";
import { TeacherDetailPage } from "@/pages/TeacherDetailPage";
import { TeachersPage } from "@/pages/TeachersPage";
import { useAuth } from "@/stores/auth";
import { useTheme } from "@/stores/theme";
import { Toaster } from "@/components/feedback/Toaster";

const queryClient = new QueryClient();

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
        </AuthBootstrap>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
