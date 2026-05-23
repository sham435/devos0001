# Stripe Webhooks v1 — Idempotent, Verifiable, Auditable

**Status**: Proposed
**Date**: 2026-05-23
**Scope**: `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.updated`, `invoice.payment_failed`

## Problem
Stripe webhooks deliver at-least-once. Network retries, out-of-order events, and duplicate deliveries cause:
- Double-provisioning access
- Double-charging credits
- Missed cancellations
- Race between webhook and API poll

## Architecture
```
Stripe → /webhooks/stripe/ → Verify sig → Dedup → Queue → Worker → Update DB → Audit log
```

### Components
1. **Webhook endpoint**: Fast 200, no DB writes
2. **Dedup table**: `stripe_event(idempotency_key, processed_at)`
3. **Queue**: Celery task per event type
4. **Worker**: Business logic with transaction
5. **Audit**: Append-only `payment_event_log`

### Data Model
```sql
CREATE TABLE stripe_event (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    processed_at TIMESTAMPTZ,
    payload JSONB NOT NULL
);

CREATE UNIQUE INDEX ON stripe_event(id);

CREATE TABLE payment_event_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    stripe_event_id TEXT REFERENCES stripe_event(id),
    delta JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Implementation

### Webhook View — Fast ACK
```python
@csrf_exempt
def stripe_webhook(request):
    payload = request.body
    sig = request.headers.get('Stripe-Signature')
    try:
        event = stripe.Webhook.construct_event(payload, sig, settings.STRIPE_WEBHOOK_SECRET)
    except:
        return HttpResponse(status=400)

    created = StripeEvent.objects.get_or_create(
        id=event['id'],
        defaults={'type': event['type'], 'payload': event}
    )[1]

    if created:
        process_stripe_event.delay(event['id'])

    return HttpResponse(status=200)
```

### Worker — Business Logic
```python
@shared_task
def process_stripe_event(event_id):
    event = StripeEvent.objects.get(id=event_id)
    if event.processed_at:
        return

    with transaction.atomic():
        if event.type == 'checkout.session.completed':
            handle_checkout(event)
        elif event.type == 'invoice.payment_succeeded':
            handle_invoice_paid(event)
        event.processed_at = now()
        event.save()
```

### Handlers — Idempotent by Design
```python
def handle_checkout(event):
    session = event.payload['data']['object']
    user = User.objects.get(stripe_customer_id=session['customer'])
    if PaymentEventLog.objects.filter(user=user, stripe_event_id=event.id).exists():
        return
    credits = session['metadata']['credits']
    user.credits = F('credits') + credits
    user.save()
    PaymentEventLog.objects.create(
        user=user, event_type='credits_added',
        stripe_event_id=event.id, delta={'credits': +credits}
    )
```

## Tradeoffs
**Pros**: Webhook returns in <50ms, at-least-once safe, full audit trail, out-of-order safe
**Cons**: Eventual consistency (1-5s delay), extra table + queue complexity

## Bottlenecks
| Volume | Solution |
| --- | --- |
| <1k/day | Sync processing in view |
| 1k-10k/day | Celery + dedup (this design) |
| >10k/day | Partition by month, archive old events |

## Monitoring
- Alert if `processed_at IS NULL AND created_at < NOW() - 5min`
- Dashboard: events/min, retry rate, handler latency

## Testing
```python
def test_checkout_idempotent():
    event_id = 'evt_test_123'
    process_stripe_event(event_id)
    process_stripe_event(event_id)
    assert PaymentEventLog.objects.count() == 1
```

## Migration Path
1. Create tables, deploy webhook endpoint
2. Dual-write: process in view + queue for 1 week
3. Compare logs, ensure parity
4. Switch to queue-only
5. Backfill last 30 days via Stripe API

## Related
- `snippets/django/stripe_webhook.py`
- `memory/bugs/stripe-double-credit-2024-03.md`
