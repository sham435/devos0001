"""
Stripe webhook handler — idempotent, verifiable, auditable.
Copy to: backend/payments/webhooks.py

Usage:
  1. Add to urls.py: path("webhooks/stripe/", stripe_webhook)
  2. Set STRIPE_WEBHOOK_SECRET in settings
  3. Add 'backend.payments' to INSTALLED_APPS
  4. Run: celery -A config worker -l info
"""
import stripe
from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from celery import shared_task
from django.contrib.auth import get_user_model

User = get_user_model()


# --- Models (create via makemigrations) ---
# stripe_event: id, type, created_at, processed_at, payload
# payment_event_log: id, user_id, event_type, stripe_event_id, delta, created_at


class StripeEvent(models.Model):
    id = models.TextField(primary_key=True)
    type = models.TextField()
    created_at = models.DateTimeField()
    processed_at = models.DateTimeField(null=True, blank=True)
    payload = models.JSONField()

    class Meta:
        db_table = "stripe_event"


class PaymentEventLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    event_type = models.TextField()
    stripe_event = models.ForeignKey(StripeEvent, on_delete=models.CASCADE)
    delta = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "payment_event_log"


@csrf_exempt
def stripe_webhook(request):
    if request.method != "POST":
        return HttpResponse(status=405)

    payload = request.body
    sig = request.headers.get("Stripe-Signature")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig, settings.STRIPE_WEBHOOK_SECRET
        )
    except (ValueError, stripe.error.SignatureVerificationError):
        return HttpResponse(status=400)

    created = StripeEvent.objects.get_or_create(
        id=event["id"],
        defaults={
            "type": event["type"],
            "created_at": timezone.now(),
            "payload": event,
        },
    )[1]

    if created:
        process_stripe_event.delay(event["id"])

    return HttpResponse(status=200)


@shared_task
def process_stripe_event(event_id):
    try:
        event = StripeEvent.objects.get(id=event_id)
    except StripeEvent.DoesNotExist:
        return

    if event.processed_at:
        return

    with transaction.atomic():
        if event.type == "checkout.session.completed":
            _handle_checkout(event)
        elif event.type == "invoice.payment_succeeded":
            _handle_invoice_paid(event)
        elif event.type == "customer.subscription.updated":
            _handle_subscription_updated(event)
        elif event.type == "invoice.payment_failed":
            _handle_payment_failed(event)

        event.processed_at = timezone.now()
        event.save(update_fields=["processed_at"])


def _handle_checkout(event):
    session = event.payload["data"]["object"]
    user = User.objects.get(stripe_customer_id=session["customer"])

    if PaymentEventLog.objects.filter(
        user=user, stripe_event=event
    ).exists():
        return

    credits = int(session.get("metadata", {}).get("credits", 0))
    if credits:
        User.objects.filter(id=user.id).update(credits=F("credits") + credits)
        PaymentEventLog.objects.create(
            user=user,
            event_type="credits_added",
            stripe_event=event,
            delta={"credits": credits},
        )


def _handle_invoice_paid(event):
    invoice = event.payload["data"]["object"]
    user = User.objects.get(stripe_customer_id=invoice["customer"])
    PaymentEventLog.objects.create(
        user=user,
        event_type="invoice_paid",
        stripe_event=event,
        delta={"amount": invoice["amount_paid"], "currency": invoice["currency"]},
    )


def _handle_subscription_updated(event):
    subscription = event.payload["data"]["object"]
    user = User.objects.get(stripe_customer_id=subscription["customer"])
    PaymentEventLog.objects.create(
        user=user,
        event_type="subscription_updated",
        stripe_event=event,
        delta={"status": subscription["status"], "plan": subscription["items"]["data"][0]["price"]["id"]},
    )


def _handle_payment_failed(event):
    invoice = event.payload["data"]["object"]
    user = User.objects.get(stripe_customer_id=invoice["customer"])
    PaymentEventLog.objects.create(
        user=user,
        event_type="payment_failed",
        stripe_event=event,
        delta={"amount": invoice["amount_due"], "attempts": invoice["attempt_count"]},
    )
