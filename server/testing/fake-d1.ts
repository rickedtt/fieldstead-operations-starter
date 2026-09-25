type Row = Record<string, unknown>;

type StoredMutation = {
  organization_id: string;
  operation_id: string;
  fingerprint: string;
  result_json: string;
};

class FakeStatement {
  private parameters: unknown[] = [];

  constructor(
    readonly database: FakeD1Database,
    readonly query: string,
  ) {}

  bind(...values: unknown[]): FakeStatement {
    const statement = new FakeStatement(this.database, this.query);
    statement.parameters = values;
    return statement;
  }

  first<T = Row>(): Promise<T | null> {
    return Promise.resolve(this.database.first(this.query, this.parameters) as T | null);
  }

  run(): Promise<D1Result<unknown>> {
    return Promise.resolve(this.database.run(this.query, this.parameters));
  }

  all<T = Row>(): Promise<D1Result<T>> {
    const rows = this.database.all(this.query, this.parameters) as T[];
    return Promise.resolve({
      success: true,
      results: rows,
      meta: { changes: 0 } as D1Result<T>['meta'],
    });
  }

  raw<T extends unknown[]>(): Promise<T[]> {
    throw new Error('raw() is not supported by this test double');
  }
}

export class FakeD1Database {
  readonly users: Row[] = [];
  readonly customers: Row[] = [];
  readonly jobs: Row[] = [];
  readonly activities: Row[] = [];
  readonly invoices: Row[] = [];
  readonly paymentWebhookEvents: Row[] = [];
  readonly portalInvitations: Row[] = [];
  readonly portalSessions: Row[] = [];
  readonly portalEstimates: Row[] = [];
  readonly mutations: StoredMutation[] = [];
  failNextBatch = false;

  prepare(query: string): D1PreparedStatement {
    return new FakeStatement(this, query) as unknown as D1PreparedStatement;
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    if (this.failNextBatch) {
      this.failNextBatch = false;
      throw new Error('simulated D1 outage');
    }

    const snapshots = {
      jobs: structuredClone(this.jobs),
      activities: structuredClone(this.activities),
      invoices: structuredClone(this.invoices),
      paymentWebhookEvents: structuredClone(this.paymentWebhookEvents),
      portalInvitations: structuredClone(this.portalInvitations),
      portalSessions: structuredClone(this.portalSessions),
      portalEstimates: structuredClone(this.portalEstimates),
      mutations: structuredClone(this.mutations),
    };
    try {
      const results: D1Result<T>[] = [];
      for (const input of statements) {
        const statement = input as unknown as FakeStatement;
        results.push(this.run(statement.query, this.parametersOf(statement)) as D1Result<T>);
      }
      return results;
    } catch (error) {
      this.jobs.splice(0, this.jobs.length, ...snapshots.jobs);
      this.activities.splice(0, this.activities.length, ...snapshots.activities);
      this.invoices.splice(0, this.invoices.length, ...snapshots.invoices);
      this.paymentWebhookEvents.splice(0, this.paymentWebhookEvents.length, ...snapshots.paymentWebhookEvents);
      this.portalInvitations.splice(0, this.portalInvitations.length, ...snapshots.portalInvitations);
      this.portalSessions.splice(0, this.portalSessions.length, ...snapshots.portalSessions);
      this.portalEstimates.splice(0, this.portalEstimates.length, ...snapshots.portalEstimates);
      this.mutations.splice(0, this.mutations.length, ...snapshots.mutations);
      throw error;
    }
  }

  private parametersOf(statement: FakeStatement): unknown[] {
    return (statement as unknown as { parameters: unknown[] }).parameters;
  }

