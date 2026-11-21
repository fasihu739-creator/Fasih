import { Router } from 'express';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import { demoRequests, subscriptionPlans } from '../../db/schema.ts';
import { ensureSubscriptionPlansSeeded } from '../../db/seed.ts';

export const publicRouter = Router();

publicRouter.get('/plans', async (_req, res) => {
  try {
    await ensureSubscriptionPlansSeeded();
    const plans = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.isActive, true))
      .orderBy(asc(subscriptionPlans.sortOrder));
    res.json({ plans });
  } catch (error) {
    console.error('Failed to load subscription plans:', error);
    res.status(500).json({ error: 'Unable to retrieve subscription plans.' });
  }
});

const demoRequestSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  workEmail: z.string().trim().email().max(180),
  companyName: z.string().trim().min(2).max(140),
  roleTitle: z.string().trim().min(2).max(100),
  engineeringHeadcount: z.string().trim().min(1).max(40),
  notes: z.string().trim().max(1000).optional(),
});

publicRouter.post('/demo-request', async (req, res) => {
  const parsed = demoRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Please complete all required fields with a valid work email.',
      issues: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const [created] = await db
      .insert(demoRequests)
      .values({
        fullName: parsed.data.fullName,
        workEmail: parsed.data.workEmail,
        companyName: parsed.data.companyName,
        roleTitle: parsed.data.roleTitle,
        engineeringHeadcount: parsed.data.engineeringHeadcount,
        notes: parsed.data.notes ?? null,
      })
      .returning();

    res.status(201).json({
      request: {
        id: created.id,
        companyName: created.companyName,
        createdAt: created.createdAt,
      },
      message:
        'Demo request received. Our UK engineering advisory team will respond within one business day.',
    });
  } catch (error) {
    console.error('Failed to record demo request:', error);
    res.status(500).json({ error: 'Unable to submit demo request.' });
  }
});
