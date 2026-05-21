export type ScheduleStatus = 'pendente' | 'confirmado' | 'recusado';

export function normalizeScheduleStatus(raw: unknown): ScheduleStatus {
  const s = String(raw ?? 'pendente').toLowerCase().trim();
  if (s === 'confirmado' || s === 'recusado' || s === 'pendente') return s;
  return 'pendente';
}

export type ScheduleAssignment = {
  id: number;
  event_id: number;
  event_name: string;
  event_date: string;
  event_time?: string | null;
  church_name?: string;
  address?: string;
  role_name?: string | null;
  status?: string;
  department_name?: string | null;
};

export type EventScheduleGroup = {
  event_id: number;
  event_name: string;
  event_date: string;
  event_time?: string | null;
  church_name?: string;
  address?: string;
  assignments: ScheduleAssignment[];
  role_names: string;
  aggregateStatus: ScheduleStatus;
};

export function groupSchedulesByEvent(rows: ScheduleAssignment[]): EventScheduleGroup[] {
  const map = new Map<number, EventScheduleGroup>();
  for (const s of rows) {
    const eid = Number(s.event_id);
    if (!map.has(eid)) {
      map.set(eid, {
        event_id: eid,
        event_name: s.event_name,
        event_date: s.event_date,
        event_time: s.event_time,
        church_name: s.church_name,
        address: s.address,
        assignments: [],
        role_names: '',
        aggregateStatus: 'recusado',
      });
    }
    map.get(eid)!.assignments.push(s);
  }

  return [...map.values()].map(g => {
    const roles = [...new Set(g.assignments.map(a => a.role_name).filter(Boolean))] as string[];
    const sts = g.assignments.map(a => normalizeScheduleStatus(a.status));
    let aggregateStatus: ScheduleStatus = 'recusado';
    if (sts.some(x => x === 'pendente')) aggregateStatus = 'pendente';
    else if (sts.some(x => x === 'confirmado')) aggregateStatus = 'confirmado';
    return {
      ...g,
      role_names: roles.join(', '),
      aggregateStatus,
    };
  });
}
