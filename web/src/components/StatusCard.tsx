import type { ReactNode } from "react";

interface StatusCardProps {
  title: string;
  value: number | string;
  icon: ReactNode;
  color: string;
  subtitle?: string;
}

export function StatusCard({ title, value, icon, color, subtitle }: StatusCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
        </div>
        <div className={`p-2.5 rounded-lg ${color}`}>{icon}</div>
      </div>
    </div>
  );
}
