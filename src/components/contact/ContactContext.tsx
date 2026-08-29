// 联系弹层全局状态（T-M3-1/T-M3-4）：TabBar「联系」打开全局弹层（无单子上下文），
// 详情页「联系管理员接单」携带当前单子（contact_wxid 回退规则见 services/contact.ts）。
// gig 状态语义：undefined=关闭；null=已打开（全局）；Gig=已打开（单子详情）。
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Gig } from '../../services/types';
import ContactModal from './ContactModal';

interface ContactContextValue {
  openContact: (gig?: Gig) => void;
}

const ContactContext = createContext<ContactContextValue | null>(null);

export function ContactProvider({ children }: { children: ReactNode }) {
  const [gig, setGig] = useState<Gig | null | undefined>(undefined);

  const openContact = useCallback((g?: Gig) => setGig(g ?? null), []);
  const close = useCallback(() => setGig(undefined), []);

  const value = useMemo(() => ({ openContact }), [openContact]);

  return (
    <ContactContext.Provider value={value}>
      {children}
      {gig !== undefined && <ContactModal gig={gig} onClose={close} />}
    </ContactContext.Provider>
  );
}

export function useContact(): ContactContextValue {
  const ctx = useContext(ContactContext);
  if (!ctx) throw new Error('useContact 必须在 <ContactProvider> 内使用');
  return ctx;
}
