import { MapPin, Phone, Mail, Clock } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function Contact() {
  const { t } = useLanguage();

  const rows = [
    { icon: Phone, label: t('contact.phone'), value: t('contact.phone_detail'), href: `tel:${t('contact.phone_detail')}` },
    { icon: MapPin, label: t('contact.location'), value: t('contact.location.detail') },
    { icon: Clock, label: t('contact.hours'), value: t('contact.hours.detail') },
    { icon: Mail, label: t('contact.email'), value: t('contact.email_detail'), href: `mailto:${t('contact.email_detail')}` },
  ];

  return (
    <div className="pt-32 pb-24 bg-[var(--surface-page)] min-h-screen">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <h1 className="mb-3">{t('contact.title')}</h1>
        <p className="mb-10">{t('contact.subtitle')}</p>

        <dl className="rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-card)] divide-y divide-[var(--border-subtle)]">
          {rows.map(({ icon: Icon, label, value, href }) => (
            <div key={label} className="flex items-start gap-4 p-5">
              <Icon size={20} className="shrink-0 mt-0.5 text-[var(--gold)]" aria-hidden />
              <div>
                <dt className="label !text-[var(--text-muted)] mb-1">{label}</dt>
                <dd className="text-white">
                  {href ? <a href={href} className="text-white hover:text-[var(--gold)]">{value}</a> : value}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
