// 联系弹层全局状态（T-M3-1/T-M3-4）：详情页「联系管理员接单」携带当前单子
// （三级回退规则见 services/contact.ts）。gig 状态语义：undefined=关闭；null=已打开（全局）；
// GigDetail=已打开（单子详情，含发布者联系资料）。
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { GigDetail } from '../../services/types';
import ContactModal from './ContactModal';

interface ContactContextValue {
  openContact: (gig?: GigDetail) => void;
}

const ContactContext = createContext<ContactContextValue | null>(null);

export function ContactProvider({ children }: { children: ReactNode }) {
  const [gig, setGig] = useState<GigDetail | null | undefined>(undefined);

  const openContact = useCallback((g?: GigDetail) => setGig(g ?? null), []);
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