  first(query: string, values: unknown[]): Row | null {
    if (query.includes('COUNT(*) AS count FROM portal_invitations')) {
      const [organizationId, createdByUserId, windowStart] = values;
      return { count: this.portalInvitations.filter((row) => row.organization_id === organizationId && row.created_by_user_id === createdByUserId && String(row.created_at) > String(windowStart)).length };
    }
    if (query.includes('FROM portal_invitations')) {
      if (query.includes('secret_hash = ?')) {
        const [secretHash, now] = values;
        return this.portalInvitations.find((row) => row.secret_hash === secretHash && row.accepted_at === null && row.revoked_at === null && String(row.expires_at) > String(now)) ?? null;
      }
      const [organizationId, id] = values;
      return this.portalInvitations.find((row) => row.organization_id === organizationId && row.id === id) ?? null;
    }
    if (query.includes('FROM portal_sessions')) {
      const [secretHash, now] = values;
      return this.portalSessions.find((row) =>
        row.secret_hash === secretHash && row.revoked_at === null && String(row.expires_at) > String(now),
      ) ?? null;
    }
    if (query.includes('FROM portal_estimates')) {
      if (query.includes('JOIN customers')) {
        const [organizationId, id] = values;
        const estimate = this.portalEstimates.find((row) => row.organization_id === organizationId && row.id === id);
        const customer = estimate && this.customers.find((row) => row.organization_id === organizationId && row.id === estimate.customer_id);
        return estimate && customer ? { ...estimate, customer_name: customer.name, customer_email: customer.email } : null;
      }
      const [organizationId, customerId, id] = values;
      return this.portalEstimates.find((row) =>
        row.organization_id === organizationId && row.customer_id === customerId &&
        (id === undefined || row.id === id),
      ) ?? null;
    }
    if (query.includes('FROM users')) {
      const [id, organizationId] = values;
      return this.users.find((row) => row.id === id && row.organization_id === organizationId) ?? null;
    }
    if (query.includes('FROM mutations_log')) {
      const [organizationId, operationId] = values;
      return this.mutations.find(
        (row) => row.organization_id === organizationId && row.operation_id === operationId,
      ) ?? null;
    }
    if (query.includes('FROM payment_webhook_events')) {
      const [providerEventId] = values;
      return this.paymentWebhookEvents.find((row) => row.provider_event_id === providerEventId) ?? null;
    }
    if (query.includes('FROM invoices')) {
      const [organizationId, second, third] = values;
      return this.invoices.find(
        (row) => row.organization_id === organizationId &&
          (query.includes('customer_id = ?')
            ? row.customer_id === second && (third === undefined || row.id === third)
            : row.id === second),
      ) ?? null;
    }
    if (query.includes('FROM jobs')) {
      const [organizationId, second, third] = values;
      return this.jobs.find(
        (row) => row.organization_id === organizationId &&
          (query.includes('customer_id = ?')
            ? row.customer_id === second && (third === undefined || row.id === third)
            : row.id === second),
      ) ?? null;
    }
    if (query.includes('FROM customers')) {
      const [organizationId, id] = values;
      return this.customers.find(
        (row) => row.organization_id === organizationId && row.id === id,
      ) ?? null;
    }
    return null;
  }

  all(query: string, values: unknown[]): Row[] {
    const [organizationId, customerId] = values;
    if (query.includes('FROM portal_invitations')) return this.portalInvitations.filter((row) => row.organization_id === organizationId && row.customer_id === customerId);
    if (query.includes('FROM portal_estimates')) return this.portalEstimates.filter((row) => row.organization_id === organizationId && row.customer_id === customerId);
    if (query.includes('FROM invoices')) return this.invoices.filter((row) => row.organization_id === organizationId && row.customer_id === customerId);
    if (query.includes('FROM jobs')) return this.jobs.filter((row) => row.organization_id === organizationId && row.customer_id === customerId);
    return [];
  }

