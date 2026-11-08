import { m } from "motion/react";
import type { EmptyCopy } from "../lib/empty";
import { Icon } from "./Ui";
import { useMotion } from "./Motion";

export function EmptyState({ copy, onAction }: { copy: EmptyCopy; onAction(id: NonNullable<EmptyCopy["action"]>["id"]): void }) {
  const p = useMotion();
  return (
    <m.div className="empty" role="status" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={p.fade}>
      <div className="art"><Icon name={copy.icon} size={22} /></div>
      <h2>{copy.title}</h2><p>{copy.body}</p>
      {copy.action && <button className="btn" onClick={() => onAction(copy.action!.id)}>{copy.action.label}</button>}
    </m.div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry(): void }) {
  return (
    <div className="empty" role="alert">
      <div className="art" style={{ color: "var(--danger)" }}><Icon name="about" size={22} /></div>
      <h2>Couldn’t load your items</h2><p>Your data was not changed. {message}</p>
      <button className="btn" onClick={onRetry}>Try again</button>
    </div>
  );
}
