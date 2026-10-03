"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { readPreferences, savePreferences, trackSiteEvent } from "@/lib/site-analytics";

export default function PrivacyControls() {
  const pathname = usePathname();
  const [banner, setBanner] = useState(false);
  const [open, setOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const lastPage = useRef<string | null>(null);
  useEffect(() => {
    const measure = () => { if (readPreferences()?.analytics && lastPage.current !== pathname) { trackSiteEvent("page_view"); lastPage.current = pathname; } if (!readPreferences()?.analytics) lastPage.current = null; };
    const manage = () => { setAnalytics(readPreferences()?.analytics ?? false); setOpen(true); };
    const sync = () => { setBanner(!readPreferences()); measure(); };
    sync();
    const click = (e: MouseEvent) => { const el = e.target instanceof Element ? e.target.closest("a") : null; if (el?.href && /^https:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//.test(el.href)) trackSiteEvent("whatsapp_click"); };
    window.addEventListener("vantriq:preferences", sync);
    window.addEventListener("vantriq:manage-privacy", manage);
    window.addEventListener("storage", sync);
    document.addEventListener("click", click);
    return () => { window.removeEventListener("vantriq:preferences", sync); window.removeEventListener("vantriq:manage-privacy", manage); window.removeEventListener("storage", sync); document.removeEventListener("click", click); };
  }, [pathname]);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  const choose = (value: boolean) => { savePreferences(value); setBanner(false); setOpen(false); };
  return <>
    {banner && <aside className="privacy-banner" aria-label="Cookie and storage choices"><div><span className="privacy-kicker">Your privacy, your choice</span><h2>A little clarity about storage.</h2><p>We remember your privacy choice and use storage for the chat assistant. Optional analytics help us improve the site, without visitor profiles. They stay off until you choose.</p><Link href="/cookies">Cookies & storage</Link></div><div className="privacy-actions"><button className="btn btn-secondary" onClick={() => choose(false)}>Reject optional</button><button className="btn btn-primary" onClick={() => choose(true)}>Accept optional</button><button className="btn btn-ghost" onClick={() => { setAnalytics(readPreferences()?.analytics ?? false); setOpen(true); }}>Manage preferences</button></div></aside>}
    <dialog ref={dialog} className="privacy-dialog" onCancel={() => setOpen(false)} onClose={() => setOpen(false)} aria-labelledby="privacy-title"><div className="privacy-dialog-head"><span className="privacy-kicker">You are in control</span><button aria-label="Close preferences" onClick={() => setOpen(false)}>×</button></div><h2 id="privacy-title">Privacy preferences</h2><p>Your choice applies to this website and can be changed using the footer link.</p><div className="privacy-option"><div><h3>Necessary storage</h3><p>Remembers your choice for 180 days. The chat widget stores a session identifier to support a conversation; previous-chat loading is disabled.</p></div><span>Always on</span></div><label className="privacy-option"><div><h3>Optional analytics</h3><p>Aggregate counts of page views, chat opens, WhatsApp clicks and successful briefs. No visitor IDs, advertising profiles or message content.</p></div><input type="checkbox" checked={analytics} onChange={e => setAnalytics(e.target.checked)} /></label><div className="privacy-option"><div><h3>Advertising</h3><p>No advertising pixels or marketing cookies are installed.</p></div><span>Not used</span></div><div className="privacy-actions"><button className="btn btn-secondary" onClick={() => choose(false)}>Reject optional</button><button className="btn btn-primary" onClick={() => choose(analytics)}>Save preferences</button></div><p className="privacy-links"><Link href="/privacy">Privacy policy</Link> · <Link href="/cookies">Cookies & storage</Link></p></dialog>
  </>;
}
