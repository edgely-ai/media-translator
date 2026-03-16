import { type DatabaseExecutor, queryMany, queryOne } from "@/lib/db/client";
import type { PlanRow } from "@/types/billing";

export async function listPlans(db: DatabaseExecutor): Promise<PlanRow[]> {
  return queryMany<PlanRow>(
    db,
    `SELECT id, name, monthly_credits, stripe_price_id, created_at, updated_at
     FROM plans
     ORDER BY monthly_credits ASC, name ASC`,
  );
}

export async function getPlanById(
  db: DatabaseExecutor,
  planId: string,
): Promise<PlanRow | null> {
  return queryOne<PlanRow>(
    db,
    `SELECT id, name, monthly_credits, stripe_price_id, created_at, updated_at
     FROM plans
     WHERE id = $1`,
    [planId],
  );
}

export async function getPlanByName(
  db: DatabaseExecutor,
  planName: string,
): Promise<PlanRow | null> {
  return queryOne<PlanRow>(
    db,
    `SELECT id, name, monthly_credits, stripe_price_id, created_at, updated_at
     FROM plans
     WHERE name = $1`,
    [planName],
  );
}
