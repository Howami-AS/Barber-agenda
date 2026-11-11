import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Clock,
  DollarSign,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Scissors,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { Footer } from '../components/Footer';
import { OfflineBanner } from '../components/OfflineBanner';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { useAuth } from '../hooks/useAuth';
import {
  ensureInitialBarbershopSeed,
  subscribeAdmins,
  subscribeAppointments,
  subscribeBackups,
  subscribeBlockedPeriods,
  subscribeBusinessHours,
  subscribeCustomers,
  subscribeDaySchedules,
  subscribeExpenses,
  subscribePayments,
  subscribeServices,
  subscribeSettings,
  syncAdminConsistency,
} from '../services/supabaseAdmin';
import type {
  AdminUser,
  Appointment,
  BackupSnapshot,
  BarbershopSettings,
  BlockedPeriod,
  BusinessHoursDay,
  Customer,
  DaySchedule,
  ExpenseRecord,
  PaymentRecord,
  ServiceItem,
} from '../types/barber';
import { DEFAULT_BUSINESS_HOURS, DEFAULT_SETTINGS } from '../utils/defaults';
import { AgendaTab } from './admin/AgendaTab';
import { BackupSecurityTab } from './admin/BackupSecurityTab';
import { CustomersTab } from './admin/CustomersTab';
import { DashboardTab } from './admin/DashboardTab';
import { FinanceTab } from './admin/FinanceTab';
import { ScheduleConfigTab } from './admin/ScheduleConfigTab';
import { ServicesTab } from './admin/ServicesTab';

type AdminTabId =
  | 'dashboard'
  | 'agenda'
  | 'services'
  | 'customers'
  | 'hours'
  | 'finance'
  | 'backup';

interface AdminPageProps {
  onBackToPublic: () => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({ onBackToPublic }) => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTabId>('dashboard');
  const [settings, setSettings] = useState<BarbershopSettings>(DEFAULT_SETTINGS);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [businessHours, setBusinessHours] = useState<BusinessHoursDay[]>(DEFAULT_BUSINESS_HOURS);
  const [blockedPeriods, setBlockedPeriods] = useState<BlockedPeriod[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [daySchedules, setDaySchedules] = useState<Record<string, DaySchedule>>({});
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [backups, setBackups] = useState<BackupSnapshot[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [loadedSlices, setLoadedSlices] = useState({
    appointments: false,
    daySchedules: false,
    customers: false,
  });

  useEffect(() => {
    void ensureInitialBarbershopSeed().finally(() => setSeeded(true));

    const unsubs = [
      subscribeSettings(setSettings),
      subscribeServices(setServices),
      subscribeBusinessHours(setBusinessHours),
      subscribeBlockedPeriods(setBlockedPeriods),
      subscribeAppointments((list) => {
        setAppointments(list);
        setLoadedSlices((prev) => (prev.appointments ? prev : { ...prev, appointments: true }));
      }),
      subscribeDaySchedules((map) => {
        setDaySchedules(map);
        setLoadedSlices((prev) => (prev.daySchedules ? prev : { ...prev, daySchedules: true }));
      }),
      subscribeCustomers((list) => {
        setCustomers(list);
        setLoadedSlices((prev) => (prev.customers ? prev : { ...prev, customers: true }));
      }),
      subscribePayments(setPayments),
      subscribeExpenses(setExpenses),
      subscribeAdmins(setAdmins),
      subscribeBackups(setBackups),
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, []);

  // Reconcile public cancellations & recurring customers automatically once all slices are ready
  useEffect(() => {
    if (
      !seeded ||
      !loadedSlices.appointments ||
      !loadedSlices.daySchedules ||
      !loadedSlices.customers ||
      appointments.length === 0
    ) {
      return;
    }
    void syncAdminConsistency(appointments, daySchedules, customers).catch((err) => {
      console.error('Erro na sincronização administrativa:', err);
    });
  }, [seeded, loadedSlices, appointments, daySchedules, customers]);

  const navItems: Array<{ id: AdminTabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'dashboard', label: 'Painel', icon: LayoutDashboard },
    { id: 'agenda', label: 'Agenda', icon: Calendar },
    { id: 'services', label: 'Serviços', icon: Scissors },
    { id: 'customers', label: 'Clientes', icon: Users },
    { id: 'hours', label: 'Horários', icon: Clock },
    { id: 'finance', label: 'Financeiro', icon: DollarSign },
    { id: 'backup', label: 'Segurança', icon: ShieldCheck },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#171717] text-white">
      <OfflineBanner />

      {/* Top Admin Header */}
      <header className="sticky top-0 z-40 bg-[#171717]/95 backdrop-blur-md border-b border-white/10 h-14 px-4 sm:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <BrandLogo name={settings.shopName} size="sm" />
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="hidden sm:block">
            <PWAInstallButton />
          </div>
          <button
            type="button"
            onClick={onBackToPublic}
            className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-white/15 text-xs text-white hover:border-[#C9A15B] whitespace-nowrap"
          >
            <ExternalLink className="w-3.5 h-3.5 text-[#C9A15B]" />
            <span>Área pública</span>
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg bg-[#252525] border border-white/10 text-xs text-[#A3A3A3] hover:text-white whitespace-nowrap"
            title={user?.email || 'Sair'}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex max-w-[1440px] w-full mx-auto">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-white/10 p-4 gap-1.5">
          <div className="px-3 py-2 mb-2 text-xs text-[#A3A3A3] truncate">
            {user?.email}
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full min-h-[44px] px-3.5 rounded-xl flex items-center gap-3 text-sm font-medium transition-colors text-left ${
                  active
                    ? 'bg-[#C9A15B] text-[#171717]'
                    : 'text-[#A3A3A3] hover:bg-[#252525] hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Main Content Viewport */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-10">
          {activeTab === 'dashboard' && (
            <DashboardTab
              appointments={appointments}
              customers={customers}
              payments={payments}
              expenses={expenses}
              onOpenAgenda={() => setActiveTab('agenda')}
              onOpenFinance={() => setActiveTab('finance')}
            />
          )}
          {activeTab === 'agenda' && (
            <AgendaTab appointments={appointments} services={services} />
          )}
          {activeTab === 'services' && <ServicesTab services={services} />}
          {activeTab === 'customers' && (
            <CustomersTab customers={customers} appointments={appointments} />
          )}
          {activeTab === 'hours' && (
            <ScheduleConfigTab
              settings={settings}
              businessHours={businessHours}
              blockedPeriods={blockedPeriods}
            />
          )}
          {activeTab === 'finance' && (
            <FinanceTab
              payments={payments}
              expenses={expenses}
              appointments={appointments}
              services={services}
            />
          )}
          {activeTab === 'backup' && (
            <BackupSecurityTab
              settings={settings}
              services={services}
              businessHours={businessHours}
              blockedPeriods={blockedPeriods}
              customers={customers}
              appointments={appointments}
              payments={payments}
              expenses={expenses}
              admins={admins}
              backups={backups}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (Compact 56px) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-[#171717]/95 backdrop-blur-md border-t border-white/10 flex items-center overflow-x-auto px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex-1 min-w-[64px] h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                active ? 'text-[#C9A15B]' : 'text-[#A3A3A3]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="truncate max-w-[60px]">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="hidden lg:block">
        <Footer showAdminLink={false} />
      </div>
    </div>
  );
};
