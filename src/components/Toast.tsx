import { AnimatePresence, m } from "motion/react";
import { Icon } from "./Ui";
import { useMotion } from "./Motion";

/** One quiet confirmation line at the bottom of the window. Never takes focus and is announced politely to screen readers. */
export function Toast({ message }: { message: string | null }) {
  const p = useMotion();
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      <AnimatePresence>
        {message && <m.div key={message} className="toast" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6, transition: p.fade }} transition={p.spring}><Icon name="check" size={14} />{message}</m.div>}
      </AnimatePresence>
    </div>
  );
}
