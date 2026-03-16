import { type DatabaseExecutor, queryOne, requireOne } from "@/lib/db/client";

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProfileInput {
  email: string;
  fullName?: string | null;
}

export interface UpdateProfileStripeCustomerIdInput {
  profileId: string;
  stripeCustomerId: string;
}

export async function getProfileById(
  db: DatabaseExecutor,
  profileId: string,
): Promise<ProfileRow | null> {
  return queryOne<ProfileRow>(
    db,
    `SELECT id, email, full_name, stripe_customer_id, created_at, updated_at
     FROM profiles
     WHERE id = $1`,
    [profileId],
  );
}

export async function getProfileByEmail(
  db: DatabaseExecutor,
  email: string,
): Promise<ProfileRow | null> {
  return queryOne<ProfileRow>(
    db,
    `SELECT id, email, full_name, stripe_customer_id, created_at, updated_at
     FROM profiles
     WHERE email = $1`,
    [email],
  );
}

export async function createProfile(
  db: DatabaseExecutor,
  input: CreateProfileInput,
): Promise<ProfileRow> {
  return requireOne<ProfileRow>(
    db,
    `INSERT INTO profiles (email, full_name)
     VALUES ($1, $2)
     RETURNING id, email, full_name, stripe_customer_id, created_at, updated_at`,
    [input.email, input.fullName ?? null],
    "Failed to create profile.",
  );
}

export async function updateProfileStripeCustomerId(
  db: DatabaseExecutor,
  input: UpdateProfileStripeCustomerIdInput,
): Promise<ProfileRow> {
  return requireOne<ProfileRow>(
    db,
    `UPDATE profiles
     SET stripe_customer_id = $2,
         updated_at = now()
     WHERE id = $1
     RETURNING id, email, full_name, stripe_customer_id, created_at, updated_at`,
    [input.profileId, input.stripeCustomerId],
    `Profile ${input.profileId} was not found.`,
  );
}