  run(query: string, values: unknown[]): D1Result<unknown> {
    let changes = 0;
    if (query.includes('INSERT INTO portal_invitations')) {
      const [id, organizationId, customerId, secretHash, expiresAt, createdByUserId, createdAt] = values;
      this.portalInvitations.push({ id, organization_id: organizationId, customer_id: customerId, secret_hash: secretHash, expires_at: expiresAt, accepted_at: null, revoked_at: null, created_by_user_id: createdByUserId, created_at: createdAt });
      changes = 1;
    } else if (query.includes('UPDATE portal_invitations SET revoked_at')) {
      const [revokedAt, organizationId, id] = values;
      const invitation = this.portalInvitations.find((row) => row.organization_id === organizationId && row.id === id);
      if (invitation) { invitation.revoked_at = revokedAt; changes = 1; }
    } else if (query.includes('UPDATE portal_invitations SET expires_at')) {
      const [expiresAt, organizationId, id] = values;
      const invitation = this.portalInvitations.find((row) => row.organization_id === organizationId && row.id === id);
      if (invitation) { invitation.expires_at = expiresAt; changes = 1; }
    } else if (query.includes('UPDATE portal_invitations SET accepted_at')) {
      const [acceptedAt, id, now] = values;
      const invitation = this.portalInvitations.find((row) => row.id === id && row.accepted_at === null && row.revoked_at === null && String(row.expires_at) > String(now));
      if (invitation) { invitation.accepted_at = acceptedAt; changes = 1; }
    } else if (query.includes('INSERT INTO portal_sessions')) {
      const [id, organizationId, customerId, invitationId, secretHash, expiresAt, createdAt, checkedInvitationId, acceptedAt] = values;
      const invitation = this.portalInvitations.find((row) => row.id === checkedInvitationId && row.accepted_at === acceptedAt);
      if (invitation) { this.portalSessions.push({ id, organization_id: organizationId, customer_id: customerId, invitation_id: invitationId, secret_hash: secretHash, expires_at: expiresAt, revoked_at: null, created_at: createdAt }); changes = 1; }
    } else if (query.includes('UPDATE portal_sessions SET revoked_at')) {
      const [revokedAt, organizationId, invitationId] = values;
      for (const session of this.portalSessions) if (session.organization_id === organizationId && session.invitation_id === invitationId && session.revoked_at === null) { session.revoked_at = revokedAt; changes += 1; }
    } else if (query.includes('UPDATE portal_estimates SET status')) {
      const [status, decidedAt, idempotencyKey, resultJson, updatedAt, organizationId, customerId, id, version, now] = values;
      const estimate = this.portalEstimates.find((row) => row.organization_id === organizationId && row.customer_id === customerId && row.id === id && row.status === 'sent' && row.version === version && row.decided_at === null && String(row.expires_at) > String(now));
      if (estimate) { Object.assign(estimate, { status, decided_at: decidedAt, decision_idempotency_key: idempotencyKey, decision_result_json: resultJson, updated_at: updatedAt }); changes = 1; }
    } else if (query.includes('INSERT INTO jobs')) {
      const [id, organizationId, customerId, assignedUserId, service, description,
        status, scheduledFor, quoteAmount, quoteMargin, invoiceAmount, createdAt, updatedAt] = values;
      this.jobs.push({
        id, organization_id: organizationId, customer_id: customerId,
        assigned_user_id: assignedUserId, service, description, status,
        scheduled_for: scheduledFor, quote_amount: quoteAmount,
        quote_margin: quoteMargin, invoice_amount: invoiceAmount,
        version: 1, created_at: createdAt, updated_at: updatedAt,
      });
      changes = 1;
    } else if (query.includes('UPDATE jobs SET')) {
      const payload = JSON.parse(String(values[0])) as Row;
      const updatedAt = values[1];
      const organizationId = values[2];
      const id = values[3];
      const baseVersion = values[4];
      const job = this.jobs.find(
        (row) => row.organization_id === organizationId && row.id === id && row.version === baseVersion,
      );
      if (job) {
        Object.assign(job, payload, { version: Number(job.version) + 1, updated_at: updatedAt });
        changes = 1;
      }
    } else if (query.includes('INSERT INTO activity_events') && query.includes('SELECT') && query.includes('portal_estimates')) {
      const [id, organizationId, customerId, eventType, detailJson, occurredAt, createdAt, updatedAt, checkedOrganizationId, checkedCustomerId, estimateId, idempotencyKey] = values;
      const estimate = this.portalEstimates.find((row) => row.organization_id === checkedOrganizationId && row.customer_id === checkedCustomerId && row.id === estimateId && row.decision_idempotency_key === idempotencyKey);
      if (estimate) { this.activities.push({ id, organization_id: organizationId, customer_id: customerId, actor_user_id: null, event_type: eventType, detail_json: detailJson, occurred_at: occurredAt, created_at: createdAt, updated_at: updatedAt }); changes = 1; }
    } else if (query.includes('INSERT INTO activity_events') && query.includes('SELECT')) {
      const [id, detailJson, occurredAt, createdAt, updatedAt, organizationId, invoiceId] = values;
      const invoice = this.invoices.find(
        (row) => row.organization_id === organizationId && row.id === invoiceId && row.status !== 'paid',
      );
      if (invoice) {
        this.activities.push({
          id, organization_id: organizationId, job_id: invoice.job_id,
          customer_id: invoice.customer_id, actor_user_id: invoice.created_by_user_id,
          event_type: 'invoice.paid', detail_json: detailJson, occurred_at: occurredAt,
          created_at: createdAt, updated_at: updatedAt,
        });
        changes = 1;
      }
    } else if (query.includes('INSERT INTO activity_events')) {
      const portalActivity = query.includes('customer_id') && !query.includes('job_id');
      const [id, organizationId, scopeId, actorUserId, eventType, detailJson, occurredAt, createdAt] = values;
      this.activities.push({
        id, organization_id: organizationId, ...(portalActivity ? { customer_id: scopeId } : { job_id: scopeId }),
        actor_user_id: actorUserId, event_type: eventType,
        detail_json: detailJson, occurred_at: occurredAt, created_at: createdAt,
      });
      changes = 1;
    } else if (query.includes('INSERT INTO invoices')) {
      const [id, organizationId, jobId, customerId, createdByUserId, invoiceNumber,
        amountDueCents, issuedAt, createdAt, updatedAt] = values;
      const exists = this.invoices.some(
        (row) => row.organization_id === organizationId && row.job_id === jobId,
      );
      if (!exists) {
        this.invoices.push({
          id, organization_id: organizationId, job_id: jobId, customer_id: customerId,
          created_by_user_id: createdByUserId, invoice_number: invoiceNumber,
          status: 'draft', currency: 'usd', amount_due_cents: amountDueCents,
          issued_at: issuedAt, version: 1, created_at: createdAt, updated_at: updatedAt,
        });
        changes = 1;
      }
    } else if (query.includes('INSERT INTO payment_webhook_events')) {
      const [providerEventId, organizationId, invoiceId, checkoutSessionId, occurredAt, processedAt] = values;
      if (this.paymentWebhookEvents.some((row) => row.provider_event_id === providerEventId)) {
        throw new Error('UNIQUE constraint failed: payment_webhook_events.provider_event_id');
      }
      this.paymentWebhookEvents.push({
        provider: 'stripe', provider_event_id: providerEventId, organization_id: organizationId,
        invoice_id: invoiceId, checkout_session_id: checkoutSessionId,
        event_type: 'checkout.session.completed', occurred_at: occurredAt, processed_at: processedAt,
      });
      changes = 1;
    } else if (query.includes('UPDATE invoices')) {
      const [paidAt, eventId, checkoutSessionId, updatedAt, organizationId, invoiceId] = values;
      const invoice = this.invoices.find(
        (row) => row.organization_id === organizationId && row.id === invoiceId && row.status !== 'paid',
      );
      if (invoice) {
        Object.assign(invoice, {
          status: 'paid', paid_at: paidAt, paid_provider: 'stripe',
          paid_provider_event_id: eventId, checkout_session_id: checkoutSessionId,
          version: Number(invoice.version) + 1, updated_at: updatedAt,
        });
        changes = 1;
      }
    } else if (query.includes('INSERT INTO mutations_log')) {
      const [organizationId, operationId, actorUserId, entityType, entityId,
        payloadJson, fingerprint, status, resultJson, processedAt, createdAt] = values;
      if (this.mutations.some((row) => row.organization_id === organizationId && row.operation_id === operationId)) {
        throw new Error('UNIQUE constraint failed: mutations_log.organization_id, mutations_log.operation_id');
      }
      this.mutations.push({
        organization_id: String(organizationId), operation_id: String(operationId),
        fingerprint: String(fingerprint), result_json: String(resultJson),
        actor_user_id: actorUserId, entity_type: entityType, entity_id: entityId,
        payload_json: payloadJson, status, processed_at: processedAt, created_at: createdAt,
      } as StoredMutation);
      changes = 1;
    }
    return {
      success: true,
      results: [],
      meta: { changes } as D1Result<unknown>['meta'],
    };
  }
}
