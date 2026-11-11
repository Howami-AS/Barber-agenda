import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  MessageCircle,
  Phone,
  Scissors,
} from 'lucide-react';
import heroBarbershopImg from '../assets/images/hero_barbershop_1794410446484.jpg';
import craftToolsImg from '../assets/images/barber_craft_tools_1794410447740.jpg';
import { BookingFlow } from '../components/BookingFlow';
import { BrandLogo } from '../components/BrandLogo';
import { Footer } from '../components/Footer';
import { MyBookingsModal } from '../components/MyBookingsModal';
import { OfflineBanner } from '../components/OfflineBanner';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { fetchPublicBootstrap } from '../services/api';
import type {
  BarbershopSettings,
  BlockedPeriod,
  BusinessHoursDay,
  ServiceItem,
} from '../types/barber';
import { DEFAULT_BUSINESS_HOURS, DEFAULT_SETTINGS } from '../utils/defaults';
import { buildWhatsAppUrl, formatCurrencyBRL } from '../utils/timezone';

interface PublicPageProps {
  onNavigateAdmin: () => void;
}

export const PublicPage: React.FC<PublicPageProps> = ({ onNavigateAdmin }) => {
  const [settings, setSettings] = useState<BarbershopSettings>(DEFAULT_SETTINGS);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [businessHours, setBusinessHours] = useState<BusinessHoursDay[]>(DEFAULT_BUSINESS_HOURS);
  const [blockedPeriods, setBlockedPeriods] = useState<BlockedPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [preselectedServiceId, setPreselectedServiceId] = useState<string | null>(null);
  const [showMyBookings, setShowMyBookings] = useState(false);

  const loadData = async () => {
    setLoadError(null);
    try {
      const data = await fetchPublicBootstrap();
      setSettings(data.settings);
      setServices(data.services || []);
      setBusinessHours(data.businessHours || []);
      setBlockedPeriods(data.blockedPeriods || []);
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar os dados reais do Supabase.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleSelectServiceToBook = (serviceId: string) => {
    setPreselectedServiceId(serviceId);
    const el = document.getElementById('agendamento');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  const whatsappContactUrl = buildWhatsAppUrl(
    settings.whatsapp,
    `Olá! Gostaria de falar com a ${settings.shopName}.`
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#171717] text-white">
      <OfflineBanner />

      {/* 3-Zone Top Bar */}
      <header className="sticky top-0 z-40 bg-[#171717]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <a href="#topo" className="whitespace-nowrap shrink-0">
            <BrandLogo name={settings.shopName} size="sm" />
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm text-[#A3A3A3]">
            <a
              href="#servicos"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Serviços
            </a>
            <a
              href="#agendamento"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Agendamento
            </a>
            <a
              href="#horarios"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Horários
            </a>
            <button
              type="button"
              onClick={() => setShowMyBookings(true)}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Meus Horários
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <a
              href="#agendamento"
              className="inline-flex items-center justify-center min-h-[40px] px-4 py-2 rounded-lg bg-[#C9A15B] text-[#171717] text-xs font-semibold hover:bg-[#d6b273] transition-colors whitespace-nowrap shrink-0"
            >
              Agendar horário
            </a>
          </div>
        </div>
      </header>

      <main id="topo" className="flex-1">
        {/* Hero Split Section */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-12 lg:py-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-between gap-8 py-2">
              <div className="space-y-5">
                <p className="text-xs font-medium tracking-widest uppercase text-[#C9A15B]">
                  {settings.slogan}
                </p>
                <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight text-white leading-[1.08] text-balance max-w-2xl">
                  Precisão clássica, atendimento no seu tempo.
                </h1>
                <p className="text-base text-[#A3A3A3] max-w-xl leading-relaxed">
                  Consulte horários em tempo real, escolha seu serviço e confirme sua cadeira sem espera. Sem necessidade de cadastro prévio.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <a
                    href="#agendamento"
                    className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 py-3 rounded-xl bg-[#C9A15B] text-[#171717] font-semibold text-sm hover:bg-[#d6b273] transition-colors whitespace-nowrap shrink-0"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>Agendar agora</span>
                  </a>
                  <a
                    href={whatsappContactUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 min-h-[48px] px-5 py-3 rounded-xl bg-[#252525] border border-white/15 text-white font-medium text-sm hover:border-[#C9A15B] transition-colors whitespace-nowrap shrink-0"
                  >
                    <MessageCircle className="w-4 h-4 text-[#C9A15B]" />
                    <span>Contato via WhatsApp</span>
                  </a>
                  <PWAInstallButton />
                </div>
              </div>

              {/* Clean unboxed metadata strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-white/10 text-sm">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-[#A3A3A3]">
                    <MapPin className="w-3.5 h-3.5 text-[#C9A15B]" />
                    <span>Endereço</span>
                  </div>
                  <p className="text-white font-medium leading-snug">{settings.address}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-[#A3A3A3]">
                    <Phone className="w-3.5 h-3.5 text-[#C9A15B]" />
                    <span>Telefone</span>
                  </div>
                  <p className="text-white font-mono tabular-nums font-medium">{settings.phone}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-[#A3A3A3]">
                    <Clock className="w-3.5 h-3.5 text-[#C9A15B]" />
                    <span>Meus horários</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMyBookings(true)}
                    className="text-[#C9A15B] font-medium hover:underline text-left"
                  >
                    Consultar ou cancelar reserva
                  </button>
                </div>
              </div>
            </div>

            {/* Hero Photography Frame */}
            <div className="lg:col-span-5 relative rounded-2xl overflow-hidden bg-[#252525] border border-white/10 min-h-[260px] lg:min-h-[400px]">
              <img
                src={heroBarbershopImg}
                alt={`Interior da barbearia ${settings.shopName}`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover lg:h-full"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#171717] via-[#171717]/20 to-transparent" />
              <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4">
                <div>
                  <p className="font-display text-lg font-semibold text-white">
                    {settings.shopName}
                  </p>
                  <p className="text-xs text-[#A3A3A3]">Atendimento individual com hora marcada</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Services & Prices Section */}
        <section id="servicos" className="border-t border-white/10 bg-[#171717] py-12 sm:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
              <div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                  Serviços e valores
                </h2>
                <p className="text-sm text-[#A3A3A3] mt-1">
                  Toque em qualquer serviço para ir direto à escolha do horário.
                </p>
              </div>
              {services.some((s) => s.isDemo) && (
                <p className="text-xs text-[#A3A3A3]">
                  Itens marcados como demonstração podem ser editados pelo barbeiro no painel.
                </p>
              )}
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-36 rounded-2xl bg-[#252525] border border-white/5 animate-pulse"
                  />
                ))}
              </div>
            ) : loadError ? (
              <div className="rounded-2xl bg-[#252525] border border-red-500/30 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-sm text-red-200">{loadError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setLoading(true);
                    void loadData();
                  }}
                  className="min-h-[40px] px-4 rounded-xl bg-[#C9A15B] text-[#171717] text-xs font-semibold shrink-0"
                >
                  Tentar novamente
                </button>
              </div>
            ) : services.length === 0 ? (
              <div className="rounded-2xl bg-[#252525] border border-white/10 p-6 text-sm text-[#A3A3A3]">
                Nenhum serviço ativo disponível no momento. Caso seja a primeira execução, o administrador deve acessar o Painel Administrativo para ativar os serviços no Supabase.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {services.map((svc) => (
                  <button
                    key={svc.id}
                    type="button"
                    onClick={() => handleSelectServiceToBook(svc.id)}
                    className="text-left rounded-2xl bg-[#252525] border border-white/10 hover:border-[#C9A15B] p-5 transition-colors flex flex-col justify-between gap-4 group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-display text-lg font-semibold text-white group-hover:text-[#C9A15B] transition-colors">
                          {svc.name}
                        </h3>
                        <Scissors className="w-4 h-4 text-[#C9A15B] shrink-0 mt-1" />
                      </div>
                      {svc.description && (
                        <p className="text-xs text-[#A3A3A3] mt-2 leading-relaxed">
                          {svc.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-white/10">
                      <span className="text-xs text-[#A3A3A3] tabular-nums">
                        {svc.durationMinutes} min
                        {svc.isDemo ? ' · Demonstração' : ''}
                      </span>
                      <span className="font-mono text-lg font-bold text-[#C9A15B] tabular-nums">
                        {formatCurrencyBRL(svc.price)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Booking Flow Section */}
        <section id="agendamento" className="border-t border-white/10 bg-[#171717] py-12 sm:py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <BookingFlow
              services={services}
              businessHours={businessHours}
              blockedPeriods={blockedPeriods}
              settings={settings}
              preselectedServiceId={preselectedServiceId}
              onBookingCompleted={() => void loadData()}
            />
          </div>
        </section>

        {/* Business Hours & Craft Showcase */}
        <section id="horarios" className="border-t border-white/10 bg-[#171717] py-12 sm:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-5 rounded-2xl overflow-hidden bg-[#252525] border border-white/10 min-h-[240px]">
              <img
                src={craftToolsImg}
                alt="Ferramentas de precisão de barbearia"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="lg:col-span-7 rounded-2xl bg-[#252525] border border-white/10 p-6 sm:p-8 flex flex-col justify-between gap-6">
              <div>
                <h2 className="font-display text-2xl font-bold text-white">
                  Horário de funcionamento e contato
                </h2>
                <p className="text-sm text-[#A3A3A3] mt-1">
                  Fuso horário oficial: Brasília / Fortaleza (America/Fortaleza).
                </p>
              </div>

              <div className="divide-y divide-white/10">
                {businessHours.map((day) => (
                  <div
                    key={day.dayOfWeek}
                    className="py-2.5 flex items-center justify-between gap-4 text-sm"
                  >
                    <span className="text-white font-medium">{day.label}</span>
                    {day.isOpen ? (
                      <span className="font-mono text-xs sm:text-sm text-[#A3A3A3] tabular-nums">
                        {day.startTime} – {day.endTime}
                        {day.hasBreak && day.breakStart && day.breakEnd
                          ? ` (pausa ${day.breakStart}–${day.breakEnd})`
                          : ''}
                      </span>
                    ) : (
                      <span className="text-xs text-[#A3A3A3]/60">Fechado</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-white/10">
                <div className="text-xs text-[#A3A3A3] space-y-1">
                  <p className="text-white font-medium">{settings.address}</p>
                  <p className="font-mono tabular-nums">{settings.phone}</p>
                </div>
                <a
                  href={whatsappContactUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-[#C9A15B] text-[#171717] text-xs font-semibold hover:bg-[#d6b273] transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Chamar no WhatsApp</span>
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer onOpenAdmin={onNavigateAdmin} showAdminLink={true} />

      <MyBookingsModal
        open={showMyBookings}
        onClose={() => setShowMyBookings(false)}
        settings={settings}
      />
    </div>
  );
};
